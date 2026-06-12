// convert-document integration suite.
// Requires LibreOffice (soffice). Skips locally (soffice absent on dev Macs);
// the Docker compose smoke is the real proof that this tool works end to end
// against the containerised LibreOffice install.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sofficeAvailable } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const DOCX = readFileSync(join(__dirname, "..", "fixtures", "documents", "tiny.docx"));
const ODT = readFileSync(join(__dirname, "..", "fixtures", "documents", "tiny.odt"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(filename: string, content: Buffer, settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/convert-document",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

async function pollJob(jobId: string) {
  const { db, schema } = await import("../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: { status: string; outputRefs: unknown; error: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return row;
}

describe.skipIf(!sofficeAvailable())("convert-document (requires soffice)", () => {
  it("converts docx to odt (PK magic)", async () => {
    const res = await runTool("tiny.docx", DOCX, { format: "odt" });
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await pollJob(jobId);
    expect(row?.status).toBe("completed");
    const outName = (row?.outputRefs as string[])[0].split("/").pop() as string;
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    // ODT is a ZIP (PK magic)
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe("PK");
  }, 90_000);

  it("converts odt to docx (PK magic)", async () => {
    const res = await runTool("tiny.odt", ODT, { format: "docx" });
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await pollJob(jobId);
    expect(row?.status).toBe("completed");
    const outName = (row?.outputRefs as string[])[0].split("/").pop() as string;
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    // DOCX is a ZIP (PK magic)
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe("PK");
  }, 90_000);

  it("rejects same-format conversion (docx to docx)", async () => {
    const res = await runTool("tiny.docx", DOCX, { format: "docx" });
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await pollJob(jobId);
    expect(row?.status).toBe("failed");
    const error = row?.error as { message: string } | null;
    expect(error?.message).toMatch(/already in that format/i);
  }, 90_000);
});

it("rejects missing format with 400", async () => {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "tiny.docx", contentType: "application/octet-stream", content: DOCX },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/convert-document",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(400);
});
