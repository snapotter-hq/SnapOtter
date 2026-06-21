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
const MP3 = readFixture(fixtures.audio.tiny("mp3"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe.skipIf(!ffmpegAvailable())("replace-audio (requires ffmpeg)", () => {
  it("replaces video audio with the supplied audio track", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/replace-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // replace-audio is fast-hint, so expect 200 (sync window)
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Probe the output: must have both video and audio streams
    const tmpDir = mkdtempSync(join(tmpdir(), "replace-audio-test-"));
    const probeFile = join(tmpDir, "replaced.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.streams.some((s) => s.type === "video")).toBe(true);
    expect(info.streams.some((s) => s.type === "audio")).toBe(true);
  }, 60_000);

  it("rejects when files are in wrong order (mp3 first, mp4 second)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/replace-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // The inputKinds seam validates input 0 as kind "video".
    // mp3 has no video stream, so the handler rejects before processV2.
    // InputValidationError defaults to 400.
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/no video stream/i);
  }, 60_000);

  it("rejects when only one file is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/replace-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // Fast-hint tool: processV2 checks input count and throws,
    // caught by the factory's generic catch -> 422.
    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.details).toMatch(/video and an audio/i);
  }, 60_000);
});
