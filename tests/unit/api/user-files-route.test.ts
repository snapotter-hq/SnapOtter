/**
 * Unit tests for user file routes helper functions and route handler logic.
 *
 * Tests the extToMime, unverifiedMime, measuredDimensions, serializeFile, and
 * deleteFilesSchema helpers and the GET /api/v1/files, DELETE /api/v1/files,
 * and POST /api/v1/files/save-result handlers from user-files.ts.
 */
import { Readable } from "node:stream";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  likeSpy: vi.fn(),
  limitSpy: vi.fn(),
  offsetSpy: vi.fn(),
  parentRows: [] as unknown[],
  insertedValues: undefined as Record<string, unknown> | undefined,
  saveFile: vi.fn(() => Promise.resolve("stored-result.png")),
  saveThumbnail: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  readStoredFile: vi.fn<() => Promise<Buffer>>(() => Promise.resolve(Buffer.alloc(0))),
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
  sql: Object.assign(() => "sql", { join: () => "sql-join" }),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: (fields?: unknown) => ({
      from: () => ({
        where: () => {
          if (fields) {
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
  getCachedThumbnail: vi.fn(() => Promise.resolve(null)),
  isStorageServiceFault: vi.fn(() => false),
  readStoredFile: mocks.readStoredFile,
  saveFile: mocks.saveFile,
  saveThumbnail: mocks.saveThumbnail,
  streamStoredFile: vi.fn(),
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

    it("maps video extensions (.mp4, .webm, .mov)", () => {
      expect(extToMime(".mp4")).toBe("video/mp4");
      expect(extToMime(".webm")).toBe("video/webm");
      expect(extToMime(".mov")).toBe("video/quicktime");
    });

    it("maps audio extensions (.mp3, .wav, .flac, .ogg, .aac)", () => {
      expect(extToMime(".mp3")).toBe("audio/mpeg");
      expect(extToMime(".wav")).toBe("audio/wav");
      expect(extToMime(".flac")).toBe("audio/flac");
      expect(extToMime(".ogg")).toBe("audio/ogg");
      expect(extToMime(".aac")).toBe("audio/aac");
    });

    it("maps document, text, and archive extensions (.pdf, .txt, .csv, .json, .xml, .zip)", () => {
      expect(extToMime(".pdf")).toBe("application/pdf");
      expect(extToMime(".txt")).toBe("text/plain");
      expect(extToMime(".csv")).toBe("text/csv");
      expect(extToMime(".json")).toBe("application/json");
      expect(extToMime(".xml")).toBe("application/xml");
      expect(extToMime(".zip")).toBe("application/zip");
    });

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
    let thumbnailHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        get: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
          const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
          if (path === "/api/v1/files") listHandler = handler;
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
      mocks.saveFile.mockResolvedValue("stored-result.png");
      mocks.saveThumbnail.mockResolvedValue();
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
    });
  });
});
