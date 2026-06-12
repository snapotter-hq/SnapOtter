import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MP3 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp3"));
const WAV = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.wav"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe.skipIf(!ffmpegAvailable())("merge-audio (requires ffmpeg)", () => {
  it("merges two audio files with different sample rates", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "file", filename: "tiny.wav", contentType: "audio/wav", content: WAV },
      { name: "settings", content: JSON.stringify({ format: "mp3" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/merge-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    // Probe: duration should be close to 1.044 + 1.0 = 2.044s
    const tmpDir = mkdtempSync(join(tmpdir(), "merge-audio-test-"));
    const probeFile = join(tmpDir, "merged.mp3");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const expected = 2.04;
    expect(info.durationS).toBeDefined();
    expect(Math.abs((info.durationS ?? 0) - expected)).toBeLessThan(expected * 0.3);
  }, 60_000);

  it("rejects when only one file is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/merge-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.details).toMatch(/at least two/i);
  }, 60_000);
});
