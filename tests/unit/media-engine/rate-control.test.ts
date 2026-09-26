import { afterEach, describe, expect, it } from "vitest";
import {
  rateControlArgs,
  setEncoderInventoryForTests,
  videoCodecArgs,
} from "../../../packages/media-engine/src/encoders.js";

/**
 * #1090: every H.264 call site used to hardcode `-crf N -preset medium` next
 * to resolveEncoder("h264"). `-crf` is a libx264 option. h264_nvenc has no
 * crf (ffmpeg logs "Codec AVOption crf has not been used for any stream" and
 * encodes at its default VBR), so on an NVENC host the quality the user chose
 * did nothing and compress-video's three levels produced the same file. The
 * rate-control arguments are now a property of the resolved encoder.
 *
 * Assertions are exact arrays: the option names are the whole point, and an
 * existence-only check would pass with `-crf` still in the list.
 */

const ORIGINAL_ACCEL = process.env.SNAPOTTER_HW_ACCEL;

afterEach(() => {
  if (ORIGINAL_ACCEL === undefined) delete process.env.SNAPOTTER_HW_ACCEL;
  else process.env.SNAPOTTER_HW_ACCEL = ORIGINAL_ACCEL;
  setEncoderInventoryForTests(undefined);
});

const ALL_ENCODERS = new Set([
  "h264_nvenc",
  "hevc_nvenc",
  "av1_nvenc",
  "h264_vaapi",
  "hevc_vaapi",
  "libx264",
  "libx265",
  "libsvtav1",
  "libvpx-vp9",
  "aac",
  "libopus",
  "libmp3lame",
]);

describe("rateControlArgs: software", () => {
  it("keeps crf and the medium preset for libx264", () => {
    expect(rateControlArgs("libx264", 20)).toEqual(["-crf", "20", "-preset", "medium"]);
  });

  it("keeps crf and the medium preset for libx265", () => {
    expect(rateControlArgs("libx265", 28)).toEqual(["-crf", "28", "-preset", "medium"]);
  });

  it("passes crf 0 through: lossless is a real libx264 setting", () => {
    expect(rateControlArgs("libx264", 0)).toEqual(["-crf", "0", "-preset", "medium"]);
  });

  it("passes crf 51 through", () => {
    expect(rateControlArgs("libx264", 51)).toEqual(["-crf", "51", "-preset", "medium"]);
  });
});

describe("rateControlArgs: NVENC", () => {
  it("uses constant-quality VBR and a p-preset for h264_nvenc", () => {
    expect(rateControlArgs("h264_nvenc", 20)).toEqual([
      "-rc",
      "vbr",
      "-cq",
      "20",
      "-b:v",
      "0",
      "-preset",
      "p5",
    ]);
  });

  it("uses the same dialect for hevc_nvenc", () => {
    expect(rateControlArgs("hevc_nvenc", 28)).toEqual([
      "-rc",
      "vbr",
      "-cq",
      "28",
      "-b:v",
      "0",
      "-preset",
      "p5",
    ]);
  });

  it("never lets crf 0 turn into NVENC's 'automatic' cq", () => {
    // -cq 0 means "let the driver pick", which is the very bug this replaces.
    expect(rateControlArgs("h264_nvenc", 0)).toEqual([
      "-rc",
      "vbr",
      "-cq",
      "1",
      "-b:v",
      "0",
      "-preset",
      "p5",
    ]);
  });
});

describe("rateControlArgs: VAAPI", () => {
  it("uses constant-QP rate control for h264_vaapi", () => {
    expect(rateControlArgs("h264_vaapi", 20)).toEqual(["-rc_mode", "CQP", "-qp", "20"]);
  });

  it("uses constant-QP rate control for hevc_vaapi", () => {
    expect(rateControlArgs("hevc_vaapi", 28)).toEqual(["-rc_mode", "CQP", "-qp", "28"]);
  });

  it("never lets crf 0 turn into VAAPI's 'unset' qp", () => {
    // -qp 0 is read as "not set" and the driver default (20) is used instead.
    expect(rateControlArgs("h264_vaapi", 0)).toEqual(["-rc_mode", "CQP", "-qp", "1"]);
  });
});

describe("rateControlArgs: contract", () => {
  it("distinct CRF levels stay distinct on every encoder", () => {
    // compress-video's light/balanced/strong (23/28/33) used to collapse on NVENC.
    for (const encoder of ["libx264", "h264_nvenc", "h264_vaapi"]) {
      const levels = [23, 28, 33].map((crf) => rateControlArgs(encoder, crf).join(" "));
      expect(new Set(levels).size).toBe(3);
    }
  });

  it("has a table for every encoder resolveEncoder can return for h264 and hevc", () => {
    const encoders = ["libx264", "libx265", "h264_nvenc", "hevc_nvenc", "h264_vaapi", "hevc_vaapi"];
    for (const encoder of encoders) {
      expect(() => rateControlArgs(encoder, 23)).not.toThrow();
    }
  });

  it("rejects encoders whose quality scale is not the H.264 one", () => {
    // av1_nvenc and libsvtav1 run 0..63, libvpx-vp9 wants -b:v 0 and no preset,
    // libtheora uses -q:v. Each needs its own row before a caller appears.
    for (const encoder of ["av1_nvenc", "libsvtav1", "libvpx-vp9", "libtheora", "aac"]) {
      expect(() => rateControlArgs(encoder, 20)).toThrow(encoder);
    }
  });

  it("rejects a crf outside 0..51 instead of clamping it quietly", () => {
    expect(() => rateControlArgs("libx264", -1)).toThrow(/-1/);
    expect(() => rateControlArgs("libx264", 52)).toThrow(/52/);
    expect(() => rateControlArgs("h264_nvenc", 60)).toThrow(/60/);
  });

  it("rejects a crf that is not an integer", () => {
    // A CRF map that drifted from its Zod enum yields undefined, and
    // Math.round(undefined) is NaN. ffmpeg must never see "-crf NaN".
    expect(() => rateControlArgs("libx264", Number.NaN)).toThrow(/NaN/);
    expect(() => rateControlArgs("libx264", undefined as unknown as number)).toThrow(/undefined/);
    expect(() => rateControlArgs("libx264", Number.POSITIVE_INFINITY)).toThrow(/Infinity/);
    expect(() => rateControlArgs("libx264", 23.5)).toThrow(/23\.5/);
  });
});

describe("videoCodecArgs", () => {
  it("pairs the resolved software encoder with libx264 options", () => {
    setEncoderInventoryForTests(ALL_ENCODERS);
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(videoCodecArgs("h264", 20)).toEqual([
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "medium",
    ]);
  });

  it("pairs the resolved NVENC encoder with NVENC options", () => {
    setEncoderInventoryForTests(ALL_ENCODERS);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(videoCodecArgs("h264", 20)).toEqual([
      "-c:v",
      "h264_nvenc",
      "-rc",
      "vbr",
      "-cq",
      "20",
      "-b:v",
      "0",
      "-preset",
      "p5",
    ]);
  });

  it("pairs the resolved VAAPI encoder with VAAPI options", () => {
    setEncoderInventoryForTests(ALL_ENCODERS);
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    expect(videoCodecArgs("hevc", 28)).toEqual([
      "-c:v",
      "hevc_vaapi",
      "-rc_mode",
      "CQP",
      "-qp",
      "28",
    ]);
  });

  it("falls back to libx264 options when the family is not in the build", () => {
    setEncoderInventoryForTests(new Set(["libx264", "aac"]));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(videoCodecArgs("h264", 23)).toEqual([
      "-c:v",
      "libx264",
      "-crf",
      "23",
      "-preset",
      "medium",
    ]);
  });

  it("never throws for h264 or hevc under any family, with a full inventory", () => {
    setEncoderInventoryForTests(ALL_ENCODERS);
    for (const accel of [undefined, "nvenc", "vaapi"]) {
      if (accel === undefined) delete process.env.SNAPOTTER_HW_ACCEL;
      else process.env.SNAPOTTER_HW_ACCEL = accel;
      for (const target of ["h264", "hevc"] as const) {
        const args = videoCodecArgs(target, 23);
        expect(args[0]).toBe("-c:v");
        if (accel) expect(args).not.toContain("-crf");
      }
    }
  });
});
