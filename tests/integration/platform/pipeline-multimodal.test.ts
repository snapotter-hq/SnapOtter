/**
 * Pipeline multimodal pool-routing integration tests.
 *
 * Verifies that pipeline finalize and parent jobs are routed to the correct
 * BullMQ pool based on the first step's modality, rather than always
 * hardcoding "image".
 */

import { gsAvailable, qpdfAvailable } from "@snapotter/doc-engine";
import { ffmpegAvailable } from "@snapotter/media-engine";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PDF_FIXTURE = readFixture(fixtures.document.pdf2);
const AUDIO_FIXTURE = readFixture(fixtures.audio.tiny("mp3"));
const VIDEO_FIXTURE = readFixture(fixtures.video.tiny("mp4"));

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
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

/** Helper to POST a pipeline execution request. */
function executePipeline(
  appInstance: TestApp["app"],
  fileBuffer: Buffer,
  filename: string,
  steps: Array<{ toolId: string; settings?: Record<string, unknown> }>,
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, content: fileBuffer, contentType: "application/octet-stream" },
    { name: "pipeline", content: JSON.stringify({ steps }) },
  ]);
  return appInstance.inject({
    method: "POST",
    url: "/api/v1/pipeline/execute",
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
}

// ---------------------------------------------------------------------------
// Pool routing
// ---------------------------------------------------------------------------
describe("Pipeline multimodal pool routing", () => {
  it("routes a document pipeline's parent job to the docs pool", async () => {
    const res = await executePipeline(app, PDF_FIXTURE, "doc.pdf", [
      { toolId: "rotate-pdf", settings: { angle: 90, range: "1-z" } },
      { toolId: "grayscale-pdf", settings: {} },
    ]);

    // Pool is set at enqueue from modality, regardless of processing success
    const body = res.json();
    const jobId = body.jobId ?? body.id;
    expect(jobId).toBeDefined();

    const parent = await db.query.jobs.findFirst({
      where: eq(schema.jobs.id, jobId),
    });
    expect(parent).toBeDefined();
    expect(parent?.pool).toBe("docs");
  });

  // Needs ffmpeg: convert-audio must process for the response to carry the jobId
  // we look up. The docs-pool test above already proves the modality->pool
  // derivation (docs, not the old hardcoded "image") in environments without ffmpeg.
  it.skipIf(!ffmpegAvailable())(
    "routes an audio pipeline's parent job to the media pool",
    async () => {
      const res = await executePipeline(app, AUDIO_FIXTURE, "a2.mp3", [
        { toolId: "convert-audio", settings: { format: "mp3", bitrateKbps: 192 } },
      ]);

      const body = res.json();
      const jobId = body.jobId ?? body.id;
      expect(jobId).toBeDefined();

      const parent = await db.query.jobs.findFirst({
        where: eq(schema.jobs.id, jobId),
      });
      expect(parent).toBeDefined();
      expect(parent?.pool).toBe("media");
    },
  );
});

// ---------------------------------------------------------------------------
// Audio pipeline chain (needs ffmpeg)
// ---------------------------------------------------------------------------
describe.skipIf(!ffmpegAvailable())("Audio pipeline chain", () => {
  it("runs an audio pipeline: convert-audio -> volume-adjust", async () => {
    const res = await executePipeline(app, AUDIO_FIXTURE, "a.mp3", [
      { toolId: "convert-audio", settings: { format: "mp3", bitrateKbps: 192 } },
      { toolId: "volume-adjust", settings: { gainDb: 3 } },
    ]);
    expect(res.statusCode).toBe(200);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Document pipeline chain (needs qpdf + ghostscript)
// ---------------------------------------------------------------------------
describe.skipIf(!qpdfAvailable() || !gsAvailable())("Document pipeline chain", () => {
  it("runs a document pipeline: rotate-pdf -> grayscale-pdf", async () => {
    const res = await executePipeline(app, PDF_FIXTURE, "d.pdf", [
      { toolId: "rotate-pdf", settings: { angle: 90, range: "1-z" } },
      { toolId: "grayscale-pdf", settings: {} },
    ]);
    expect(res.statusCode).toBe(200);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// File pipeline chain (no external tool -- ALWAYS runs)
// ---------------------------------------------------------------------------
describe("File pipeline chain", () => {
  it("runs a file pipeline: json-xml", async () => {
    const res = await executePipeline(app, Buffer.from('{"a":1}'), "x.json", [
      { toolId: "json-xml", settings: {} },
    ]);
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Cross-modality pipeline chain (video -> audio, needs ffmpeg)
// ---------------------------------------------------------------------------
describe.skipIf(!ffmpegAvailable())("Cross-modality pipeline chain", () => {
  it("runs a cross-modality pipeline: extract-audio -> normalize-audio", async () => {
    const res = await executePipeline(app, VIDEO_FIXTURE, "v.mp4", [
      { toolId: "extract-audio", settings: { format: "mp3" } },
      { toolId: "normalize-audio", settings: {} },
    ]);
    expect(res.statusCode).toBe(200);
  }, 60_000);
});
