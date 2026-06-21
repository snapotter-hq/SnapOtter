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
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/**
 * Handles both the 200 sync-window path and the 202+poll path.
 * merge-videos has executionHint "long", so expect 202 in most runs.
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

describe.skipIf(!ffmpegAvailable())("merge-videos (requires ffmpeg)", () => {
  it("merges two copies of tiny.mp4 into a single video", async () => {
    // Send TWO file parts named "file" (the multi-input path)
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.mp4", contentType: "video/mp4", content: MP4 },
      { name: "file", filename: "b.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/merge-videos",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    const { path, downloadPayload } = await resolveResult(res);
    expect(downloadPayload.length).toBeGreaterThan(100);

    // Probe the merged output: duration should be roughly 2x the source
    const tmpDir = mkdtempSync(join(tmpdir(), "merge-test-"));
    const probeFile = join(tmpDir, "merged.mp4");
    writeFileSync(probeFile, downloadPayload);
    const info = await probeMedia(probeFile);

    // Probe the source for comparison
    const srcFile = join(tmpDir, "src.mp4");
    writeFileSync(srcFile, MP4);
    const srcInfo = await probeMedia(srcFile);
    const srcDuration = srcInfo.durationS ?? 0;

    expect(info.durationS).not.toBeNull();
    const merged = info.durationS as number;
    // Within 30% tolerance of 2x source
    expect(merged).toBeGreaterThan(srcDuration * 2 * 0.7);
    expect(merged).toBeLessThan(srcDuration * 2 * 1.3);

    // Record which path was taken for the report
    // eslint-disable-next-line no-console
    console.log(`merge-videos happy path: ${path}`);
  }, 120_000);

  it("rejects a single file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "only.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/merge-videos",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    // merge-videos has executionHint "long", so 202 is returned immediately.
    // The worker then fails with InputValidationError. Poll for the failure.
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    expect(jobId).toBeDefined();

    const { db, schema } = await import("../../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    let row: { status: string; error: unknown } | undefined;
    for (let i = 0; i < 60; i++) {
      [row] = await db
        .select({ status: schema.jobs.status, error: schema.jobs.error })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId));
      if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    // Observed behavior: 202 (async) -> job status "failed" with error message.
    // The plan noted "400/422" but long-hint tools skip the sync window.
    expect(row?.status).toBe("failed");
    const error = row?.error as { message?: string } | null;
    expect(error?.message).toMatch(/at least two/i);
  }, 60_000);
});
