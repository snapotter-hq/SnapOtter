import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
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
    url: "/api/v1/tools/rotate-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("rotate-video (requires ffmpeg)", () => {
  it("rotates cw90 and swaps dimensions", async () => {
    // First probe the source to know its original dimensions
    const srcDir = mkdtempSync(join(tmpdir(), "rotate-src-"));
    const srcFile = join(srcDir, "tiny.mp4");
    writeFileSync(srcFile, MP4);
    const srcInfo = await probeMedia(srcFile);
    const srcV = srcInfo.streams.find((s) => s.type === "video");
    const srcW = srcV?.width ?? 0;
    const srcH = srcV?.height ?? 0;

    const res = await runTool({ transform: "cw90" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const tmpDir = mkdtempSync(join(tmpdir(), "rotate-test-"));
    const probeFile = join(tmpDir, "rotated.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const v = info.streams.find((s) => s.type === "video");
    // After 90-degree rotation, width and height should swap
    expect(v?.width).toBe(srcH);
    expect(v?.height).toBe(srcW);
  }, 60_000);
});
