// epub-convert integration suite.
// Requires pandoc (and weasyprint for the pdf case). Skips locally
// (pandoc absent on dev Macs); the Docker compose smoke is the real proof.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pandocAvailable } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pythonWith } from "../helpers/python-gate.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const EPUB = readFileSync(join(__dirname, "..", "fixtures", "documents", "tiny.epub"));

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
    url: "/api/v1/tools/epub-convert",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!pandocAvailable())("epub-convert (requires pandoc)", () => {
  it("converts epub to HTML containing source text", async () => {
    const res = await runTool("tiny.epub", EPUB, { format: "html" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.payload).toContain("SnapOtter test epub");
  }, 30_000);

  it("converts epub to DOCX with PK magic", async () => {
    const res = await runTool("tiny.epub", EPUB, { format: "docx" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe("PK");
  }, 30_000);

  it("converts epub to Markdown containing source text", async () => {
    const res = await runTool("tiny.epub", EPUB, { format: "md" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.payload.length).toBeGreaterThan(0);
    expect(dl.payload).toContain("SnapOtter");
  }, 30_000);
});

describe.skipIf(!pandocAvailable() || !pythonWith("weasyprint"))(
  "epub-convert pdf (requires pandoc + weasyprint)",
  () => {
    it("converts epub to PDF via the weasyprint chain", async () => {
      const res = await runTool("tiny.epub", EPUB, { format: "pdf" });
      // Long hint: expects 202 with jobId
      expect(res.statusCode).toBe(202);
      const { jobId } = JSON.parse(res.body);
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
  },
);

// Ungated tests: run locally without pandoc
it("rejects missing format with 400", async () => {
  const res = await runTool("tiny.epub", EPUB, {});
  expect(res.statusCode).toBe(400);
});
