/**
 * Tier-2 depth tests: real TTS speech heroes through real audio tool routes.
 *
 * Exercises convert-audio and normalize-audio with the typed fixture registry,
 * verifying output validity via ffprobe (codec, duration, stream presence).
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const SPEECH_WAV = readFixture(fixtures.audio.speech.wav);
const SPEECH_FLAC = readFixture(fixtures.audio.speech.flac);
const SPEECH_OGG = readFixture(fixtures.audio.speech.ogg);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/** POST a file to a tool route. */
async function postTool(
  toolId: string,
  settings: Record<string, unknown>,
  file: Buffer,
  filename: string,
  ct: string,
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: ct, content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: apiToolPath(toolId),
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

/** Download a result and return the raw payload. */
async function download(downloadUrl: string): Promise<Buffer> {
  const dl = await app.inject({
    method: "GET",
    url: downloadUrl,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(dl.statusCode).toBe(200);
  return dl.rawPayload;
}

/** Write a buffer to a temp file and probe it. */
async function probeBuffer(buf: Buffer, ext: string) {
  const dir = mkdtempSync(join(tmpdir(), "audio-depth-"));
  const filePath = join(dir, `output.${ext}`);
  writeFileSync(filePath, buf);
  return probeMedia(filePath);
}

// -----------------------------------------------------------------------
// Convert audio depth tests
// -----------------------------------------------------------------------
describe.skipIf(!ffmpegAvailable())("Audio depth: convert-audio real speech", () => {
  it("converts WAV speech to MP3, output has audio stream with duration > 0", async () => {
    const res = await postTool(
      "convert-audio",
      { format: "mp3" },
      SPEECH_WAV,
      "speech-10s.wav",
      "audio/wav",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    const info = await probeBuffer(payload, "mp3");
    const audio = info.streams.find((s) => s.type === "audio");
    expect(audio).toBeDefined();
    expect(info.durationS).toBeGreaterThan(0);
  }, 60_000);

  it("converts FLAC speech to WAV, output has audio stream", async () => {
    const res = await postTool(
      "convert-audio",
      { format: "wav" },
      SPEECH_FLAC,
      "speech.flac",
      "audio/flac",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    const info = await probeBuffer(payload, "wav");
    const audio = info.streams.find((s) => s.type === "audio");
    expect(audio).toBeDefined();
    expect(info.durationS).toBeGreaterThan(0);
  }, 60_000);

  it("converts OGG speech to FLAC, output is valid FLAC", async () => {
    const res = await postTool(
      "convert-audio",
      { format: "flac" },
      SPEECH_OGG,
      "speech.ogg",
      "audio/ogg",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    const info = await probeBuffer(payload, "flac");
    const audio = info.streams.find((s) => s.type === "audio");
    expect(audio).toBeDefined();
    expect(audio!.codec).toMatch(/flac/i);
    expect(info.durationS).toBeGreaterThan(0);
  }, 60_000);
});

// -----------------------------------------------------------------------
// Normalize audio depth tests
// -----------------------------------------------------------------------
describe.skipIf(!ffmpegAvailable())("Audio depth: normalize-audio real speech", () => {
  it("normalizes WAV speech, output is valid audio with duration > 0", async () => {
    const res = await postTool("normalize-audio", {}, SPEECH_WAV, "speech-10s.wav", "audio/wav");
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const payload = await download(envelope.downloadUrl);
    expect(payload.length).toBeGreaterThan(100);

    const info = await probeBuffer(payload, "wav");
    const audio = info.streams.find((s) => s.type === "audio");
    expect(audio).toBeDefined();
    expect(info.durationS).toBeGreaterThan(0);
  }, 60_000);
});
