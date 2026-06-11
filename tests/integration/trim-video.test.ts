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
    url: "/api/v1/tools/trim-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("trim-video (requires ffmpeg)", () => {
  it("trims a clip (fast, stream-copy) and returns 200", async () => {
    const res = await runTool({ startS: 0, endS: 0.5 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Verify trimmed duration via probeMedia (the plan's verify-don't-trust point)
    const tmpDir = mkdtempSync(join(tmpdir(), "trim-test-"));
    const probeFile = join(tmpDir, "trimmed.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    // The trimmed file should be approximately 0.5s (stream-copy may be
    // slightly longer due to keyframe alignment, but well under 2s).
    expect(info.durationS).not.toBeNull();
    expect(info.durationS as number).toBeLessThanOrEqual(2);
    expect(info.durationS as number).toBeGreaterThan(0);
  }, 60_000);

  it("trims with precise re-encode and returns 200", async () => {
    const res = await runTool({ startS: 0, endS: 0.5, precise: true });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);
  }, 60_000);

  it("rejects when end is before start", async () => {
    const res = await runTool({ startS: 0.5, endS: 0.2 });
    expect(res.statusCode).toBe(400);
  });
});
