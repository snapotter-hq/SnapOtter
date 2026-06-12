import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MP4 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp4"));

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
    url: "/api/v1/tools/video-to-webp",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("video-to-webp (requires ffmpeg)", () => {
  it("converts video to animated webp with RIFF/WEBP magic", async () => {
    const res = await runTool({});
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Verify RIFF....WEBP magic bytes
    const buf = dl.rawPayload;
    const riff = buf.subarray(0, 4).toString("ascii");
    const webp = buf.subarray(8, 12).toString("ascii");
    expect(riff).toBe("RIFF");
    expect(webp).toBe("WEBP");
  }, 60_000);
});
