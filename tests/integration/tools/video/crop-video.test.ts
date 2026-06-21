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
    url: "/api/v1/tools/video/crop-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("crop-video (requires ffmpeg)", () => {
  it("crops to 32x32 and returns 200", async () => {
    const res = await runTool({ width: 32, height: 32, x: 0, y: 0 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "crop-test-"));
    const probeFile = join(tmpDir, "cropped.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const v = info.streams.find((s) => s.type === "video");
    expect(v?.width).toBe(32);
    expect(v?.height).toBe(32);
  }, 60_000);

  it("rejects crop rect exceeding video dimensions with 422", async () => {
    const res = await runTool({ width: 9999, height: 9999 });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details || body.error).toMatch(/exceeds video size/i);
  }, 60_000);

  it("rejects missing width with 400", async () => {
    const res = await runTool({});
    expect(res.statusCode).toBe(400);
  });
});
