import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const WAV = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.wav"));
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

async function runTool(settings: Record<string, unknown>, file = WAV, filename = "tiny.wav") {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "audio/wav", content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/convert-audio",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("convert-audio (requires ffmpeg)", () => {
  it("converts wav to mp3 and returns 200", async () => {
    const res = await runTool({ format: "mp3" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);
    const outName = envelope.downloadUrl.split("/").pop() as string;
    expect(outName.endsWith(".mp3")).toBe(true);
  }, 60_000);

  it("converts mp3 to ogg and returns 200", async () => {
    // Use mp3 fixture (44100 Hz) because libvorbis rejects the 8 kHz wav
    const res = await runTool({ format: "ogg" }, MP3, "tiny.mp3");
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);
    const outName = envelope.downloadUrl.split("/").pop() as string;
    expect(outName.endsWith(".ogg")).toBe(true);
  }, 60_000);
});
