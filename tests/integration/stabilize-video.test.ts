import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probeMedia } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const MP4 = readFileSync(join(__dirname, "..", "fixtures", "media", "tiny.mp4"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(settings: Record<string, unknown> = {}) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/stabilize-video",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/**
 * Handles both the 200 sync-window path and the 202+poll path.
 * Long-hint tools may complete within the sync window (200) or go async (202).
 */
async function resolveResult(res: Awaited<ReturnType<typeof runTool>>): Promise<{
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

  const { db, schema } = await import("../../apps/api/src/db/index.js");
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

describe.skipIf(!ffmpegAvailable())("stabilize-video (requires ffmpeg)", () => {
  it("stabilizes a video and returns a downloadable mp4", async () => {
    const res = await runTool({});
    const { downloadPayload } = await resolveResult(res);
    expect(downloadPayload.length).toBeGreaterThan(100);

    const tmpDir = mkdtempSync(join(tmpdir(), "stab-test-"));
    const probeFile = join(tmpDir, "stabilized.mp4");
    writeFileSync(probeFile, downloadPayload);
    const info = await probeMedia(probeFile);
    const v = info.streams.find((s) => s.type === "video");
    expect(v).toBeDefined();
  }, 120_000);

  it("rejects smoothing out of range with 400", async () => {
    const res = await runTool({ smoothing: 100 });
    expect(res.statusCode).toBe(400);
  });
});
