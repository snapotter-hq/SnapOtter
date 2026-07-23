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

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/video/extract-audio",
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
});
