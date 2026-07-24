import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable } from "@snapotter/media-engine";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InputValidationError } from "../../../../apps/api/src/modality/contract.js";
import { getToolConfig } from "../../../../apps/api/src/routes/tool-factory.js";
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

describe.skipIf(!ffmpegAvailable())("video-to-gif (requires ffmpeg)", () => {
  it("normalizes sub-microsecond offsets instead of emitting exponential ffmpeg syntax", async () => {
    const config = getToolConfig("video-to-gif");
    if (!config?.processV2) throw new Error("video-to-gif processV2 must be registered");
    const scratchDir = await mkdtemp(join(tmpdir(), "snapotter-video-to-gif-test-"));

    try {
      const result = await config.processV2({
        inputs: [{ buffer: MP4, filename: "tiny.mp4", ref: "test/tiny.mp4" }],
        settings: { fps: 1, width: 120, startS: Number.MIN_VALUE, durationS: 1 },
        scratchDir,
        signal: new AbortController().signal,
        report: () => undefined,
      });
      if (!result.scratchPath) throw new Error("video-to-gif must return a scratch path");
      const output = await readFile(result.scratchPath);
      expect(output.subarray(0, 4).toString("ascii")).toBe("GIF8");
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  });

  it("rejects a start time beyond the video instead of running an empty encode", async () => {
    const config = getToolConfig("video-to-gif");
    if (!config?.processV2) throw new Error("video-to-gif processV2 must be registered");
    const processV2 = config.processV2;
    const scratchDir = await mkdtemp(join(tmpdir(), "snapotter-video-to-gif-test-"));

    try {
      await expect(
        processV2({
          inputs: [{ buffer: MP4, filename: "tiny.mp4", ref: "test/tiny.mp4" }],
          settings: { fps: 1, width: 672, startS: 2, durationS: 1 },
          scratchDir,
          signal: new AbortController().signal,
          report: () => undefined,
        }),
      ).rejects.toBeInstanceOf(InputValidationError);
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  });

  it("returns 202 (long hint) and produces a GIF with GIF8 magic", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({ fps: 8, width: 120, durationS: 1 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/video-to-gif",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await pollJob(jobId);
    expect(row?.status).toBe("completed");
    const outputRefs = (row?.outputRefs ?? []) as string[];
    const outName = outputRefs[0].split("/").pop() as string;
    expect(outName.endsWith(".gif")).toBe(true);
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    // GIF files start with GIF8 magic bytes
    const magic = dl.rawPayload.subarray(0, 4).toString("ascii");
    expect(magic).toBe("GIF8");
    // Decode the payload and confirm it is an animated GIF at the requested width.
    const meta = await sharp(dl.rawPayload, { animated: true }).metadata();
    expect(meta.format).toBe("gif");
    expect(meta.width).toBe(120);
    expect((meta.pages ?? 1) > 1).toBe(true);
  }, 90_000);
});
