// convert-presentation integration suite.
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

async function runTool(filename: string, content: Buffer, settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/convert-presentation",
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

describe.skipIf(!sofficeAvailable())("convert-presentation (requires soffice)", () => {
  it("converts pptx to odp (PK magic)", async () => {
    const res = await runTool("tiny.pptx", PPTX, { format: "odp" });
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
    // ODP is a ZIP (PK magic)
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe("PK");
  }, 90_000);
});

it("rejects missing format with 400", async () => {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "tiny.pptx", contentType: "application/octet-stream", content: PPTX },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/convert-presentation",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(400);
});
