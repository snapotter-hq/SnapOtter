import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const WAV = readFixture(fixtures.audio.tiny("wav"));
const MP3 = readFixture(fixtures.audio.tiny("mp3"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(settings: Record<string, unknown>, file = WAV, filename = "tiny.wav") {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "audio/wav", content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/audio/convert-audio",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

function probeSampleRate(payload: Buffer, filename: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "convert-audio-test-"));
  const probeFile = join(tmpDir, filename);
  writeFileSync(probeFile, payload);
  const result = spawnSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=sample_rate",
    "-of",
    "csv=p=0",
    probeFile,
  ]);
  return result.stdout.toString().trim();
}

function probeAudioCodec(payload: Buffer, filename: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "convert-audio-test-"));
  const probeFile = join(tmpDir, filename);
  writeFileSync(probeFile, payload);
  const result = spawnSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name",
    "-of",
    "csv=p=0",
    probeFile,
  ]);
  return result.stdout.toString().trim();
}

/** The audio fixtures are all 16-bit, so 24-bit sources are generated (#4969). */
function sineSource(filename: string, codecArgs: string[]): Buffer {
  const out = join(mkdtempSync(join(tmpdir(), "convert-audio-src-")), filename);
  const result = spawnSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    ...codecArgs,
    out,
  ]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return readFileSync(out);
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
    // mp3 fixture (44100 Hz); the 8 kHz wav -> ogg case is the regression test below.
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

  it("resamples to 44100 Hz when sampleRate is set", async () => {
    // tiny.wav is 8 kHz; the output must carry the requested rate.
    const res = await runTool({ format: "mp3", sampleRate: 44100 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(probeSampleRate(dl.rawPayload, "out.mp3")).toBe("44100");
  }, 60_000);

  it("preserves the source sample rate when sampleRate is omitted", async () => {
    const res = await runTool({ format: "mp3" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(probeSampleRate(dl.rawPayload, "out.mp3")).toBe("8000");
  }, 60_000);

  it("resamples to 96000 Hz for wav output", async () => {
    const res = await runTool({ format: "wav", sampleRate: 96000 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(probeSampleRate(dl.rawPayload, "out.wav")).toBe("96000");
  }, 60_000);

  it("rejects 96000 Hz for mp3 output (libmp3lame caps at 48000)", async () => {
    const res = await runTool({ format: "mp3", sampleRate: 96000 });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Invalid settings");
  });

  it("rejects a sample rate outside the supported set with an actionable message", async () => {
    const res = await runTool({ format: "wav", sampleRate: 12345 });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Invalid settings");
    // API users should see the accepted set, not zod's generic "Invalid input".
    expect(body.details).toContain("8000");
    expect(body.details).toContain("96000");
  });

  it("rejects a bitrate above the MP3 ceiling for low sample rates", async () => {
    // libmp3lame would silently clamp 192 kbps to 64 kbps at 8 kHz.
    const res = await runTool({ format: "mp3", sampleRate: 8000 });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Invalid settings");
  });

  it("converts mp3 at 8000 Hz with a bitrate under the ceiling", async () => {
    const res = await runTool({ format: "mp3", sampleRate: 8000, bitrateKbps: 64 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(probeSampleRate(dl.rawPayload, "out.mp3")).toBe("8000");
  }, 60_000);

  it("converts 8 kHz wav to ogg (regression: libvorbis low samplerate)", async () => {
    // tiny.wav is 8 kHz; a fixed bitrate (-b:a) made libvorbis "encoder setup failed".
    // The ogg path now uses -q:a (quality VBR), which adapts to the sample rate.
    const res = await runTool({ format: "ogg" }, WAV, "tiny.wav");
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);
    expect((envelope.downloadUrl.split("/").pop() as string).endsWith(".ogg")).toBe(true);
  }, 60_000);

  it.each([
    ["in24.flac", ["-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24"]],
    ["in24.aiff", ["-c:a", "pcm_s24be"]],
  ])(
    "keeps %s at 24 bits when converting to wav (#4969)",
    async (filename, codecArgs) => {
      const res = await runTool({ format: "wav" }, sineSource(filename, codecArgs), filename);
      expect(res.statusCode).toBe(200);
      const envelope = JSON.parse(res.body);
      const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
      expect(dl.statusCode).toBe(200);
      expect(probeAudioCodec(dl.rawPayload, "out.wav")).toBe("pcm_s24le");
    },
    60_000,
  );

  it("writes a lossy mp3 as 16-bit wav", async () => {
    const res = await runTool({ format: "wav" }, MP3, "tiny.mp3");
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(probeAudioCodec(dl.rawPayload, "out.wav")).toBe("pcm_s16le");
  }, 60_000);
});
