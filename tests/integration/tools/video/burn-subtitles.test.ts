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
const SRT = readFixture(fixtures.video.subs.srt);
const VTT = readFixture(fixtures.video.subs.vtt);
const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/**
 * Handles both the 200 sync-window path and the 202+poll path.
 * burn-subtitles has executionHint "long", so 202 is expected in most runs.
 */
async function resolveResult(res: Awaited<ReturnType<typeof testApp.app.inject>>): Promise<{
  path: "sync" | "poll";
  downloadPayload: Buffer;
}> {
  if (res.statusCode === 200) {
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    return { path: "sync", downloadPayload: dl.rawPayload };
  }

  expect(res.statusCode).toBe(202);
  const { jobId } = JSON.parse(res.body);
  expect(jobId).toBeDefined();

  const { db, schema } = await import("../../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: { status: string; outputRefs: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(row?.status).toBe("completed");
  const outName = (row?.outputRefs as string[])[0].split("/").pop() as string;
  const dl = await testApp.app.inject({
    method: "GET",
    url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
  });
  expect(dl.statusCode).toBe(200);
  return { path: "poll", downloadPayload: dl.rawPayload };
}

describe.skipIf(!ffmpegAvailable())("burn-subtitles (requires ffmpeg)", () => {
  it("burns SRT subtitles onto a video", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "file", filename: "tiny.srt", contentType: "application/x-subrip", content: SRT },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/burn-subtitles",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    const { downloadPayload } = await resolveResult(res);
    expect(downloadPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "burn-srt-"));
    const probeFile = join(tmpDir, "burned.mp4");
    writeFileSync(probeFile, downloadPayload);
    const info = await probeMedia(probeFile);
    expect(info.streams.some((s) => s.type === "video")).toBe(true);
  }, 120_000);

  it("burns VTT subtitles onto a video", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "file", filename: "tiny.vtt", contentType: "text/vtt", content: VTT },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/burn-subtitles",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    const { downloadPayload } = await resolveResult(res);
    expect(downloadPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "burn-vtt-"));
    const probeFile = join(tmpDir, "burned.mp4");
    writeFileSync(probeFile, downloadPayload);
    const info = await probeMedia(probeFile);
    expect(info.streams.some((s) => s.type === "video")).toBe(true);
  }, 120_000);

  it("rejects a PNG as the second file (subtitle kind rejection)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "file", filename: "image.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/burn-subtitles",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // The inputKinds seam validates input 1 as kind "subtitle".
    // A PNG fails the subtitle kind validation.
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/subtitle/i);
  }, 60_000);
});
