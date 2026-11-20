import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP3 = readFixture(fixtures.audio.tiny("mp3"));
const TONE_GAP = readFixture(fixtures.audio.gap);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe.skipIf(!ffmpegAvailable())("split-audio (requires ffmpeg)", () => {
  it("splits into 2 parts via parts mode", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "settings", content: JSON.stringify({ mode: "parts", parts: 2 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    // ZIP magic: PK\x03\x04
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
  }, 60_000);

  it("splits by silence on tone-gap.wav", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tone-gap.wav", contentType: "audio/wav", content: TONE_GAP },
      {
        name: "settings",
        content: JSON.stringify({ mode: "silence", thresholdDb: -40, minSilenceS: 0.2 }),
      },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    // ZIP magic
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
    expect(dl.rawPayload.length).toBeGreaterThan(400);
  }, 60_000);

  it("rejects silence mode when no silence found", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      {
        name: "settings",
        content: JSON.stringify({ mode: "silence", thresholdDb: -40, minSilenceS: 0.2 }),
      },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/no silence found/i);
  }, 60_000);

  it("splits by time mode on tone-gap.wav (segmentS=1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tone-gap.wav", contentType: "audio/wav", content: TONE_GAP },
      { name: "settings", content: JSON.stringify({ mode: "time", segmentS: 1 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    // ZIP magic
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
  }, 60_000);

  it("never ships a frameless trailing MP3 part in time mode (#4438)", async () => {
    // A 60 s 44.1 kHz MP3 probes as 60.029 s, so a cut at 60 s left a one-frame
    // tail that ffprobe rejected.
    const tmpDir = mkdtempSync(join(tmpdir(), "split-audio-tail-"));
    try {
      const input = join(tmpDir, "sixty.mp3");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=f=440:d=60:sample_rate=44100",
        "-ac",
        "2",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        input,
      ]);
      const { body, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "sixty.mp3",
          contentType: "audio/mpeg",
          content: readFileSync(input),
        },
        { name: "settings", content: JSON.stringify({ mode: "time", segmentS: 10 }) },
      ]);
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/tools/audio/split-audio",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(200);
      const envelope = JSON.parse(res.body);
      const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
      expect(dl.statusCode).toBe(200);

      const entries = new AdmZip(dl.rawPayload).getEntries();
      expect(entries.map((e) => e.entryName).sort()).toEqual([
        "part-000.mp3",
        "part-001.mp3",
        "part-002.mp3",
        "part-003.mp3",
        "part-004.mp3",
        "part-005.mp3",
      ]);
      for (const entry of entries) {
        const partPath = join(tmpDir, basename(entry.entryName));
        writeFileSync(partPath, entry.getData());
        const info = await probeMedia(partPath);
        expect(info.durationS ?? 0).toBeGreaterThan(9);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);

  // Probed duration of every part in the ZIP the tool returns for `input`.
  async function splitAndProbe(
    tmpDir: string,
    input: string,
    settings: Record<string, unknown>,
  ): Promise<Record<string, number>> {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: basename(input),
        contentType: "application/octet-stream",
        content: readFileSync(input),
      },
      { name: "settings", content: JSON.stringify(settings) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({
      method: "GET",
      url: JSON.parse(res.body).downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const durations: Record<string, number> = {};
    for (const entry of new AdmZip(dl.rawPayload).getEntries()) {
      const partPath = join(tmpDir, `out-${basename(entry.entryName)}`);
      writeFileSync(partPath, entry.getData());
      durations[entry.entryName] = (await probeMedia(partPath)).durationS ?? 0;
    }
    return durations;
  }

  it.each(["flac", "opus"])(
    "time-mode %s parts report their own duration, not the source's (#4885)",
    async (ext) => {
      // FLAC parts kept the source's STREAMINFO total and the second Opus part
      // kept running granule positions, so both probed as 20 s.
      const tmpDir = mkdtempSync(join(tmpdir(), "split-audio-dur-"));
      try {
        const input = join(tmpDir, `twenty.${ext}`);
        execFileSync("ffmpeg", [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "sine=f=440:d=20:sample_rate=48000",
          "-ac",
          "2",
          input,
        ]);
        const durations = await splitAndProbe(tmpDir, input, { mode: "time", segmentS: 10 });

        expect(Object.keys(durations).sort()).toEqual([`part-000.${ext}`, `part-001.${ext}`]);
        for (const durationS of Object.values(durations)) {
          expect(durationS).toBeGreaterThan(9);
          expect(durationS).toBeLessThan(11);
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it("silence-mode FLAC parts report their own duration (#4885)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "split-audio-dur-"));
    try {
      const wav = join(tmpDir, "tone-gap.wav");
      writeFileSync(wav, TONE_GAP);
      const input = join(tmpDir, "tone-gap.flac");
      execFileSync("ffmpeg", ["-v", "error", "-i", wav, input]);
      // tone-gap.wav is 1.2 s with a silence from 0.4 s to 0.8 s, so the cut
      // lands at 0.6 s and each part is about 0.6 s long.
      const durations = await splitAndProbe(tmpDir, input, {
        mode: "silence",
        thresholdDb: -40,
        minSilenceS: 0.2,
      });

      expect(Object.keys(durations).sort()).toEqual(["part-000.flac", "part-001.flac"]);
      for (const durationS of Object.values(durations)) {
        expect(durationS).toBeGreaterThan(0.4);
        expect(durationS).toBeLessThan(0.8);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects time mode when the whole input fits in one part", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "settings", content: JSON.stringify({ mode: "time", segmentS: 1 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/nothing to split/i);
  }, 60_000);

  it("rejects parts=1 (schema minimum is 2)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "settings", content: JSON.stringify({ mode: "parts", parts: 1 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/split-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
  }, 60_000);
});
