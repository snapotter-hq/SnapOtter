// html-to-pdf integration suite.
// Requires WeasyPrint (Python). Skips locally (weasyprint absent on dev Macs);
// the Docker compose smoke is the real end-to-end proof.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { pythonWith } from "../../../helpers/python-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const HTML = readFixture(fixtures.document.tiny("html"));
const REMOTE_HTML = readFixture(fixtures.document.remoteImgHtml);

const hasWeasyprint = pythonWith("weasyprint");

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(filename: string, content: Buffer) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/files/html-to-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!hasWeasyprint)("html-to-pdf (requires weasyprint)", () => {
  it("returns 202 (long hint) and the job completes with a PDF", async () => {
    const res = await runTool("tiny.html", HTML);
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
    const outName = (row?.outputRefs as string[])[0].split("/").pop() as string;
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }, 90_000);

  it("SSRF CONTRACT: rejects HTML referencing remote resources", async () => {
    const res = await runTool("remote-img.html", REMOTE_HTML);
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const { db, schema } = await import("../../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    let row: { status: string; error: string | null } | undefined;
    for (let i = 0; i < 120; i++) {
      [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/remote resources are disabled/i);
  }, 90_000);
});

// Ungated: runs locally without weasyprint
it("rejects a .txt file with 415", async () => {
  const txtContent = Buffer.from("hello world");
  const res = await runTool("readme.txt", txtContent);
  expect(res.statusCode).toBe(415);
});
