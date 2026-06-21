import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
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
let silentMp4: Buffer;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  // Generate a silent (no audio track) clip for the rejection test
  const tmpDir = mkdtempSync(join(tmpdir(), "loudnorm-fixture-"));
  const silentPath = join(tmpDir, "silent.mp4");
  const result = spawnSync(
    "ffmpeg",
    ["-f", "lavfi", "-i", "color=red:s=64x64:d=1", "-an", "-y", silentPath],
    { timeout: 15_000 },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to generate silent fixture: ${result.stderr?.toString()}`);
  }
  silentMp4 = readFileSync(silentPath);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe.skipIf(!ffmpegAvailable())("video-loudnorm (requires ffmpeg)", () => {
  it("normalizes audio and returns 200", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/video-loudnorm",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);
  }, 60_000);

  it("rejects a video with no audio track with 422", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "silent.mp4", contentType: "video/mp4", content: silentMp4 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/video-loudnorm",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(422);
    const resBody = JSON.parse(res.body);
    expect(resBody.details || resBody.error).toMatch(/no audio track/i);
  }, 60_000);
});
