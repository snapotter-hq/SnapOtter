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
    { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/video/convert-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!ffmpegAvailable())("convert-video (requires ffmpeg)", () => {
  it("returns 202 (long hint) and the job completes with a webm", async () => {
    const res = await runTool({ format: "webm", quality: "small" });
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    // Poll the durable row until terminal (the long hint skips the sync window).
    const { db, schema } = await import("../../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    let row: { status: string; outputRefs: unknown } | undefined;
    for (let i = 0; i < 120; i++) {
      [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(row?.status).toBe("completed");
    const outputRefs = (row?.outputRefs ?? []) as string[];
    const outName = outputRefs[0].split("/").pop() as string;
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    expect(outName.endsWith(".webm")).toBe(true);
    expect(dl.rawPayload.length).toBeGreaterThan(100);

    // Semantic check: a real mp4 -> webm conversion must re-encode the video to
    // a VP-family codec inside a webm container. The input fixture is h264 in an
    // mp4 container, so an h264 stream here means the container was renamed
    // without transcoding (the tool asks for resolveEncoder("vp9") -> libvpx-vp9).
    const dir = mkdtempSync(join(tmpdir(), "convert-webm-"));
    try {
      const outPath = join(dir, outName);
      writeFileSync(outPath, dl.rawPayload);
      const info = await probeMedia(outPath);
      expect(info.container).toContain("webm");
      const video = info.streams.find((s) => s.type === "video");
      expect(video).toBeDefined();
      expect(video?.codec).toMatch(/^vp[89]$/);
      expect(video?.codec).not.toBe("h264");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("converts to mp4 (default settings)", async () => {
    const res = await runTool({ format: "mp4" });
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const { db, schema } = await import("../../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    let row: { status: string; outputRefs: unknown } | undefined;
    for (let i = 0; i < 120; i++) {
      [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(row?.status).toBe("completed");
    const outputRefs = (row?.outputRefs ?? []) as string[];
    const outName = outputRefs[0].split("/").pop() as string;
    expect(outName.endsWith(".mp4")).toBe(true);

    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);

    // Semantic check: the mp4 target encodes video with resolveEncoder("h264")
    // into the mp4 (mov/mp4/m4a) container family. ffprobe reports the container
    // as a comma list ("mov,mp4,m4a,3gp,3g2,mj2"), so match on the mp4 member.
    const dir = mkdtempSync(join(tmpdir(), "convert-mp4-"));
    try {
      const outPath = join(dir, outName);
      writeFileSync(outPath, dl.rawPayload);
      const info = await probeMedia(outPath);
      expect(info.container).toContain("mp4");
      const video = info.streams.find((s) => s.type === "video");
      expect(video).toBeDefined();
      expect(video?.codec).toBe("h264");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("rejects a non-video upload", async () => {
    const png = readFixture(fixtures.image.edge.px1);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "x.mp4", contentType: "video/mp4", content: png },
      { name: "settings", content: JSON.stringify({ format: "mp4" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/convert-video",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/still image|Unrecognized video/);
  });
});
