import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const STEREO = readFileSync(join(__dirname, "..", "fixtures", "media", "tone-stereo.wav"));
const MONO_MP3 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp3"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function postTool(
  filename: string,
  contentTypeHeader: string,
  fileContent: Buffer,
  settings: Record<string, unknown>,
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: contentTypeHeader, content: fileContent },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/audio-channels",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("audio-channels (requires ffmpeg)", () => {
  it("stereo-to-mono on stereo file produces mono output", async () => {
    const res = await postTool("tone-stereo.wav", "audio/wav", STEREO, {
      mode: "stereo-to-mono",
    });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    const tmpDir = mkdtempSync(join(tmpdir(), "ch-test-"));
    const probeFile = join(tmpDir, "mono.wav");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const audio = info.streams.find((s) => s.type === "audio");
    expect(audio?.channels).toBe(1);
  }, 60_000);

  it("swap on stereo file returns 200 with 2 channels", async () => {
    const res = await postTool("tone-stereo.wav", "audio/wav", STEREO, { mode: "swap" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });

    const tmpDir = mkdtempSync(join(tmpdir(), "ch-test-"));
    const probeFile = join(tmpDir, "swapped.wav");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const audio = info.streams.find((s) => s.type === "audio");
    expect(audio?.channels).toBe(2);
  }, 60_000);

  it("stereo-to-mono on mono input returns 422", async () => {
    const res = await postTool("tiny.mp3", "audio/mpeg", MONO_MP3, {
      mode: "stereo-to-mono",
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toMatch(/stereo input/i);
  }, 60_000);

  it("rejects missing mode (400)", async () => {
    const res = await postTool("tone-stereo.wav", "audio/wav", STEREO, {});
    expect(res.statusCode).toBe(400);
  });
});
