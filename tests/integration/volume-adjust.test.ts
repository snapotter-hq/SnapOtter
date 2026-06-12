import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MP3 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp3"));

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
    { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/volume-adjust",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("volume-adjust (requires ffmpeg)", () => {
  it("adjusts volume and returns 200 with audio stream", async () => {
    const res = await runTool({ gainDb: 3 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "vol-test-"));
    const probeFile = join(tmpDir, "adjusted.mp3");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const audio = info.streams.find((s) => s.type === "audio");
    expect(audio).toBeDefined();
  }, 60_000);

  it("rejects gainDb out of range (50)", async () => {
    const res = await runTool({ gainDb: 50 });
    expect(res.statusCode).toBe(400);
  });
});
