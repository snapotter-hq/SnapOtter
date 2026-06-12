import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MP4 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp4"));

let testApp: TestApp;
let adminToken: string;
let sourceDurationS: number;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  const tmpDir = mkdtempSync(join(tmpdir(), "rev-src-"));
  const srcFile = join(tmpDir, "tiny.mp4");
  writeFileSync(srcFile, MP4);
  const info = await probeMedia(srcFile);
  sourceDurationS = info.durationS ?? 1;
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
    url: "/api/v1/tools/reverse-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("reverse-video (requires ffmpeg)", () => {
  it("reverses a clip and returns 200 with similar duration", async () => {
    const res = await runTool({});
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "rev-test-"));
    const probeFile = join(tmpDir, "reversed.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.durationS).not.toBeNull();

    const tolerance = sourceDurationS * 0.3;
    expect(info.durationS as number).toBeGreaterThan(sourceDurationS - tolerance);
    expect(info.durationS as number).toBeLessThan(sourceDurationS + tolerance);
  }, 60_000);
});
