import { describe, expect, it } from "vitest";
import { parsePageSpec } from "../../../apps/api/src/lib/page-spec.js";

describe("parsePageSpec", () => {
  it("resolves a single page", () => {
    const result = parsePageSpec("2", 3);
    expect(result).toEqual(new Set([2]));
  });

  it("resolves a range", () => {
    const result = parsePageSpec("1-2", 3);
    expect(result).toEqual(new Set([1, 2]));
  });

  it("resolves z as the last page", () => {
    const result = parsePageSpec("z", 3);
    expect(result).toEqual(new Set([3]));
  });

  it("resolves r1 as the last page", () => {
    const result = parsePageSpec("r1", 3);
    expect(result).toEqual(new Set([3]));
  });

  it("resolves r2 as second-to-last", () => {
    const result = parsePageSpec("r2", 3);
    expect(result).toEqual(new Set([2]));
  });

  it("resolves r3 as the first page of 3", () => {
    const result = parsePageSpec("r3", 3);
    expect(result).toEqual(new Set([1]));
  });

  it("handles comma-separated values", () => {
    const result = parsePageSpec("1,3", 3);
    expect(result).toEqual(new Set([1, 3]));
  });

  it("handles 1-z as all pages", () => {
    const result = parsePageSpec("1-z", 3);
    expect(result).toEqual(new Set([1, 2, 3]));
  });

  it("throws on out-of-range page", () => {
    expect(() => parsePageSpec("5", 3)).toThrow(/out of range/i);
  });

  it("throws on r-index that resolves below 1", () => {
    expect(() => parsePageSpec("r4", 3)).toThrow(/out of range/i);
  });

  it("throws on page 0", () => {
    expect(() => parsePageSpec("0", 3)).toThrow();
  });

  // Removal keep-list derivation tests:
  // "2" of 3 -> remove set {2}, keep "1,3"
  it("remove-pages: '2' of 3 yields keep '1,3'", () => {
    const removeSet = parsePageSpec("2", 3);
    const keep: number[] = [];
    for (let i = 1; i <= 3; i++) {
      if (!removeSet.has(i)) keep.push(i);
    }
    expect(keep.join(",")).toBe("1,3");
  });

  // "1-2" of 3 -> remove set {1,2}, keep "3"
  it("remove-pages: '1-2' of 3 yields keep '3'", () => {
    const removeSet = parsePageSpec("1-2", 3);
    const keep: number[] = [];
    for (let i = 1; i <= 3; i++) {
      if (!removeSet.has(i)) keep.push(i);
    }
    expect(keep.join(",")).toBe("3");
  });

  // "z" of 3 -> remove set {3}, keep "1,2"
  it("remove-pages: 'z' of 3 yields keep '1,2'", () => {
    const removeSet = parsePageSpec("z", 3);
    const keep: number[] = [];
    for (let i = 1; i <= 3; i++) {
      if (!removeSet.has(i)) keep.push(i);
    }
    expect(keep.join(",")).toBe("1,2");
  });

  // "1-z" of 3 -> all pages removed -> keep list empty
  it("remove-pages: '1-z' of 3 leaves nothing to keep", () => {
    const removeSet = parsePageSpec("1-z", 3);
    const keep: number[] = [];
    for (let i = 1; i <= 3; i++) {
      if (!removeSet.has(i)) keep.push(i);
    }
    expect(keep.length).toBe(0);
  });
});
