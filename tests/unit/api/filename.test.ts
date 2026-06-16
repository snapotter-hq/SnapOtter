import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "../../../apps/api/src/lib/filename.js";

describe("sanitizeFilename", () => {
  it("passes through a simple filename", () => {
    expect(sanitizeFilename("photo.png")).toBe("photo.png");
  });

  it("strips directory path and returns basename only", () => {
    expect(sanitizeFilename("/usr/local/bin/image.png")).toBe("image.png");
  });

  it("strips relative directory path", () => {
    expect(sanitizeFilename("some/nested/dir/file.jpg")).toBe("file.jpg");
  });

  it("removes .. sequences", () => {
    const result = sanitizeFilename("../../etc/passwd");
    expect(result).toBe("passwd");
    expect(result).not.toContain("..");
  });

  it("removes embedded .. sequences in filename", () => {
    expect(sanitizeFilename("my..file..name.png")).toBe("myfilename.png");
  });

  it("removes null bytes", () => {
    expect(sanitizeFilename("image\0.png")).toBe("image.png");
  });

  it("falls back to upload for empty string", () => {
    expect(sanitizeFilename("")).toBe("upload");
  });

  it("falls back to upload for single dot", () => {
    expect(sanitizeFilename(".")).toBe("upload");
  });

  it("falls back to upload for double dot", () => {
    expect(sanitizeFilename("..")).toBe("upload");
  });

  it("falls back to upload for triple dots (.. removal leaves .)", () => {
    expect(sanitizeFilename("...")).toBe("upload");
  });

  it("falls back to upload for four dots (.. removal leaves empty)", () => {
    expect(sanitizeFilename("....")).toBe("upload");
  });

  it("truncates after first safe image extension (photo.png.php)", () => {
    expect(sanitizeFilename("photo.png.php")).toBe("photo.png");
  });

  it("truncates after first safe image extension (report.jpg.exe)", () => {
    expect(sanitizeFilename("report.jpg.exe")).toBe("report.jpg");
  });

  it("truncates after first safe image extension with multiple unsafe parts", () => {
    expect(sanitizeFilename("evil.webp.php.sh")).toBe("evil.webp");
  });

  it("handles no extension", () => {
    expect(sanitizeFilename("README")).toBe("README");
  });

  it("handles unknown extensions without truncation", () => {
    expect(sanitizeFilename("archive.tar.gz")).toBe("archive.tar.gz");
  });

  it("handles filename with only unknown extensions", () => {
    expect(sanitizeFilename("data.xyz")).toBe("data.xyz");
  });

  it("truncates very long filenames over 200 bytes", () => {
    const longName = `${"a".repeat(300)}.png`;
    const result = sanitizeFilename(longName);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(200);
    expect(result).toMatch(/\.png$/);
  });

  it("truncates long filename without extension", () => {
    const longName = "b".repeat(300);
    const result = sanitizeFilename(longName);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(200);
  });

  it("handles unicode filenames", () => {
    expect(sanitizeFilename("写真.png")).toBe("写真.png");
  });

  it("handles emoji filenames", () => {
    expect(sanitizeFilename("\u{1F600}photo.jpg")).toBe("\u{1F600}photo.jpg");
  });

  it("handles filenames with spaces", () => {
    expect(sanitizeFilename("my photo 2024.jpg")).toBe("my photo 2024.jpg");
  });

  it("handles filenames with dashes and underscores", () => {
    expect(sanitizeFilename("my-photo_v2.webp")).toBe("my-photo_v2.webp");
  });

  it("preserves dotfiles", () => {
    expect(sanitizeFilename(".gitignore")).toBe(".gitignore");
  });

  it("handles trailing slash in path", () => {
    expect(sanitizeFilename("/foo/bar/")).toBe("bar");
  });

  it("handles only null bytes falling back to upload", () => {
    expect(sanitizeFilename("\0\0\0")).toBe("upload");
  });

  it("truncates long unicode filenames correctly", () => {
    const longUnicode = `${"\u{1F600}".repeat(100)}.png`;
    const result = sanitizeFilename(longUnicode);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(200);
    expect(result).toMatch(/\.png$/);
  });

  it("recognizes all safe image extensions", () => {
    const extensions = [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "gif",
      "bmp",
      "tiff",
      "tif",
      "avif",
      "svg",
      "pdf",
    ];
    for (const ext of extensions) {
      const result = sanitizeFilename(`file.${ext}.evil`);
      expect(result).toBe(`file.${ext}`);
    }
  });

  it("recognizes safe extensions across all modalities", () => {
    const cases: Record<string, string> = {
      "clip.mp4.exe": "clip.mp4",
      "song.mp3.php": "song.mp3",
      "report.csv.php": "report.csv",
      "doc.docx.exe": "doc.docx",
      "data.json.sh": "data.json",
      "book.epub.php": "book.epub",
      "sheet.xlsx.exe": "sheet.xlsx",
      "subs.srt.php": "subs.srt",
    };
    for (const [input, expected] of Object.entries(cases)) {
      expect(sanitizeFilename(input)).toBe(expected);
    }
  });
});
