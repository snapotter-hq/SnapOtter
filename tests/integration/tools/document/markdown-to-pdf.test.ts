// markdown-to-pdf integration suite.
// Requires WeasyPrint AND the markdown Python module.
// Both are Docker-only, absent locally; gated describes skip cleanly.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { pythonWith } from "../../../helpers/python-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MD = readFixture(fixtures.document.tiny("md"));

const hasWeasyprint = pythonWith("weasyprint");
const hasMarkdownMod = pythonWith("markdown");

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
    url: "/api/v1/tools/files/markdown-to-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!hasWeasyprint || !hasMarkdownMod)(
  "markdown-to-pdf (requires weasyprint + markdown)",
  () => {
    it("returns 202 (long hint) and the job completes with a PDF", async () => {
      const res = await runTool("tiny.md", MD);
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
  },
);

// Ungated: runs locally without weasyprint/markdown
it("rejects a .txt file with 415", async () => {
  const txtContent = Buffer.from("hello world");
  const res = await runTool("readme.txt", txtContent);
  expect(res.statusCode).toBe(415);
});
