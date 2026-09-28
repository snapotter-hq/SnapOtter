import { chmod, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { getStoredFilePath } from "../../../apps/api/src/lib/file-storage.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/**
 * The office-document preview used to answer every failure in its staging and
 * conversion block with a 422 "Could not generate document preview" and no
 * report (#1404). A full disk, an unwritable preview dir, or a stored file
 * missing from disk is the server's fault: it has to be a 500 that reaches
 * error reporting. Only a document LibreOffice can't convert stays a 422.
 *
 * LibreOffice is faked so this runs without it; the point is how the route
 * classifies each failure.
 */
const mocks = vi.hoisted(() => ({
  reportError: vi.fn(),
  convert: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return { ...actual, reportError: mocks.reportError };
});

vi.mock("@snapotter/doc-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/doc-engine")>();
  return { ...actual, sofficeAvailable: () => true, convertDocument: mocks.convert };
});

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

beforeEach(() => {
  mocks.reportError.mockReset();
  mocks.convert.mockReset();
  // A successful conversion writes input.pdf next to the input copy.
  mocks.convert.mockImplementation(async (_input: string, outDir: string) => {
    await writeFile(join(outDir, "input.pdf"), "%PDF-1.4 converted");
  });
});

async function uploadDocx(): Promise<{ id: string; storedName: string }> {
  const payload = createMultipartPayload([
    { name: "file", filename: "report.docx", contentType: DOCX_MIME, content: Buffer.from("docx") },
  ]);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": payload.contentType },
    body: payload.body,
  });
  expect(res.statusCode, res.body).toBe(201);
  const { id } = JSON.parse(res.body).files[0] as { id: string };
  const [row] = await db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id));
  expect(row?.mimeType).toBe(DOCX_MIME);
  return { id, storedName: row?.storedName ?? "" };
}

function getPreview(id: string) {
  return testApp.app.inject({
    method: "GET",
    url: `/api/v1/files/${id}/preview`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

function previewReports() {
  return mocks.reportError.mock.calls.filter(
    ([, ctx]) => (ctx as { route?: string }).route === "/api/v1/files/:id/preview",
  );
}

describe("document preview failure classification (#1404)", () => {
  it("still converts and caches a document when nothing goes wrong", async () => {
    const { id } = await uploadDocx();
    const res = await getPreview(id);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("converted");
    expect(previewReports()).toHaveLength(0);
  });

  it("keeps a failed conversion as a 422 bad document, unreported", async () => {
    mocks.convert.mockRejectedValueOnce(new Error("soffice: source file could not be loaded"));
    const { id } = await uploadDocx();
    const res = await getPreview(id);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: "Could not generate document preview" });
    expect(previewReports()).toHaveLength(0);
  });

  it("answers a stored file missing from disk with a reported 500", async () => {
    const { id, storedName } = await uploadDocx();
    await rm(getStoredFilePath(storedName), { force: true });

    const res = await getPreview(id);
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Could not prepare document preview" });
    expect(mocks.convert).not.toHaveBeenCalled();
    expect(previewReports()).toHaveLength(1);
  });

  // Root ignores directory permissions, so an unwritable dir can't be staged there.
  it.skipIf(process.getuid?.() === 0)(
    "answers an unwritable preview directory with a reported 500",
    async () => {
      const { id } = await uploadDocx();
      const previewDir = join(env.FILES_STORAGE_PATH, ".previews");
      await getPreview((await uploadDocx()).id); // make sure the dir exists
      mocks.reportError.mockReset();
      await chmod(previewDir, 0o555);
      try {
        const res = await getPreview(id);
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({ error: "Could not prepare document preview" });
        expect(previewReports()).toHaveLength(1);
      } finally {
        await chmod(previewDir, 0o755);
      }
    },
  );
});
