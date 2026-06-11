import { resolveEncoder } from "@snapotter/media-engine";
import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL = process.env.SNAPOTTER_HW_ACCEL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SNAPOTTER_HW_ACCEL;
  else process.env.SNAPOTTER_HW_ACCEL = ORIGINAL;
});

describe("resolveEncoder", () => {
  it("defaults to software encoders", () => {
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
    expect(resolveEncoder("av1")).toBe("libsvtav1");
    expect(resolveEncoder("aac")).toBe("aac");
  });

  it("maps nvenc when SNAPOTTER_HW_ACCEL=nvenc", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
    expect(resolveEncoder("hevc")).toBe("hevc_nvenc");
    expect(resolveEncoder("aac")).toBe("aac"); // audio unaffected
  });

  it("falls back to software for unknown accel values", () => {
    process.env.SNAPOTTER_HW_ACCEL = "quantum";
    expect(resolveEncoder("h264")).toBe("libx264");
  });
});
