import { afterEach, describe, expect, it } from "vitest";
import { type EncoderTarget, resolveEncoder } from "../src/encoders.js";

/**
 * resolveEncoder reads process.env.SNAPOTTER_HW_ACCEL at call time, so each
 * test sets or clears it. Assertions are exact strings: an existence-only test
 * would leave every map-entry mutant alive.
 */
afterEach(() => {
  delete process.env.SNAPOTTER_HW_ACCEL;
});

const ALL_TARGETS: EncoderTarget[] = ["h264", "hevc", "av1", "vp9", "aac", "opus", "mp3"];

describe("resolveEncoder: software (no accel set)", () => {
  const expected: Record<EncoderTarget, string> = {
    h264: "libx264",
    hevc: "libx265",
    av1: "libsvtav1",
    vp9: "libvpx-vp9",
    aac: "aac",
    opus: "libopus",
    mp3: "libmp3lame",
  };
  for (const target of ALL_TARGETS) {
    it(`${target} -> ${expected[target]}`, () => {
      delete process.env.SNAPOTTER_HW_ACCEL;
      expect(resolveEncoder(target)).toBe(expected[target]);
    });
  }

  it("falls back to software when SNAPOTTER_HW_ACCEL is empty string", () => {
    process.env.SNAPOTTER_HW_ACCEL = "";
    expect(resolveEncoder("h264")).toBe("libx264");
  });
});

describe("resolveEncoder: nvenc", () => {
  it("h264 -> h264_nvenc", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
  });
  it("hevc -> hevc_nvenc", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("hevc")).toBe("hevc_nvenc");
  });
  it("av1 -> av1_nvenc", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("av1")).toBe("av1_nvenc");
  });
  it("vp9 has no nvenc entry -> software libvpx-vp9", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("vp9")).toBe("libvpx-vp9");
  });
  it("aac has no nvenc entry -> software aac", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("aac")).toBe("aac");
  });
  it("opus has no nvenc entry -> software libopus", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("opus")).toBe("libopus");
  });
  it("mp3 has no nvenc entry -> software libmp3lame", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("mp3")).toBe("libmp3lame");
  });
});

describe("resolveEncoder: vaapi", () => {
  it("h264 -> h264_vaapi", () => {
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    expect(resolveEncoder("h264")).toBe("h264_vaapi");
  });
  it("hevc -> hevc_vaapi", () => {
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    expect(resolveEncoder("hevc")).toBe("hevc_vaapi");
  });
  it("av1 has no vaapi entry -> software libsvtav1", () => {
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    expect(resolveEncoder("av1")).toBe("libsvtav1");
  });
  it("vp9 has no vaapi entry -> software libvpx-vp9", () => {
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    expect(resolveEncoder("vp9")).toBe("libvpx-vp9");
  });
  it("mp3 has no vaapi entry -> software libmp3lame", () => {
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    expect(resolveEncoder("mp3")).toBe("libmp3lame");
  });
});

describe("resolveEncoder: unknown accel and casing", () => {
  it("unknown accel value falls back to software", () => {
    process.env.SNAPOTTER_HW_ACCEL = "quicksync";
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
  });

  it("lowercases the env value: NVENC selects the nvenc family", () => {
    process.env.SNAPOTTER_HW_ACCEL = "NVENC";
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
  });

  it("lowercases the env value: VaApi selects the vaapi family", () => {
    process.env.SNAPOTTER_HW_ACCEL = "VaApi";
    expect(resolveEncoder("hevc")).toBe("hevc_vaapi");
  });

  it("does not partial-match: 'nvenc-extra' falls back to software", () => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc-extra";
    expect(resolveEncoder("h264")).toBe("libx264");
  });
});
