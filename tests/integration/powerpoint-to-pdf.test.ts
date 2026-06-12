// powerpoint-to-pdf integration suite.
// Requires LibreOffice (soffice). Skips locally (soffice absent on dev Macs);
// the Docker compose smoke is the real proof that this tool works end to end
// against the containerised LibreOffice install.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sofficeAvailable } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const PPTX = readFileSync(join(__dirname, "..", "fixtures", "documents", "tiny.pptx"));

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
    url: "/api/v1/tools/powerpoint-to-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!sofficeAvailable())("powerpoint-to-pdf (requires soffice)", () => {
  it("returns 202 (long hint) and the job completes with a PDF", async () => {
    const res = await runTool("tiny.pptx", PPTX);
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    // Poll the durable row until terminal (the long hint skips the sync window).
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
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }, 90_000);
});

it("rejects unsupported file types with 415", async () => {
  const { body, contentType } = createMultipartPayload([
    {
      name: "file",
      filename: "readme.txt",
      contentType: "text/plain",
      content: Buffer.from("hello"),
    },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/powerpoint-to-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(415);
});
