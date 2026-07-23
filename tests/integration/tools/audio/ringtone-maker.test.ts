import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

// Default durationS in the ringtone-maker settings schema (also its max), so the
// happy-path call with `{}` caps the ringtone at this many seconds.
const MAX_DURATION_S = 30;

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
    url: "/api/v1/tools/audio/ringtone-maker",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("ringtone-maker (requires ffmpeg)", () => {
  it("creates m4r ringtone with defaults and returns 200", async () => {
    const res = await runTool({});
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(200);

    // Semantic oracle: the ringtone must be AAC audio and duration-capped. A bad
    // encode (wrong codec, or no `-t` cap so a long input passes through) still
    // returns valid magic bytes, so probe the real container instead.
    const tmpDir = mkdtempSync(join(tmpdir(), "ringtone-test-"));
    try {
      const outPath = join(tmpDir, "ringtone.m4r");
      writeFileSync(outPath, dl.rawPayload);
      const info = await probeMedia(outPath);
      const audio = info.streams.find((s) => s.type === "audio");
      expect(audio).toBeDefined();
      expect(audio?.codec).toBe("aac");
      // Ringtones are duration-capped at the configured maximum length.
      expect(info.durationS).not.toBeNull();
      expect(info.durationS ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(MAX_DURATION_S);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects startS beyond audio duration (422)", async () => {
    const res = await runTool({ startS: 5 });
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatch(/beyond the end/i);
  }, 60_000);
});
