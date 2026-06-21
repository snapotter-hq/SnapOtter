// to-epub integration suite.
// Requires pandoc. Skips locally (pandoc absent on dev Macs);
// the Docker compose smoke is the real proof.

import { pandocAvailable } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MD = readFixture(fixtures.document.tiny("md"));

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
    url: "/api/v1/tools/files/to-epub",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!pandocAvailable())("to-epub (requires pandoc)", () => {
  it("converts tiny.md to EPUB with PK magic", async () => {
    const res = await runTool("tiny.md", MD);
    // to-epub is a "long" tool: it returns 202 + jobId and runs async.
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const { db, schema } = await import("../../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    let row: { status: string; outputRefs: unknown; error: { message: string } | null } | undefined;
    for (let i = 0; i < 120; i++) {
      [row] = await db
        .select({
          status: schema.jobs.status,
          outputRefs: schema.jobs.outputRefs,
          error: schema.jobs.error,
        })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId));
      if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (row?.status !== "completed") {
      throw new Error(`to-epub job ${jobId} ${row?.status}: ${row?.error?.message ?? "unknown"}`);
    }
    const outName = (row.outputRefs as string[])[0].split("/").pop() as string;
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    // EPUB is a ZIP archive (PK magic bytes)
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe("PK");
  }, 90_000);
});

// Ungated: runs locally without pandoc
it("rejects unsupported file types with 415", async () => {
  const { body, contentType } = createMultipartPayload([
    {
      name: "file",
      filename: "data.csv",
      contentType: "text/csv",
      content: Buffer.from("a,b\n1,2"),
    },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/files/to-epub",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
  expect(res.statusCode).toBe(415);
});
