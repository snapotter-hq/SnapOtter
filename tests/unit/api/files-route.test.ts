/**
 * Unit tests for file serving route helper functions.
 *
 * Tests the path traversal guard, content type mapping, and download/upload
 * logic helpers from the files route.
 */
import { describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

// ── Reproduce helper functions from files.ts ────────────────────────────

function isPathTraversal(segment: string): boolean {
  return (
    segment.includes("..") ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("\0")
  );
}

function getContentType(ext: string): string {
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
    svg: "image/svg+xml",
    pdf: "application/pdf",
    zip: "application/zip",
    ico: "image/x-icon",
    json: "application/json",
    jxl: "image/jxl",
    dng: "image/x-adobe-dng",
    cr2: "image/x-canon-cr2",
    nef: "image/x-nikon-nef",
    arw: "image/x-sony-arw",
    orf: "image/x-olympus-orf",
    rw2: "image/x-panasonic-rw2",
    tga: "image/x-tga",
    psd: "image/vnd.adobe.photoshop",
    exr: "image/x-exr",
    hdr: "image/vnd.radiance",
    heic: "image/heic",
    heif: "image/heif",
  };
  return map[ext] ?? "application/octet-stream";
}

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

    it("returns application/octet-stream for unknown extension", () => {
      expect(getContentType("xyz")).toBe("application/octet-stream");
    });

    it("returns application/octet-stream for empty string", () => {
      expect(getContentType("")).toBe("application/octet-stream");
    });
  });

  describe("filename encoding for Content-Disposition", () => {
    it("encodes special characters", () => {
      const filename = "my photo (1).jpg";
      const encoded = encodeURIComponent(filename);
      expect(encoded).toBe("my%20photo%20(1).jpg");
    });

    it("preserves simple filenames", () => {
      const filename = "photo.jpg";
      const encoded = encodeURIComponent(filename);
      expect(encoded).toBe("photo.jpg");
    });

    it("encodes unicode characters", () => {
      const filename = "写真.png";
      const encoded = encodeURIComponent(filename);
      expect(encoded).toContain("%");
    });
  });

  describe("extension extraction from filename", () => {
    it("extracts extension from simple filename", () => {
      const filename = "photo.jpg";
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      expect(ext).toBe("jpg");
    });

    it("handles filename with multiple dots", () => {
      const filename = "my.photo.2024.png";
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      expect(ext).toBe("png");
    });

    it("handles filename without extension", () => {
      const filename = "no-extension";
      const parts = filename.split(".");
      const ext = parts.length > 1 ? (parts.pop()?.toLowerCase() ?? "") : "";
      expect(ext).toBe("");
    });
  });
});
