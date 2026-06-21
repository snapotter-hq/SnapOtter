// pdf-to-word integration suite.
// Requires pdf2docx (Python). Skips locally (pdf2docx absent on dev Macs);
// the Task 13 Docker compose smoke is the real proof. Uses the 202+poll
// pattern because pdf-to-word has executionHint "long".

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { pythonWith } from "../../../helpers/python-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3);
const hasPdf2docx = pythonWith("pdf2docx");

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
    { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/pdf-to-word",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!hasPdf2docx)("pdf-to-word (requires pdf2docx)", () => {
  it("returns 202 (long hint) and the job completes with a docx", async () => {
    const res = await runTool();
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
    const outName = (row?.outputRefs as string[])[0].split("/").pop() as string;
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    // DOCX files are ZIP archives; PK magic bytes.
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe("PK");
  }, 90_000);
});
