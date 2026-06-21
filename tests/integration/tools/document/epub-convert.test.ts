// epub-convert integration suite.
// Requires pandoc (and weasyprint for the pdf case). Skips locally
// (pandoc absent on dev Macs); the Docker compose smoke is the real proof.

import { pandocAvailable } from "@snapotter/doc-engine";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { pythonWith } from "../../../helpers/python-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const EPUB = readFixture(fixtures.document.tiny("epub"));

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
    url: "/api/v1/tools/files/epub-convert",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/**
 * epub-convert is a "long" tool: it returns 202 + jobId and runs async. Poll the
 * job row to completion, then download the output via the job download route.
 * Mirrors the pattern the pdf-chain tests below already use.
 */
async function convertAndDownload(
  filename: string,
  content: Buffer,
  settings: Record<string, unknown>,
) {
  const res = await runTool(filename, content, settings);
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
    throw new Error(
      `epub-convert job ${jobId} ${row?.status}: ${row?.error?.message ?? "unknown"}`,
    );
  }
  const outName = (row.outputRefs as string[])[0].split("/").pop() as string;
  const dl = await testApp.app.inject({
    method: "GET",
    url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
  });
  expect(dl.statusCode).toBe(200);
  return dl;
}

describe.skipIf(!pandocAvailable())("epub-convert (requires pandoc)", () => {
  it("converts epub to HTML containing source text", async () => {
    const dl = await convertAndDownload("tiny.epub", EPUB, { format: "html" });
    expect(dl.payload).toContain("SnapOtter test epub");
  }, 90_000);

  it("converts epub to DOCX with PK magic", async () => {
    const dl = await convertAndDownload("tiny.epub", EPUB, { format: "docx" });
    expect(dl.rawPayload.subarray(0, 2).toString()).toBe("PK");
  }, 90_000);

  it("converts an epub with a remote ref without fetching it (no SSRF)", async () => {
    const remoteEpub = buildRemoteRefEpub();
    // The book references a remote image on a closed port (127.0.0.1:9). The
    // conversion must complete from the book's own content and never fetch that
    // ref (resource embedding is off in the route). pandoc strips the
    // unmanifested remote <img> rather than inlining it; either way it must not
    // be fetched and inlined as a data: URI.
    const dl = await convertAndDownload("remote.epub", remoteEpub, { format: "html" });
    expect(dl.payload).toContain("RemoteRefBook");
    expect(dl.payload).not.toContain("base64");
  }, 90_000);

  it("converts epub to Markdown containing source text", async () => {
    const dl = await convertAndDownload("tiny.epub", EPUB, { format: "md" });
    expect(dl.payload.length).toBeGreaterThan(0);
    expect(dl.payload).toContain("SnapOtter");
  }, 90_000);
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
      const { db, schema } = await import("../../../../apps/api/src/db/index.js");
      const { eq } = await import("drizzle-orm");
      let row: { status: string; error: { message: string } | null } | undefined;
      for (let i = 0; i < 120; i++) {
        [row] = await db
          .select({ status: schema.jobs.status, error: schema.jobs.error })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, jobId));
        if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(row?.status).toBe("failed");
      expect(row?.error?.message).toMatch(/remote resources are disabled/i);
    }, 90_000);

    it("converts epub to PDF via the weasyprint chain", async () => {
      const res = await runTool("tiny.epub", EPUB, { format: "pdf" });
      // Long hint: expects 202 with jobId
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

// Ungated tests: run locally without pandoc
it("rejects missing format with 400", async () => {
  const res = await runTool("tiny.epub", EPUB, {});
  expect(res.statusCode).toBe(400);
});
