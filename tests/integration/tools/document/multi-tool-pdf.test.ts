import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable, qpdfPageCount } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF3 = readFixture(fixtures.document.pdf3);
const PDF2 = readFixture(fixtures.document.pdf2);

let testApp: TestApp;
let adminToken: string;

const PDF3_PAGES = 3;
const PDF2_PAGES = 2;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

type PlanItem = { doc: number; page: number; rot?: 90 | 180 | 270 };

interface TestFile {
  name: string;
  content: Buffer;
  pages: number;
}

async function runTool(files: TestFile[], items: PlanItem[]) {
  const parts = files.map((f) => ({
    name: "file",
    filename: f.name,
    contentType: "application/pdf",
    content: f.content,
  }));
  parts.push({
    name: "settings",
    contentType: "application/json",
    content: JSON.stringify({
      items,
      pageCounts: files.map((f) => f.pages),
    }),
  });
  const { body, contentType } = createMultipartPayload(parts);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/multi-tool-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

async function download(res: { body: string }): Promise<Buffer> {
  const envelope = JSON.parse(res.body);
  expect(envelope.downloadUrl).toBeDefined();
  const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
  expect(dl.statusCode).toBe(200);
  return dl.rawPayload;
}

describe.skipIf(!qpdfAvailable())("multi-tool-pdf (requires qpdf)", () => {
  it("deletes, duplicates, and reorders pages of one document", async () => {
    const res = await runTool(
      [{ name: "test-3page.pdf", content: PDF3, pages: PDF3_PAGES }],
      [
        { doc: 0, page: 3 },
        { doc: 0, page: 1 },
        { doc: 0, page: 1 },
      ],
    );
    expect(res.statusCode).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), "multi-tool-pdf-test-"));
    try {
      const outPath = join(dir, "out.pdf");
      writeFileSync(outPath, await download(res));
      expect(await qpdfPageCount(outPath)).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("accepts a rotation value in the plan", async () => {
    const res = await runTool(
      [{ name: "test-3page.pdf", content: PDF3, pages: PDF3_PAGES }],
      [
        { doc: 0, page: 1, rot: 90 },
        { doc: 0, page: 2 },
      ],
    );
    expect(res.statusCode).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), "multi-tool-pdf-test-"));
    try {
      const outPath = join(dir, "out.pdf");
      writeFileSync(outPath, await download(res));
      expect(await qpdfPageCount(outPath)).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("pulls pages from a second document", async () => {
    const res = await runTool(
      [
        { name: "test-3page.pdf", content: PDF3, pages: PDF3_PAGES },
        { name: "alt-2page.pdf", content: PDF2, pages: PDF2_PAGES },
      ],
      [
        { doc: 0, page: 1 },
        { doc: 1, page: 1 },
        { doc: 1, page: 2 },
      ],
    );
    expect(res.statusCode).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), "multi-tool-pdf-test-"));
    try {
      const outPath = join(dir, "out.pdf");
      writeFileSync(outPath, await download(res));
      expect(await qpdfPageCount(outPath)).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps distinct PDF uploads with the same filename", async () => {
    const res = await runTool(
      [
        { name: "document.pdf", content: PDF3, pages: PDF3_PAGES },
        { name: "document.pdf", content: PDF2, pages: PDF2_PAGES },
      ],
      [
        { doc: 0, page: 3 },
        { doc: 1, page: 2 },
      ],
    );
    expect(res.statusCode).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), "multi-tool-pdf-test-"));
    try {
      const outPath = join(dir, "out.pdf");
      writeFileSync(outPath, await download(res));
      expect(await qpdfPageCount(outPath)).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it.each([undefined, 90] as const)(
    "rejects a page beyond the declared count with 400 (rotation %s)",
    async (rot) => {
      const res = await runTool(
        [{ name: "test-3page.pdf", content: PDF3, pages: PDF3_PAGES }],
        [{ doc: 0, page: 9, rot }],
      );
      expect(res.statusCode).toBe(400);
    },
    60_000,
  );

  it("answers 400 with the worker's message when a declared page count is forged", async () => {
    // The declared count passes preValidate; only the worker's qpdf check
    // against the real file catches it.
    const res = await runTool(
      [{ name: "test-3page.pdf", content: PDF3, pages: 5 }],
      [{ doc: 0, page: 1 }],
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({
      error: "Page count does not match document 1",
    });
  }, 60_000);

  it("rejects a plan referencing more docs than uploads with 400", async () => {
    // pageCounts has 3 entries for a single upload. Indexer-aligned counts
    // are part of the v2 contract, so this must fail cleanly.
    const parts = [
      {
        name: "file",
        filename: "test-3page.pdf",
        contentType: "application/pdf",
        content: PDF3,
      },
      {
        name: "settings",
        contentType: "application/json",
        content: JSON.stringify({
          items: [{ doc: 0, page: 1 }],
          pageCounts: [3, 3, 3],
        }),
      },
    ];
    const { body, contentType } = createMultipartPayload(parts);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/pdf/multi-tool-pdf",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(400);
  }, 60_000);
});
