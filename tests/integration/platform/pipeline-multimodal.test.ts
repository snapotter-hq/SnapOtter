/**
 * Pipeline multimodal pool-routing integration tests.
 *
 * Verifies that pipeline finalize and parent jobs are routed to the correct
 * BullMQ pool based on the first step's modality, rather than always
 * hardcoding "image".
 */

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
});
