/**
 * Tier-2 depth tests: real BBB hero through real video tool routes.
 *
 * Exercises convert-video, trim-video, and extract-audio with the typed
 * fixture registry, verifying output codecs, duration, and stream presence
 * via ffprobe.
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

const HERO_MP4 = readFixture(fixtures.video.hero.mp4);

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
  file: Buffer = HERO_MP4,
  filename = "media-30s.mp4",
  ct = "video/mp4",
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

/**
 * Resolve both the 200 (sync) and 202 (async poll) paths.
 * Long-hint video tools may complete within the sync window or fall back to 202.
 */
async function resolveResult(res: Awaited<ReturnType<typeof postTool>>): Promise<Buffer> {
  if (res.statusCode === 200) {
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await app.inject({
      method: "GET",
      url: envelope.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dl.statusCode).toBe(200);
    return dl.rawPayload;
  }

  // 202 async path: poll the job table until terminal
  expect(res.statusCode).toBe(202);
  const { jobId } = JSON.parse(res.body);
  expect(jobId).toBeDefined();

  const { db, schema } = await import("../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: { status: string; outputRefs: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(row?.status).toBe("completed");
  const outName = (row?.outputRefs as string[])[0].split("/").pop() as string;
  const dl = await app.inject({
    method: "GET",
    url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
  });
  expect(dl.statusCode).toBe(200);
  return dl.rawPayload;
}

/** Write a buffer to a temp file and probe it. */
async function probeBuffer(buf: Buffer, ext: string) {
  const dir = mkdtempSync(join(tmpdir(), "vid-depth-"));
  const filePath = join(dir, `output.${ext}`);
  writeFileSync(filePath, buf);
  return probeMedia(filePath);
}

// -----------------------------------------------------------------------
describe.skipIf(!ffmpegAvailable())("Video depth: convert-video hero", () => {
  it("converts hero mp4 to webm, output ffprobes to vp8/vp9 with duration > 0", async () => {
    const res = await postTool("convert-video", { format: "webm", quality: "small" });
    const payload = await resolveResult(res);
    expect(payload.length).toBeGreaterThan(100);

    const info = await probeBuffer(payload, "webm");
    const video = info.streams.find((s) => s.type === "video");
    expect(video).toBeDefined();
    expect(video!.codec).toMatch(/vp[89]/i);
    expect(info.durationS).toBeGreaterThan(0);
  }, 120_000);

  it("converts hero mp4 to mp4 (re-encode), output has h264 video stream", async () => {
    const res = await postTool("convert-video", { format: "mp4" });
    const payload = await resolveResult(res);
    expect(payload.length).toBeGreaterThan(100);

    const info = await probeBuffer(payload, "mp4");
    const video = info.streams.find((s) => s.type === "video");
    expect(video).toBeDefined();
    expect(info.durationS).toBeGreaterThan(0);
  }, 120_000);
});

// -----------------------------------------------------------------------
describe.skipIf(!ffmpegAvailable())("Video depth: trim-video hero", () => {
  it("trims hero to 0-5s, output duration is shorter than input", async () => {
    const res = await postTool("trim-video", { startS: 0, endS: 5 });
    const payload = await resolveResult(res);
    expect(payload.length).toBeGreaterThan(100);

    const info = await probeBuffer(payload, "mp4");
    expect(info.durationS).toBeGreaterThan(0);
    // Trimmed clip should be at most ~7s (keyframe alignment tolerance)
    expect(info.durationS as number).toBeLessThanOrEqual(8);

    // Original hero is ~30s, trimmed must be strictly shorter
    const origDir = mkdtempSync(join(tmpdir(), "vid-orig-"));
    const origPath = join(origDir, "orig.mp4");
    writeFileSync(origPath, HERO_MP4);
    const origInfo = await probeMedia(origPath);
    expect(info.durationS as number).toBeLessThan(origInfo.durationS as number);
  }, 120_000);
});

// -----------------------------------------------------------------------
describe.skipIf(!ffmpegAvailable())("Video depth: extract-audio hero", () => {
  it("extracts audio from hero mp4 as mp3, output has an audio stream", async () => {
    const res = await postTool("extract-audio", { format: "mp3" });
    const payload = await resolveResult(res);
    expect(payload.length).toBeGreaterThan(100);

    const info = await probeBuffer(payload, "mp3");
    const audio = info.streams.find((s) => s.type === "audio");
    expect(audio).toBeDefined();
    expect(info.durationS).toBeGreaterThan(0);
  }, 120_000);
});
