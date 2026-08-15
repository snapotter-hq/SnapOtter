import { describe, expect, it } from "vitest";
import { shouldShowConversionCard } from "@/lib/result-display";

/**
 * #746: a non-previewable result (TIFF/JXL) whose server preview also failed has
 * no renderable source. The side-by-side, no-comparison, plain live-preview, and
 * before-after branches render displayUrl as the result, and displayUrl falls
 * back to the original upload, so without a guard they show the untouched
 * original under the processed filename. shouldShowConversionCard decides when
 * to render the success card instead.
 */
const base = {
  hasProcessed: true,
  isProcessedPreviewable: false,
  processedPreviewUrl: null as string | null,
  originalBlobUrl: "blob:original" as string | null,
  displayMode: "side-by-side",
  hasImageWrapperStyle: false,
};

describe("shouldShowConversionCard (#746)", () => {
  it("is false before a result exists", () => {
    expect(shouldShowConversionCard({ ...base, hasProcessed: false })).toBe(false);
  });

  it("is false when the processed result is browser-previewable", () => {
    expect(shouldShowConversionCard({ ...base, isProcessedPreviewable: true })).toBe(false);
  });

  it("is false when a server-generated preview exists", () => {
    expect(shouldShowConversionCard({ ...base, processedPreviewUrl: "blob:preview" })).toBe(false);
  });

  it("is true for a non-renderable result in the side-by-side branch", () => {
    expect(shouldShowConversionCard({ ...base, displayMode: "side-by-side" })).toBe(true);
  });

  it("is true for a non-renderable result in the no-comparison branch", () => {
    expect(shouldShowConversionCard({ ...base, displayMode: "no-comparison" })).toBe(true);
  });

  it("is true for a non-renderable result in the before-after branch", () => {
    expect(shouldShowConversionCard({ ...base, displayMode: "before-after" })).toBe(true);
  });

  it("is true for plain live-preview without a wrapper style", () => {
    expect(
      shouldShowConversionCard({
        ...base,
        displayMode: "live-preview",
        hasImageWrapperStyle: false,
      }),
    ).toBe(true);
  });

  it("is false for live-preview + wrapper style with the original present (WYSIWYG / #713 handles it)", () => {
    expect(
      shouldShowConversionCard({
        ...base,
        displayMode: "live-preview",
        hasImageWrapperStyle: true,
        originalBlobUrl: "blob:original",
      }),
    ).toBe(false);
  });

  it("is true for live-preview + wrapper style when the original is gone", () => {
    expect(
      shouldShowConversionCard({
        ...base,
        displayMode: "live-preview",
        hasImageWrapperStyle: true,
        originalBlobUrl: null,
      }),
    ).toBe(true);
  });
});
