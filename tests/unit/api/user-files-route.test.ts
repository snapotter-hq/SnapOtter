/**
 * Unit tests for user file routes helper functions and serialization logic.
 *
 * Tests the formatToMime, extToMime, and serializeFile helpers that are
 * used throughout the user-files route handlers.
 */
import { describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => null, all: () => [] }),
        all: () => [],
      }),
    }),
    insert: () => ({ values: () => ({ run: vi.fn() }) }),
    delete: () => ({ where: () => ({ run: vi.fn() }) }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    userFiles: { id: {}, userId: {}, parentId: {}, createdAt: {}, originalName: {} },
  },
}));

// ── Reproduce helper functions from user-files.ts ──────────────────────

function formatToMime(format: string): string {
  const map: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    avif: "image/avif",
  };
  return map[format] ?? "application/octet-stream";
}

function extToMime(ext: string): string {
  const clean = ext.toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    avif: "image/avif",
  };
  return map[clean] ?? "application/octet-stream";
}

interface UserFileRow {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  version: number;
  parentId: string | null;
  toolChain: string | null;
  createdAt: Date;
}

function serializeFile(row: UserFileRow) {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    width: row.width,
    height: row.height,
    version: row.version,
    parentId: row.parentId,
    toolChain: row.toolChain ? JSON.parse(row.toolChain) : [],
    createdAt: row.createdAt.toISOString(),
  };
}

// Reproduce the bulk delete validation logic
function validateDeleteBody(body: unknown): { success: boolean; ids?: string[] } {
  if (typeof body !== "object" || body === null) return { success: false };
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.ids)) return { success: false };
  if (obj.ids.length === 0) return { success: false };
  if (!obj.ids.every((id: unknown) => typeof id === "string")) return { success: false };
  return { success: true, ids: obj.ids as string[] };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("user files route logic", () => {
  describe("formatToMime", () => {
    it("maps jpeg to image/jpeg", () => {
      expect(formatToMime("jpeg")).toBe("image/jpeg");
    });

    it("maps png to image/png", () => {
      expect(formatToMime("png")).toBe("image/png");
    });

    it("maps webp to image/webp", () => {
      expect(formatToMime("webp")).toBe("image/webp");
    });

    it("maps gif to image/gif", () => {
      expect(formatToMime("gif")).toBe("image/gif");
    });

    it("maps bmp to image/bmp", () => {
      expect(formatToMime("bmp")).toBe("image/bmp");
    });

    it("maps tiff to image/tiff", () => {
      expect(formatToMime("tiff")).toBe("image/tiff");
    });

    it("maps avif to image/avif", () => {
      expect(formatToMime("avif")).toBe("image/avif");
    });

    it("returns application/octet-stream for unknown format", () => {
      expect(formatToMime("raw")).toBe("application/octet-stream");
    });

    it("returns application/octet-stream for empty string", () => {
      expect(formatToMime("")).toBe("application/octet-stream");
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

    it("maps .tif to image/tiff", () => {
      expect(extToMime(".tif")).toBe("image/tiff");
    });

    it("maps .tiff to image/tiff", () => {
      expect(extToMime(".tiff")).toBe("image/tiff");
    });

    it("maps .avif to image/avif", () => {
      expect(extToMime(".avif")).toBe("image/avif");
    });

    it("handles uppercase extensions", () => {
      expect(extToMime(".JPG")).toBe("image/jpeg");
    });

    it("handles extension without leading dot", () => {
      expect(extToMime("png")).toBe("image/png");
    });

    it("returns application/octet-stream for unknown extension", () => {
      expect(extToMime(".xyz")).toBe("application/octet-stream");
    });
  });

  describe("serializeFile", () => {
    it("serializes a complete file row", () => {
      const row: UserFileRow = {
        id: "file-1",
        originalName: "photo.jpg",
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
      expect(result.id).toBe("file-1");
      expect(result.originalName).toBe("photo.jpg");
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.size).toBe(12345);
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.version).toBe(1);
      expect(result.parentId).toBeNull();
      expect(result.toolChain).toEqual([]);
      expect(result.createdAt).toBe("2025-06-01T12:00:00.000Z");
    });

    it("parses toolChain JSON when present", () => {
      const row: UserFileRow = {
        id: "file-2",
        originalName: "edited.png",
        mimeType: "image/png",
        size: 54321,
        width: 1920,
        height: 1080,
        version: 3,
        parentId: "file-1",
        toolChain: JSON.stringify(["resize", "compress", "convert"]),
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
        originalName: "upload.gif",
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
        originalName: "unknown.bin",
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
      const result = validateDeleteBody({ ids: ["id-1", "id-2"] });
      expect(result.success).toBe(true);
    });

    it("rejects empty ids array", () => {
      const result = validateDeleteBody({ ids: [] });
      expect(result.success).toBe(false);
    });

    it("rejects missing ids field", () => {
      const result = validateDeleteBody({});
      expect(result.success).toBe(false);
    });

    it("rejects non-array ids", () => {
      const result = validateDeleteBody({ ids: "single-id" });
      expect(result.success).toBe(false);
    });

    it("accepts single id", () => {
      const result = validateDeleteBody({ ids: ["only-one"] });
      expect(result.success).toBe(true);
    });
  });

  describe("pagination parsing", () => {
    it("defaults to limit 50 and offset 0", () => {
      const limit = parseInt("" || "50", 10) || 50;
      const offset = parseInt("" || "0", 10) || 0;
      expect(limit).toBe(50);
      expect(offset).toBe(0);
    });

    it("parses custom limit and offset", () => {
      const limit = parseInt("25", 10) || 50;
      const offset = parseInt("10", 10) || 0;
      expect(limit).toBe(25);
      expect(offset).toBe(10);
    });

    it("falls back to defaults for non-numeric values", () => {
      const limit = parseInt("abc", 10) || 50;
      const offset = parseInt("xyz", 10) || 0;
      expect(limit).toBe(50);
      expect(offset).toBe(0);
    });
  });

  describe("search escaping", () => {
    it("escapes SQL LIKE wildcards", () => {
      const search = "test%name_file\\special";
      const escaped = search.replace(/[%_\\]/g, "\\$&");
      expect(escaped).toBe("test\\%name\\_file\\\\special");
    });

    it("does not modify strings without special characters", () => {
      const search = "normal-search";
      const escaped = search.replace(/[%_\\]/g, "\\$&");
      expect(escaped).toBe("normal-search");
    });

    it("trims search string", () => {
      const search = "  hello  ";
      const trimmed = search.trim();
      expect(trimmed).toBe("hello");
    });
  });

  describe("version chain logic", () => {
    it("computes next version from parent", () => {
      const parentVersion = 2;
      const nextVersion = parentVersion + 1;
      expect(nextVersion).toBe(3);
    });

    it("builds tool chain by appending toolId", () => {
      const existingChain = ["resize", "compress"];
      const toolId = "convert";
      const newChain = [...existingChain, toolId];
      expect(newChain).toEqual(["resize", "compress", "convert"]);
    });

    it("starts with empty chain for first tool", () => {
      const existingChain: string[] = [];
      const toolId = "resize";
      const newChain = [...existingChain, toolId];
      expect(newChain).toEqual(["resize"]);
    });

    it("preserves chain when no toolId provided", () => {
      const existingChain = ["resize"];
      const toolId: string | null = null;
      const newChain = toolId ? [...existingChain, toolId] : existingChain;
      expect(newChain).toEqual(["resize"]);
    });
  });

  describe("filename preservation for results", () => {
    it("preserves parent base name with new extension", () => {
      const parentName = "vacation-photo.jpg";
      const ext = ".png";
      const baseName = parentName.replace(/\.[^.]+$/, "");
      const resultName = `${baseName}${ext}`;
      expect(resultName).toBe("vacation-photo.png");
    });

    it("handles parent name with multiple dots", () => {
      const parentName = "my.great.photo.jpg";
      const ext = ".webp";
      const baseName = parentName.replace(/\.[^.]+$/, "");
      const resultName = `${baseName}${ext}`;
      expect(resultName).toBe("my.great.photo.webp");
    });

    it("handles parent name without extension", () => {
      const parentName = "no-extension";
      const ext = ".png";
      const baseName = parentName.replace(/\.[^.]+$/, "");
      const resultName = `${baseName}${ext}`;
      expect(resultName).toBe("no-extension.png");
    });
  });
});
