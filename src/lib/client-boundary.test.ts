import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the server/client boundary mistake `next build` does not catch.
 *
 * A server component may **render** a client component, but it may not **call
 * a function** exported from a `"use client"` module: across that boundary the
 * import is a client reference, not the function, so it compiles cleanly and
 * then throws at request time ("Attempted to call X() from the server but X is
 * on the client"). It has bitten this codebase twice — the i18n label helpers,
 * and the Work quick-view panel importing `workHref` from a client module on
 * 2026-11-08, which shipped a modal that errored on open.
 *
 * The rule this encodes: shared helpers that both runtimes need belong in a
 * pure `src/lib` module (see `src/lib/work-peek.ts`), never in the `"use
 * client"` file that happens to render them.
 *
 * PascalCase imports are allowed — those are components, and rendering them is
 * exactly what the boundary is for. `import type` is erased, so it is fine too.
 */

const ROOT = "src";
const EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function isClientModule(path: string): boolean {
  const first = readFileSync(path, "utf8").split("\n", 1)[0].trim();
  return first.replace(/["';]/g, "") === "use client";
}

function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(fromFile), spec));
  else return null; // package import
  for (const candidate of [...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => join(base, `index${e}`))]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const IMPORT_RE = /^import\s+(?!type\s)(\{[^}]*\}|[\w*]+[^;]*?)\s+from\s+"([^"]+)"/gm;

function offendingImports(path: string): { spec: string; names: string[] }[] {
  const source = readFileSync(path, "utf8");
  const out: { spec: string; names: string[] }[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const dep = resolveImport(match[2], path);
    if (!dep || !isClientModule(dep)) continue;
    const names = match[1]
      .replace(/[{}]/g, "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .filter((n) => !n.startsWith("type "))
      // PascalCase = a component the server is allowed to render.
      .filter((n) => !/^[A-Z]/.test(n.split(" as ")[0].trim()));
    if (names.length > 0) out.push({ spec: match[2], names });
  }
  return out;
}

describe("server/client boundary", () => {
  it("no server component calls a function exported from a \"use client\" module", () => {
    const serverFiles = walk(join(ROOT, "app")).filter((f) => !isClientModule(f));
    const offenders = serverFiles
      .map((file) => ({ file, imports: offendingImports(file) }))
      .filter((r) => r.imports.length > 0)
      .map((r) => `${r.file} imports ${r.imports.map((i) => `${i.names.join("/")} from ${i.spec}`).join("; ")}`);

    // Fails with the exact file and symbol, since the symptom in the browser
    // ("Application error") says nothing about which import caused it.
    expect(offenders).toEqual([]);
    expect(serverFiles.length).toBeGreaterThan(20); // the walk actually found the app tree
  });
});
