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
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(
  settings: Record<string, unknown>,
  file: { filename: string; contentType: string; content: Buffer } = {
    filename: "tiny.mp4",
    contentType: "video/mp4",
    content: MP4,
  },
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", ...file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/video/trim-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("trim-video (requires ffmpeg)", () => {
  it("trims a clip (fast, stream-copy) and returns 200", async () => {
    const res = await runTool({ startS: 0, endS: 0.5 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Verify trimmed duration via probeMedia (the plan's verify-don't-trust point)
    const tmpDir = mkdtempSync(join(tmpdir(), "trim-test-"));
    const probeFile = join(tmpDir, "trimmed.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    // About 0.5 s: fast mode cuts frame-accurately (#4370).
    expect(info.durationS).not.toBeNull();
    expect(info.durationS as number).toBeLessThanOrEqual(2);
    expect(info.durationS as number).toBeGreaterThan(0);
  }, 60_000);

  it("trims with precise re-encode and returns 200", async () => {
    const res = await runTool({ startS: 0, endS: 0.5, precise: true });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);
  }, 60_000);

  // media-30s.mp4 has keyframes at 0, 8.02 and 16.05 s at 24 fps (#4370).
  // Fast mode once copied from the keyframe before the start, so 2..7 s
  // came back 7.1 s long.
  async function trimmedDuration(
    settings: Record<string, unknown>,
    fixture: string,
    filename: string,
    mime: string,
  ): Promise<{ durationS: number; streams: string[] }> {
    const res = await runTool(settings, {
      filename,
      contentType: mime,
      content: readFixture(fixture),
    });
    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({ method: "GET", url: JSON.parse(res.body).downloadUrl });
    expect(dl.statusCode).toBe(200);
    const probeFile = join(mkdtempSync(join(tmpdir(), "trim-test-")), filename);
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    return { durationS: info.durationS as number, streams: info.streams.map((s) => s.type) };
  }

  it("fast mode returns the requested range when it ends before the next keyframe", async () => {
    const { durationS } = await trimmedDuration(
      { startS: 2, endS: 7 },
      fixtures.video.hero.mp4,
      "media-30s.mp4",
      "video/mp4",
    );
    expect(durationS).toBeCloseTo(5, 1);
  }, 60_000);

  it("fast mode re-encodes the head and copies from the keyframe on", async () => {
    const { durationS, streams } = await trimmedDuration(
      { startS: 2, endS: 12 },
      fixtures.video.hero.mp4,
      "media-30s.mp4",
      "video/mp4",
    );
    // The copied tail keeps the reference frame past the end that earlier
    // B-frames need (one 42 ms frame on this fixture).
    expect(durationS).toBeGreaterThanOrEqual(9.95);
    expect(durationS).toBeLessThan(10.1);
    expect(streams).toEqual(["video", "audio"]);
  }, 60_000);

  it("fast mode copies a cut that starts on a keyframe, keeping subtitles", async () => {
    const { durationS, streams } = await trimmedDuration(
      { startS: 0, endS: 0.5 },
      fixtures.video.subs.mkv,
      "tiny-subs.mkv",
      "video/x-matroska",
    );
    expect(durationS).toBeLessThan(0.6);
    expect(streams).toEqual(["video", "audio", "other"]);
  }, 60_000);

  it("fast mode falls back to a re-encode for containers it doesn't copy", async () => {
    const { durationS } = await trimmedDuration(
      { startS: 1, endS: 3 },
      fixtures.video.hero.avi,
      "hero.avi",
      "video/x-msvideo",
    );
    expect(durationS).toBeGreaterThan(1.9);
    expect(durationS).toBeLessThan(2.2);
  }, 60_000);

  it("rejects when end is before start", async () => {
    const res = await runTool({ startS: 0.5, endS: 0.2 });
    expect(res.statusCode).toBe(400);
  });

  it("cuts time off both ends without an end time (#728)", async () => {
    // tiny.mp4 is 1s; precise re-encode so the result tracks the cut instead
    // of snapping to a keyframe.
    const res = await runTool({ mode: "ends", cutStartS: 0.2, cutEndS: 0.3, precise: true });
    expect(res.statusCode).toBe(200);
    const dl = await testApp.app.inject({ method: "GET", url: JSON.parse(res.body).downloadUrl });
    expect(dl.statusCode).toBe(200);
    const tmpDir = mkdtempSync(join(tmpdir(), "trim-ends-test-"));
    const probeFile = join(tmpDir, "trimmed.mp4");
    writeFileSync(probeFile, dl.rawPayload);
    const info = await probeMedia(probeFile);
    expect(info.durationS as number).toBeGreaterThan(0.3);
    expect(info.durationS as number).toBeLessThan(0.75);
  }, 60_000);

  it("rejects an ends cut that leaves nothing (#728)", async () => {
    const res = await runTool({ mode: "ends", cutStartS: 0.6, cutEndS: 0.6 });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/nothing of the video is left/);
  });
});
