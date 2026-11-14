import { ToolInputError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  assertGifWorkload,
  MAX_GIF_FRAMES,
  MAX_GIF_TOTAL_PIXELS,
  resolveGifResizeDimensions,
} from "../../../apps/api/src/lib/gif-limits.js";

describe("GIF workload limits", () => {
  it("accepts an aggregate workload exactly at the pixel boundary", () => {
    expect(assertGifWorkload({ width: 8_192, height: 8_192, pages: 1 }).totalPixels).toBe(
      MAX_GIF_TOTAL_PIXELS,
    );
  });

  it("rejects aggregate animated pixels above the boundary", () => {
    expect(() => assertGifWorkload({ width: 8_192, height: 8_192, pages: 2 })).toThrow(
      /total pixels across all frames/i,
    );
  });

  it("rejects excessive frame counts even when frames are tiny", () => {
    expect(() => assertGifWorkload({ width: 1, height: 1, pages: MAX_GIF_FRAMES + 1 })).toThrow(
      /frames/i,
    );
  });

  it("uses pageHeight as the per-frame height", () => {
    const workload = assertGifWorkload({ width: 10, height: 30, pageHeight: 10, pages: 3 });
    expect(workload).toMatchObject({ height: 10, framePixels: 100, totalPixels: 300 });
  });

  it("marks limit failures as user input errors", () => {
    expect(() => assertGifWorkload({ width: 0, height: 10, pages: 1 })).toThrow(ToolInputError);
  });

  // The web app translates these from the code (#4727).
  it("codes each limit so the web app can say which one tripped", () => {
    const codeOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (err) {
        return (err as ToolInputError).code;
      }
      return undefined;
    };
    expect(codeOf(() => assertGifWorkload({ width: 0, height: 10, pages: 1 }))).toBe(
      "IMAGE_UNDECODABLE",
    );
    expect(
      codeOf(() => assertGifWorkload({ width: 1, height: 1, pages: MAX_GIF_FRAMES + 1 })),
    ).toBe("TOO_MANY_FRAMES");
    expect(codeOf(() => assertGifWorkload({ width: 8_192, height: 8_192, pages: 2 }))).toBe(
      "TOO_MANY_PIXELS",
    );
    expect(codeOf(() => assertGifWorkload({ width: 20_000, height: 10, pages: 1 }))).toBe(
      "IMAGE_TOO_LARGE",
    );
    expect(
      codeOf(() =>
        assertGifWorkload(
          { width: 20_000, height: 10, pages: 1 },
          "GIF resize output",
          "RESULT_TOO_LARGE",
        ),
      ),
    ).toBe("RESULT_TOO_LARGE");
  });
});

describe("GIF resize dimension resolution", () => {
  const source = { width: 400, height: 200 };

  it("preserves aspect ratio for an inside bounding box", () => {
    expect(resolveGifResizeDimensions(source, { width: 100, height: 100 })).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("resolves percentage dimensions before allocation", () => {
    expect(resolveGifResizeDimensions(source, { percentage: 250 })).toEqual({
      width: 1_000,
      height: 500,
    });
  });
});
