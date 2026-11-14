// word-to-pdf integration suite.
// Requires LibreOffice (soffice). Skips locally (soffice absent on dev Macs);
// the Task 14 Docker compose smoke is the real proof that this tool works
// end to end against the containerised LibreOffice install.

import { sofficeAvailable } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const DOCX = readFixture(fixtures.document.tiny("docx"));
const TRUNCATED_DOCX = readFixture(fixtures.document.hostile.truncatedDocx);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(filename: string, content: Buffer) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/files/word-to-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** Poll the durable row until terminal (the long hint skips the sync window). */
async function settledJobRow(jobId: string) {
  const { db, schema } = await import("../../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: { status: string; outputRefs: unknown; error: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!row) throw new Error("job row not found after polling");
  return row;
}

describe.skipIf(!sofficeAvailable())("word-to-pdf (requires soffice)", () => {
  it("returns 202 (long hint) and the job completes with a PDF", async () => {
    const res = await runTool("tiny.docx", DOCX);
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await settledJobRow(jobId);
    expect(row.status).toBe("completed");
    const outName = (row.outputRefs as string[])[0].split("/").pop() as string;
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }, 90_000);

  // Sentry NODE-35: LibreOffice can't load a truncated DOCX, exits 0, and
  // writes nothing. That is the user's file, so the job fails as a 400 with a
  // message about the document, not a 500-class bug (#4380).
  it("fails a truncated DOCX as the user's input, without naming the temp file", async () => {
    const res = await runTool("truncated.docx", TRUNCATED_DOCX);
    expect(res.statusCode).toBe(202);
    const row = await settledJobRow(JSON.parse(res.body).jobId);
    expect(row.status).toBe("failed");
    const error = row.error as { message: string; httpStatus?: number; code?: string };
    expect(error.httpStatus).toBe(400);
    // The code is what the web app translates the failure from (#4679).
    expect(error.code).toBe("DOCUMENT_UNREADABLE");
    expect(error.message).toMatch(/couldn't be opened/);
    expect(error.message).not.toContain("in-truncated");
  }, 90_000);
});
