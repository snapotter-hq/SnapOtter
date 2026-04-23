import { describe, expect, it } from "vitest";
import { parsePageRange } from "../../../apps/api/src/routes/tools/pdf-to-image.js";

describe("parsePageRange", () => {
  // -- "all" / empty → full range -------------------------------------------

  it("returns all pages for empty string", () => {
    expect(parsePageRange("", 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns all pages for 'all'", () => {
    expect(parsePageRange("all", 3)).toEqual([1, 2, 3]);
  });

  it("returns all pages for 'ALL' (case-insensitive)", () => {
    expect(parsePageRange("ALL", 4)).toEqual([1, 2, 3, 4]);
  });

  it("returns all pages for '  all  ' (trimmed)", () => {
    expect(parsePageRange("  all  ", 2)).toEqual([1, 2]);
  });

  // -- Single pages ---------------------------------------------------------

  it("parses a single page number", () => {
    expect(parsePageRange("3", 10)).toEqual([3]);
  });

  it("parses multiple single pages", () => {
    expect(parsePageRange("1, 3, 5", 10)).toEqual([1, 3, 5]);
  });

  it("deduplicates repeated pages", () => {
    expect(parsePageRange("2, 2, 3, 3", 5)).toEqual([2, 3]);
  });

  it("sorts pages in ascending order", () => {
    expect(parsePageRange("5, 1, 3", 10)).toEqual([1, 3, 5]);
  });

  // -- Ranges ---------------------------------------------------------------

  it("parses a simple range", () => {
    expect(parsePageRange("2-4", 10)).toEqual([2, 3, 4]);
  });

  it("parses multiple ranges", () => {
    expect(parsePageRange("1-3, 7-9", 10)).toEqual([1, 2, 3, 7, 8, 9]);
  });

  it("parses mixed single pages and ranges", () => {
    expect(parsePageRange("1, 3-5, 8", 10)).toEqual([1, 3, 4, 5, 8]);
  });

  it("handles ranges with spaces", () => {
    expect(parsePageRange(" 2 - 4 , 6 ", 10)).toEqual([2, 3, 4, 6]);
  });

  it("deduplicates overlapping ranges", () => {
    expect(parsePageRange("1-3, 2-4", 5)).toEqual([1, 2, 3, 4]);
  });

  // -- Edge cases -----------------------------------------------------------

  it("handles single page equal to totalPages", () => {
    expect(parsePageRange("5", 5)).toEqual([5]);
  });

  it("handles range ending at totalPages", () => {
    expect(parsePageRange("3-5", 5)).toEqual([3, 4, 5]);
  });

  it("handles a range of one page (start equals end)", () => {
    expect(parsePageRange("3-3", 5)).toEqual([3]);
  });

  // -- Error cases ----------------------------------------------------------

  it("throws for page exceeding totalPages", () => {
    expect(() => parsePageRange("6", 5)).toThrow("out of range");
  });

  it("throws for range exceeding totalPages", () => {
    expect(() => parsePageRange("3-10", 5)).toThrow("out of range");
  });

  it("throws for page 0 (pages start at 1)", () => {
    expect(() => parsePageRange("0", 5)).toThrow("positive");
  });

  it("throws for negative page number", () => {
    expect(() => parsePageRange("-1", 5)).toThrow();
  });

  it("throws for reversed range (start > end)", () => {
    expect(() => parsePageRange("5-3", 10)).toThrow("start exceeds end");
  });

  it("throws for non-integer page number", () => {
    expect(() => parsePageRange("1.5", 5)).toThrow();
  });

  it("throws for non-numeric input", () => {
    expect(() => parsePageRange("abc", 5)).toThrow();
  });

  it("throws for empty segment (trailing comma)", () => {
    expect(() => parsePageRange("1,", 5)).toThrow("Invalid page range format");
  });

  it("throws for empty segment (leading comma)", () => {
    expect(() => parsePageRange(",1", 5)).toThrow("Invalid page range format");
  });
});
