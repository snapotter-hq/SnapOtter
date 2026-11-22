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

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(
  settings: Record<string, unknown>,
  content: Buffer = MP3,
  filename = "tiny.mp3",
  mime = "audio/mpeg",
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: mime, content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/audio/volume-adjust",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** The audio fixtures are all 16-bit, so deeper sources are generated (#5123). */
function sineSource(filename: string, codec: string): Buffer {
  const out = join(mkdtempSync(join(tmpdir(), "vol-src-")), filename);
  const result = spawnSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:a",
    codec,
    out,
  ]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return readFileSync(out);
}

async function outputAudioCodec(payload: Buffer, filename: string): Promise<string | undefined> {
  const probeFile = join(mkdtempSync(join(tmpdir(), "vol-test-")), filename);
  writeFileSync(probeFile, payload);
  const info = await probeMedia(probeFile);
  return info.streams.find((s) => s.type === "audio")?.codec;
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

  it.each([
    ["in24.wav", "pcm_s24le", "audio/wav"],
    ["in24.aiff", "pcm_s24be", "audio/aiff"],
    ["inf.wav", "pcm_f32le", "audio/wav"],
    ["inf.aiff", "pcm_f32be", "audio/aiff"],
  ])(
    "keeps %s at its source depth (%s) (#5123)",
    async (filename, codec, mime) => {
      const res = await runTool({ gainDb: 3 }, sineSource(filename, codec), filename, mime);
      expect(res.statusCode).toBe(200);
      const envelope = JSON.parse(res.body);
      const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
      expect(dl.statusCode).toBe(200);
      expect(await outputAudioCodec(dl.rawPayload, filename)).toBe(codec);
    },
    60_000,
  );

  it("keeps an .aif input as AIFF instead of re-encoding to mp3 (#5161)", async () => {
    const res = await runTool(
      { gainDb: 3 },
      sineSource("tone.aif", "pcm_s16be"),
      "tone.aif",
      "audio/aiff",
    );
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toMatch(/tone_volume\.aif$/);
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"]).toMatch(/^audio\/aiff/);
    expect(await outputAudioCodec(dl.rawPayload, "out.aif")).toBe("pcm_s16be");
  }, 60_000);

  it("rejects gainDb out of range (50)", async () => {
    const res = await runTool({ gainDb: 50 });
    expect(res.statusCode).toBe(400);
  });
});
