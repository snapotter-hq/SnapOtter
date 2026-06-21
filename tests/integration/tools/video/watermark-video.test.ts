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
    url: "/api/v1/tools/video/watermark-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("watermark-video (requires ffmpeg)", () => {
  it("watermarks a video and returns 200 with video content type", async () => {
    const res = await runTool({ text: "CONFIDENTIAL" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "wm-test-"));
    const probeFile = join(tmpDir, "watermarked.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.streams.some((s) => s.type === "video")).toBe(true);
  }, 60_000);

  it("handles special characters and literal percent sequences in text", async () => {
    const res = await runTool({ text: "a:b'c\\d,e %{pts} %{bad}" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const tmpDir = mkdtempSync(join(tmpdir(), "wm-special-"));
    const probeFile = join(tmpDir, "watermarked.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.streams.some((s) => s.type === "video")).toBe(true);
  }, 60_000);

  it("rejects empty text with 400", async () => {
    const res = await runTool({ text: "" });
    expect(res.statusCode).toBe(400);
  });
});
