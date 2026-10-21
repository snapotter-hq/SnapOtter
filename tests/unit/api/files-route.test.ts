/**
 * Unit tests for file serving route helper functions.
 *
 * Tests the path traversal guard, content type mapping, and download/upload
 * logic helpers from the files route.
 */
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
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
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
  return {
    ...actual,
    sanitizeSvg: (...args: Parameters<typeof actual.sanitizeSvg>) => mocks.sanitizeSvg(...args),
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

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.deletePrefix.mockResolvedValue(undefined);
      mocks.putObject.mockResolvedValue(undefined);
      mocks.requireFileAccess.mockResolvedValue({ id: "user-1", role: "admin" });
      mocks.sanitizeSvg.mockImplementation((buf: Buffer) => buf);
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
      expect(mocks.putObject).toHaveBeenCalledTimes(1);
      const writtenKey = (mocks.putObject.mock.calls[0] as unknown[])[0] as string;
      const prefix = writtenKey.replace(/first\.txt$/, "");
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(prefix);
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
      expect(mocks.putObject).not.toHaveBeenCalled();
      expect(mocks.deletePrefix).not.toHaveBeenCalled();
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
      const req = makeRequest([
        filePart("README", Buffer.from("hello")),
        filePart("README.", Buffer.from("trailing-dot")),
        filePart(undefined, Buffer.from("world")),
        filePart(".gitignore", Buffer.from("node_modules\n")),
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
  });
});
