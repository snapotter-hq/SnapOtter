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
    url: "/api/v1/tools/video-to-frames",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("video-to-frames (requires ffmpeg)", () => {
  it("extracts every-Nth frame and returns a zip", async () => {
    const res = await runTool({ mode: "nth", n: 2 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    // Verify PK zip magic and reasonable size
    const buf = dl.rawPayload;
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
    expect(buf.length).toBeGreaterThan(200);
  }, 60_000);

  it("extracts a single frame at timestamp 0 and returns a zip", async () => {
    const res = await runTool({ mode: "timestamps", timestamps: "0" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    // PK magic
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
  }, 60_000);

  it("rejects timestamps mode with empty timestamps string", async () => {
    const res = await runTool({ mode: "timestamps", timestamps: "" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a timestamp beyond the video duration with 422", async () => {
    const res = await runTool({ mode: "timestamps", timestamps: "999" });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details || body.error).toMatch(/timestamp/i);
  });
});
