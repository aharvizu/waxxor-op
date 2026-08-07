import { describe, expect, it } from "vitest";
import { applyColumnResize, normalizeColumnConfig, reorderVisibleColumns } from "./data-table";

const ALL = ["a", "b", "c", "d"];
const KNOWN = new Set(ALL);

describe("normalizeColumnConfig", () => {
  it("falls back to every known key, visible and unsized, when nothing is saved", () => {
    expect(normalizeColumnConfig([], ALL)).toEqual([
      { key: "a", visible: true, width: null },
      { key: "b", visible: true, width: null },
      { key: "c", visible: true, width: null },
      { key: "d", visible: true, width: null },
    ]);
  });

  it("leaves a saved config untouched", () => {
    const saved = [{ key: "b", visible: false, width: 200 }];
    expect(normalizeColumnConfig(saved, ALL)).toBe(saved);
  });
});

describe("reorderVisibleColumns", () => {
  const config = [
    { key: "a", visible: true, width: null },
    { key: "b", visible: true, width: null },
    { key: "c", visible: false, width: null },
    { key: "d", visible: true, width: null },
  ];

  it("moves a dragged column next to the target within the visible subsequence", () => {
    // drag "d" onto "a" -> visible order becomes d, a, b (c stays put, hidden)
    expect(reorderVisibleColumns(config, ALL, KNOWN, "d", "a")).toEqual([
      { key: "d", visible: true, width: null },
      { key: "a", visible: true, width: null },
      { key: "c", visible: false, width: null },
      { key: "b", visible: true, width: null },
    ]);
  });

  it("is a no-op when dragged and target are the same key", () => {
    expect(reorderVisibleColumns(config, ALL, KNOWN, "a", "a")).toEqual(config);
  });

  it("is a no-op when either key is hidden or unknown", () => {
    expect(reorderVisibleColumns(config, ALL, KNOWN, "c", "a")).toEqual(config);
    expect(reorderVisibleColumns(config, ALL, KNOWN, "a", "missing")).toEqual(config);
  });

  it("drops stale keys no longer present in the registry", () => {
    const withStale = [...config, { key: "removed", visible: true, width: null }];
    const result = reorderVisibleColumns(withStale, ALL, KNOWN, "a", "b");
    expect(result.some((c) => c.key === "removed")).toBe(false);
  });

  it("materializes defaults first when nothing was saved yet", () => {
    const result = reorderVisibleColumns([], ALL, KNOWN, "d", "a");
    expect(result.map((c) => c.key)).toEqual(["d", "a", "b", "c"]);
  });
});

describe("applyColumnResize", () => {
  const config = [
    { key: "a", visible: true, width: null },
    { key: "b", visible: true, width: 150 },
  ];

  it("patches the width of an existing column", () => {
    expect(applyColumnResize(config, ALL, KNOWN, { a: 240.4 })).toEqual([
      { key: "a", visible: true, width: 240 },
      { key: "b", visible: true, width: 150 },
    ]);
  });

  it("appends a new entry for a known column missing from the saved config", () => {
    const result = applyColumnResize(config, ALL, KNOWN, { c: 100 });
    expect(result).toContainEqual({ key: "c", visible: true, width: 100 });
    expect(result).toHaveLength(3);
  });

  it("ignores sizes for keys outside the known registry", () => {
    const result = applyColumnResize(config, ALL, KNOWN, { ghost: 999 });
    expect(result.some((c) => c.key === "ghost")).toBe(false);
    expect(result).toEqual(config);
  });

  it("never mutates the input config array", () => {
    const before = JSON.parse(JSON.stringify(config));
    applyColumnResize(config, ALL, KNOWN, { a: 500 });
    expect(config).toEqual(before);
  });
});
