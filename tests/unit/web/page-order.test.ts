import { describe, expect, it } from "vitest";
import { MAX_ORDER_LENGTH, serializePageOrder } from "@/lib/page-order";

describe("serializePageOrder", () => {
  it("returns an empty spec for no pages", () => {
    expect(serializePageOrder([])).toBe("");
  });

  it("collapses an untouched document into a single range", () => {
    expect(serializePageOrder([1, 2, 3, 4, 5])).toBe("1-5");
  });

  it("keeps short runs as separate pages", () => {
    expect(serializePageOrder([3, 1])).toBe("3,1");
    expect(serializePageOrder([2, 3])).toBe("2,3");
  });

  it("writes a descending run as a reversed range", () => {
    expect(serializePageOrder([5, 4, 3, 2, 1])).toBe("5-1");
  });

  it("splits a moved page out of its surrounding ranges", () => {
    // Page 7 pulled to the front of a 10-page document.
    expect(serializePageOrder([7, 1, 2, 3, 4, 5, 6, 8, 9, 10])).toBe("7,1-6,8-10");
  });

  it("keeps a single move inside the API length cap on a long document", () => {
    const pages = [400, ...Array.from({ length: 399 }, (_, i) => i + 1)];
    const spec = serializePageOrder(pages);
    expect(spec).toBe("400,1-399");
    expect(spec.length).toBeLessThanOrEqual(MAX_ORDER_LENGTH);
  });

  it("ends an ascending run on the last page with z so qpdf keeps pages pdf.js missed", () => {
    expect(serializePageOrder([1, 2, 3, 4, 5], 5)).toBe("1-z");
    expect(serializePageOrder([7, 1, 2, 3, 4, 5, 6, 8, 9, 10], 10)).toBe("7,1-6,8-z");
    expect(serializePageOrder([2, 1, 3], 3)).toBe("2,1,3-z");
    expect(serializePageOrder([1, 2, 4, 3, 5], 5)).toBe("1,2,4,3,5-z");
  });

  it("leaves a run ending on the last page alone when it is descending or not last", () => {
    expect(serializePageOrder([5, 4, 3, 2, 1], 5)).toBe("5-1");
    expect(serializePageOrder([4, 5, 1, 2, 3], 5)).toBe("4-z,1-3");
  });

  it("round-trips every page exactly once", () => {
    const pages = [4, 2, 9, 1, 3, 8, 7, 5, 6];
    const expanded = serializePageOrder(pages)
      .split(",")
      .flatMap((part) => {
        if (!part.includes("-")) return [Number(part)];
        const [from, to] = part.split("-").map(Number);
        const step = from <= to ? 1 : -1;
        const run: number[] = [];
        for (let n = from; step > 0 ? n <= to : n >= to; n += step) run.push(n);
        return run;
      });
    expect(expanded).toEqual(pages);
  });
});
