import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

const MP3 = readFixture(fixtures.audio.tiny("mp3"));
const WAV = readFixture(fixtures.audio.tiny("wav"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe.skipIf(!ffmpegAvailable())("merge-audio (requires ffmpeg)", () => {
  it("merges two audio files with different sample rates", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "file", filename: "tiny.wav", contentType: "audio/wav", content: WAV },
      { name: "settings", content: JSON.stringify({ format: "mp3" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/merge-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    // Probe: duration should be close to 1.044 + 1.0 = 2.044s
    const tmpDir = mkdtempSync(join(tmpdir(), "merge-audio-test-"));
    const probeFile = join(tmpDir, "merged.mp3");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    const expected = 2.04;
    expect(info.durationS).toBeDefined();
    expect(Math.abs((info.durationS ?? 0) - expected)).toBeLessThan(expected * 0.3);
  }, 60_000);

  it("rejects when only one file is provided", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/merge-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/at least 2 files/i);
  }, 60_000);

  it("keeps a 24-bit input's depth in wav output (#4969)", async () => {
    // The audio fixtures are all 16-bit, so the 24-bit source is generated.
    const flacPath = join(mkdtempSync(join(tmpdir(), "merge-audio-src-")), "in24.flac");
    const gen = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-c:a",
      "flac",
      "-sample_fmt",
      "s32",
      "-bits_per_raw_sample",
      "24",
      flacPath,
    ]);
    expect(gen.status).toBe(0);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp3", contentType: "audio/mpeg", content: MP3 },
      {
        name: "file",
        filename: "in24.flac",
        contentType: "audio/flac",
        content: readFileSync(flacPath),
      },
      { name: "settings", content: JSON.stringify({ format: "wav" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/audio/merge-audio",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({ method: "GET", url: JSON.parse(res.body).downloadUrl });
    expect(dl.statusCode).toBe(200);
    const probeFile = join(mkdtempSync(join(tmpdir(), "merge-audio-test-")), "merged.wav");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.streams.find((s) => s.type === "audio")?.codec).toBe("pcm_s24le");
  }, 60_000);
});
