import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  mp4TimescaleArgs,
  videoEncodeArgsForContainer,
} from "../../../apps/api/src/lib/media-tool.js";
import { setEncoderInventoryForTests } from "../../../packages/media-engine/src/encoders.js";

/**
 * #1090: the H.264 rate-control flags must follow the encoder resolveEncoder
 * picked. On an NVENC host `-crf` is ignored (h264_nvenc has no such option;
 * `-preset medium` is still accepted as a legacy alias), so the quality
 * setting silently did nothing.
 */

const ORIGINAL_ACCEL = process.env.SNAPOTTER_HW_ACCEL;

afterEach(() => {
  if (ORIGINAL_ACCEL === undefined) delete process.env.SNAPOTTER_HW_ACCEL;
  else process.env.SNAPOTTER_HW_ACCEL = ORIGINAL_ACCEL;
  setEncoderInventoryForTests(undefined);
});

const WITH_NVENC = new Set([
  "libx264",
  "libx265",
  "libsvtav1",
  "libvpx-vp9",
  "aac",
  "libopus",
  "libmp3lame",
  "libvorbis",
  "libtheora",
  "h264_nvenc",
  "hevc_nvenc",
  "av1_nvenc",
]);

describe("videoEncodeArgsForContainer", () => {
  it("keeps the libx264 flags on a software host", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(videoEncodeArgsForContainer(".mp4")).toEqual([
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      "-video_track_timescale",
      "90000",
    ]);
  });

  it("switches to NVENC rate control when h264_nvenc is resolved", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(videoEncodeArgsForContainer(".mkv")).toEqual([
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
      "-pix_fmt",
      "yuv420p",
    ]);
  });

  it("leaves the VP9 and Theora branches alone", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    // Neither has a hardware mapping, so their software flags are correct.
    expect(videoEncodeArgsForContainer(".webm")).toContain("-crf");
    expect(videoEncodeArgsForContainer(".ogv")).toEqual(["-c:v", "libtheora", "-q:v", "7"]);
  });
});

/**
 * #2426: without a fixed timescale ffmpeg derives the mp4/mov track timescale
 * from the source's avg_frame_rate, and a long gap between frames in a VFR
 * screen recording overflows the 32-bit stts sample delta.
 */
describe("mp4TimescaleArgs", () => {
  it("pins the video track timescale for mp4, m4v and mov outputs", () => {
    for (const ext of [".mp4", ".m4v", ".mov", ".MOV"]) {
      expect(mp4TimescaleArgs(ext)).toEqual(["-video_track_timescale", "90000"]);
    }
  });

  it("adds nothing for containers without the mov muxer", () => {
    for (const ext of [".mkv", ".webm", ".avi", ".ts", ".ogv", ".mpg", ".3gp", ".3g2"]) {
      expect(mp4TimescaleArgs(ext)).toEqual([]);
    }
  });

  it("is part of the H.264 encode args only for mp4-family containers", () => {
    setEncoderInventoryForTests(WITH_NVENC);
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(videoEncodeArgsForContainer(".mov")).toContain("-video_track_timescale");
    expect(videoEncodeArgsForContainer(".mkv")).not.toContain("-video_track_timescale");
  });
});

/**
 * The eight route files each carried their own copy of the literal, which is
 * why the bug lived in eight places. videoCodecArgs is now the only sanctioned
 * way to put a rate-controlled video encoder on an ffmpeg command line, so a
 * bare resolveEncoder("h264") anywhere in the API is a copy-paste of the bug
 * waiting for someone's GPU box. file-preview.ts is not caught here because it
 * hardcodes libx264 without resolveEncoder at all; #1270 tracks that.
 */
describe("no API code resolves a rate-controlled video encoder by hand", () => {
  const root = join(__dirname, "../../../apps/api/src");
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(root, name));

  it("scans the API source tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds no bare resolveEncoder call for h264, hevc or av1", () => {
    const offenders = files.filter((file) =>
      /resolveEncoder\("(h264|hevc|av1)"\)/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => file.slice(root.length + 1))).toEqual([]);
  });

  it("delegates preserved-container video encoding to videoEncodeArgsForContainer", () => {
    const offenders = files.filter(
      (file) =>
        !file.endsWith("media-tool.ts") &&
        (/function codecForContainer\b/.test(readFileSync(file, "utf8")) ||
          /resolveEncoder\("theora"\)/.test(readFileSync(file, "utf8"))),
    );
    expect(offenders.map((file) => file.slice(root.length + 1))).toEqual([]);
  });
});
