/**
 * Unit tests for file serving route helper functions.
 *
 * Tests the path traversal guard, content type mapping, and download/upload
 * logic helpers from the files route.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { IMAGE_EXT_TO_MIME } from "@snapotter/shared";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  deletePrefix: vi.fn(() => Promise.resolve()),
  getObjectSize: vi.fn(),
  getObjectStream: vi.fn(),
  isStorageServiceFault: vi.fn<(_e: unknown) => boolean>(() => false),
  isValidObjectKey: vi.fn(() => true),
  putObject: vi.fn(() => Promise.resolve()),
  verifyS3Bucket: vi.fn(() => Promise.resolve()),
  reportError: vi.fn(() => Promise.resolve()),
  requireFileAccess: vi.fn(() => Promise.resolve({ id: "user-1", role: "admin" })),
  requirePermission: vi.fn(() => () => Promise.resolve(true)),
  sanitizeSvg: vi.fn((buf: Buffer) => buf),
  readImageDimensions: vi.fn<
    (_buf: Buffer, _ext?: string) => Promise<{ width: number; height: number } | null>
  >(() => Promise.resolve(null)),
  decodeToSharpCompat:
    vi.fn<(_buf: Buffer, _format: string, _ext?: string, _options?: unknown) => Promise<Buffer>>(),
  decodeHeic: vi.fn<(_buf: Buffer, _options?: unknown) => Promise<Buffer>>(),
  dbInsertValues: vi.fn<(_values: unknown) => Promise<void>>(() => Promise.resolve()),
  dbDeleteWhere: vi.fn<(_where: unknown) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({ values: (v: unknown) => mocks.dbInsertValues(v) }),
    delete: () => ({ where: (w: unknown) => mocks.dbDeleteWhere(w) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: { jobs: { id: "jobs.id" } },
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    deletePrefix: mocks.deletePrefix,
    getObjectSize: mocks.getObjectSize,
    getObjectStream: mocks.getObjectStream,
    isStorageServiceFault: mocks.isStorageServiceFault,
    isValidObjectKey: mocks.isValidObjectKey,
    putObject: mocks.putObject,
    verifyS3Bucket: mocks.verifyS3Bucket,
  };
});

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return {
    ...actual,
    reportError: mocks.reportError,
  };
});

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requireFileAccess: mocks.requireFileAccess,
  requirePermission: mocks.requirePermission,
}));

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/svg-sanitize.js")>();
  mocks.sanitizeSvg.mockImplementation(actual.sanitizeSvg);
  return {
    ...actual,
    sanitizeSvg: (...args: Parameters<typeof actual.sanitizeSvg>) => mocks.sanitizeSvg(...args),
  };
});

vi.mock("../../../apps/api/src/lib/exiftool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/exiftool.js")>();
  return {
    ...actual,
    readImageDimensions: (...args: Parameters<typeof actual.readImageDimensions>) =>
      mocks.readImageDimensions(...args),
  };
});

vi.mock("../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-decoders.js")>();
  return {
    ...actual,
    decodeToSharpCompat: (...args: Parameters<typeof actual.decodeToSharpCompat>) =>
      mocks.decodeToSharpCompat(...args),
  };
});

vi.mock("../../../apps/api/src/lib/heic-converter.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/heic-converter.js")>();
  return {
    ...actual,
    decodeHeic: (...args: Parameters<typeof actual.decodeHeic>) => mocks.decodeHeic(...args),
  };
});

import { fileRoutes, getContentType, isPathTraversal } from "../../../apps/api/src/routes/files.js";

// ── Tests ───────────────────────────────────────────────────────────────

describe("files route logic", () => {
  describe("isPathTraversal", () => {
    it("detects double dot traversal", () => {
      expect(isPathTraversal("..")).toBe(true);
    });

    it("detects double dot with prefix", () => {
      expect(isPathTraversal("foo..bar")).toBe(true);
    });

    it("detects forward slash", () => {
      expect(isPathTraversal("foo/bar")).toBe(true);
    });

    it("detects backslash", () => {
      expect(isPathTraversal("foo\\bar")).toBe(true);
    });

    it("detects null byte", () => {
      expect(isPathTraversal("foo\0bar")).toBe(true);
    });

    it("allows clean UUID-like segment", () => {
      expect(isPathTraversal("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    });

    it("allows clean filename", () => {
      expect(isPathTraversal("photo.jpg")).toBe(false);
    });

    it("allows alphanumeric-only segment", () => {
      expect(isPathTraversal("abc123")).toBe(false);
    });

    it("detects relative path traversal (../)", () => {
      expect(isPathTraversal("../etc/passwd")).toBe(true);
    });

    it("detects Windows-style path traversal (..\\)", () => {
      expect(isPathTraversal("..\\windows\\system32")).toBe(true);
    });

    it("allows single dot in filename (extension)", () => {
      expect(isPathTraversal("file.name.ext")).toBe(false);
    });

    it("allows hyphens and underscores", () => {
      expect(isPathTraversal("my-file_name")).toBe(false);
    });
  });

  describe("getContentType", () => {
    it("maps jpg to image/jpeg", () => {
      expect(getContentType("jpg")).toBe("image/jpeg");
    });

    it("maps jpeg to image/jpeg", () => {
      expect(getContentType("jpeg")).toBe("image/jpeg");
    });

    it("maps png to image/png", () => {
      expect(getContentType("png")).toBe("image/png");
    });

    it("maps webp to image/webp", () => {
      expect(getContentType("webp")).toBe("image/webp");
    });

    it("maps gif to image/gif", () => {
      expect(getContentType("gif")).toBe("image/gif");
    });

    it("maps bmp to image/bmp", () => {
      expect(getContentType("bmp")).toBe("image/bmp");
    });

    it("maps tiff to image/tiff", () => {
      expect(getContentType("tiff")).toBe("image/tiff");
    });

    it("maps tif to image/tiff", () => {
      expect(getContentType("tif")).toBe("image/tiff");
    });

    it("maps avif to image/avif", () => {
      expect(getContentType("avif")).toBe("image/avif");
    });

    it("maps svg to image/svg+xml", () => {
      expect(getContentType("svg")).toBe("image/svg+xml");
    });

    it("maps pdf to application/pdf", () => {
      expect(getContentType("pdf")).toBe("application/pdf");
    });

    it("maps zip to application/zip", () => {
      expect(getContentType("zip")).toBe("application/zip");
    });

    it("maps ico to image/x-icon", () => {
      expect(getContentType("ico")).toBe("image/x-icon");
    });

    it("maps json to application/json", () => {
      expect(getContentType("json")).toBe("application/json");
    });

    it("maps jxl to image/jxl", () => {
      expect(getContentType("jxl")).toBe("image/jxl");
    });

    it("maps RAW formats correctly", () => {
      expect(getContentType("dng")).toBe("image/x-adobe-dng");
      expect(getContentType("cr2")).toBe("image/x-canon-cr2");
      expect(getContentType("nef")).toBe("image/x-nikon-nef");
      expect(getContentType("arw")).toBe("image/x-sony-arw");
      expect(getContentType("orf")).toBe("image/x-olympus-orf");
      expect(getContentType("rw2")).toBe("image/x-panasonic-rw2");
    });

    it("maps specialty formats correctly", () => {
      expect(getContentType("tga")).toBe("image/x-tga");
      expect(getContentType("psd")).toBe("image/vnd.adobe.photoshop");
      expect(getContentType("exr")).toBe("image/x-exr");
      expect(getContentType("hdr")).toBe("image/vnd.radiance");
    });

    it("maps HEIC/HEIF formats correctly", () => {
      expect(getContentType("heic")).toBe("image/heic");
      expect(getContentType("heif")).toBe("image/heif");
    });

    it.each(Object.entries(IMAGE_EXT_TO_MIME))(
      "maps IMAGE_EXT_TO_MIME entry %s to %s (#3215)",
      (ext, mime) => {
        expect(getContentType(ext)).toBe(mime);
      },
    );

    it("appends charset=utf-8 to text/* formats", () => {
      expect(getContentType("csv")).toBe("text/csv; charset=utf-8");
      expect(getContentType("tsv")).toBe("text/tab-separated-values; charset=utf-8");
      expect(getContentType("txt")).toBe("text/plain; charset=utf-8");
      expect(getContentType("md")).toBe("text/markdown; charset=utf-8");
      expect(getContentType("markdown")).toBe("text/markdown; charset=utf-8");
      expect(getContentType("html")).toBe("text/html; charset=utf-8");
      expect(getContentType("htm")).toBe("text/html; charset=utf-8");
      expect(getContentType("vtt")).toBe("text/vtt; charset=utf-8");
    });

    it("maps structured data and subtitle formats correctly", () => {
      expect(getContentType("xml")).toBe("application/xml");
      expect(getContentType("yaml")).toBe("application/yaml");
      expect(getContentType("yml")).toBe("application/yaml");
      expect(getContentType("srt")).toBe("application/x-subrip");
    });

    it("maps video formats correctly", () => {
      expect(getContentType("mp4")).toBe("video/mp4");
      expect(getContentType("m4v")).toBe("video/mp4");
      expect(getContentType("mov")).toBe("video/quicktime");
      expect(getContentType("webm")).toBe("video/webm");
      expect(getContentType("mkv")).toBe("video/x-matroska");
      expect(getContentType("avi")).toBe("video/x-msvideo");
      expect(getContentType("3gp")).toBe("video/3gpp");
      expect(getContentType("flv")).toBe("video/x-flv");
      expect(getContentType("wmv")).toBe("video/x-ms-wmv");
      expect(getContentType("mpg")).toBe("video/mpeg");
      expect(getContentType("mpeg")).toBe("video/mpeg");
      expect(getContentType("ts")).toBe("video/mp2t");
      expect(getContentType("mts")).toBe("video/mp2t");
      expect(getContentType("m2ts")).toBe("video/mp2t");
      expect(getContentType("ogv")).toBe("video/ogg");
    });

    it("maps audio formats correctly", () => {
      expect(getContentType("mp3")).toBe("audio/mpeg");
      expect(getContentType("wav")).toBe("audio/wav");
      expect(getContentType("flac")).toBe("audio/flac");
      expect(getContentType("aac")).toBe("audio/aac");
      expect(getContentType("m4a")).toBe("audio/mp4");
      expect(getContentType("ogg")).toBe("audio/ogg");
      expect(getContentType("opus")).toBe("audio/opus");
      expect(getContentType("wma")).toBe("audio/x-ms-wma");
      expect(getContentType("aiff")).toBe("audio/aiff");
      expect(getContentType("amr")).toBe("audio/amr");
      expect(getContentType("ac3")).toBe("audio/ac3");
    });

    it("maps document and ebook formats correctly", () => {
      expect(getContentType("docx")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(getContentType("odt")).toBe("application/vnd.oasis.opendocument.text");
      expect(getContentType("rtf")).toBe("application/rtf");
      expect(getContentType("pptx")).toBe(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
      expect(getContentType("odp")).toBe("application/vnd.oasis.opendocument.presentation");
      expect(getContentType("xlsx")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(getContentType("ods")).toBe("application/vnd.oasis.opendocument.spreadsheet");
      expect(getContentType("epub")).toBe("application/epub+zip");
    });

    it("returns application/octet-stream for unknown extension", () => {
      expect(getContentType("xyz")).toBe("application/octet-stream");
    });

    it("returns application/octet-stream for empty string", () => {
      expect(getContentType("")).toBe("application/octet-stream");
    });
  });

  describe("GET /api/v1/download/:jobId/:filename", () => {
    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let downloadHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        post: vi.fn(),
        get: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/download/:jobId/:filename") downloadHandler = handler;
        }),
      };
      await fileRoutes(fakeApp as never);
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.isValidObjectKey.mockReturnValue(true);
      mocks.getObjectSize.mockResolvedValue(5);
      mocks.getObjectStream.mockImplementation(async () => Readable.from([Buffer.from("hello")]));
      mocks.verifyS3Bucket.mockResolvedValue(undefined);
    });

    function makeDownloadReply() {
      const headers: Record<string, string> = {};
      const reply = {
        statusCode: 200,
        headers,
        payload: undefined as unknown,
        raw: { destroy: vi.fn() },
        status: vi.fn((code: number) => {
          reply.statusCode = code;
          return reply;
        }),
        code: vi.fn((code: number) => {
          reply.statusCode = code;
          return reply;
        }),
        header: vi.fn((name: string, value: string) => {
          headers[name] = value;
          return reply;
        }),
        send: vi.fn((body: unknown) => {
          reply.payload = body;
          return reply;
        }),
      };
      return reply;
    }

    it("rejects path traversal in jobId or filename with 400", async () => {
      const reply1 = makeDownloadReply();
      await downloadHandler(
        {
          params: { jobId: "../secret", filename: "photo.jpg" },
          headers: {},
          log: { warn: vi.fn(), error: vi.fn() },
        },
        reply1,
      );
      expect(reply1.statusCode).toBe(400);
      expect(reply1.payload).toEqual({ error: "Invalid path" });

      const reply2 = makeDownloadReply();
      await downloadHandler(
        {
          params: { jobId: "550e8400-e29b-41d4-a716-446655440000", filename: "foo/bar.jpg" },
          headers: {},
          log: { warn: vi.fn(), error: vi.fn() },
        },
        reply2,
      );
      expect(reply2.statusCode).toBe(400);
      expect(reply2.payload).toEqual({ error: "Invalid path" });
    });

    it("encodes special and unicode characters in Content-Disposition", async () => {
      for (const [filename, expectedEncoded] of [
        ["my photo (1).jpg", "my%20photo%20(1).jpg"],
        ["photo.jpg", "photo.jpg"],
        ["写真.png", encodeURIComponent("写真.png")],
      ] as const) {
        const reply = makeDownloadReply();
        await downloadHandler(
          {
            params: { jobId: "job-1", filename },
            headers: {},
            log: { warn: vi.fn(), error: vi.fn() },
          },
          reply,
        );
        expect(reply.statusCode).toBe(200);
        expect(reply.headers["Content-Disposition"]).toBe(
          `attachment; filename="${expectedEncoded}"; filename*=UTF-8''${expectedEncoded}`,
        );
      }
    });

    it("extracts extension from filename and sets Content-Type header", async () => {
      for (const [filename, expectedType] of [
        ["photo.jpg", "image/jpeg"],
        ["my.photo.2024.PNG", "image/png"],
        ["notes.txt", "text/plain; charset=utf-8"],
        ["no-extension", "application/octet-stream"],
      ] as const) {
        const reply = makeDownloadReply();
        await downloadHandler(
          {
            params: { jobId: "job-1", filename },
            headers: {},
            log: { warn: vi.fn(), error: vi.fn() },
          },
          reply,
        );
        expect(reply.statusCode).toBe(200);
        expect(reply.headers["Content-Type"]).toBe(expectedType);
      }
    });

    it("normalizes S3 size-probe and stream-open faults into a 503 storage-unavailable SafeError classified as operational (#2808)", async () => {
      const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
      mocks.isStorageServiceFault.mockReturnValue(true);

      const s3Reset = Object.assign(new Error("read ECONNRESET"), {
        name: "TimeoutError",
        code: "ECONNRESET",
        syscall: "read",
        $metadata: { attempts: 3 },
      });
      const accessDenied = Object.assign(new Error("Access Denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      });
      const slowDown = Object.assign(new Error("Please reduce your request rate."), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      });

      // 1. outputs/ size probe fails with S3 ECONNRESET (with syscall: "read")
      mocks.getObjectSize.mockRejectedValueOnce(s3Reset);
      const outputsErr = await downloadHandler(
        {
          params: { jobId: "job-1", filename: "result.png" },
          headers: {},
          log: { warn: vi.fn(), error: vi.fn() },
        },
        makeDownloadReply(),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(outputsErr).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: s3Reset,
      });
      expect(classifyError(outputsErr, "http")).toBe("operational");
      expect(mocks.verifyS3Bucket).not.toHaveBeenCalled();

      // 2. outputs/ misses (404), uploads/ size probe fails with AccessDenied
      const notFound = Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
      mocks.isStorageServiceFault.mockImplementation((e: unknown) => e !== notFound);
      mocks.getObjectSize.mockRejectedValueOnce(notFound).mockRejectedValueOnce(accessDenied);
      const uploadsErr = await downloadHandler(
        {
          params: { jobId: "job-1", filename: "input.png" },
          headers: {},
          log: { warn: vi.fn(), error: vi.fn() },
        },
        makeDownloadReply(),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(uploadsErr).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: accessDenied,
      });
      expect(classifyError(uploadsErr, "http")).toBe("operational");
      expect(mocks.verifyS3Bucket).not.toHaveBeenCalled();

      // 3. getObjectStream fails with SlowDown
      mocks.isStorageServiceFault.mockReturnValue(true);
      mocks.getObjectSize.mockResolvedValueOnce(128);
      mocks.getObjectStream.mockRejectedValueOnce(slowDown);
      const streamErr = await downloadHandler(
        {
          params: { jobId: "job-1", filename: "result.png" },
          headers: {},
          log: { warn: vi.fn(), error: vi.fn() },
        },
        makeDownloadReply(),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(streamErr).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: slowDown,
      });
      expect(classifyError(streamErr, "http")).toBe("operational");

      // 4. unexpected S3 client bug rethrows unwrapped as "bug"
      const unexpectedBug = new TypeError("unexpected S3 client defect");
      mocks.getObjectSize.mockRejectedValueOnce(unexpectedBug);
      const bugErr = await downloadHandler(
        {
          params: { jobId: "job-1", filename: "result.png" },
          headers: {},
          log: { warn: vi.fn(), error: vi.fn() },
        },
        makeDownloadReply(),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(bugErr).toBe(unexpectedBug);
      expect(classifyError(bugErr, "http")).toBe("bug");
    });

    it("rethrows non-syscall local faults from getObjectSize and getObjectStream while keeping 404 for ENOENT and ENAMETOOLONG (#2851)", async () => {
      const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
      mocks.isStorageServiceFault.mockReturnValue(false);

      const nonMissingLocalErrors: Array<{
        err: Error;
        expectedKind: "bug" | "expected";
      }> = [
        {
          err: Object.assign(new RangeError("File size is greater than 2 GiB"), {
            code: "ERR_FS_FILE_TOO_LARGE",
          }),
          expectedKind: "bug",
        },
        {
          err: Object.assign(new Error("The operation was aborted"), {
            name: "AbortError",
            code: "ABORT_ERR",
          }),
          expectedKind: "expected",
        },
        {
          err: Object.assign(new RangeError("Invalid byte range"), {
            code: "ERR_OUT_OF_RANGE",
          }),
          expectedKind: "bug",
        },
        {
          err: new TypeError("unexpected local failure"),
          expectedKind: "bug",
        },
      ];

      // 1. outputs/ size probe fails with non-syscall local error -> rethrows without probing uploads/
      for (const { err: localFault, expectedKind } of nonMissingLocalErrors) {
        mocks.getObjectSize.mockClear();
        mocks.verifyS3Bucket.mockClear();
        mocks.getObjectSize.mockRejectedValueOnce(localFault);
        const warn = vi.fn();
        const reply = makeDownloadReply();
        const caught = await downloadHandler(
          {
            params: { jobId: "job-1", filename: "result.png" },
            headers: {},
            log: { warn, error: vi.fn() },
          },
          reply,
        ).then(
          () => null,
          (e: unknown) => e,
        );
        expect(caught).toBe(localFault);
        expect(classifyError(caught, "http")).toBe(expectedKind);
        expect(mocks.getObjectSize).toHaveBeenCalledTimes(1);
        expect(mocks.verifyS3Bucket).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(reply.send).not.toHaveBeenCalled();
      }

      // 2. outputs/ misses with ENOENT, uploads/ size probe fails with non-syscall local error -> rethrows
      const enoent = Object.assign(new Error("ENOENT: no such file or directory, stat"), {
        code: "ENOENT",
        syscall: "stat",
      });
      for (const { err: localFault, expectedKind } of nonMissingLocalErrors) {
        mocks.getObjectSize.mockClear();
        mocks.verifyS3Bucket.mockClear();
        mocks.getObjectSize.mockRejectedValueOnce(enoent).mockRejectedValueOnce(localFault);
        const warn = vi.fn();
        const reply = makeDownloadReply();
        const caught = await downloadHandler(
          {
            params: { jobId: "job-1", filename: "result.png" },
            headers: {},
            log: { warn, error: vi.fn() },
          },
          reply,
        ).then(
          () => null,
          (e: unknown) => e,
        );
        expect(caught).toBe(localFault);
        expect(classifyError(caught, "http")).toBe(expectedKind);
        expect(mocks.getObjectSize).toHaveBeenCalledTimes(2);
        expect(mocks.verifyS3Bucket).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(reply.send).not.toHaveBeenCalled();
      }

      // 3. getObjectStream fails with non-syscall local error -> rethrows instead of 404
      for (const { err: localFault, expectedKind } of nonMissingLocalErrors) {
        mocks.getObjectSize.mockResolvedValueOnce(128);
        mocks.getObjectStream.mockRejectedValueOnce(localFault);
        const warn = vi.fn();
        const reply = makeDownloadReply();
        const caught = await downloadHandler(
          {
            params: { jobId: "job-1", filename: "result.png" },
            headers: {},
            log: { warn, error: vi.fn() },
          },
          reply,
        ).then(
          () => null,
          (e: unknown) => e,
        );
        expect(caught).toBe(localFault);
        expect(classifyError(caught, "http")).toBe(expectedKind);
        expect(warn).not.toHaveBeenCalled();
        expect(reply.send).not.toHaveBeenCalled();
      }

      // 4. ENOENT, ENAMETOOLONG, and S3 NoSuchKey at getObjectStream still map to 404
      const enametoolong = Object.assign(new Error("ENAMETOOLONG: name too long, stat"), {
        code: "ENAMETOOLONG",
        syscall: "stat",
      });
      mocks.getObjectSize.mockRejectedValueOnce(enoent).mockRejectedValueOnce(enametoolong);
      const warnMiss = vi.fn();
      const missReply = makeDownloadReply();
      await downloadHandler(
        {
          params: { jobId: "job-1", filename: "missing.png" },
          headers: {},
          log: { warn: warnMiss, error: vi.fn() },
        },
        missReply,
      );
      expect(missReply.statusCode).toBe(404);
      expect(missReply.payload).toEqual({ error: "File not found" });
      expect(warnMiss).toHaveBeenCalledTimes(1);

      const s3StreamNoSuchKey = Object.assign(new Error("NoSuchKey"), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      });
      mocks.getObjectSize.mockResolvedValueOnce(128);
      mocks.getObjectStream.mockRejectedValueOnce(s3StreamNoSuchKey);
      const warnS3StreamMiss = vi.fn();
      const s3StreamMissReply = makeDownloadReply();
      await downloadHandler(
        {
          params: { jobId: "job-1", filename: "vanished-on-stream.png" },
          headers: {},
          log: { warn: warnS3StreamMiss, error: vi.fn() },
        },
        s3StreamMissReply,
      );
      expect(s3StreamMissReply.statusCode).toBe(404);
      expect(s3StreamMissReply.payload).toEqual({ error: "File not found" });
      expect(warnS3StreamMiss).toHaveBeenCalledTimes(1);
    });

    it("verifies S3 bucket existence only when both outputs/ and uploads/ size probes miss (#996)", async () => {
      const notFound = Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
      mocks.isStorageServiceFault.mockReturnValue(false);

      // 1. outputs/ hits -> verifyS3Bucket not called
      mocks.getObjectSize.mockResolvedValueOnce(5);
      await downloadHandler(
        {
          params: { jobId: "job-1", filename: "result.png" },
          headers: {},
          log: { warn: vi.fn(), error: vi.fn() },
        },
        makeDownloadReply(),
      );
      expect(mocks.verifyS3Bucket).not.toHaveBeenCalled();

      // 2. outputs/ misses, uploads/ hits -> verifyS3Bucket not called
      mocks.getObjectSize.mockRejectedValueOnce(notFound).mockResolvedValueOnce(5);
      await downloadHandler(
        {
          params: { jobId: "job-1", filename: "input.png" },
          headers: {},
          log: { warn: vi.fn(), error: vi.fn() },
        },
        makeDownloadReply(),
      );
      expect(mocks.verifyS3Bucket).not.toHaveBeenCalled();

      // 3. both miss and bucket exists -> verifyS3Bucket called once, warns and returns 404
      mocks.getObjectSize.mockRejectedValueOnce(notFound).mockRejectedValueOnce(notFound);
      const warnOnMiss = vi.fn();
      const missReply = makeDownloadReply();
      await downloadHandler(
        {
          params: { jobId: "job-1", filename: "missing.png" },
          headers: {},
          log: { warn: warnOnMiss, error: vi.fn() },
        },
        missReply,
      );
      expect(mocks.verifyS3Bucket).toHaveBeenCalledTimes(1);
      expect(warnOnMiss).toHaveBeenCalledTimes(1);
      expect(missReply.statusCode).toBe(404);
      expect(missReply.payload).toEqual({ error: "File not found" });

      // 4. both miss because bucket vanished -> verifyS3Bucket rejects with 503 before 404 warn
      const { SafeError } = await import("@snapotter/shared");
      const bucketFault = new SafeError("The server's storage service is unavailable.", {
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
      });
      mocks.verifyS3Bucket.mockRejectedValueOnce(bucketFault);
      mocks.getObjectSize.mockRejectedValueOnce(notFound).mockRejectedValueOnce(notFound);
      const warnOnVanishedBucket = vi.fn();
      const vanishedReply = makeDownloadReply();
      const caught = await downloadHandler(
        {
          params: { jobId: "job-1", filename: "result.png" },
          headers: {},
          log: { warn: warnOnVanishedBucket, error: vi.fn() },
        },
        vanishedReply,
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(caught).toBe(bucketFault);
      expect(warnOnVanishedBucket).not.toHaveBeenCalled();
      expect(vanishedReply.send).not.toHaveBeenCalled();
    });

    it.each([
      ["result.jp2", "image/jp2"],
      ["result.qoi", "image/qoi"],
      ["result.ppm", "image/x-portable-pixmap"],
      ["result.pgm", "image/x-portable-graymap"],
      ["result.pbm", "image/x-portable-bitmap"],
      ["result.dds", "image/vnd.ms-dds"],
      ["result.cur", "image/x-icon"],
      ["result.apng", "image/apng"],
      ["result.dpx", "image/x-dpx"],
      ["result.fits", "image/fits"],
      ["result.eps", "application/postscript"],
      ["result.svgz", "image/svg+xml"],
      ["result.cr3", "image/x-canon-cr3"],
      ["result.raf", "image/x-fuji-raf"],
      ["result.pef", "image/x-pentax-pef"],
    ])(
      "serves Content-Type from IMAGE_EXT_TO_MIME for %s -> %s (#3215)",
      async (filename, expectedContentType) => {
        const reply = makeDownloadReply();
        await downloadHandler(
          {
            params: { jobId: "job-1", filename },
            headers: {},
            log: { warn: vi.fn(), error: vi.fn() },
          },
          reply,
        );
        expect(reply.statusCode).toBe(200);
        expect(reply.headers["Content-Type"]).toBe(expectedContentType);
      },
    );
  });

  describe("POST /api/v1/upload orphan cleanup on failure (#1210)", () => {
    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let uploadHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        post: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/upload") uploadHandler = handler;
        }),
        get: vi.fn(),
      };
      await fileRoutes(fakeApp as never);
    });

    beforeEach(async () => {
      vi.clearAllMocks();
      mocks.deletePrefix.mockResolvedValue(undefined);
      mocks.putObject.mockResolvedValue(undefined);
      mocks.dbInsertValues.mockResolvedValue(undefined);
      mocks.dbDeleteWhere.mockResolvedValue(undefined);
      mocks.requireFileAccess.mockResolvedValue({ id: "user-1", role: "admin" });
      const { sanitizeSvg: realSanitizeSvg } = await vi.importActual<
        typeof import("../../../apps/api/src/lib/svg-sanitize.js")
      >("../../../apps/api/src/lib/svg-sanitize.js");
      mocks.sanitizeSvg.mockImplementation(realSanitizeSvg);
    });

    function makeReply() {
      const reply = {
        statusCode: 200,
        payload: undefined as unknown,
        status: vi.fn((code: number) => {
          reply.statusCode = code;
          return reply;
        }),
        code: vi.fn((code: number) => {
          reply.statusCode = code;
          return reply;
        }),
        header: vi.fn(() => reply),
        send: vi.fn((body: unknown) => {
          reply.payload = body;
          return reply;
        }),
      };
      return reply;
    }

    function filePart(filename: string | undefined, content: Buffer | Error) {
      return {
        type: "file" as const,
        fieldname: "file",
        filename,
        file:
          content instanceof Error
            ? new Readable({
                read() {
                  this.destroy(content);
                },
              })
            : Readable.from([content]),
      };
    }

    function makeRequest(
      parts: Array<ReturnType<typeof filePart> | Error>,
      log = { warn: vi.fn(), error: vi.fn() },
    ) {
      return {
        log,
        parts: async function* () {
          for (const part of parts) {
            if (part instanceof Error) throw part;
            yield part;
          }
        },
      };
    }

    it("deletes earlier uploaded parts when a later SVG fails with 400", async () => {
      const clientErr = Object.assign(new Error("SVG exceeds maximum element count (5000)"), {
        statusCode: 400,
      });
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw clientErr;
      });
      const req = makeRequest([
        filePart("first.txt", Buffer.from("hello")),
        filePart(
          "second.svg",
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
        ),
      ]);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.payload).toEqual({ error: "SVG exceeds maximum element count (5000)" });
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const writtenKey = (mocks.putObject.mock.calls[0] as unknown[])[0] as string;
      const prefix = writtenKey.replace(/first\.txt$/, "");
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(prefix);
    });

    it("deletes earlier uploaded parts when a later SVG sanitizer call fails with 500", async () => {
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw new Error("unexpected parser failure");
      });
      const req = makeRequest([
        filePart("first.txt", Buffer.from("hello")),
        filePart(
          "second.svg",
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
        ),
      ]);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(500);
      expect(reply.payload).toEqual({ error: "Internal server error" });
      expect(mocks.reportError).toHaveBeenCalledTimes(1);
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const writtenKey = (mocks.putObject.mock.calls[0] as unknown[])[0] as string;
      const prefix = writtenKey.replace(/first\.txt$/, "");
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(prefix);
    });

    it("deletes earlier uploaded parts and rethrows when a later file part stream errors (e.g. 413)", async () => {
      const tooLarge = Object.assign(new Error("request file too large"), {
        statusCode: 413,
        code: "FST_REQ_FILE_TOO_LARGE",
      });
      const req = makeRequest([
        filePart("first.txt", Buffer.from("hello")),
        filePart("huge.bin", tooLarge),
      ]);
      const reply = makeReply();

      await expect(uploadHandler(req, reply)).rejects.toBe(tooLarge);
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const writtenKey = (mocks.putObject.mock.calls[0] as unknown[])[0] as string;
      const prefix = writtenKey.replace(/first\.txt$/, "");
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(prefix);
    });

    it("deletes earlier uploaded parts and rethrows when putObject fails on a later part", async () => {
      const storageFault = Object.assign(new Error("The server's storage is full."), {
        statusCode: 503,
      });
      mocks.putObject.mockResolvedValueOnce(undefined).mockRejectedValueOnce(storageFault);
      const req = makeRequest([
        filePart("first.txt", Buffer.from("hello")),
        filePart("second.txt", Buffer.from("world")),
      ]);
      const reply = makeReply();

      await expect(uploadHandler(req, reply)).rejects.toBe(storageFault);
      expect(mocks.putObject).toHaveBeenCalledTimes(2);
      const writtenKey = (mocks.putObject.mock.calls[0] as unknown[])[0] as string;
      const prefix = writtenKey.replace(/first\.txt$/, "");
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(prefix);
    });

    it("deletes earlier uploaded parts and rethrows when the multipart iterator throws between parts", async () => {
      const filesLimitErr = Object.assign(new Error("reached files limit"), {
        statusCode: 400,
      });
      const req = makeRequest([filePart("first.txt", Buffer.from("hello")), filesLimitErr]);
      const reply = makeReply();

      await expect(uploadHandler(req, reply)).rejects.toBe(filesLimitErr);
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const writtenKey = (mocks.putObject.mock.calls[0] as unknown[])[0] as string;
      const prefix = writtenKey.replace(/first\.txt$/, "");
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(prefix);
    });

    it("cleans up the upload prefix and rethrows when putObject fails on the first part", async () => {
      const storageFault = Object.assign(new Error("The server's storage is full."), {
        statusCode: 503,
      });
      mocks.putObject.mockRejectedValueOnce(storageFault);
      const req = makeRequest([filePart("first.txt", Buffer.from("hello"))]);
      const reply = makeReply();

      await expect(uploadHandler(req, reply)).rejects.toBe(storageFault);
      expect(mocks.dbInsertValues).toHaveBeenCalledTimes(1);
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const writtenKey = (mocks.putObject.mock.calls[0] as unknown[])[0] as string;
      const prefix = writtenKey.replace(/first\.txt$/, "");
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(prefix);
      expect(mocks.dbDeleteWhere).toHaveBeenCalledTimes(1);
    });

    it("does not mask a rethrown stream or storage error when deletePrefix fails in the outer catch", async () => {
      const tooLarge = Object.assign(new Error("request file too large"), {
        statusCode: 413,
        code: "FST_REQ_FILE_TOO_LARGE",
      });
      mocks.deletePrefix.mockRejectedValueOnce(new Error("S3 cleanup fault"));
      const log = { warn: vi.fn(), error: vi.fn() };
      const req = makeRequest(
        [filePart("first.txt", Buffer.from("hello")), filePart("huge.bin", tooLarge)],
        log,
      );
      const reply = makeReply();

      await expect(uploadHandler(req, reply)).rejects.toBe(tooLarge);
      expect(mocks.dbDeleteWhere).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), jobId: expect.any(String) }),
        "failed to discard a rejected request's uploads",
      );
    });

    it("does not mask the original 400 when deletePrefix fails during cleanup", async () => {
      const clientErr = Object.assign(new Error("SVG exceeds maximum element count (5000)"), {
        statusCode: 400,
      });
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw clientErr;
      });
      mocks.deletePrefix.mockRejectedValueOnce(new Error("S3 cleanup fault"));
      const log = { warn: vi.fn(), error: vi.fn() };
      const req = makeRequest(
        [
          filePart("first.txt", Buffer.from("hello")),
          filePart(
            "second.svg",
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
          ),
        ],
        log,
      );
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.payload).toEqual({ error: "SVG exceeds maximum element count (5000)" });
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), jobId: expect.any(String) }),
        "failed to discard a rejected request's uploads",
      );
    });

    it("does not call deletePrefix when the first part is rejected before putObject", async () => {
      const clientErr = Object.assign(new Error("SVG exceeds maximum element count (5000)"), {
        statusCode: 400,
      });
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw clientErr;
      });
      const req = makeRequest([
        filePart("first.svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')),
      ]);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(400);
      expect(mocks.dbInsertValues).not.toHaveBeenCalled();
      expect(mocks.putObject).not.toHaveBeenCalled();
      expect(mocks.deletePrefix).not.toHaveBeenCalled();
      expect(mocks.dbDeleteWhere).not.toHaveBeenCalled();
    });

    it("keeps uploaded files when all parts succeed", async () => {
      const req = makeRequest([
        filePart("first.txt", Buffer.from("hello")),
        filePart("second.txt", Buffer.from("world")),
      ]);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(mocks.putObject).toHaveBeenCalledTimes(2);
      expect(mocks.deletePrefix).not.toHaveBeenCalled();
    });

    it("rejects an .svgz upload that decompresses past the 50 MiB cap with 400, cleans up earlier parts, and skips reportError (#2593)", async () => {
      const svgzBomb = gzipSync(
        Buffer.concat([
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'),
          Buffer.alloc(51 * 1024 * 1024, 0x20),
          Buffer.from("</svg>"),
        ]),
      );
      const log = { warn: vi.fn(), error: vi.fn() };
      const req = makeRequest(
        [filePart("first.txt", Buffer.from("hello")), filePart("bomb.svgz", svgzBomb)],
        log,
      );
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(400);
      expect(reply.payload).toEqual({
        error: expect.stringMatching(/52428800|larger than/i),
      });
      expect(mocks.reportError).not.toHaveBeenCalled();
      expect(log.error).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(RangeError), filename: "bomb.svgz" }),
        "SVGZ decompression failed",
      );
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const writtenKey = (mocks.putObject.mock.calls[0] as unknown[])[0] as string;
      const prefix = writtenKey.replace(/first\.txt$/, "");
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(prefix);
    });

    it("returns an empty format string for extensionless non-image files (#2745)", async () => {
      const nonSvgGzip = gzipSync(Buffer.from("hello"));
      const req = makeRequest([
        filePart("README", Buffer.from("hello")),
        filePart("README.", Buffer.from("trailing-dot")),
        filePart(undefined, Buffer.from("world")),
        filePart(".gitignore", Buffer.from("node_modules\n")),
        filePart("tga", Buffer.from("hello")),
        filePart(".tga", Buffer.from("hello")),
        filePart("dng", Buffer.from("hello")),
        filePart(".dng", Buffer.from("hello")),
        filePart("notes.dng", Buffer.from("hello")),
        filePart("archive.svgz", nonSvgGzip),
        filePart("Archive.ZIP", Buffer.from("not-an-image")),
        filePart(
          "logo",
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'),
        ),
      ]);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.payload).toEqual({
        jobId: expect.any(String),
        files: [
          { name: "README", size: 5, format: "" },
          { name: "README.", size: 12, format: "" },
          { name: "upload", size: 5, format: "" },
          { name: ".gitignore", size: 13, format: "" },
          { name: "tga", size: 5, format: "" },
          { name: ".tga", size: 5, format: "" },
          { name: "dng", size: 5, format: "" },
          { name: ".dng", size: 5, format: "" },
          { name: "notes.dng", size: 5, format: "dng" },
          { name: "archive.svgz", size: nonSvgGzip.length, format: "svgz" },
          { name: "Archive.ZIP", size: 12, format: "zip" },
          {
            name: "logo",
            size: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
              .length,
            format: "svg",
          },
        ],
      });
    });

    it("stores a .svgz dotfile as an extensionless file without treating it as an SVGZ archive (#3259)", async () => {
      const corruptGzipDotfile = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);
      const log = { warn: vi.fn(), error: vi.fn() };
      const req = makeRequest([filePart(".svgz", corruptGzipDotfile)], log);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(log.warn).not.toHaveBeenCalled();
      expect(reply.payload).toEqual({
        jobId: expect.any(String),
        files: [{ name: ".svgz", size: corruptGzipDotfile.length, format: "" }],
      });
    });

    it("validates DOCTYPE-bearing SVGs and SVGZ archives after sanitizeSvg strips the DOCTYPE (#3259)", async () => {
      const parameterEntitySvg = Buffer.from(
        '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY % p SYSTEM "http://127.0.0.1:1/evil.dtd"> %p;]>' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      );
      const req = makeRequest([
        filePart("logo", parameterEntitySvg),
        filePart("icon.svgz", gzipSync(parameterEntitySvg)),
      ]);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.payload).toEqual({
        jobId: expect.any(String),
        files: [
          {
            name: "logo",
            size: expect.any(Number),
            format: "svg",
          },
          {
            name: "icon.svg",
            size: expect.any(Number),
            format: "svg",
          },
        ],
      });
      for (const callIdx of [0, 1]) {
        const storedSvg = (
          mocks.putObject.mock.calls[callIdx] as unknown as [string, Buffer]
        )[1].toString("utf-8");
        expect(storedSvg).not.toContain("DOCTYPE");
        expect(storedSvg).toContain("<svg");
      }
    });

    it("sanitizes the upload filename before .svgz detection so double-extension uploads stay consistent (#3531)", async () => {
      const rawSvgWithScript = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
      );
      const compressedSvg = gzipSync(rawSvgWithScript);
      const nonSvgGzip = gzipSync(Buffer.from("not-an-svg"));
      const req = makeRequest([
        filePart("diagram.svgz.php", compressedSvg),
        filePart("diagram.png.svgz", compressedSvg),
        filePart("archive.svgz.php", nonSvgGzip),
      ]);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.payload).toEqual({
        jobId: expect.any(String),
        files: [
          {
            name: "diagram.svg",
            size: expect.any(Number),
            format: "svg",
          },
          {
            name: "diagram.png",
            size: compressedSvg.length,
            format: "png",
          },
          {
            name: "archive.svgz",
            size: nonSvgGzip.length,
            format: "svgz",
          },
        ],
      });
      const firstStored = (
        mocks.putObject.mock.calls[0] as unknown as [string, Buffer]
      )[1].toString("utf-8");
      expect(firstStored).toContain("<svg");
      expect(firstStored).not.toContain("<script");
      const secondStored = (mocks.putObject.mock.calls[1] as unknown as [string, Buffer])[1];
      expect(secondStored.equals(compressedSvg)).toBe(true);
      const thirdStored = (mocks.putObject.mock.calls[2] as unknown as [string, Buffer])[1];
      expect(thirdStored.equals(nonSvgGzip)).toBe(true);
    });

    it("records a completed upload jobs row once before the first putObject so S3 TTL sweep expires the prefix (#3624)", async () => {
      const req = makeRequest([
        filePart("first.txt", Buffer.from("hello")),
        filePart("second.txt", Buffer.from("world")),
      ]);
      const reply = makeReply();

      await uploadHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      const { jobId } = reply.payload as { jobId: string };
      expect(mocks.dbInsertValues).toHaveBeenCalledTimes(1);
      expect(mocks.dbInsertValues).toHaveBeenCalledWith({
        id: jobId,
        userId: "user-1",
        toolId: "upload",
        type: "single",
        status: "completed",
        inputRefs: [],
        outputRefs: [`uploads/${jobId}/first.txt`],
        completedAt: expect.any(Date),
      });
      expect(mocks.dbInsertValues.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.putObject.mock.invocationCallOrder[0] ?? 0,
      );
      expect(mocks.dbDeleteWhere).not.toHaveBeenCalled();
    });

    it("deletes the recorded jobs row in discardUploads when a later part fails, and keeps the row when deletePrefix fails (#3624)", async () => {
      const clientErr = Object.assign(new Error("SVG exceeds maximum element count (5000)"), {
        statusCode: 400,
      });
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw clientErr;
      });
      const req1 = makeRequest([
        filePart("first.txt", Buffer.from("hello")),
        filePart(
          "second.svg",
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
        ),
      ]);
      const reply1 = makeReply();

      await uploadHandler(req1, reply1);

      expect(reply1.statusCode).toBe(400);
      expect(mocks.dbInsertValues).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.dbDeleteWhere).toHaveBeenCalledTimes(1);

      // When deletePrefix fails, keep the jobs row so the S3 TTL sweep can expire the prefix later
      vi.clearAllMocks();
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw clientErr;
      });
      mocks.deletePrefix.mockRejectedValueOnce(new Error("S3 cleanup fault"));
      const log2 = { warn: vi.fn(), error: vi.fn() };
      const req2 = makeRequest(
        [
          filePart("first.txt", Buffer.from("hello")),
          filePart(
            "second.svg",
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
          ),
        ],
        log2,
      );
      const reply2 = makeReply();

      await uploadHandler(req2, reply2);

      expect(reply2.statusCode).toBe(400);
      expect(mocks.dbInsertValues).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.dbDeleteWhere).not.toHaveBeenCalled();

      // When db.delete fails during discardUploads, log a warning without masking the original error
      vi.clearAllMocks();
      mocks.sanitizeSvg.mockImplementationOnce(() => {
        throw clientErr;
      });
      mocks.dbDeleteWhere.mockRejectedValueOnce(new Error("DB delete fault"));
      const log3 = { warn: vi.fn(), error: vi.fn() };
      const req3 = makeRequest(
        [
          filePart("first.txt", Buffer.from("hello")),
          filePart(
            "second.svg",
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
          ),
        ],
        log3,
      );
      const reply3 = makeReply();

      await uploadHandler(req3, reply3);

      expect(reply3.statusCode).toBe(400);
      expect(log3.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), jobId: expect.any(String) }),
        "failed to delete a rejected request's job row",
      );
    });

    it("rethrows a 500 error and writes nothing to storage when recording the upload jobs row fails (#3624)", async () => {
      mocks.dbInsertValues.mockRejectedValueOnce(
        new Error('Failed query: insert into "jobs" params: secret'),
      );
      const req = makeRequest([filePart("first.txt", Buffer.from("hello"))]);
      const reply = makeReply();

      await expect(uploadHandler(req, reply)).rejects.toMatchObject({
        message: "Failed to record the job",
        statusCode: 500,
      });
      expect(mocks.putObject).not.toHaveBeenCalled();
      expect(mocks.deletePrefix).not.toHaveBeenCalled();
      expect(mocks.dbDeleteWhere).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/preview RAW extension extraction (#3246)", () => {
    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let previewHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        post: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/preview") previewHandler = handler;
        }),
        get: vi.fn(),
      };
      await fileRoutes(fakeApp as never);
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.requirePermission.mockImplementation(() => () => Promise.resolve(true));
    });

    function makePreviewReply() {
      const headers: Record<string, string> = {};
      const reply = {
        statusCode: 200,
        headers,
        payload: undefined as unknown,
        status: vi.fn((code: number) => {
          reply.statusCode = code;
          return reply;
        }),
        header: vi.fn((name: string, val: string) => {
          headers[name] = val;
          return reply;
        }),
        send: vi.fn((body: unknown) => {
          reply.payload = body;
          return reply;
        }),
      };
      return reply;
    }

    const PNG_1X1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    it("passes undefined ext for extensionless RAW filenames instead of the bare filename (#3246)", async () => {
      const rafMagic = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");
      mocks.decodeToSharpCompat.mockResolvedValueOnce(PNG_1X1);
      mocks.readImageDimensions.mockResolvedValueOnce({ width: 6000, height: 4000 });

      const req = {
        log: { warn: vi.fn(), error: vi.fn() },
        file: async () => ({
          filename: "sub/DSCF0001",
          toBuffer: async () => rafMagic,
        }),
      };
      const reply = makePreviewReply();

      await previewHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(mocks.decodeToSharpCompat).toHaveBeenCalledWith(rafMagic, "raw", undefined);
      expect(mocks.readImageDimensions).toHaveBeenCalledWith(rafMagic, undefined);
      expect(reply.headers["X-Original-Width"]).toBe("6000");
      expect(reply.headers["X-Original-Height"]).toBe("4000");
    });

    it.each([
      [".raf", undefined],
      ["DSCF0001.", undefined],
      [undefined, undefined],
      ["photo.jpg.cr2", "cr2"],
    ] as const)(
      "extracts ext=%s -> %s consistently with validateImageBuffer (#3246)",
      async (filename, expectedExt) => {
        const rafMagic = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");
        mocks.decodeToSharpCompat.mockResolvedValueOnce(PNG_1X1);
        mocks.readImageDimensions.mockResolvedValueOnce({ width: 4000, height: 3000 });

        const req = {
          log: { warn: vi.fn(), error: vi.fn() },
          file: async () => ({
            filename,
            toBuffer: async () => rafMagic,
          }),
        };
        const reply = makePreviewReply();

        await previewHandler(req, reply);

        expect(reply.statusCode).toBe(200);
        expect(mocks.decodeToSharpCompat).toHaveBeenCalledWith(rafMagic, "raw", expectedExt);
        expect(mocks.readImageDimensions).toHaveBeenCalledWith(rafMagic, expectedExt);
      },
    );

    it("extracts lowercase extension via extname for dotted RAW filenames (#3246)", async () => {
      const rafMagic = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");
      mocks.decodeToSharpCompat.mockResolvedValueOnce(PNG_1X1);
      mocks.readImageDimensions.mockResolvedValueOnce({ width: 6000, height: 4000 });

      const req = {
        log: { warn: vi.fn(), error: vi.fn() },
        file: async () => ({
          filename: "sub/DSCF0001.RAF",
          toBuffer: async () => rafMagic,
        }),
      };
      const reply = makePreviewReply();

      await previewHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(mocks.decodeToSharpCompat).toHaveBeenCalledWith(rafMagic, "raw", "raf");
      expect(mocks.readImageDimensions).toHaveBeenCalledWith(rafMagic, "raf");
    });

    it("keeps Sharp decoded dimensions in X-Original-Width/Height when readImageDimensions returns null (#3343)", async () => {
      const rafMagic = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");
      mocks.decodeToSharpCompat.mockResolvedValueOnce(PNG_1X1);
      mocks.readImageDimensions.mockResolvedValueOnce(null);

      const req = {
        log: { warn: vi.fn(), error: vi.fn() },
        file: async () => ({
          filename: "DSCF0001.RAF",
          toBuffer: async () => rafMagic,
        }),
      };
      const reply = makePreviewReply();

      await previewHandler(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.headers["X-Original-Width"]).toBe("1");
      expect(reply.headers["X-Original-Height"]).toBe("1");
    });

    it("answers 503 ENGINE_UNAVAILABLE when decodeToSharpCompat throws DecoderUnavailableError on a TIFF-headed RAW (CR2) whose header Sharp reads (#2801)", async () => {
      const cr2Bytes = readFileSync(
        resolve(process.cwd(), "tests/fixtures/image/formats/sample.cr2"),
      );
      const formatDecoders = await import("../../../apps/api/src/lib/format-decoders.js");
      mocks.decodeToSharpCompat.mockRejectedValueOnce(
        new formatDecoders.DecoderUnavailableError("No dcraw_emu found."),
      );

      const req = {
        log: { warn: vi.fn(), error: vi.fn() },
        file: async () => ({
          filename: "photo.cr2",
          toBuffer: async () => cr2Bytes,
        }),
      };
      const reply = makePreviewReply();

      await previewHandler(req, reply);

      expect(reply.statusCode).toBe(503);
      expect(reply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    });

    it.each([
      ["ENOSPC", "storage-full"],
      ["EDQUOT", "storage-full"],
      ["EACCES", "storage-not-writable"],
      ["EPERM", "storage-not-writable"],
      ["EROFS", "storage-not-writable"],
    ] as const)(
      "answers 503 %s (%s) when decodeHeic or decodeToSharpCompat fails writing to tmpdir, including on a DNG that Sharp can read (#2800)",
      async (errno, expectedCode) => {
        const heicBytes = readFileSync(
          resolve(process.cwd(), "tests/fixtures/image/valid/test-200x150.heic"),
        );
        const psdBytes = readFileSync(
          resolve(process.cwd(), "tests/fixtures/image/formats/sample.psd"),
        );
        const dngBytes = readFileSync(
          resolve(process.cwd(), "tests/fixtures/image/formats/sample.dng"),
        );
        const fsErr = () =>
          Object.assign(new Error(`${errno}: open temp file`), {
            code: errno,
            syscall: "open",
          });

        mocks.decodeHeic.mockRejectedValueOnce(fsErr());
        const heicReply = makePreviewReply();
        await previewHandler(
          {
            log: { warn: vi.fn(), error: vi.fn() },
            file: async () => ({ filename: "photo.heic", toBuffer: async () => heicBytes }),
          },
          heicReply,
        );
        expect(heicReply.statusCode).toBe(503);
        expect(heicReply.payload).toMatchObject({ code: expectedCode });

        mocks.decodeToSharpCompat.mockRejectedValueOnce(fsErr());
        const psdReply = makePreviewReply();
        await previewHandler(
          {
            log: { warn: vi.fn(), error: vi.fn() },
            file: async () => ({ filename: "layer.psd", toBuffer: async () => psdBytes }),
          },
          psdReply,
        );
        expect(psdReply.statusCode).toBe(503);
        expect(psdReply.payload).toMatchObject({ code: expectedCode });

        mocks.decodeToSharpCompat.mockRejectedValueOnce(fsErr());
        const dngReply = makePreviewReply();
        await previewHandler(
          {
            log: { warn: vi.fn(), error: vi.fn() },
            file: async () => ({ filename: "photo.dng", toBuffer: async () => dngBytes }),
          },
          dngReply,
        );
        expect(dngReply.statusCode).toBe(503);
        expect(dngReply.payload).toMatchObject({ code: expectedCode });

        const objectStorage = await import("../../../apps/api/src/lib/object-storage.js");
        for (const dimErr of [
          fsErr(),
          objectStorage.normalizeOperationalWriteError(fsErr()) as Error,
        ]) {
          mocks.decodeToSharpCompat.mockResolvedValueOnce(PNG_1X1);
          mocks.readImageDimensions.mockRejectedValueOnce(dimErr);
          const rawDimReply = makePreviewReply();
          await previewHandler(
            {
              log: { warn: vi.fn(), error: vi.fn() },
              file: async () => ({ filename: "photo.dng", toBuffer: async () => dngBytes }),
            },
            rawDimReply,
          );
          expect(rawDimReply.statusCode).toBe(503);
          expect(rawDimReply.payload).toMatchObject({ code: expectedCode });
        }
      },
    );

    it("answers 503 ENGINE_UNAVAILABLE when readImageDimensions rejects with DecoderOutOfMemoryError (#3548)", async () => {
      const dngBytes = readFileSync(
        resolve(process.cwd(), "tests/fixtures/image/formats/sample.dng"),
      );
      const formatDecoders = await import("../../../apps/api/src/lib/format-decoders.js");
      mocks.decodeToSharpCompat.mockResolvedValueOnce(PNG_1X1);
      mocks.readImageDimensions.mockRejectedValueOnce(
        new formatDecoders.DecoderOutOfMemoryError("The image decoder ran out of memory."),
      );
      const reply = makePreviewReply();
      await previewHandler(
        {
          log: { warn: vi.fn(), error: vi.fn() },
          file: async () => ({ filename: "photo.dng", toBuffer: async () => dngBytes }),
        },
        reply,
      );
      expect(reply.statusCode).toBe(503);
      expect(reply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    });

    it("answers 503 ENGINE_UNAVAILABLE and reports DecoderOutOfMemoryError when Sharp preview encode, CLI/HEIC decode, or the DNG fallback probe hits V8 buffer allocation OOM (#3619)", async () => {
      const sharpMod = (await import("sharp")).default;
      const formatDecoders = await import("../../../apps/api/src/lib/format-decoders.js");
      const tiffBytes = await sharpMod({
        create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
      })
        .tiff()
        .toBuffer();
      const heicBytes = readFileSync(
        resolve(process.cwd(), "tests/fixtures/image/valid/test-200x150.heic"),
      );
      const psdBytes = readFileSync(
        resolve(process.cwd(), "tests/fixtures/image/formats/sample.psd"),
      );

      // 1. Final Sharp WebP preview encode rejects with V8 RangeError("Array buffer allocation failed") vs non-OOM RangeError
      const webpSpy = vi
        .spyOn(sharpMod.prototype, "webp")
        .mockImplementationOnce(function (this: InstanceType<typeof sharpMod>) {
          return {
            toBuffer: async () => {
              throw new RangeError("Array buffer allocation failed");
            },
          } as unknown as InstanceType<typeof sharpMod>;
        })
        .mockImplementationOnce(function (this: InstanceType<typeof sharpMod>) {
          return {
            toBuffer: async () => {
              throw new RangeError("Invalid WebP parameter");
            },
          } as unknown as InstanceType<typeof sharpMod>;
        });
      let fakeNow = Date.now() + 20 * 60_000;
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => fakeNow);
      try {
        mocks.reportError.mockClear();
        const warnOom = vi.fn();
        const webpOomReply = makePreviewReply();
        await previewHandler(
          {
            log: { warn: warnOom, error: vi.fn() },
            file: async () => ({ filename: "photo.tiff", toBuffer: async () => tiffBytes }),
          },
          webpOomReply,
        );
        expect(webpOomReply.statusCode).toBe(503);
        expect(webpOomReply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
        expect(warnOom).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "ENGINE_UNAVAILABLE",
            cause: "DecoderOutOfMemoryError",
            toolId: "file-preview",
          }),
          "Tool engine unavailable during input preparation",
        );
        expect(mocks.reportError).toHaveBeenCalledOnce();

        fakeNow += 11 * 60_000;
        mocks.reportError.mockClear();
        const warnNonOom = vi.fn();
        const nonOomReply = makePreviewReply();
        await previewHandler(
          {
            log: { warn: warnNonOom, error: vi.fn() },
            file: async () => ({ filename: "photo.tiff", toBuffer: async () => tiffBytes }),
          },
          nonOomReply,
        );
        expect(nonOomReply.statusCode).toBe(422);
        expect(nonOomReply.payload).toEqual({
          error: "Failed to generate preview for TIFF file",
        });
        expect(warnNonOom).not.toHaveBeenCalled();
        expect(mocks.reportError).not.toHaveBeenCalled();

        // 1b. Final sharp(buffer).metadata() rejecting with V8 RangeError("Array buffer allocation failed")
        fakeNow += 11 * 60_000;
        mocks.reportError.mockClear();
        const origMetadata = sharpMod.prototype.metadata;
        let metaCallCount = 0;
        const metaSpy = vi.spyOn(sharpMod.prototype, "metadata").mockImplementation(function (
          this: InstanceType<typeof sharpMod>,
        ) {
          metaCallCount += 1;
          // Call 1 is inside validateImageBuffer; call 2 is preMeta in POST /api/v1/preview
          if (metaCallCount === 2) {
            return Promise.reject(new RangeError("Array buffer allocation failed"));
          }
          return origMetadata.call(this);
        });
        try {
          const warnMetaOom = vi.fn();
          const metaOomReply = makePreviewReply();
          await previewHandler(
            {
              log: { warn: warnMetaOom, error: vi.fn() },
              file: async () => ({ filename: "photo.tiff", toBuffer: async () => tiffBytes }),
            },
            metaOomReply,
          );
          expect(metaOomReply.statusCode).toBe(503);
          expect(metaOomReply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
          expect(warnMetaOom).toHaveBeenCalledWith(
            expect.objectContaining({
              code: "ENGINE_UNAVAILABLE",
              cause: "DecoderOutOfMemoryError",
              toolId: "file-preview",
            }),
            "Tool engine unavailable during input preparation",
          );
          expect(mocks.reportError).toHaveBeenCalledOnce();
        } finally {
          metaSpy.mockRestore();
        }

        // 2. DNG Sharp fallback probe rejecting with V8 RangeError("Array buffer allocation failed") surfaces DecoderOutOfMemoryError over DecoderUnavailableError
        fakeNow += 11 * 60_000;
        mocks.reportError.mockClear();
        mocks.decodeToSharpCompat.mockRejectedValueOnce(
          new formatDecoders.DecoderUnavailableError("No dcraw_emu found."),
        );
        const rawSpy = vi.spyOn(sharpMod.prototype, "raw").mockImplementationOnce(function (
          this: InstanceType<typeof sharpMod>,
        ) {
          return {
            toBuffer: async () => {
              throw new RangeError("Array buffer allocation failed");
            },
          } as unknown as InstanceType<typeof sharpMod>;
        });
        try {
          const warnDngProbeOom = vi.fn();
          const dngProbeReply = makePreviewReply();
          await previewHandler(
            {
              log: { warn: warnDngProbeOom, error: vi.fn() },
              file: async () => ({ filename: "photo.dng", toBuffer: async () => tiffBytes }),
            },
            dngProbeReply,
          );
          expect(dngProbeReply.statusCode).toBe(503);
          expect(dngProbeReply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
          expect(warnDngProbeOom).toHaveBeenCalledWith(
            expect.objectContaining({
              code: "ENGINE_UNAVAILABLE",
              cause: "DecoderOutOfMemoryError",
              toolId: "file-preview",
            }),
            "Tool engine unavailable during input preparation",
          );
          expect(mocks.reportError).toHaveBeenCalledOnce();
        } finally {
          rawSpy.mockRestore();
        }

        // 3. Raw SIGKILL and V8 RangeError at decodeHeic and decodeToSharpCompat (PSD + DNG)
        for (const makeRawOom of [
          () => Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" }),
          () => new RangeError("Array buffer allocation failed"),
        ]) {
          fakeNow += 11 * 60_000;
          mocks.reportError.mockClear();
          mocks.decodeHeic.mockRejectedValueOnce(makeRawOom());
          const warnHeic = vi.fn();
          const heicReply = makePreviewReply();
          await previewHandler(
            {
              log: { warn: warnHeic, error: vi.fn() },
              file: async () => ({ filename: "photo.heic", toBuffer: async () => heicBytes }),
            },
            heicReply,
          );
          expect(heicReply.statusCode).toBe(503);
          expect(heicReply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
          expect(warnHeic).toHaveBeenCalledWith(
            expect.objectContaining({
              code: "ENGINE_UNAVAILABLE",
              cause: "DecoderOutOfMemoryError",
              toolId: "file-preview",
            }),
            "Tool engine unavailable during input preparation",
          );

          fakeNow += 11 * 60_000;
          mocks.reportError.mockClear();
          mocks.decodeToSharpCompat.mockRejectedValueOnce(makeRawOom());
          const warnPsd = vi.fn();
          const psdReply = makePreviewReply();
          await previewHandler(
            {
              log: { warn: warnPsd, error: vi.fn() },
              file: async () => ({ filename: "layer.psd", toBuffer: async () => psdBytes }),
            },
            psdReply,
          );
          expect(psdReply.statusCode).toBe(503);
          expect(psdReply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
          expect(warnPsd).toHaveBeenCalledWith(
            expect.objectContaining({
              code: "ENGINE_UNAVAILABLE",
              cause: "DecoderOutOfMemoryError",
              toolId: "file-preview",
            }),
            "Tool engine unavailable during input preparation",
          );

          fakeNow += 11 * 60_000;
          mocks.reportError.mockClear();
          mocks.decodeToSharpCompat.mockRejectedValueOnce(makeRawOom());
          const warnDng = vi.fn();
          const dngReply = makePreviewReply();
          await previewHandler(
            {
              log: { warn: warnDng, error: vi.fn() },
              file: async () => ({ filename: "photo.dng", toBuffer: async () => tiffBytes }),
            },
            dngReply,
          );
          expect(dngReply.statusCode).toBe(503);
          expect(dngReply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
          expect(warnDng).toHaveBeenCalledWith(
            expect.objectContaining({
              code: "ENGINE_UNAVAILABLE",
              cause: "DecoderOutOfMemoryError",
              toolId: "file-preview",
            }),
            "Tool engine unavailable during input preparation",
          );
        }
      } finally {
        webpSpy.mockRestore();
        nowSpy.mockRestore();
      }
    });

    it("uses extname instead of split('.').pop() at POST /api/v1/preview and every decodeToSharpCompat call site (#3246)", () => {
      const filesRouteSrc = readFileSync(
        resolve(process.cwd(), "apps/api/src/routes/files.ts"),
        "utf8",
      );
      expect(filesRouteSrc).not.toContain('.split(".").pop()');

      const infoRouteSrc = readFileSync(
        resolve(process.cwd(), "apps/api/src/routes/tools/info.ts"),
        "utf8",
      );
      expect(infoRouteSrc).not.toContain('.split(".").pop()');

      const callerFiles = [
        "apps/api/src/lib/image-input-prep.ts",
        "apps/api/src/modality/image-input.ts",
        "apps/api/src/routes/file-preview.ts",
        "apps/api/src/routes/user-files.ts",
        "apps/api/src/routes/batch.ts",
        "apps/api/src/routes/pipeline.ts",
        "apps/api/src/routes/tools/ai-canvas-expand.ts",
        "apps/api/src/routes/tools/barcode-read.ts",
        "apps/api/src/routes/tools/beautify.ts",
        "apps/api/src/routes/tools/blur-faces.ts",
        "apps/api/src/routes/tools/collage.ts",
        "apps/api/src/routes/tools/color-palette.ts",
        "apps/api/src/routes/tools/content-aware-resize.ts",
        "apps/api/src/routes/tools/edit-metadata.ts",
        "apps/api/src/routes/tools/favicon.ts",
        "apps/api/src/routes/tools/find-duplicates.ts",
        "apps/api/src/routes/tools/image-to-base64.ts",
        "apps/api/src/routes/tools/image-to-pdf.ts",
        "apps/api/src/routes/tools/meme-generator.ts",
        "apps/api/src/routes/tools/red-eye-removal.ts",
        "apps/api/src/routes/tools/split.ts",
        "apps/api/src/routes/tools/stitch.ts",
      ];
      for (const relPath of callerFiles) {
        const src = readFileSync(resolve(process.cwd(), relPath), "utf8");
        expect(src, `${relPath} should not extract extensions with split('.').pop()`).not.toContain(
          '.split(".").pop()',
        );
      }
    });
  });
});
