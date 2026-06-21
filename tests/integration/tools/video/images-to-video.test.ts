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

const JPG = readFixture(fixtures.image.base.jpg100);
const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe.skipIf(!ffmpegAvailable())("images-to-video (requires ffmpeg)", () => {
  it("creates a slideshow from two images with default settings", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/images-to-video",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const tmpDir = mkdtempSync(join(tmpdir(), "slideshow-"));
    const probeFile = join(tmpDir, "slideshow.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);

    // Duration should be roughly 4s (2 images x 2s default, 30% tolerance)
    expect(info.durationS).not.toBeNull();
    const dur = info.durationS as number;
    expect(dur).toBeGreaterThan(4 * 0.7);
    expect(dur).toBeLessThan(4 * 1.3);

    // Resolution should be 1280x720 (720p default)
    const v = info.streams.find((s) => s.type === "video");
    expect(v).toBeDefined();
    expect(v?.width).toBe(1280);
    expect(v?.height).toBe(720);
  }, 60_000);

  it("rejects a single image with 422", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/images-to-video",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // fast hint: inline 422
    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.details).toMatch(/at least two images/i);
  }, 60_000);
});
