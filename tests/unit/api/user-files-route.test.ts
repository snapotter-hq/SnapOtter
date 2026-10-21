/**
 * Unit tests for user file routes helper functions and route handler logic.
 *
 * Tests the extToMime, unverifiedMime, measuredDimensions, serializeFile, and
 * deleteFilesSchema helpers and the GET /api/v1/files, DELETE /api/v1/files,
 * and POST /api/v1/files/save-result handlers from user-files.ts.
 */
import { Readable } from "node:stream";
import { IMAGE_EXT_TO_MIME } from "@snapotter/shared";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  likeSpy: vi.fn(),
  limitSpy: vi.fn(),
  offsetSpy: vi.fn(),
  executeSpy: vi.fn<(_q: unknown) => Promise<{ rows: unknown[] }>>(() =>
    Promise.resolve({ rows: [] }),
  ),
  deleteWhereSpy: vi.fn(() => Promise.resolve()),
  parentRows: [] as unknown[],
  insertedValues: undefined as Record<string, unknown> | undefined,
  getCachedThumbnail: vi.fn<() => Promise<Buffer | null>>(() => Promise.resolve(null)),
  isStorageServiceFault: vi.fn<(_e: unknown) => boolean>(() => false),
  saveFile: vi.fn(() => Promise.resolve("stored-result.png")),
  saveThumbnail: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  readStoredFile: vi.fn<() => Promise<Buffer>>(() => Promise.resolve(Buffer.alloc(0))),
  streamStoredFile: vi.fn<() => Promise<Readable>>(() =>
    Promise.resolve(Readable.from([Buffer.from("bytes")])),
  ),
  videoPosterPreview: vi.fn<() => Promise<Buffer | null>>(() =>
    Promise.resolve(Buffer.from("webp-poster")),
  ),
  pdfFirstPagePreview: vi.fn<() => Promise<Buffer | null>>(() =>
    Promise.resolve(Buffer.from("png-page")),
  ),
  quotaRefusal: vi.fn(() => Promise.resolve(null)),
  requireFileAccess: vi.fn(() => Promise.resolve({ id: "user-1", role: "admin" })),
  hasEffectivePermission: vi.fn(() => Promise.resolve(true)),
  validateImageBuffer: vi.fn(() =>
    Promise.resolve({ valid: true as const, format: "png", width: 800, height: 600 }),
  ),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conds: unknown[]) => ({ op: "and", conds }),
  desc: (col: unknown) => ({ op: "desc", col }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  inArray: (col: unknown, vals: unknown) => ({ op: "inArray", col, vals }),
  like: (col: unknown, pattern: string) => {
    mocks.likeSpy(col, pattern);
    return { op: "like", col, pattern };
  },
  sql: Object.assign((strings: TemplateStringsArray) => strings.join("?"), {
    join: () => "sql-join",
  }),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: (fields?: unknown) => ({
      from: () => ({
        where: () => {
          if (fields && typeof fields === "object" && "count" in fields) {
            return Promise.resolve([{ count: 0 }]);
          }
          const orderChain = {
            orderBy: () => ({
              limit: (n: number) => {
                mocks.limitSpy(n);
                return {
                  offset: (o: number) => {
                    mocks.offsetSpy(o);
                    return Promise.resolve([]);
                  },
                };
              },
            }),
            // Thenable so `await db.select().from().where()` resolves to parentRows
            // biome-ignore lint/suspicious/noThenProperty: mock Drizzle query builder promise chain
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(mocks.parentRows).then(resolve),
          };
          return orderChain;
        },
      }),
    }),
    execute: (q: unknown) => mocks.executeSpy(q),
    delete: () => ({
      where: mocks.deleteWhereSpy,
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: () => ({
          values: (vals: Record<string, unknown>) => {
            mocks.insertedValues = vals;
            return {
              returning: () =>
                Promise.resolve([
                  {
                    ...vals,
                    createdAt: new Date("2025-06-01T12:00:00Z"),
                  },
                ]),
            };
          },
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
      };
      return fn(tx);
    },
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    userFiles: {
      id: "id",
      userId: "user_id",
      parentId: "parent_id",
      createdAt: "created_at",
      originalName: "original_name",
    },
    users: { id: "id", storageUsed: "storage_used" },
  },
}));

vi.mock("../../../apps/api/src/lib/file-storage.js", () => ({
  deleteStoredFile: vi.fn(() => Promise.resolve()),
  getCachedThumbnail: mocks.getCachedThumbnail,
  isStorageServiceFault: mocks.isStorageServiceFault,
  readStoredFile: mocks.readStoredFile,
  saveFile: mocks.saveFile,
  saveThumbnail: mocks.saveThumbnail,
  streamStoredFile: mocks.streamStoredFile,
}));

vi.mock("../../../apps/api/src/modality/preview.js", () => ({
  videoPosterPreview: mocks.videoPosterPreview,
  pdfFirstPagePreview: mocks.pdfFirstPagePreview,
}));

vi.mock("../../../apps/api/src/lib/quota.js", () => ({
  quotaRefusal: mocks.quotaRefusal,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  hasEffectivePermission: mocks.hasEffectivePermission,
  requireFileAccess: mocks.requireFileAccess,
}));

vi.mock("../../../apps/api/src/lib/library-cleanup.js", () => ({
  deleteLibraryFileStorage: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditFromRequest: () => vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../apps/api/src/lib/file-validation.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/file-validation.js")>();
  return {
    ...actual,
    validateImageBuffer: mocks.validateImageBuffer,
  };
});

import type { schema } from "../../../apps/api/src/db/index.js";
import {
  deleteFilesSchema,
  extToMime,
  measuredDimensions,
  serializeFile,
  thumbnailContentType,
  unverifiedMime,
  userFileRoutes,
} from "../../../apps/api/src/routes/user-files.js";

type UserFileRow = typeof schema.userFiles.$inferSelect;

// ── Tests ───────────────────────────────────────────────────────────────

describe("user files route logic", () => {
  describe("unverifiedMime", () => {
    it("downgrades unverified image/* claims to application/octet-stream", () => {
      expect(unverifiedMime("image/png")).toBe("application/octet-stream");
      expect(unverifiedMime("image/jpeg")).toBe("application/octet-stream");
      expect(unverifiedMime("image/svg+xml")).toBe("application/octet-stream");
    });

    it("preserves non-image MIME types", () => {
      expect(unverifiedMime("application/pdf")).toBe("application/pdf");
      expect(unverifiedMime("video/mp4")).toBe("video/mp4");
      expect(unverifiedMime("audio/mpeg")).toBe("audio/mpeg");
      expect(unverifiedMime("text/plain")).toBe("text/plain");
      expect(unverifiedMime("application/octet-stream")).toBe("application/octet-stream");
    });
  });

  describe("thumbnailContentType (#2824)", () => {
    it("returns image/webp for video/* MIME types", () => {
      expect(thumbnailContentType("video/mp4")).toBe("image/webp");
      expect(thumbnailContentType("video/webm")).toBe("image/webp");
      expect(thumbnailContentType("video/quicktime")).toBe("image/webp");
    });

    it("returns image/png for application/pdf", () => {
      expect(thumbnailContentType("application/pdf")).toBe("image/png");
    });

    it("returns image/jpeg for image/* and other MIME types", () => {
      expect(thumbnailContentType("image/png")).toBe("image/jpeg");
      expect(thumbnailContentType("image/jpeg")).toBe("image/jpeg");
      expect(thumbnailContentType("image/webp")).toBe("image/jpeg");
      expect(thumbnailContentType("application/octet-stream")).toBe("image/jpeg");
    });
  });

  describe("measuredDimensions", () => {
    it("returns null dimensions when validation is null", () => {
      expect(measuredDimensions(null)).toEqual({ width: null, height: null });
    });

    it("returns null dimensions when validation reports 0x0 (CLI-decoded formats)", () => {
      expect(measuredDimensions({ valid: true, format: "heif", width: 0, height: 0 })).toEqual({
        width: null,
        height: null,
      });
    });

    it("returns positive width and height when measured", () => {
      expect(measuredDimensions({ valid: true, format: "png", width: 1920, height: 1080 })).toEqual(
        {
          width: 1920,
          height: 1080,
        },
      );
    });

    it("evaluates width and height independently when one axis is zero", () => {
      expect(measuredDimensions({ valid: true, format: "png", width: 100, height: 0 })).toEqual({
        width: 100,
        height: null,
      });
      expect(measuredDimensions({ valid: true, format: "png", width: 0, height: 100 })).toEqual({
        width: null,
        height: 100,
      });
    });
  });

  describe("extToMime", () => {
    it("maps .jpg to image/jpeg", () => {
      expect(extToMime(".jpg")).toBe("image/jpeg");
    });

    it("maps .jpeg to image/jpeg", () => {
      expect(extToMime(".jpeg")).toBe("image/jpeg");
    });

    it("maps .png to image/png", () => {
      expect(extToMime(".png")).toBe("image/png");
    });

    it("maps .webp to image/webp", () => {
      expect(extToMime(".webp")).toBe("image/webp");
    });

    it("maps .gif to image/gif", () => {
      expect(extToMime(".gif")).toBe("image/gif");
    });

    it("maps .bmp to image/bmp", () => {
      expect(extToMime(".bmp")).toBe("image/bmp");
    });

    it("maps .tif to image/tiff", () => {
      expect(extToMime(".tif")).toBe("image/tiff");
    });

    it("maps .tiff to image/tiff", () => {
      expect(extToMime(".tiff")).toBe("image/tiff");
    });

    it("maps .avif to image/avif", () => {
      expect(extToMime(".avif")).toBe("image/avif");
    });

    it("maps video extensions (.mp4, .webm, .mov, .mkv, .avi, .m4v, .ogv, .ts, ...)", () => {
      expect(extToMime(".mp4")).toBe("video/mp4");
      expect(extToMime(".m4v")).toBe("video/mp4");
      expect(extToMime(".webm")).toBe("video/webm");
      expect(extToMime(".mov")).toBe("video/quicktime");
      expect(extToMime(".mkv")).toBe("video/x-matroska");
      expect(extToMime(".avi")).toBe("video/x-msvideo");
      expect(extToMime(".3gp")).toBe("video/3gpp");
      expect(extToMime(".flv")).toBe("video/x-flv");
      expect(extToMime(".wmv")).toBe("video/x-ms-wmv");
      expect(extToMime(".mpg")).toBe("video/mpeg");
      expect(extToMime(".mpeg")).toBe("video/mpeg");
      expect(extToMime(".ts")).toBe("video/mp2t");
      expect(extToMime(".mts")).toBe("video/mp2t");
      expect(extToMime(".m2ts")).toBe("video/mp2t");
      expect(extToMime(".ogv")).toBe("video/ogg");
    });

    it("maps audio extensions (.mp3, .wav, .flac, .ogg, .aac, .m4a, .opus, .aiff, .wma, ...)", () => {
      expect(extToMime(".mp3")).toBe("audio/mpeg");
      expect(extToMime(".wav")).toBe("audio/wav");
      expect(extToMime(".flac")).toBe("audio/flac");
      expect(extToMime(".ogg")).toBe("audio/ogg");
      expect(extToMime(".aac")).toBe("audio/aac");
      expect(extToMime(".m4a")).toBe("audio/mp4");
      expect(extToMime(".opus")).toBe("audio/opus");
      expect(extToMime(".wma")).toBe("audio/x-ms-wma");
      expect(extToMime(".aiff")).toBe("audio/aiff");
      expect(extToMime(".amr")).toBe("audio/amr");
      expect(extToMime(".ac3")).toBe("audio/ac3");
    });

    it("maps document, text, data, archive, and subtitle extensions (#3215)", () => {
      expect(extToMime(".pdf")).toBe("application/pdf");
      expect(extToMime(".epub")).toBe("application/epub+zip");
      expect(extToMime(".docx")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(extToMime(".odt")).toBe("application/vnd.oasis.opendocument.text");
      expect(extToMime(".rtf")).toBe("application/rtf");
      expect(extToMime(".pptx")).toBe(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
      expect(extToMime(".odp")).toBe("application/vnd.oasis.opendocument.presentation");
      expect(extToMime(".xlsx")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(extToMime(".ods")).toBe("application/vnd.oasis.opendocument.spreadsheet");
      expect(extToMime(".html")).toBe("text/html");
      expect(extToMime(".htm")).toBe("text/html");
      expect(extToMime(".md")).toBe("text/markdown");
      expect(extToMime(".markdown")).toBe("text/markdown");
      expect(extToMime(".txt")).toBe("text/plain");
      expect(extToMime(".csv")).toBe("text/csv");
      expect(extToMime(".tsv")).toBe("text/tab-separated-values");
      expect(extToMime(".json")).toBe("application/json");
      expect(extToMime(".xml")).toBe("application/xml");
      expect(extToMime(".yaml")).toBe("application/yaml");
      expect(extToMime(".yml")).toBe("application/yaml");
      expect(extToMime(".zip")).toBe("application/zip");
      expect(extToMime(".srt")).toBe("application/x-subrip");
      expect(extToMime(".vtt")).toBe("text/vtt");
    });

    it.each(Object.entries(IMAGE_EXT_TO_MIME))(
      "maps IMAGE_EXT_TO_MIME entry .%s to %s (#3215)",
      (ext, mime) => {
        expect(extToMime(`.${ext}`)).toBe(mime);
        expect(extToMime(ext)).toBe(mime);
      },
    );

    it("handles uppercase extensions", () => {
      expect(extToMime(".JPG")).toBe("image/jpeg");
      expect(extToMime(".MP4")).toBe("video/mp4");
    });

    it("handles extension without leading dot", () => {
      expect(extToMime("png")).toBe("image/png");
      expect(extToMime("pdf")).toBe("application/pdf");
    });

    it("returns application/octet-stream for unknown extension", () => {
      expect(extToMime(".xyz")).toBe("application/octet-stream");
    });
  });

  describe("serializeFile", () => {
    it("serializes a complete file row and omits internal storage columns", () => {
      const row: UserFileRow = {
        id: "file-1",
        userId: "user-1",
        originalName: "photo.jpg",
        storedName: "stored-file-1.jpg",
        mimeType: "image/jpeg",
        size: 12345,
        width: 800,
        height: 600,
        version: 1,
        parentId: null,
        toolChain: null,
        createdAt: new Date("2025-06-01T12:00:00Z"),
      };

      const result = serializeFile(row);
      expect(result).toEqual({
        id: "file-1",
        originalName: "photo.jpg",
        mimeType: "image/jpeg",
        size: 12345,
        width: 800,
        height: 600,
        version: 1,
        parentId: null,
        toolChain: [],
        createdAt: "2025-06-01T12:00:00.000Z",
      });
      expect(result).not.toHaveProperty("userId");
      expect(result).not.toHaveProperty("storedName");
    });

    it("preserves toolChain string array from jsonb column when present", () => {
      const row: UserFileRow = {
        id: "file-2",
        userId: "user-1",
        originalName: "edited.png",
        storedName: "stored-file-2.png",
        mimeType: "image/png",
        size: 54321,
        width: 1920,
        height: 1080,
        version: 3,
        parentId: "file-1",
        toolChain: ["resize", "compress", "convert"],
        createdAt: new Date("2025-06-15T08:30:00Z"),
      };

      const result = serializeFile(row);
      expect(result.toolChain).toEqual(["resize", "compress", "convert"]);
      expect(result.parentId).toBe("file-1");
      expect(result.version).toBe(3);
    });

    it("returns empty array for null toolChain", () => {
      const row: UserFileRow = {
        id: "file-3",
        userId: "user-1",
        originalName: "upload.gif",
        storedName: "stored-file-3.gif",
        mimeType: "image/gif",
        size: 999,
        width: null,
        height: null,
        version: 1,
        parentId: null,
        toolChain: null,
        createdAt: new Date("2025-01-01"),
      };

      const result = serializeFile(row);
      expect(result.toolChain).toEqual([]);
    });

    it("preserves null width and height", () => {
      const row: UserFileRow = {
        id: "file-4",
        userId: null,
        originalName: "unknown.bin",
        storedName: "stored-file-4.bin",
        mimeType: "application/octet-stream",
        size: 100,
        width: null,
        height: null,
        version: 1,
        parentId: null,
        toolChain: null,
        createdAt: new Date(),
      };

      const result = serializeFile(row);
      expect(result.width).toBeNull();
      expect(result.height).toBeNull();
    });
  });

  describe("delete schema validation", () => {
    it("accepts valid ids array", () => {
      const result = deleteFilesSchema.safeParse({ ids: ["id-1", "id-2"] });
      expect(result.success).toBe(true);
    });

    it("rejects empty ids array", () => {
      const result = deleteFilesSchema.safeParse({ ids: [] });
      expect(result.success).toBe(false);
    });

    it("rejects missing ids field", () => {
      const result = deleteFilesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects non-array ids", () => {
      const result = deleteFilesSchema.safeParse({ ids: "single-id" });
      expect(result.success).toBe(false);
    });

    it("rejects non-string elements in ids array", () => {
      const result = deleteFilesSchema.safeParse({ ids: [123] });
      expect(result.success).toBe(false);
    });

    it("accepts single id", () => {
      const result = deleteFilesSchema.safeParse({ ids: ["only-one"] });
      expect(result.success).toBe(true);
    });
  });

  describe("route handler behavior", () => {
    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let listHandler: RouteHandler;
    let deleteHandler: RouteHandler;
    let saveResultHandler: RouteHandler;
    let downloadHandler: RouteHandler;
    let thumbnailHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        get: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/files") listHandler = handler;
          if (path === "/api/v1/files/:id/download") downloadHandler = handler;
          if (path === "/api/v1/files/:id/thumbnail") thumbnailHandler = handler;
        }),
        post: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/files/save-result") saveResultHandler = handler;
        }),
        delete: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/files") deleteHandler = handler;
        }),
        log: { info: vi.fn() },
      };
      await userFileRoutes(fakeApp as never);
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.parentRows = [];
      mocks.insertedValues = undefined;
      mocks.requireFileAccess.mockResolvedValue({ id: "user-1", role: "admin" });
      mocks.hasEffectivePermission.mockResolvedValue(true);
      mocks.quotaRefusal.mockResolvedValue(null);
      mocks.getCachedThumbnail.mockResolvedValue(null);
      mocks.isStorageServiceFault.mockReturnValue(false);
      mocks.saveFile.mockResolvedValue("stored-result.png");
      mocks.saveThumbnail.mockResolvedValue();
      mocks.streamStoredFile.mockImplementation(async () => Readable.from([Buffer.from("bytes")]));
      mocks.videoPosterPreview.mockResolvedValue(Buffer.from("webp-poster"));
      mocks.pdfFirstPagePreview.mockResolvedValue(Buffer.from("png-page"));
      mocks.validateImageBuffer.mockResolvedValue({
        valid: true,
        format: "png",
        width: 800,
        height: 600,
      });
    });

    function makeReply() {
      const reply = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        payload: undefined as unknown,
        status: vi.fn((code: number) => {
          reply.statusCode = code;
          return reply;
        }),
        header: vi.fn((name: string, value: string) => {
          reply.headers[name.toLowerCase()] = value;
          return reply;
        }),
        send: vi.fn((body: unknown) => {
          reply.payload = body;
          return reply;
        }),
      };
      return reply;
    }

    function makeSaveResultRequest(opts: {
      filename: string;
      parentId: string;
      toolId?: string | null;
      buffer?: Buffer;
    }) {
      const content = opts.buffer ?? Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      return {
        log: { warn: vi.fn(), error: vi.fn() },
        parts: async function* () {
          yield {
            type: "file" as const,
            fieldname: "file",
            filename: opts.filename,
            file: Readable.from([content]),
          };
          yield {
            type: "field" as const,
            fieldname: "parentId",
            value: opts.parentId,
          };
          if (opts.toolId) {
            yield {
              type: "field" as const,
              fieldname: "toolId",
              value: opts.toolId,
            };
          }
        },
      };
    }

    describe("GET /api/v1/files pagination and search escaping", () => {
      it("defaults to limit 50 and offset 0", async () => {
        const reply = makeReply();
        await listHandler({ query: {} }, reply);
        expect(mocks.limitSpy).toHaveBeenCalledWith(50);
        expect(mocks.offsetSpy).toHaveBeenCalledWith(0);
        expect(reply.payload).toMatchObject({ limit: 50, offset: 0 });
      });

      it("parses custom limit and offset", async () => {
        const reply = makeReply();
        await listHandler({ query: { limit: "25", offset: "10" } }, reply);
        expect(mocks.limitSpy).toHaveBeenCalledWith(25);
        expect(mocks.offsetSpy).toHaveBeenCalledWith(10);
        expect(reply.payload).toMatchObject({ limit: 25, offset: 10 });
      });

      it("falls back to defaults for non-numeric or zero limit and offset", async () => {
        const reply1 = makeReply();
        await listHandler({ query: { limit: "abc", offset: "xyz" } }, reply1);
        expect(mocks.limitSpy).toHaveBeenCalledWith(50);
        expect(mocks.offsetSpy).toHaveBeenCalledWith(0);
        expect(reply1.payload).toMatchObject({ limit: 50, offset: 0 });

        const reply2 = makeReply();
        await listHandler({ query: { limit: "0", offset: "0" } }, reply2);
        expect(mocks.limitSpy).toHaveBeenLastCalledWith(50);
        expect(mocks.offsetSpy).toHaveBeenLastCalledWith(0);
      });

      it("trims search and escapes SQL LIKE wildcards", async () => {
        const reply = makeReply();
        await listHandler({ query: { search: "  test%name_file\\special  " } }, reply);
        expect(mocks.likeSpy).toHaveBeenCalledWith(
          "original_name",
          "%test\\%name\\_file\\\\special%",
        );
      });

      it("skips LIKE filter when search is whitespace-only", async () => {
        const reply = makeReply();
        await listHandler({ query: { search: "   " } }, reply);
        expect(mocks.likeSpy).not.toHaveBeenCalled();
      });

      it("passes unescaped normal search string wrapped in % wildcards", async () => {
        const reply = makeReply();
        await listHandler({ query: { search: "normal-search" } }, reply);
        expect(mocks.likeSpy).toHaveBeenCalledWith("original_name", "%normal-search%");
      });
    });

    describe("DELETE /api/v1/files validation", () => {
      it("returns 400 when ids is empty or missing", async () => {
        const reply1 = makeReply();
        await deleteHandler({ body: { ids: [] } }, reply1);
        expect(reply1.statusCode).toBe(400);
        expect(reply1.payload).toEqual({ error: "ids must be a non-empty array of strings" });

        const reply2 = makeReply();
        await deleteHandler({ body: {} }, reply2);
        expect(reply2.statusCode).toBe(400);
      });

      it("seeds the delete CTE from ancestors whose parent row is NULL or missing (#2927)", async () => {
        mocks.parentRows = [{ id: "orphan-v2", userId: "user-1" }];
        mocks.executeSpy.mockResolvedValueOnce({
          rows: [{ id: "orphan-v2", stored_name: "stored-v2.png", size: 256, user_id: "user-1" }],
        });

        const reply = makeReply();
        await deleteHandler({ body: { ids: ["orphan-v2"] } }, reply);

        expect(reply.statusCode).toBe(200);
        expect(reply.payload).toEqual({ deleted: 1 });
        expect(mocks.executeSpy).toHaveBeenCalledTimes(1);
        const queryText = String(mocks.executeSpy.mock.calls[0]?.[0] ?? "");
        expect(queryText).toMatch(
          /NOT EXISTS\s*\(\s*SELECT 1 FROM user_files p WHERE p\.id = a\.parent_id\s*\)/i,
        );
      });
    });

    describe("POST /api/v1/files/save-result version chain and filename preservation", () => {
      function makeParent(overrides: Partial<UserFileRow> = {}): UserFileRow {
        return {
          id: "parent-1",
          userId: "user-1",
          originalName: "vacation-photo.jpg",
          storedName: "stored-parent.jpg",
          mimeType: "image/jpeg",
          size: 1000,
          width: 800,
          height: 600,
          version: 2,
          parentId: null,
          toolChain: ["resize", "compress"],
          createdAt: new Date("2025-06-01T12:00:00Z"),
          ...overrides,
        };
      }

      it("increments parent version and appends toolId to existing toolChain", async () => {
        mocks.parentRows = [makeParent({ version: 2, toolChain: ["resize", "compress"] })];
        const reply = makeReply();
        await saveResultHandler(
          makeSaveResultRequest({
            filename: "output.png",
            parentId: "parent-1",
            toolId: "convert",
          }),
          reply,
        );
        expect(reply.statusCode).toBe(201);
        expect(mocks.insertedValues).toMatchObject({
          version: 3,
          parentId: "parent-1",
          toolChain: ["resize", "compress", "convert"],
          originalName: "vacation-photo.png",
        });
      });

      it("starts from an empty chain when parent toolChain is null", async () => {
        mocks.parentRows = [makeParent({ version: 1, toolChain: null })];
        const reply = makeReply();
        await saveResultHandler(
          makeSaveResultRequest({
            filename: "output.png",
            parentId: "parent-1",
            toolId: "resize",
          }),
          reply,
        );
        expect(reply.statusCode).toBe(201);
        expect(mocks.insertedValues).toMatchObject({
          version: 2,
          toolChain: ["resize"],
        });
      });

      it("preserves existing toolChain when no toolId is provided", async () => {
        mocks.parentRows = [makeParent({ version: 1, toolChain: ["resize"] })];
        const reply = makeReply();
        await saveResultHandler(
          makeSaveResultRequest({
            filename: "output.png",
            parentId: "parent-1",
            toolId: null,
          }),
          reply,
        );
        expect(reply.statusCode).toBe(201);
        expect(mocks.insertedValues).toMatchObject({
          version: 2,
          toolChain: ["resize"],
        });
      });

      it("preserves parent base name across multiple dots or extensionless names", async () => {
        mocks.parentRows = [makeParent({ originalName: "my.great.photo.jpg" })];
        const reply1 = makeReply();
        await saveResultHandler(
          makeSaveResultRequest({
            filename: "result.webp",
            parentId: "parent-1",
            toolId: "convert",
          }),
          reply1,
        );
        expect(mocks.insertedValues?.originalName).toBe("my.great.photo.webp");

        mocks.parentRows = [makeParent({ originalName: "no-extension" })];
        const reply2 = makeReply();
        await saveResultHandler(
          makeSaveResultRequest({
            filename: "result.png",
            parentId: "parent-1",
            toolId: "convert",
          }),
          reply2,
        );
        expect(mocks.insertedValues?.originalName).toBe("no-extension.png");

        mocks.parentRows = [makeParent({ originalName: "vacation-photo.jpg" })];
        const reply3 = makeReply();
        await saveResultHandler(
          makeSaveResultRequest({
            filename: "result",
            parentId: "parent-1",
            toolId: "resize",
          }),
          reply3,
        );
        expect(mocks.insertedValues?.originalName).toBe("vacation-photo.jpg");
      });

      it.each([
        ["result.mkv", "video/x-matroska"],
        ["result.avi", "video/x-msvideo"],
        ["result.m4a", "audio/mp4"],
        ["result.opus", "audio/opus"],
        ["result.epub", "application/epub+zip"],
        ["result.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        ["result.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        [
          "result.pptx",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
        ["result.odt", "application/vnd.oasis.opendocument.text"],
        ["result.ods", "application/vnd.oasis.opendocument.spreadsheet"],
        ["result.odp", "application/vnd.oasis.opendocument.presentation"],
        ["result.rtf", "application/rtf"],
        ["result.html", "text/html"],
        ["result.md", "text/markdown"],
        ["result.yaml", "application/yaml"],
        ["result.srt", "application/x-subrip"],
        ["result.vtt", "text/vtt"],
        ["result.MKV", "video/x-matroska"],
        ["result", "video/x-matroska"],
      ])(
        "stores the output MIME type for non-image save-result %s -> %s (#3215)",
        async (filename, expectedMime) => {
          mocks.parentRows = [
            makeParent({ originalName: "source.mkv", mimeType: "video/x-matroska" }),
          ];
          mocks.validateImageBuffer.mockResolvedValueOnce({
            valid: false,
            reason: "Not a valid image",
          } as never);
          const reply = makeReply();
          await saveResultHandler(
            makeSaveResultRequest({
              filename,
              parentId: "parent-1",
              toolId: "video-convert",
              buffer: Buffer.from("non-image-output-bytes"),
            }),
            reply,
          );
          expect(reply.statusCode).toBe(201);
          expect(mocks.insertedValues?.mimeType).toBe(expectedMime);
        },
      );

      it.each(["result.qoi", "result.cr3"])(
        "downgrades unverified IMAGE_EXT_TO_MIME image/* claims on save-result (%s) to application/octet-stream (#3215)",
        async (filename) => {
          mocks.parentRows = [makeParent({ originalName: "source.png", mimeType: "image/png" })];
          mocks.validateImageBuffer.mockResolvedValueOnce({
            valid: false,
            reason: "Not a valid image",
          } as never);
          const reply = makeReply();
          await saveResultHandler(
            makeSaveResultRequest({
              filename,
              parentId: "parent-1",
              toolId: "convert",
              buffer: Buffer.from("not-an-image"),
            }),
            reply,
          );
          expect(reply.statusCode).toBe(201);
          expect(mocks.insertedValues?.mimeType).toBe("application/octet-stream");
        },
      );
    });

    describe("GET /api/v1/files/:id/thumbnail cache write failure logging (#1633)", () => {
      function makeFileRow(overrides: Partial<UserFileRow> = {}): UserFileRow {
        return {
          id: "file-thumb-1",
          userId: "user-1",
          originalName: "photo.png",
          storedName: "stored-thumb.png",
          mimeType: "image/png",
          size: 512,
          width: 10,
          height: 10,
          version: 1,
          parentId: null,
          toolChain: null,
          createdAt: new Date("2025-06-01T12:00:00Z"),
          ...overrides,
        };
      }

      it("still sends the generated thumbnail and logs a warning when saveThumbnail rejects", async () => {
        const tinyPng = await sharp({
          create: { width: 4, height: 4, channels: 3, background: { r: 20, g: 40, b: 60 } },
        })
          .png()
          .toBuffer();

        const cases = [
          {
            label: "image",
            row: makeFileRow({
              id: "file-img",
              storedName: "stored-img.png",
              mimeType: "image/png",
            }),
            raw: tinyPng,
            expectedType: "image/jpeg",
          },
          {
            label: "video",
            row: makeFileRow({
              id: "file-vid",
              storedName: "stored-vid.mp4",
              mimeType: "video/mp4",
            }),
            raw: Buffer.from("video-bytes"),
            expectedType: "image/webp",
          },
          {
            label: "pdf",
            row: makeFileRow({
              id: "file-pdf",
              storedName: "stored-pdf.pdf",
              mimeType: "application/pdf",
            }),
            raw: Buffer.from("pdf-bytes"),
            expectedType: "image/png",
          },
        ];

        for (const c of cases) {
          mocks.parentRows = [c.row];
          mocks.readStoredFile.mockResolvedValueOnce(c.raw);
          const diskFull = Object.assign(new Error("ENOSPC: no space left on device"), {
            code: "ENOSPC",
          });
          mocks.saveThumbnail.mockRejectedValueOnce(diskFull);

          const warn = vi.fn();
          const reply = makeReply();
          await thumbnailHandler(
            { params: { id: c.row.id }, log: { warn, error: vi.fn() } },
            reply,
          );
          await new Promise((resolve) => setImmediate(resolve));

          expect(reply.statusCode, c.label).toBe(200);
          expect(reply.headers["content-type"], c.label).toBe(c.expectedType);
          expect(Buffer.isBuffer(reply.payload), c.label).toBe(true);
          expect(mocks.saveThumbnail, c.label).toHaveBeenCalledWith(
            c.row.storedName,
            reply.payload,
          );
          expect(warn, c.label).toHaveBeenCalledWith(
            expect.objectContaining({
              err: diskFull,
              fileId: c.row.id,
              storedName: c.row.storedName,
            }),
            expect.any(String),
          );
        }
      });

      it("does not read the source file or regenerate the thumbnail when getCachedThumbnail rejects (#976, #2808)", async () => {
        const row = makeFileRow({
          id: "file-s3-denied",
          storedName: "stored-s3-denied.png",
          mimeType: "image/png",
        });
        mocks.parentRows = [row];
        mocks.isStorageServiceFault.mockReturnValue(true);
        const denied = Object.assign(new Error("AccessDenied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        });
        mocks.getCachedThumbnail.mockRejectedValueOnce(denied);

        const reply = makeReply();
        await expect(
          thumbnailHandler(
            { params: { id: row.id }, log: { warn: vi.fn(), error: vi.fn() } },
            reply,
          ),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          cause: denied,
        });
        expect(mocks.readStoredFile).not.toHaveBeenCalled();
        expect(mocks.saveThumbnail).not.toHaveBeenCalled();

        mocks.isStorageServiceFault.mockReturnValue(false);
        const invalidName = Object.assign(new Error("Invalid stored file name"), {
          statusCode: 400,
          code: "INVALID_STORED_NAME",
        });
        mocks.getCachedThumbnail.mockRejectedValueOnce(invalidName);
        await expect(
          thumbnailHandler(
            { params: { id: row.id }, log: { warn: vi.fn(), error: vi.fn() } },
            makeReply(),
          ),
        ).rejects.toBe(invalidName);
        expect(mocks.readStoredFile).not.toHaveBeenCalled();

        for (const code of ["EACCES", "EISDIR", "EIO"] as const) {
          const localErr = Object.assign(new Error(`${code}: local thumbnail read fault`), {
            code,
            syscall: "open",
          });
          mocks.getCachedThumbnail.mockRejectedValueOnce(localErr);
          await expect(
            thumbnailHandler(
              { params: { id: row.id }, log: { warn: vi.fn(), error: vi.fn() } },
              makeReply(),
            ),
          ).rejects.toBe(localErr);
          expect(mocks.readStoredFile).not.toHaveBeenCalled();
          expect(mocks.saveThumbnail).not.toHaveBeenCalled();
        }
      });

      it("normalizes S3 read faults from getCachedThumbnail and readStoredFile into a 503 storage-unavailable SafeError (#2808)", async () => {
        const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
        const row = makeFileRow({
          id: "file-s3-thumb",
          storedName: "stored-s3-thumb.png",
          mimeType: "image/png",
        });
        mocks.parentRows = [row];
        mocks.isStorageServiceFault.mockReturnValue(true);

        const s3Faults = [
          Object.assign(new Error("Access Denied"), {
            name: "AccessDenied",
            $metadata: { httpStatusCode: 403 },
          }),
          Object.assign(new Error("Please reduce your request rate."), {
            name: "SlowDown",
            $metadata: { httpStatusCode: 503 },
          }),
          Object.assign(new Error("read ECONNRESET"), {
            name: "TimeoutError",
            code: "ECONNRESET",
            syscall: "read",
            $metadata: { attempts: 3 },
          }),
          Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), {
            code: "ECONNREFUSED",
            syscall: "connect",
          }),
          Object.assign(new Error("Premature close"), {
            code: "ERR_STREAM_PREMATURE_CLOSE",
          }),
        ];

        for (const fault of s3Faults) {
          mocks.readStoredFile.mockClear();
          mocks.getCachedThumbnail.mockRejectedValueOnce(fault);
          const cacheErr = await thumbnailHandler(
            { params: { id: row.id }, log: { warn: vi.fn(), error: vi.fn() } },
            makeReply(),
          ).then(
            () => null,
            (e: unknown) => e,
          );
          expect(cacheErr).toMatchObject({
            isSafeMessage: true,
            kind: "operational",
            code: "storage-unavailable",
            statusCode: 503,
            cause: fault,
          });
          expect(classifyError(cacheErr, "http")).toBe("operational");
          expect(mocks.readStoredFile).not.toHaveBeenCalled();

          mocks.readStoredFile.mockRejectedValueOnce(fault);
          const readErr = await thumbnailHandler(
            { params: { id: row.id }, log: { warn: vi.fn(), error: vi.fn() } },
            makeReply(),
          ).then(
            () => null,
            (e: unknown) => e,
          );
          expect(readErr).toMatchObject({
            isSafeMessage: true,
            kind: "operational",
            code: "storage-unavailable",
            statusCode: 503,
            cause: fault,
          });
          expect(classifyError(readErr, "http")).toBe("operational");
        }

        const unexpectedBug = new TypeError("unexpected S3 client defect");
        mocks.readStoredFile.mockRejectedValueOnce(unexpectedBug);
        const bugErr = await thumbnailHandler(
          { params: { id: row.id }, log: { warn: vi.fn(), error: vi.fn() } },
          makeReply(),
        ).then(
          () => null,
          (e: unknown) => e,
        );
        expect(bugErr).toBe(unexpectedBug);
        expect(classifyError(bugErr, "http")).toBe("bug");
      });

      it("rethrows a local EACCES fault from readStoredFile instead of swallowing it as 422 (#2808)", async () => {
        const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
        const row = makeFileRow({
          id: "file-local-eacces",
          storedName: "stored-local-eacces.png",
          mimeType: "image/png",
        });
        mocks.parentRows = [row];
        const eacces = Object.assign(new Error("EACCES: permission denied, open"), {
          code: "EACCES",
          syscall: "open",
        });
        mocks.readStoredFile.mockRejectedValueOnce(eacces);

        const reply = makeReply();
        const err = await thumbnailHandler(
          { params: { id: row.id }, log: { warn: vi.fn(), error: vi.fn() } },
          reply,
        ).then(
          () => null,
          (e: unknown) => e,
        );
        expect(err).toBe(eacces);
        expect(classifyError(err, "http")).toBe("operational");
        expect(reply.send).not.toHaveBeenCalled();
      });

      it("logs a warning and returns 422 when readStoredFile rejects with a missing blob (ENOENT or NoSuchKey)", async () => {
        const row = makeFileRow({
          id: "file-missing-blob",
          storedName: "stored-missing-blob.png",
          mimeType: "image/png",
        });
        mocks.parentRows = [row];
        const enoent = Object.assign(new Error("ENOENT: no such file or directory, open"), {
          code: "ENOENT",
          syscall: "open",
        });
        mocks.readStoredFile.mockRejectedValueOnce(enoent);

        const warn1 = vi.fn();
        const reply1 = makeReply();
        await thumbnailHandler(
          { params: { id: row.id }, log: { warn: warn1, error: vi.fn() } },
          reply1,
        );
        expect(reply1.statusCode).toBe(422);
        expect(reply1.payload).toEqual({ error: "Could not generate thumbnail" });
        expect(warn1).toHaveBeenCalledWith(
          { fileId: row.id, storedName: row.storedName },
          "library thumbnail: stored blob missing",
        );

        const noSuchKey = Object.assign(new Error("NoSuchKey"), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        });
        mocks.isStorageServiceFault.mockReturnValue(false);
        mocks.readStoredFile.mockRejectedValueOnce(noSuchKey);

        const warn2 = vi.fn();
        const reply2 = makeReply();
        await thumbnailHandler(
          { params: { id: row.id }, log: { warn: warn2, error: vi.fn() } },
          reply2,
        );
        expect(reply2.statusCode).toBe(422);
        expect(reply2.payload).toEqual({ error: "Could not generate thumbnail" });
        expect(warn2).toHaveBeenCalledWith(
          { fileId: row.id, storedName: row.storedName },
          "library thumbnail: stored blob missing",
        );
      });

      it("preserves Content-Type on cached thumbnail hits for video, PDF, and image files (#2824)", async () => {
        const cases = [
          {
            label: "image",
            row: makeFileRow({
              id: "file-cached-img",
              storedName: "stored-cached-img.png",
              mimeType: "image/png",
            }),
            cached: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
            expectedType: "image/jpeg",
          },
          {
            label: "video",
            row: makeFileRow({
              id: "file-cached-vid",
              storedName: "stored-cached-vid.mp4",
              mimeType: "video/mp4",
            }),
            cached: Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 "),
            expectedType: "image/webp",
          },
          {
            label: "pdf",
            row: makeFileRow({
              id: "file-cached-pdf",
              storedName: "stored-cached-pdf.pdf",
              mimeType: "application/pdf",
            }),
            cached: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            expectedType: "image/png",
          },
        ];

        for (const c of cases) {
          mocks.parentRows = [c.row];
          mocks.getCachedThumbnail.mockResolvedValueOnce(c.cached);
          mocks.readStoredFile.mockClear();

          const reply = makeReply();
          await thumbnailHandler(
            { params: { id: c.row.id }, log: { warn: vi.fn(), error: vi.fn() } },
            reply,
          );

          expect(reply.statusCode, c.label).toBe(200);
          expect(reply.headers["content-type"], c.label).toBe(c.expectedType);
          expect(reply.headers["cache-control"], c.label).toBe("public, max-age=86400, immutable");
          expect(reply.payload, c.label).toBe(c.cached);
          expect(mocks.readStoredFile, c.label).not.toHaveBeenCalled();
        }
      });
    });

    describe("GET /api/v1/files/:id/download S3 fault classification (#2808)", () => {
      it("normalizes S3 streamStoredFile faults into a 503 storage-unavailable SafeError classified as operational", async () => {
        const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
        mocks.parentRows = [
          {
            id: "file-dl-1",
            userId: "user-1",
            originalName: "photo.png",
            storedName: "stored-dl.png",
            mimeType: "image/png",
            size: 128,
            width: 10,
            height: 10,
            version: 1,
            parentId: null,
            toolChain: null,
            createdAt: new Date("2025-06-01T12:00:00Z"),
          },
        ];
        mocks.isStorageServiceFault.mockReturnValue(true);

        const s3Faults = [
          Object.assign(new Error("Access Denied"), {
            name: "AccessDenied",
            $metadata: { httpStatusCode: 403 },
          }),
          Object.assign(new Error("Please reduce your request rate."), {
            name: "SlowDown",
            $metadata: { httpStatusCode: 503 },
          }),
          Object.assign(new Error("read ECONNRESET"), {
            name: "TimeoutError",
            code: "ECONNRESET",
            syscall: "read",
            $metadata: { attempts: 3 },
          }),
          Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), {
            code: "ECONNREFUSED",
            syscall: "connect",
          }),
        ];

        for (const fault of s3Faults) {
          mocks.streamStoredFile.mockRejectedValueOnce(fault);
          const reply = makeReply();
          const err = await downloadHandler(
            { params: { id: "file-dl-1" }, log: { warn: vi.fn(), error: vi.fn() } },
            reply,
          ).then(
            () => null,
            (e: unknown) => e,
          );
          expect(err).toMatchObject({
            isSafeMessage: true,
            kind: "operational",
            code: "storage-unavailable",
            statusCode: 503,
            cause: fault,
          });
          expect(classifyError(err, "http")).toBe("operational");
          expect(reply.send).not.toHaveBeenCalled();
        }

        const unexpectedBug = new TypeError("unexpected S3 client defect");
        mocks.streamStoredFile.mockRejectedValueOnce(unexpectedBug);
        const bugErr = await downloadHandler(
          { params: { id: "file-dl-1" }, log: { warn: vi.fn(), error: vi.fn() } },
          makeReply(),
        ).then(
          () => null,
          (e: unknown) => e,
        );
        expect(bugErr).toBe(unexpectedBug);
        expect(classifyError(bugErr, "http")).toBe("bug");
      });
    });
  });
});
