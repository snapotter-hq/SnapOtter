/**
 * Integration tests for the user file library (user-files.ts).
 *
 * Covers upload, list, detail with version chain, download, thumbnail,
 * bulk delete, save-result versioning, search, and pagination.
 */

import { chmod, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  reportError: vi.fn(),
  svgUnexpectedError: false,
  afterSaveFile: null as ((storedName: string) => Promise<void>) | null,
  streamStoredFileError: null as Error | null,
  readStoredFileError: null as Error | null,
}));

vi.mock("../../../apps/api/src/lib/file-storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/file-storage.js")>();
  return {
    ...actual,
    saveFile: async (...args: Parameters<typeof actual.saveFile>) => {
      const storedName = await actual.saveFile(...args);
      if (hooks.afterSaveFile) {
        await hooks.afterSaveFile(storedName);
      }
      return storedName;
    },
    streamStoredFile: async (...args: Parameters<typeof actual.streamStoredFile>) => {
      if (hooks.streamStoredFileError) {
        const err = hooks.streamStoredFileError;
        hooks.streamStoredFileError = null;
        throw err;
      }
      return actual.streamStoredFile(...args);
    },
    readStoredFile: async (...args: Parameters<typeof actual.readStoredFile>) => {
      if (hooks.readStoredFileError) {
        const err = hooks.readStoredFileError;
        hooks.readStoredFileError = null;
        throw err;
      }
      return actual.readStoredFile(...args);
    },
  };
});

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return {
    ...actual,
    reportError: (...args: Parameters<typeof actual.reportError>) => {
      hooks.reportError(...args);
      return actual.reportError(...args);
    },
  };
});

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/svg-sanitize.js")>();
  return {
    ...actual,
    sanitizeSvg: (buffer: Buffer) => {
      if (hooks.svgUnexpectedError) throw new Error("simulated sanitizer crash");
      return actual.sanitizeSvg(buffer);
    },
  };
});

import { db, schema } from "../../../apps/api/src/db/index.js";
import { getStoredFilePath } from "../../../apps/api/src/lib/file-storage.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);
const WEBP = readFixture(fixtures.image.base.webp50);
const TINY_PNG = readFixture(fixtures.image.edge.px1);
// BMP is a CLI_DECODED_FORMATS member (see file-validation.ts): validateImageBuffer()
// intentionally returns {valid: true, width: 0, height: 0} for it without decoding,
// since real decoding happens lazily elsewhere. Used to cover the 0x0-vs-null bug.
const BMP = readFixture(fixtures.image.formats("bmp"));
const SVGZ_BOMB = gzipSync(
  Buffer.concat([
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'),
    Buffer.alloc(51 * 1024 * 1024, 0x20),
    Buffer.from("</svg>"),
  ]),
);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// ── Upload ───────────────────────────────────────────────────────
describe("File upload", () => {
  it("uploads a single image file", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "upload-test.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].originalName).toBe("upload-test.png");
    expect(result.files[0].width).toBe(200);
    expect(result.files[0].height).toBe(150);
    expect(result.files[0].version).toBe(1);
    expect(result.files[0].parentId).toBeNull();
  });

  it("uploads multiple image files", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "multi-a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "multi-b.jpg", contentType: "image/jpeg", content: JPG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.files).toHaveLength(2);
  });

  it("rejects upload with no files", async () => {
    const { body, contentType } = createMultipartPayload([{ name: "other", content: "nothing" }]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/no valid files/i);
  });

  // Regression test for #635: validateImageBuffer() reports {width: 0, height: 0}
  // by design for CLI_DECODED_FORMATS members (never decoded on upload), and the
  // route must treat that sentinel as "unknown" (null), not write the literal 0x0.
  it("stores null dimensions (not 0x0) for a CLI-decoded format upload", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.bmp", contentType: "image/bmp", content: BMP },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].width).toBeNull();
    expect(result.files[0].height).toBeNull();
  });

  it("rejects an .svgz upload that decompresses past the 50 MiB cap with 400 and no Sentry report (#2429, #2582)", async () => {
    hooks.reportError.mockClear();

    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "upload-bomb.svgz",
        contentType: "image/svg+xml",
        content: SVGZ_BOMB,
      },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/52428800|larger than/i);
    expect(hooks.reportError).not.toHaveBeenCalled();
  });
});

// ── List ─────────────────────────────────────────────────────────
describe("File listing", () => {
  it("lists uploaded files", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.files).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.limit).toBeDefined();
    expect(result.offset).toBeDefined();
  });

  it("supports pagination with limit and offset", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files?limit=1&offset=0",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(0);
    expect(result.files.length).toBeLessThanOrEqual(1);
  });

  it("supports search by filename", async () => {
    // Upload a file with a unique name for searching
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      {
        name: "file",
        filename: "searchable-unicorn.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);

    await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files?search=unicorn",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.files.length).toBeGreaterThanOrEqual(1);
    expect(
      result.files.some((f: { originalName: string }) => f.originalName.includes("unicorn")),
    ).toBe(true);
  });

  it("requires authentication to list files", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files",
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── File detail and version history ─────────────────────────────
describe("File detail", () => {
  it("returns file details and version history", async () => {
    // Upload a file
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "detail-test.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.file).toBeDefined();
    expect(result.file.id).toBe(fileId);
    expect(result.versions).toBeDefined();
    expect(Array.isArray(result.versions)).toBe(true);
    expect(result.versions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for non-existent file ID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── Download ─────────────────────────────────────────────────────
describe("File download", () => {
  it("downloads an uploaded file", async () => {
    // Upload
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "download-test.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    // Download
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["content-disposition"]).toContain("download-test.png");
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it("returns 404 for non-existent file download", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/00000000-0000-0000-0000-000000000000/download",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  // #899: a userFiles row whose backing blob vanished (volume reset, manual
  // prune) must 404 like any other missing file, not 500. createReadStream
  // used to defer the ENOENT past the route's try/catch.
  it("returns 404 when the backing blob is missing from storage", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "gone-blob.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    // Remove the blob out from under the row, like a pruned data volume would
    const [row] = await db
      .select({ storedName: schema.userFiles.storedName })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, fileId));
    await unlink(getStoredFilePath(row.storedName));

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found in storage/i);
  });

  // An unreadable blob is a storage fault (volume UID drift, botched restore),
  // not a deleted file. It must stay a 500 that reaches the error handler and
  // Sentry, never fold into the missing-blob 404.
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)("returns 500, not a silent 404, when the blob is unreadable", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "locked-blob.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    const [row] = await db
      .select({ storedName: schema.userFiles.storedName })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, fileId));
    const blobPath = getStoredFilePath(row.storedName);
    await chmod(blobPath, 0o000);

    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/files/${fileId}/download`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(500);
    } finally {
      await chmod(blobPath, 0o644);
    }
  });

  it("keeps 404 for a poisoned stored_name (INVALID_STORED_NAME SafeError) on download (#2851)", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "poisoned-dl.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const fileId = (JSON.parse(uploadRes.body).files[0] as { id: string }).id;

    const [row] = await db
      .select({ storedName: schema.userFiles.storedName })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, fileId));
    await unlink(getStoredFilePath(row.storedName));
    await db
      .update(schema.userFiles)
      .set({ storedName: "../escape.png" })
      .where(eq(schema.userFiles.id, fileId));

    hooks.reportError.mockClear();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "File not found in storage" });
    expect(hooks.reportError).not.toHaveBeenCalled();
  });

  it("returns 500, not 404 or 422, when streamStoredFile or readStoredFile rejects with a non-syscall local error (#2851)", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "nosyscall-fault.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const fileId = (JSON.parse(uploadRes.body).files[0] as { id: string }).id;

    const tooLarge = Object.assign(new RangeError("File size is greater than 2 GiB"), {
      code: "ERR_FS_FILE_TOO_LARGE",
    });
    hooks.streamStoredFileError = tooLarge;
    const dlRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(dlRes.statusCode).toBe(500);
    expect(JSON.parse(dlRes.body).error).not.toMatch(/not found/i);

    const unexpectedBug = new TypeError("unexpected readStoredFile failure");
    hooks.readStoredFileError = unexpectedBug;
    const thumbRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/thumbnail`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(thumbRes.statusCode).toBe(500);
    expect(JSON.parse(thumbRes.body).error).not.toMatch(/could not generate thumbnail/i);
  });
});

// ── Thumbnail ────────────────────────────────────────────────────
describe("Thumbnail generation", () => {
  it("generates a JPEG thumbnail for an uploaded file", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "thumb-test.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}/thumbnail`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toContain("max-age");

    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.format).toBe("jpeg");
    // Should be constrained to 300px width max
    expect(meta.width).toBeLessThanOrEqual(300);
  });

  it("preserves Content-Type on cached PDF and video thumbnails (#2824)", async () => {
    const pdf = readFixture(fixtures.document.pdf3);
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "cached-thumb.pdf", contentType: "application/pdf", content: pdf },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const pdfFileId = (JSON.parse(uploadRes.body).files[0] as { id: string }).id;
    const [pdfRow] = await db
      .select({ storedName: schema.userFiles.storedName })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, pdfFileId));

    const { saveThumbnail } = await import("../../../apps/api/src/lib/file-storage.js");
    await saveThumbnail(pdfRow.storedName, TINY_PNG);

    const cachedPdfRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${pdfFileId}/thumbnail`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(cachedPdfRes.statusCode).toBe(200);
    expect(cachedPdfRes.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(cachedPdfRes.rawPayload, TINY_PNG)).toBe(0);

    const mp4 = readFixture(fixtures.video.tiny("mp4"));
    const { body: vidBody, contentType: vidCt } = createMultipartPayload([
      { name: "file", filename: "cached-thumb.mp4", contentType: "video/mp4", content: mp4 },
    ]);
    const vidUploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": vidCt, authorization: `Bearer ${adminToken}` },
      body: vidBody,
    });
    expect(vidUploadRes.statusCode).toBe(201);
    const vidFileId = (JSON.parse(vidUploadRes.body).files[0] as { id: string }).id;
    const [vidRow] = await db
      .select({ storedName: schema.userFiles.storedName })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, vidFileId));

    await saveThumbnail(vidRow.storedName, WEBP);

    const cachedVidRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${vidFileId}/thumbnail`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(cachedVidRes.statusCode).toBe(200);
    expect(cachedVidRes.headers["content-type"]).toBe("image/webp");
    expect(Buffer.compare(cachedVidRes.rawPayload, WEBP)).toBe(0);
  });

  it("returns 404 for non-existent file thumbnail", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/files/00000000-0000-0000-0000-000000000000/thumbnail",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)(
    "returns 500, not 422, when the backing blob is unreadable (#2808)",
    async () => {
      const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
        { name: "file", filename: "locked-thumb.png", contentType: "image/png", content: PNG },
      ]);

      const uploadRes = await app.inject({
        method: "POST",
        url: "/api/v1/files/upload",
        headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
        body: uploadBody,
      });

      const fileId = JSON.parse(uploadRes.body).files[0].id;

      const [row] = await db
        .select({ storedName: schema.userFiles.storedName })
        .from(schema.userFiles)
        .where(eq(schema.userFiles.id, fileId));
      const blobPath = getStoredFilePath(row.storedName);
      await chmod(blobPath, 0o000);

      try {
        const res = await app.inject({
          method: "GET",
          url: `/api/v1/files/${fileId}/thumbnail`,
          headers: { authorization: `Bearer ${adminToken}` },
        });

        expect(res.statusCode).toBe(500);
      } finally {
        await chmod(blobPath, 0o644);
      }
    },
  );

  it.skipIf(isRoot)(
    "returns 500, not a regenerated 200 cache miss, when the cached thumbnail is unreadable (#2836)",
    async () => {
      const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
        {
          name: "file",
          filename: "locked-cached-thumb.png",
          contentType: "image/png",
          content: PNG,
        },
      ]);

      const uploadRes = await app.inject({
        method: "POST",
        url: "/api/v1/files/upload",
        headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
        body: uploadBody,
      });

      const fileId = JSON.parse(uploadRes.body).files[0].id;

      const [row] = await db
        .select({ storedName: schema.userFiles.storedName })
        .from(schema.userFiles)
        .where(eq(schema.userFiles.id, fileId));
      const { saveThumbnail } = await import("../../../apps/api/src/lib/file-storage.js");
      await saveThumbnail(row.storedName, TINY_PNG);
      const cachedThumbPath = join(
        dirname(getStoredFilePath(row.storedName)),
        ".thumbs",
        `${row.storedName}.thumb.jpg`,
      );
      await chmod(cachedThumbPath, 0o000);

      try {
        const res = await app.inject({
          method: "GET",
          url: `/api/v1/files/${fileId}/thumbnail`,
          headers: { authorization: `Bearer ${adminToken}` },
        });

        expect(res.statusCode).toBe(500);
      } finally {
        await chmod(cachedThumbPath, 0o644);
      }
    },
  );

  it("returns 500, not 422, when videoPosterPreview or pdfFirstPagePreview fails with an operational scratch fault (#2870)", async () => {
    const previewMod = await import("../../../apps/api/src/modality/preview.js");

    const pdf = readFixture(fixtures.document.pdf3);
    const { body: pdfBody, contentType: pdfCt } = createMultipartPayload([
      { name: "file", filename: "fault-thumb.pdf", contentType: "application/pdf", content: pdf },
    ]);
    const pdfUploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": pdfCt, authorization: `Bearer ${adminToken}` },
      body: pdfBody,
    });
    expect(pdfUploadRes.statusCode).toBe(201);
    const pdfFileId = (JSON.parse(pdfUploadRes.body).files[0] as { id: string }).id;

    const mp4 = readFixture(fixtures.video.tiny("mp4"));
    const { body: vidBody, contentType: vidCt } = createMultipartPayload([
      { name: "file", filename: "fault-thumb.mp4", contentType: "video/mp4", content: mp4 },
    ]);
    const vidUploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": vidCt, authorization: `Bearer ${adminToken}` },
      body: vidBody,
    });
    expect(vidUploadRes.statusCode).toBe(201);
    const vidFileId = (JSON.parse(vidUploadRes.body).files[0] as { id: string }).id;

    const enospc = Object.assign(new Error("ENOSPC: no space left on device, mkdir"), {
      code: "ENOSPC",
      syscall: "mkdir",
    });
    const pdfSpy = vi.spyOn(previewMod, "pdfFirstPagePreview").mockRejectedValueOnce(enospc);
    const vidSpy = vi.spyOn(previewMod, "videoPosterPreview").mockRejectedValueOnce(enospc);
    try {
      const pdfRes = await app.inject({
        method: "GET",
        url: `/api/v1/files/${pdfFileId}/thumbnail`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(pdfRes.statusCode).toBe(500);

      const vidRes = await app.inject({
        method: "GET",
        url: `/api/v1/files/${vidFileId}/thumbnail`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(vidRes.statusCode).toBe(500);

      const { DecoderOutOfMemoryError } = await import(
        "../../../apps/api/src/lib/format-decoders.js"
      );
      pdfSpy.mockRejectedValueOnce(
        new DecoderOutOfMemoryError(
          "The PDF preview engine ran out of memory rendering this PDF, or was killed.",
        ),
      );
      vidSpy.mockRejectedValueOnce(
        new DecoderOutOfMemoryError(
          "The video preview engine ran out of memory decoding this video, or was killed.",
        ),
      );

      const pdfOomRes = await app.inject({
        method: "GET",
        url: `/api/v1/files/${pdfFileId}/thumbnail`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(pdfOomRes.statusCode).toBe(503);
      expect(JSON.parse(pdfOomRes.body)).toMatchObject({ code: "ENGINE_UNAVAILABLE" });

      const vidOomRes = await app.inject({
        method: "GET",
        url: `/api/v1/files/${vidFileId}/thumbnail`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(vidOomRes.statusCode).toBe(503);
      expect(JSON.parse(vidOomRes.body)).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    } finally {
      pdfSpy.mockRestore();
      vidSpy.mockRestore();
    }
  });
});

// ── Bulk delete ──────────────────────────────────────────────────
describe("Bulk delete", () => {
  it("deletes files by their IDs", async () => {
    // Upload a file to delete
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "to-delete.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const fileId = JSON.parse(uploadRes.body).files[0].id;

    // Delete it
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { ids: [fileId] },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    // Verify it's gone
    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.statusCode).toBe(404);
  });

  it("rejects delete with empty ids array", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { ids: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects delete without ids field", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("handles delete of non-existent IDs gracefully", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { ids: ["00000000-0000-0000-0000-000000000000"] },
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.deleted).toBe(0);
  });

  it("deletes an orphaned version chain whose parent row was already deleted (#2927)", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "orphan-root.png", contentType: "image/png", content: PNG },
    ]);
    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const v1Id = (JSON.parse(uploadRes.body).files[0] as { id: string }).id;

    const { body: v2Body, contentType: v2Ct } = createMultipartPayload([
      { name: "file", filename: "v2.png", contentType: "image/png", content: PNG },
      { name: "parentId", content: v1Id },
      { name: "toolId", content: "resize" },
    ]);
    const v2Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v2Ct, authorization: `Bearer ${adminToken}` },
      body: v2Body,
    });
    expect(v2Res.statusCode).toBe(201);
    const v2 = JSON.parse(v2Res.body).file as { id: string; size: number };

    const { body: v3Body, contentType: v3Ct } = createMultipartPayload([
      { name: "file", filename: "v3.png", contentType: "image/png", content: TINY_PNG },
      { name: "parentId", content: v2.id },
      { name: "toolId", content: "compress" },
    ]);
    const v3Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v3Ct, authorization: `Bearer ${adminToken}` },
      body: v3Body,
    });
    expect(v3Res.statusCode).toBe(201);
    const v3 = JSON.parse(v3Res.body).file as { id: string; size: number };

    // Remove the root parent row directly so v2 -> v3 is an orphaned sub-chain
    // whose top-most surviving row (v2) has a non-null parent_id pointing at a
    // deleted row.
    const [v1Row] = await db
      .select({ userId: schema.userFiles.userId, storedName: schema.userFiles.storedName })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, v1Id));
    await unlink(getStoredFilePath(v1Row.storedName));
    await db.delete(schema.userFiles).where(eq(schema.userFiles.id, v1Id));

    const [userBefore] = await db
      .select({ storageUsed: schema.users.storageUsed })
      .from(schema.users)
      .where(eq(schema.users.id, v1Row.userId ?? ""));

    const delRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      payload: { ids: [v3.id] },
    });
    expect(delRes.statusCode).toBe(200);
    expect(JSON.parse(delRes.body)).toEqual({ deleted: 2 });

    const remaining = await db
      .select()
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, v2.id));
    expect(remaining).toEqual([]);
    const remainingLeaf = await db
      .select()
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, v3.id));
    expect(remainingLeaf).toEqual([]);

    const [userAfter] = await db
      .select({ storageUsed: schema.users.storageUsed })
      .from(schema.users)
      .where(eq(schema.users.id, v1Row.userId ?? ""));
    expect(userAfter.storageUsed).toBe(Math.max(0, userBefore.storageUsed - v2.size - v3.size));
  });
});

// ── Save result (versioning) ────────────────────────────────────
describe("Save result", () => {
  it("creates a new version linked to a parent file", async () => {
    // Upload the parent file
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "parent.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const parentId = JSON.parse(uploadRes.body).files[0].id;

    // Save a "processed" result as a new version
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "file", filename: "result.png", contentType: "image/png", content: TINY_PNG },
      { name: "parentId", content: parentId },
      { name: "toolId", content: "resize" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.file).toBeDefined();
    expect(result.file.version).toBe(2);
    expect(result.file.parentId).toBe(parentId);
    expect(result.file.toolChain).toContain("resize");
  });

  it("rejects save-result without a file", async () => {
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "parentId", content: "some-id" },
      { name: "toolId", content: "resize" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/no file/i);
  });

  it("rejects save-result without parentId", async () => {
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "file", filename: "orphan.png", contentType: "image/png", content: PNG },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/parentId/i);
  });

  it("returns 404 when parent file does not exist", async () => {
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "file", filename: "nope.png", contentType: "image/png", content: PNG },
      { name: "parentId", content: "00000000-0000-0000-0000-000000000000" },
      { name: "toolId", content: "resize" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(404);
  });

  // Regression test for #635: same 0x0-vs-null bug as the upload endpoint, but on
  // the separate save-result write path (a tool result saved as a new version).
  it("stores null dimensions (not 0x0) for a CLI-decoded format result", async () => {
    // Upload the parent file
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      {
        name: "file",
        filename: "parent-for-bmp-result.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const parentId = JSON.parse(uploadRes.body).files[0].id;

    // Save a BMP "processed" result as a new version
    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "file", filename: "result.bmp", contentType: "image/bmp", content: BMP },
      { name: "parentId", content: parentId },
      { name: "toolId", content: "convert" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.file.width).toBeNull();
    expect(result.file.height).toBeNull();
  });

  it("builds version chain correctly across multiple saves", async () => {
    // Upload parent
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "chain-root.png", contentType: "image/png", content: PNG },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });

    const v1Id = JSON.parse(uploadRes.body).files[0].id;

    // Save version 2
    const { body: v2Body, contentType: v2Ct } = createMultipartPayload([
      { name: "file", filename: "v2.png", contentType: "image/png", content: PNG },
      { name: "parentId", content: v1Id },
      { name: "toolId", content: "resize" },
    ]);

    const v2Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v2Ct, authorization: `Bearer ${adminToken}` },
      body: v2Body,
    });

    const v2Id = JSON.parse(v2Res.body).file.id;

    // Save version 3
    const { body: v3Body, contentType: v3Ct } = createMultipartPayload([
      { name: "file", filename: "v3.png", contentType: "image/png", content: TINY_PNG },
      { name: "parentId", content: v2Id },
      { name: "toolId", content: "compress" },
    ]);

    const v3Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v3Ct, authorization: `Bearer ${adminToken}` },
      body: v3Body,
    });

    expect(v3Res.statusCode).toBe(201);
    const v3 = JSON.parse(v3Res.body).file;
    expect(v3.version).toBe(3);
    expect(v3.toolChain).toEqual(["resize", "compress"]);

    // Get detail for v3 — should include full chain
    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${v3.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const detail = JSON.parse(detailRes.body);
    expect(detail.versions.length).toBe(3);
    expect(detail.versions[0].version).toBe(1);
    expect(detail.versions[2].version).toBe(3);
  });

  // Regression test for #2582: gunzipSync(..., { maxOutputLength: 50 MiB }) throws
  // RangeError (ERR_BUFFER_TOO_LARGE) when an .svgz result decompresses past the cap.
  // save-result must answer 400 without reporting to Sentry or creating a version row,
  // matching /api/v1/files/upload (#2429).
  it("rejects an .svgz result that decompresses past the 50 MiB cap with 400 and no Sentry report (#2582)", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      {
        name: "file",
        filename: "parent-for-svgz-bomb.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const parentId = JSON.parse(uploadRes.body).files[0].id;

    hooks.reportError.mockClear();

    const { body: saveBody, contentType: saveCt } = createMultipartPayload([
      { name: "file", filename: "result.svgz", contentType: "image/svg+xml", content: SVGZ_BOMB },
      { name: "parentId", content: parentId },
      { name: "toolId", content: "compress" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
      body: saveBody,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/52428800|larger than/i);
    expect(hooks.reportError).not.toHaveBeenCalled();

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${parentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    expect(JSON.parse(detailRes.body).versions).toHaveLength(1);
  });

  it("rejects corrupt, truncated, and over-element-cap SVG/SVGZ results with 400 and no Sentry report", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      {
        name: "file",
        filename: "parent-for-svg-errors.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const parentId = JSON.parse(uploadRes.body).files[0].id;

    const validSvgz = gzipSync(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
    );
    // 1. Z_DATA_ERROR: valid gzip stream with a corrupted CRC32 trailer byte
    const corruptSvgz = Buffer.from(validSvgz);
    corruptSvgz[corruptSvgz.length - 8] ^= 0xff;
    // 2. Z_BUF_ERROR: valid gzip stream truncated mid-stream
    const truncatedSvgz = validSvgz.subarray(0, validSvgz.length - 6);
    // 3. statusCode === 400: SVG over the 5000-element cap
    const overElementCapSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg">${"<rect/>".repeat(5001)}</svg>`,
    );

    for (const [filename, content, expectedError] of [
      ["corrupt.svgz", corruptSvgz, /incorrect data check/i],
      ["truncated.svgz", truncatedSvgz, /unexpected end of file/i],
      ["too-many-elements.svg", overElementCapSvg, /element count/i],
    ] as const) {
      hooks.reportError.mockClear();
      const { body: saveBody, contentType: saveCt } = createMultipartPayload([
        { name: "file", filename, contentType: "image/svg+xml", content },
        { name: "parentId", content: parentId },
        { name: "toolId", content: "compress" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/files/save-result",
        headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
        body: saveBody,
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(expectedError);
      expect(hooks.reportError).not.toHaveBeenCalled();
    }

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/v1/files/${parentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    expect(JSON.parse(detailRes.body).versions).toHaveLength(1);
  });

  it("answers 500 and calls reportError when sanitizeSvg throws an unexpected error on save-result", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      {
        name: "file",
        filename: "parent-for-svg-500.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const parentId = JSON.parse(uploadRes.body).files[0].id;

    hooks.reportError.mockClear();
    hooks.svgUnexpectedError = true;
    try {
      const { body: saveBody, contentType: saveCt } = createMultipartPayload([
        {
          name: "file",
          filename: "result.svg",
          contentType: "image/svg+xml",
          content: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
        },
        { name: "parentId", content: parentId },
        { name: "toolId", content: "compress" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/files/save-result",
        headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
        body: saveBody,
      });

      expect(res.statusCode).toBe(500);
      expect(hooks.reportError).toHaveBeenCalledTimes(1);
      expect(hooks.reportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "simulated sanitizer crash" }),
        expect.objectContaining({
          source: "http",
          route: "/api/v1/files/save-result",
          method: "POST",
          statusCode: 500,
        }),
      );
    } finally {
      hooks.svgUnexpectedError = false;
    }
  });

  it("decompresses valid .svgz to .svg and keeps non-SVG .svgz as opaque on save-result", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      {
        name: "file",
        filename: "vector-parent.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);

    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const parentId = JSON.parse(uploadRes.body).files[0].id;

    const validSvgz = gzipSync(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>'),
    );
    const { body: v2Body, contentType: v2Ct } = createMultipartPayload([
      { name: "file", filename: "result.svgz", contentType: "image/svg+xml", content: validSvgz },
      { name: "parentId", content: parentId },
      { name: "toolId", content: "compress" },
    ]);

    const v2Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v2Ct, authorization: `Bearer ${adminToken}` },
      body: v2Body,
    });
    expect(v2Res.statusCode).toBe(201);
    const v2 = JSON.parse(v2Res.body).file;
    expect(v2.originalName).toBe("vector-parent.svg");

    const opaqueSvgz = gzipSync(Buffer.from("plain text inside gzip, not an SVG"));
    const { body: v3Body, contentType: v3Ct } = createMultipartPayload([
      {
        name: "file",
        filename: "opaque.svgz",
        contentType: "application/octet-stream",
        content: opaqueSvgz,
      },
      { name: "parentId", content: v2.id },
      { name: "toolId", content: "compress" },
    ]);

    const v3Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v3Ct, authorization: `Bearer ${adminToken}` },
      body: v3Body,
    });
    expect(v3Res.statusCode).toBe(201);
    const v3 = JSON.parse(v3Res.body).file;
    expect(v3.originalName).toBe("vector-parent.svgz");
  });

  it("discards the staged blob and returns 404 when the parent file is deleted while save-result is staging (#2939)", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      {
        name: "file",
        filename: "race-parent.png",
        contentType: "image/png",
        content: PNG,
      },
    ]);
    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const v1Id = (JSON.parse(uploadRes.body).files[0] as { id: string }).id;

    const [v1Row] = await db
      .select({ userId: schema.userFiles.userId })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, v1Id));
    const ownerId = v1Row.userId ?? "";

    let stagedStoredName: string | null = null;
    hooks.afterSaveFile = async (storedName) => {
      stagedStoredName = storedName;
      const delRes = await app.inject({
        method: "DELETE",
        url: "/api/v1/files",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: { ids: [v1Id] },
      });
      expect(delRes.statusCode).toBe(200);
      expect(JSON.parse(delRes.body)).toEqual({ deleted: 1 });
    };

    try {
      const [userBeforeSave] = await db
        .select({ storageUsed: schema.users.storageUsed })
        .from(schema.users)
        .where(eq(schema.users.id, ownerId));

      const { body: saveBody, contentType: saveCt } = createMultipartPayload([
        { name: "file", filename: "race-v2.png", contentType: "image/png", content: TINY_PNG },
        { name: "parentId", content: v1Id },
        { name: "toolId", content: "resize" },
      ]);
      const saveRes = await app.inject({
        method: "POST",
        url: "/api/v1/files/save-result",
        headers: { "content-type": saveCt, authorization: `Bearer ${adminToken}` },
        body: saveBody,
      });

      expect(saveRes.statusCode).toBe(404);
      expect(JSON.parse(saveRes.body)).toEqual({ error: "Parent file not found" });
      expect(stagedStoredName).toBeTruthy();
      await expect(stat(getStoredFilePath(stagedStoredName ?? ""))).rejects.toMatchObject({
        code: "ENOENT",
      });

      const orphanChildren = await db
        .select()
        .from(schema.userFiles)
        .where(eq(schema.userFiles.parentId, v1Id));
      expect(orphanChildren).toEqual([]);

      const [userAfterSave] = await db
        .select({ storageUsed: schema.users.storageUsed })
        .from(schema.users)
        .where(eq(schema.users.id, ownerId));
      // v1 was deleted inside afterSaveFile, so userAfterSave.storageUsed must equal
      // userBeforeSave.storageUsed minus v1's size (no charge from the aborted v2).
      expect(userAfterSave.storageUsed).toBe(userBeforeSave.storageUsed - PNG.length);
    } finally {
      hooks.afterSaveFile = null;
    }
  });

  it("returns the surviving version chain from GET /api/v1/files/:id when the root parent row is missing (#2939)", async () => {
    const { body: uploadBody, contentType: uploadCt } = createMultipartPayload([
      { name: "file", filename: "detail-orphan-root.png", contentType: "image/png", content: PNG },
    ]);
    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": uploadCt, authorization: `Bearer ${adminToken}` },
      body: uploadBody,
    });
    expect(uploadRes.statusCode).toBe(201);
    const v1Id = (JSON.parse(uploadRes.body).files[0] as { id: string }).id;

    const { body: v2Body, contentType: v2Ct } = createMultipartPayload([
      { name: "file", filename: "v2.png", contentType: "image/png", content: PNG },
      { name: "parentId", content: v1Id },
      { name: "toolId", content: "resize" },
    ]);
    const v2Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v2Ct, authorization: `Bearer ${adminToken}` },
      body: v2Body,
    });
    expect(v2Res.statusCode).toBe(201);
    const v2 = JSON.parse(v2Res.body).file as { id: string };

    const { body: v3Body, contentType: v3Ct } = createMultipartPayload([
      { name: "file", filename: "v3.png", contentType: "image/png", content: TINY_PNG },
      { name: "parentId", content: v2.id },
      { name: "toolId", content: "compress" },
    ]);
    const v3Res = await app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": v3Ct, authorization: `Bearer ${adminToken}` },
      body: v3Body,
    });
    expect(v3Res.statusCode).toBe(201);
    const v3 = JSON.parse(v3Res.body).file as { id: string };

    const [v1Row] = await db
      .select({ storedName: schema.userFiles.storedName })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, v1Id));
    await unlink(getStoredFilePath(v1Row.storedName));
    await db.delete(schema.userFiles).where(eq(schema.userFiles.id, v1Id));

    for (const targetId of [v2.id, v3.id]) {
      const detailRes = await app.inject({
        method: "GET",
        url: `/api/v1/files/${targetId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(detailRes.statusCode).toBe(200);
      const detail = JSON.parse(detailRes.body) as {
        file: { id: string };
        versions: { id: string; version: number; parentId: string | null }[];
      };
      expect(detail.file.id).toBe(targetId);
      expect(detail.versions.map((v) => ({ id: v.id, version: v.version }))).toEqual([
        { id: v2.id, version: 2 },
        { id: v3.id, version: 3 },
      ]);
    }
  });
});
