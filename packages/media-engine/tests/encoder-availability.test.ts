import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { ffmpegAvailable, resolveFfmpeg } from "../src/binaries.js";
import {
  type EncoderTarget,
  parseEncoderNames,
  resolveEncoder,
  setEncoderInventoryForTests,
} from "../src/encoders.js";

/**
 * Regression cover for #1054. `resolveEncoder` used to return the mapped
 * hardware name without checking that the binary provides it, so
 * SNAPOTTER_HW_ACCEL=nvenc on the published image (QSV only, no NVENC and no
 * VAAPI on either arch) sent `-c:v h264_nvenc` to ffmpeg and every
 * re-encoding job died with `Unknown encoder 'h264_nvenc'`.
 */

afterEach(() => {
  delete process.env.SNAPOTTER_HW_ACCEL;
  setEncoderInventoryForTests(undefined);
});

/**
 * Shape of real `ffmpeg -encoders` output. The legend rows above the table
 * carry the same leading-flag pattern as real rows, which is the trap a naive
 * parser falls into: it records "=" as an encoder.
 *
 * This particular inventory is the published image's: libx264/libx265/QSV and
 * v4l2m2m, no NVENC, no VAAPI.
 */
const SHIPPED_QSV_ONLY = `Encoders:
 V..... = Video
 A..... = Audio
 S..... = Subtitle
 .F.... = Frame-level multithreading
 ..S... = Slice-level multithreading
 ...X.. = Codec is experimental
 ....B. = Supports draw_horiz_band
 .....D = Supports direct rendering method 1
 ------
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V....D libx264rgb           libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 RGB (codec h264)
 V..... h264_qsv             H.264 / AVC (Intel Quick Sync Video acceleration) (codec h264)
 V..... h264_v4l2m2m         V4L2 mem2mem H.264 encoder wrapper (codec h264)
 V....D libx265              libx265 H.265 / HEVC (codec hevc)
 V..... hevc_qsv             HEVC (Intel Quick Sync Video acceleration) (codec hevc)
 V....D libsvtav1            SVT-AV1 encoder (codec av1)
 V....D libvpx-vp9           libvpx VP9 (codec vp9)
 A....D aac                  AAC (Advanced Audio Coding)
 A....D libopus              libopus Opus (codec opus)
 A....D libmp3lame           libmp3lame MP3 (MPEG audio layer 3) (codec mp3)
`;

/** Same shape, but from a build that really was compiled with NVENC. */
const WITH_NVENC = `${SHIPPED_QSV_ONLY} V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
 V....D hevc_nvenc           NVIDIA NVENC hevc encoder (codec hevc)
 V....D av1_nvenc            NVIDIA NVENC av1 encoder (codec av1)
`;

describe("parseEncoderNames", () => {
  it("reads the encoder names out of the table", () => {
    const names = parseEncoderNames(SHIPPED_QSV_ONLY);
    expect(names.has("libx264")).toBe(true);
    expect(names.has("libx265")).toBe(true);
    expect(names.has("h264_qsv")).toBe(true);
    expect(names.has("libvpx-vp9")).toBe(true);
    expect(names.has("aac")).toBe(true);
    expect(names.has("libmp3lame")).toBe(true);
  });

  it("does not invent encoders from the legend rows", () => {
    const names = parseEncoderNames(SHIPPED_QSV_ONLY);
    // " V..... = Video" matches on flags alone; the name column holds "=".
    expect(names.has("=")).toBe(false);
    expect(names.has("Video")).toBe(false);
    expect(names.has("Audio")).toBe(false);
    expect(names.has("Subtitle")).toBe(false);
    expect(names.has("------")).toBe(false);
  });

  it("reports absent families as absent", () => {
    const names = parseEncoderNames(SHIPPED_QSV_ONLY);
    expect(names.has("h264_nvenc")).toBe(false);
    expect(names.has("hevc_nvenc")).toBe(false);
    expect(names.has("h264_vaapi")).toBe(false);
  });

  it("returns an empty set for output that is not an encoder table", () => {
    expect(parseEncoderNames("").size).toBe(0);
    expect(parseEncoderNames("ffmpeg: command not found").size).toBe(0);
  });
});

describe("resolveEncoder falls back when the binary lacks the encoder (#1054)", () => {
  it("nvenc requested on a QSV-only build gives software, not h264_nvenc", () => {
    setEncoderInventoryForTests(parseEncoderNames(SHIPPED_QSV_ONLY));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
    expect(resolveEncoder("av1")).toBe("libsvtav1");
  });

  it("vaapi requested on a QSV-only build gives software", () => {
    setEncoderInventoryForTests(parseEncoderNames(SHIPPED_QSV_ONLY));
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("hevc")).toBe("libx265");
  });

  it("still uses hardware when the build really has it", () => {
    setEncoderInventoryForTests(parseEncoderNames(WITH_NVENC));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("h264_nvenc");
    expect(resolveEncoder("hevc")).toBe("hevc_nvenc");
    expect(resolveEncoder("av1")).toBe("av1_nvenc");
  });

  it("treats an unreadable inventory as absent rather than assuming presence", () => {
    setEncoderInventoryForTests(null);
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("h264")).toBe("libx264");
  });

  it("leaves audio targets on software regardless of inventory", () => {
    setEncoderInventoryForTests(parseEncoderNames(WITH_NVENC));
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    expect(resolveEncoder("aac")).toBe("aac");
    expect(resolveEncoder("opus")).toBe("libopus");
    expect(resolveEncoder("mp3")).toBe("libmp3lame");
  });

  it("does not consult the inventory when no accel is configured", () => {
    // A null inventory means "nothing is available". Software targets must
    // still resolve, which proves the default path never reaches the gate.
    setEncoderInventoryForTests(null);
    delete process.env.SNAPOTTER_HW_ACCEL;
    expect(resolveEncoder("h264")).toBe("libx264");
    expect(resolveEncoder("vp9")).toBe("libvpx-vp9");
  });
});

/**
 * The seam tests above pin the logic; this one pins reality. It runs only
 * where ffmpeg exists (CI integration shards have no ffmpeg), and asserts the
 * property that actually matters: whatever resolveEncoder hands back, this
 * ffmpeg can run it.
 */
describe.runIf(ffmpegAvailable())("resolveEncoder against the real ffmpeg binary", () => {
  const TARGETS: EncoderTarget[] = ["h264", "hevc", "av1", "vp9", "aac", "opus", "mp3"];
  // One spawn for the whole block: this used to shell out once per target.
  const installed = parseEncoderNames(realEncoderOutput());

  for (const accel of ["", "nvenc", "vaapi", "quantum"]) {
    it(`every target resolves to an encoder this build has (SNAPOTTER_HW_ACCEL=${accel || "unset"})`, () => {
      setEncoderInventoryForTests(undefined);
      if (accel) process.env.SNAPOTTER_HW_ACCEL = accel;
      else delete process.env.SNAPOTTER_HW_ACCEL;

      for (const target of TARGETS) {
        const chosen = resolveEncoder(target);
        expect(
          installed.has(chosen),
          `${target} resolved to "${chosen}", which this ffmpeg does not list. ` +
            "If that is a software encoder, this build is leaner than the shipped " +
            "one and the gap is #1092, not the hardware gate.",
        ).toBe(true);
      }
    });
  }
});

function realEncoderOutput(): string {
  const bin = resolveFfmpeg();
  if (!bin) return "";
  return spawnSync(bin, ["-hide_banner", "-encoders"], { encoding: "utf8" }).stdout ?? "";
}
