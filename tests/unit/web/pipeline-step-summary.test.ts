import { describe, expect, it } from "vitest";
import { getSettingsSummary } from "../../../apps/web/src/components/tools/pipeline-step-summary";

describe("getSettingsSummary", () => {
  it("returns dimensions for resize with width and height", () => {
    expect(getSettingsSummary("resize", { width: 1920, height: 1080 })).toBe("1920 x 1080");
  });

  it("returns percentage for resize with scale", () => {
    expect(getSettingsSummary("resize", { percentage: 50 })).toBe("50%");
  });

  it("returns width only for resize with just width", () => {
    expect(getSettingsSummary("resize", { width: 800 })).toBe("800px wide");
  });

  it("returns quality for compress", () => {
    expect(getSettingsSummary("compress", { quality: 80 })).toBe("Quality 80");
  });

  it("returns target size for compress targetSize mode", () => {
    expect(getSettingsSummary("compress", { mode: "targetSize", targetSizeKb: 200 })).toBe(
      "Target 200 KB",
    );
  });

  it("returns format for convert", () => {
    expect(getSettingsSummary("convert", { format: "webp" })).toBe("WEBP");
  });

  it("returns angle for rotate", () => {
    expect(getSettingsSummary("rotate", { angle: 90 })).toBe("90°");
  });

  it("returns text preview for watermark-text", () => {
    expect(getSettingsSummary("watermark-text", { text: "Copyright 2026" })).toBe("Copyright 2026");
  });

  it("truncates long watermark text", () => {
    expect(
      getSettingsSummary("watermark-text", {
        text: "A very long watermark text that should be truncated",
      }),
    ).toBe("A very long watermark te...");
  });

  it("returns dimensions for crop", () => {
    expect(getSettingsSummary("crop", { width: 800, height: 600 })).toBe("800 x 600");
  });

  it("returns empty string for unknown tool with empty settings", () => {
    expect(getSettingsSummary("unknown-tool", {})).toBe("");
  });

  it("returns empty string for tool with no relevant settings", () => {
    expect(getSettingsSummary("resize", {})).toBe("");
  });
});
