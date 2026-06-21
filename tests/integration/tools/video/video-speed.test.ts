import { mkdtempSync, writeFileSync } from "node:fs";
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
let sourceDurationS: number;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  // Probe source duration and verify sampleRate for comparison
  const tmpDir = mkdtempSync(join(tmpdir(), "speed-src-"));
  const srcFile = join(tmpDir, "tiny.mp4");
  writeFileSync(srcFile, MP4);
  const info = await probeMedia(srcFile);
  sourceDurationS = info.durationS ?? 1;
  const audioStream = info.streams.find((s) => s.type === "audio");
  if (audioStream) {
    // Verify sampleRate is populated correctly from ffprobe
    expect(audioStream.sampleRate).toBe(44100);
  }
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
    url: "/api/v1/tools/video/video-speed",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("video-speed (requires ffmpeg)", () => {
  it("speeds up by factor 2 and halves duration", async () => {
    const res = await runTool({ factor: 2 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "speed-test-"));
    const probeFile = join(tmpDir, "speed.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.durationS).not.toBeNull();

    const expected = sourceDurationS / 2;
    const tolerance = expected * 0.25;
    expect(info.durationS as number).toBeGreaterThan(expected - tolerance);
    expect(info.durationS as number).toBeLessThan(expected + tolerance);
  }, 60_000);

  it("speeds up by factor 2 with keepPitch=false and halves duration", async () => {
    const res = await runTool({ factor: 2, keepPitch: false });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "speed-nopitch-"));
    const probeFile = join(tmpDir, "speed-nopitch.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.durationS).not.toBeNull();

    const expected = sourceDurationS / 2;
    const tolerance = expected * 0.25;
    expect(info.durationS as number).toBeGreaterThan(expected - tolerance);
    expect(info.durationS as number).toBeLessThan(expected + tolerance);
  }, 60_000);

  it("rejects factor out of range with 400", async () => {
    const res = await runTool({ factor: 8 });
    expect(res.statusCode).toBe(400);
  });
});
