import { randomBytes } from "node:crypto";
import { del, list, put } from "@vercel/blob";

/**
 * Vercel Blob attachment storage adapter (2026-08-03 — replaces the local-
 * disk MVP adapter, which wrote to `process.cwd()/.uploads`: that works in
 * local dev but Vercel's deployed function filesystem is read-only, so
 * every upload failed in production with a generic "Something went wrong").
 * Postgres keeps metadata only; blobs live in Vercel Blob under a random,
 * extension-free key (the filename never becomes part of the storage path).
 * `access: "public"` is the only mode Vercel Blob offers — that's fine here
 * because nothing ever hands the raw blob URL to the client: every read
 * goes through the org-scoped /api/attachments/[id] route, which fetches
 * the bytes server-side and streams them, so access control is unchanged.
 */

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB per file (MVP)

const KEY_RE = /^[a-f0-9]{32}$/;

/** Random, extension-free key — the filename never touches storage. */
export function newStorageKey(): string {
  return randomBytes(16).toString("hex");
}

function pathnameFor(storageKey: string): string {
  if (!KEY_RE.test(storageKey)) throw new Error("invalid storage key");
  return `attachments/${storageKey}`;
}

/** Vercel Blob has no "get by pathname" lookup — list() with an exact-match prefix is the documented way to resolve a pathname back to its URL. */
async function blobUrlFor(storageKey: string): Promise<string> {
  const pathname = pathnameFor(storageKey);
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find((b) => b.pathname === pathname);
  if (!blob) throw new Error("attachment blob not found");
  return blob.url;
}

export async function saveAttachment(storageKey: string, data: Buffer): Promise<void> {
  await put(pathnameFor(storageKey), data, {
    access: "public",
    addRandomSuffix: false,
  });
}

export async function readAttachment(storageKey: string): Promise<Buffer> {
  const url = await blobUrlFor(storageKey);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteAttachmentBlob(storageKey: string): Promise<void> {
  try {
    const url = await blobUrlFor(storageKey);
    await del(url);
  } catch {
    // metadata is the source of truth; a missing blob must not block cleanup
  }
}
