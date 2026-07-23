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

const MP4 = readFixture(fixtures.video.tiny("mp4"));
// A genuinely compressible clip (480x270, ~30s). The tiny fixture is already so
// small that re-encoding cannot beat MP4 container overhead, so the "output is
// smaller than input" invariant is only meaningful on a source with real
// bitrate slack.
const COMPRESSIBLE_MP4 = readFixture(fixtures.video.hero.mp4);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function pollJob(jobId: string) {
  const { db, schema } = await import("../../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: { status: string; outputRefs: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return row;
}

async function runTool(settings: Record<string, unknown>, content: Buffer = MP4) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/video/compress-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("compress-video (requires ffmpeg)", () => {
  it("returns 202 and produces a compressed mp4", async () => {
    const res = await runTool({ quality: "balanced" }, COMPRESSIBLE_MP4);
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await pollJob(jobId);
    expect(row?.status).toBe("completed");
    const outputRefs = (row?.outputRefs ?? []) as string[];
    const outName = outputRefs[0].split("/").pop() as string;
    expect(outName).toContain("_compressed.mp4");
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // The entire point of compress-video is to shrink the file: the output must
    // be strictly smaller than the input it was handed. Assert the RELATIVE
    // change against the measured input fixture, not a hard-coded byte count.
    expect(dl.rawPayload.length).toBeLessThan(COMPRESSIBLE_MP4.length);

    // Whatever it shrinks to must still decode as a real video, not a stub or a
    // silent audio-only remux.
    const dir = mkdtempSync(join(tmpdir(), "compress-video-"));
    try {
      const outPath = join(dir, outName);
      writeFileSync(outPath, dl.rawPayload);
      const info = await probeMedia(outPath);
      expect(info.streams.some((s) => s.type === "video")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("compresses with 480p resolution", async () => {
    const res = await runTool({ quality: "strong", resolution: "480p" });
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await pollJob(jobId);
    expect(row?.status).toBe("completed");
  }, 90_000);
});
