import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setEncoderInventoryForTests } from "../../../packages/media-engine/src/encoders.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * #1270, file-preview side. The encoder list is pinned in-process rather than
 * read from a binary, so these run on the CI shards, which have no ffmpeg.
 *
 * Previews pass libx264's own options (`-preset ultrafast`), which NVENC
 * rejects, so they must resolve through softwareEncoder and never pick up a
 * hardware encoder. And only the missing-encoder message may reach the client:
 * ffmpeg's own failures carry raw stderr and stay behind the generic text.
 */
const SHIPPED = [
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
];

const ORIGINAL_ACCEL = process.env.SNAPOTTER_HW_ACCEL;

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

afterEach(() => {
  if (ORIGINAL_ACCEL === undefined) delete process.env.SNAPOTTER_HW_ACCEL;
  else process.env.SNAPOTTER_HW_ACCEL = ORIGINAL_ACCEL;
  setEncoderInventoryForTests(undefined);
});

async function generatePreview(filename: string, contentType: string, content: Buffer) {
  const payload = createMultipartPayload([{ name: "file", filename, contentType, content }]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/preview/generate",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": payload.contentType },
    body: payload.body,
  });
}

describe("on-demand preview encoders (#1270)", () => {
  it("uses software libx264 even when NVENC is configured and listed", async () => {
    // With libx264 missing, a software-only lookup must name it. A lookup that
    // honoured SNAPOTTER_HW_ACCEL would pick h264_nvenc instead and fail later
    // with a generic message, since NVENC can't take `-preset ultrafast`.
    setEncoderInventoryForTests(
      new Set([...SHIPPED.filter((n) => n !== "libx264"), "h264_nvenc", "hevc_nvenc"]),
    );
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
    const res = await generatePreview(
      "clip.mp4",
      "video/mp4",
      readFixture(fixtures.video.tiny("mp4")),
    );
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toContain("has no libx264 encoder");
  });

  it("names a missing libmp3lame for an audio preview", async () => {
    setEncoderInventoryForTests(new Set(SHIPPED.filter((n) => n !== "libmp3lame")));
    const res = await generatePreview(
      "clip.wav",
      "audio/wav",
      readFixture(fixtures.audio.tiny("wav")),
    );
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toContain("has no libmp3lame encoder");
  });

  it("keeps any other failure behind the generic message", async () => {
    // Not audio at all, so ffmpeg fails on it (or, on a shard without ffmpeg,
    // runFfmpeg fails to start). Neither message may reach the client.
    setEncoderInventoryForTests(new Set(SHIPPED));
    const res = await generatePreview(
      "clip.wav",
      "audio/wav",
      Buffer.from("not really a wav file"),
    );
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toBe("Could not generate preview");
  });
});
