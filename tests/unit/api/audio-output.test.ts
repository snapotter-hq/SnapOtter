import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  audioEncodeArgsForContainer,
  audioOutputFor,
  videoEncodeArgsForContainer,
} from "../../../apps/api/src/lib/media-tool.js";
import { setEncoderInventoryForTests } from "../../../packages/media-engine/src/encoders.js";

/**
 * What the published image's static ffmpeg lists, so these tests never read
 * the ambient binary (CI has none, and a dev box may have a lean one).
 */
const SHIPPED = new Set([
  "libx264",
  "libx265",
  "libsvtav1",
  "libvpx-vp9",
  "aac",
  "libopus",
  "libmp3lame",
  "libvorbis",
  "libtheora",
  "libwebp_anim",
]);

const without = (...missing: string[]) =>
  new Set([...SHIPPED].filter((name) => !missing.includes(name)));

beforeEach(() => {
  delete process.env.SNAPOTTER_HW_ACCEL;
  setEncoderInventoryForTests(SHIPPED);
});

afterEach(() => {
  setEncoderInventoryForTests(undefined);
});

describe("audioOutputFor", () => {
  it("normalises uppercase extensions", () => {
    const out = audioOutputFor(".MP3");
    expect(out.ext).toBe(".mp3");
    expect(out.contentType).toBe("audio/mpeg");
    expect(out.encodeArgs).toContain("libmp3lame");
  });

  it("falls back to mp3 for decode-only formats", () => {
    const out = audioOutputFor(".wma");
    expect(out.ext).toBe(".mp3");
    expect(out.contentType).toBe("audio/mpeg");
  });

  it("maps .aac input to .m4a output", () => {
    const out = audioOutputFor(".aac");
    expect(out.ext).toBe(".m4a");
    expect(out.contentType).toBe("audio/mp4");
    expect(out.encodeArgs).toContain("aac");
  });

  it("keeps the encoder-specific options next to each encoder", () => {
    expect(audioOutputFor(".ogg").encodeArgs).toEqual(["-c:a", "libvorbis", "-q:a", "6"]);
    expect(audioOutputFor(".opus").encodeArgs).toEqual(["-c:a", "libopus", "-b:a", "128k"]);
    expect(audioOutputFor(".mp3").encodeArgs).toEqual(["-c:a", "libmp3lame", "-b:a", "192k"]);
  });
});

/**
 * #1270: these used to hardcode libmp3lame, libvorbis and libtheora, so a lean
 * ffmpeg failed with "Unknown encoder" and the user was told their file was
 * corrupt. They go through resolveEncoder now and name the missing encoder.
 */
describe("media-tool encoders on a build that lacks them (#1270)", () => {
  it("audioOutputFor names a missing libmp3lame, including for the decode-only fallback", () => {
    setEncoderInventoryForTests(without("libmp3lame"));
    expect(() => audioOutputFor(".mp3")).toThrow(/has no libmp3lame encoder/);
    expect(() => audioOutputFor(".wma")).toThrow(/has no libmp3lame encoder/);
  });

  it("audioOutputFor names a missing libvorbis", () => {
    setEncoderInventoryForTests(without("libvorbis"));
    expect(() => audioOutputFor(".ogg")).toThrow(/has no libvorbis encoder/);
  });

  it("audioOutputFor still serves outputs whose encoder is built in", () => {
    setEncoderInventoryForTests(without("libmp3lame", "libvorbis", "libopus"));
    expect(audioOutputFor(".flac").encodeArgs).toEqual(["-c:a", "flac"]);
    expect(audioOutputFor(".wav").encodeArgs).toEqual(["-c:a", "pcm_s16le"]);
    expect(audioOutputFor(".m4a").encodeArgs).toContain("aac");
  });

  /**
   * The map is built at import; if an entry resolved its encoder there, a
   * missing one would throw for every output, or break loading the module.
   */
  it("audioOutputFor resolves per call, not once at module load", () => {
    setEncoderInventoryForTests(without("libmp3lame"));
    expect(() => audioOutputFor(".mp3")).toThrow();
    setEncoderInventoryForTests(SHIPPED);
    expect(audioOutputFor(".mp3").encodeArgs).toContain("libmp3lame");
  });

  it("the ogv container helpers name a missing libtheora and libvorbis", () => {
    setEncoderInventoryForTests(without("libtheora", "libvorbis"));
    expect(() => videoEncodeArgsForContainer(".ogv")).toThrow(/has no libtheora encoder/);
    expect(() => audioEncodeArgsForContainer(".ogg")).toThrow(/has no libvorbis encoder/);
  });

  it("the ogv container helpers use libtheora and libvorbis when present", () => {
    expect(videoEncodeArgsForContainer(".ogv")).toEqual(["-c:v", "libtheora", "-q:v", "7"]);
    expect(audioEncodeArgsForContainer(".ogv")).toEqual(["-c:a", "libvorbis"]);
  });

  it("fails open when the encoder list could not be read", () => {
    setEncoderInventoryForTests(null);
    expect(audioOutputFor(".mp3").encodeArgs).toContain("libmp3lame");
    expect(videoEncodeArgsForContainer(".ogv")).toContain("libtheora");
  });
});
