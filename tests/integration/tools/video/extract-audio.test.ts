import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP4 = readFixture(fixtures.video.tiny("mp4"));
// H.264 with no audio stream.
const VIDEO_ONLY_MP4 = readFixture(fixtures.video.withMeta);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(
  settings: Record<string, unknown>,
  content: Buffer = MP4,
  toolId = "extract-audio",
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: `/api/v1/tools/video/${toolId}`,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("extract-audio (requires ffmpeg)", () => {
  it("extracts audio from mp4 as mp3 and returns 200", async () => {
    const res = await runTool({ format: "mp3" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);
    const outName = envelope.downloadUrl.split("/").pop() as string;
    expect(outName.endsWith(".mp3")).toBe(true);

    const tmpDir = mkdtempSync(join(tmpdir(), "extract-audio-mp3-"));
    try {
      const outPath = join(tmpDir, "out.mp3");
      writeFileSync(outPath, dl.rawPayload);
      const info = await probeMedia(outPath);
      // Extract-audio must strip video entirely and keep exactly one audio track.
      expect(info.streams.filter((s) => s.type === "video")).toHaveLength(0);
      expect(info.streams.filter((s) => s.type === "audio")).toHaveLength(1);
      // libmp3lame in an mp3 container: codec_name "mp3", format_name "mp3".
      const audio = info.streams.find((s) => s.type === "audio");
      expect(audio?.codec).toBe("mp3");
      expect(info.container).toContain("mp3");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("extracts audio from mp4 as wav and returns 200", async () => {
    const res = await runTool({ format: "wav" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);
    const outName = envelope.downloadUrl.split("/").pop() as string;
    expect(outName.endsWith(".wav")).toBe(true);

    const tmpDir = mkdtempSync(join(tmpdir(), "extract-audio-wav-"));
    try {
      const outPath = join(tmpDir, "out.wav");
      writeFileSync(outPath, dl.rawPayload);
      const info = await probeMedia(outPath);
      // Extract-audio must strip video entirely and keep exactly one audio track.
      expect(info.streams.filter((s) => s.type === "video")).toHaveLength(0);
      expect(info.streams.filter((s) => s.type === "audio")).toHaveLength(1);
      // pcm_s16le in a wav container.
      const audio = info.streams.find((s) => s.type === "audio");
      expect(audio?.codec).toBe("pcm_s16le");
      expect(info.container).toContain("wav");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);

  // #4411 (Sentry NODE-A7): ffmpeg exited 234 and the client got a generic 422.
  it.each([
    ["extract-audio", { format: "mp3" }],
    ["mp4-to-mp3", {}],
  ])(
    "%s answers 400 with a no-audio message for a video-only mp4",
    async (toolId, settings) => {
      const res = await runTool(settings, VIDEO_ONLY_MP4, toolId);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain("no audio track");
    },
    60_000,
  );
});
