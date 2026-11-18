import { describe, expect, it } from "vitest";
import {
  assertPageSpecInRange,
  compressPageRuns,
  INVALID_PAGE_RANGE,
  PAGE_OUT_OF_RANGE,
  parsePageSpec,
} from "../../../apps/api/src/lib/page-spec.js";

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

  // Every rejection is the user's input, so it must be a 400 the worker
  // classifies as expected and the web app can translate by code (NODE-A4).
  it.each([
    ["5", PAGE_OUT_OF_RANGE],
    ["2-9", PAGE_OUT_OF_RANGE],
    ["r4", PAGE_OUT_OF_RANGE],
    ["0", PAGE_OUT_OF_RANGE],
    ["1z", INVALID_PAGE_RANGE],
    ["3-", INVALID_PAGE_RANGE],
    ["1-2-3", INVALID_PAGE_RANGE],
    ["r", INVALID_PAGE_RANGE],
    ["r0", INVALID_PAGE_RANGE],
    [",", INVALID_PAGE_RANGE],
  ])("rejects %j with a 400 InputValidationError coded %s", (spec, code) => {
    let caught: unknown;
    try {
      parsePageSpec(spec, 3);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: "InputValidationError", statusCode: 400, code });
  });

  it("assertPageSpecInRange accepts every page reference qpdf accepts for the document", () => {
    for (const spec of ["1", "1-z", "z-1", "r1", "r3-r1", "1,3", "2-3,1"]) {
      expect(() => assertPageSpecInRange(spec, 3)).not.toThrow();
    }
  });

  it("assertPageSpecInRange rejects a page past the end", () => {
    expect(() => assertPageSpecInRange("13", 12)).toThrow(
      "Page 13 is out of range for a 12-page document",
    );
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

  // Reviewer edge-decision tests
  it("reversed range '3-1' normalizes to {1,2,3}", () => {
    expect(parsePageSpec("3-1", 3)).toEqual(new Set([1, 2, 3]));
  });

  it("'z-1' of 3 resolves to all pages", () => {
    expect(parsePageSpec("z-1", 3)).toEqual(new Set([1, 2, 3]));
  });

  it("'r2-r1' of 5 resolves to {4,5}", () => {
    expect(parsePageSpec("r2-r1", 5)).toEqual(new Set([4, 5]));
  });

  it("'1-r1' of 5 resolves to all pages", () => {
    expect(parsePageSpec("1-r1", 5)).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("'1,1' deduplicates to {1}", () => {
    expect(parsePageSpec("1,1", 3)).toEqual(new Set([1]));
  });
});

describe("compressPageRuns", () => {
  it("collapses a full consecutive run: [2..80] -> '2-80'", () => {
    const pages = Array.from({ length: 79 }, (_, i) => i + 2);
    expect(compressPageRuns(pages)).toBe("2-80");
  });

  it("leaves non-consecutive pages as singles: [1,3,5,7] -> '1,3,5,7'", () => {
    expect(compressPageRuns([1, 3, 5, 7])).toBe("1,3,5,7");
  });

  it("mixes runs and singles: [1,2,4,5,6,9] -> '1-2,4-6,9'", () => {
    expect(compressPageRuns([1, 2, 4, 5, 6, 9])).toBe("1-2,4-6,9");
  });

  it("returns empty string for empty input", () => {
    expect(compressPageRuns([])).toBe("");
  });

  it("handles a single page: [3] -> '3'", () => {
    expect(compressPageRuns([3])).toBe("3");
  });

  it("pathological alternation (odd pages 1..399) produces ~800 chars", () => {
    // 200 odd pages, none consecutive, so compression cannot help
    const pages = Array.from({ length: 200 }, (_, i) => i * 2 + 1);
    const result = compressPageRuns(pages);
    // Each singleton is up to 3 digits + comma -> no runs to collapse
    expect(result).toBe(pages.join(","));
    // This exceeds 200 chars, confirming the need for qpdfPagesSpecUnchecked
    expect(result.length).toBeGreaterThan(200);
  });
});
