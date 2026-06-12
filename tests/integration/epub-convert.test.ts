// epub-convert integration suite.
// Requires pandoc (and weasyprint for the pdf case). Skips locally
// (pandoc absent on dev Macs); the Docker compose smoke is the real proof.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pandocAvailable } from "@snapotter/doc-engine";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pythonWith } from "../helpers/python-gate.js";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const EPUB = readFileSync(join(__dirname, "..", "fixtures", "documents", "tiny.epub"));

/** Build a minimal valid epub in memory containing a remote image reference. */
function buildRemoteRefEpub(): Buffer {
  const zip = new AdmZip();
  // mimetype must be first entry, stored (no compression)
  zip.addFile("mimetype", Buffer.from("application/epub+zip"), "", 0o644);
  zip.addFile(
    "META-INF/container.xml",
    Buffer.from(
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    ),
  );
  zip.addFile(
    "OEBPS/content.opf",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:00000000-0000-0000-0000-000000000001</dc:identifier>
    <dc:title>RemoteRefBook</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`,
    ),
  );
  zip.addFile(
    "OEBPS/chapter1.xhtml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>RemoteRefBook</title></head>
<body>
  <h1>RemoteRefBook</h1>
  <p>Content for remote-ref SSRF test.</p>
  <img src="http://127.0.0.1:9/x.png" alt="remote"/>
</body>
</html>`,
    ),
  );
  return zip.toBuffer();
}

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

  it("html output passes remote refs through without fetching (no SSRF)", async () => {
    const remoteEpub = buildRemoteRefEpub();
    const res = await runTool("remote.epub", remoteEpub, { format: "html" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    // The literal remote URL must still be present (pandoc did not inline it)
    expect(dl.payload).toContain("http://127.0.0.1:9/x.png");
    expect(dl.payload).toContain("RemoteRefBook");
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
    it("pdf output rejects remote refs in epub content", async () => {
      const remoteEpub = buildRemoteRefEpub();
      const res = await runTool("remote.epub", remoteEpub, { format: "pdf" });
      // Long hint: expects 202 with jobId
      expect(res.statusCode).toBe(202);
      const { jobId } = JSON.parse(res.body);
      const { db, schema } = await import("../../apps/api/src/db/index.js");
      const { eq } = await import("drizzle-orm");
      let row: { status: string; errorMessage: string | null } | undefined;
      for (let i = 0; i < 120; i++) {
        [row] = await db
          .select({ status: schema.jobs.status, errorMessage: schema.jobs.errorMessage })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, jobId));
        if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(row?.status).toBe("failed");
      expect(row?.errorMessage).toMatch(/remote resources are disabled/i);
    }, 90_000);

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
