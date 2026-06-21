import { describe, expect, it } from "vitest";
import { parsePageRange } from "../../../apps/api/src/routes/tools/pdf-to-image.js";

describe("parsePageRange", () => {
  it("returns all pages for 'all'", () => {
    expect(parsePageRange("all", 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns all pages for empty string", () => {
    expect(parsePageRange("", 3)).toEqual([1, 2, 3]);
  });

  it("parses a single page", () => {
    expect(parsePageRange("2", 5)).toEqual([2]);
  });

  it("parses a range", () => {
    expect(parsePageRange("1-3", 5)).toEqual([1, 2, 3]);
  });

  it("parses mixed ranges and singles", () => {
    expect(parsePageRange("1-3, 5", 5)).toEqual([1, 2, 3, 5]);
  });

  it("deduplicates overlapping ranges", () => {
    expect(parsePageRange("1-3, 2-4", 5)).toEqual([1, 2, 3, 4]);
  });

  it("sorts output", () => {
    expect(parsePageRange("5, 1, 3", 5)).toEqual([1, 3, 5]);
  });

  it("handles whitespace", () => {
    expect(parsePageRange(" 1 - 3 , 5 ", 5)).toEqual([1, 2, 3, 5]);
  });

  it("throws on page 0", () => {
    expect(() => parsePageRange("0", 5)).toThrow();
  });

  it("throws on negative page", () => {
    expect(() => parsePageRange("-1", 5)).toThrow();
  });

  it("throws on page exceeding total", () => {
    expect(() => parsePageRange("6", 5)).toThrow(/out of range/);
  });

  it("throws on range exceeding total", () => {
    expect(() => parsePageRange("3-7", 5)).toThrow(/out of range/);
  });

  it("throws on reversed range", () => {
    expect(() => parsePageRange("5-2", 5)).toThrow();
  });

  it("throws on non-numeric input", () => {
    expect(() => parsePageRange("abc", 5)).toThrow();
  });

  it("throws on empty range segment", () => {
    expect(() => parsePageRange("1,,3", 5)).toThrow();
  });
});
