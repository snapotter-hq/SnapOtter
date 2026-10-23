import { describe, expect, it } from "vitest";
import { createUniqueNamer, sanitizeFilename } from "../../../apps/api/src/lib/filename.js";
import { isValidObjectKey } from "../../../apps/api/src/lib/object-storage.js";

type WellFormable = string & { isWellFormed(): boolean };

describe("createUniqueNamer", () => {
  it("treats names that differ only in case as a collision, keeping the casing", () => {
    const unique = createUniqueNamer();
    const names = ["Report.pdf", "report.pdf", "REPORT.PDF", "report_1.pdf"].map(unique);
    expect(names[0]).toBe("Report.pdf");
    expect(names[1]).toBe("report_1.pdf");
    expect(names[2]).toBe("REPORT_2.PDF");
    expect(names[3]).toBe("report_1_1.pdf");
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });

  it("treats the composed and decomposed spellings of a name as a collision", () => {
    const unique = createUniqueNamer();
    const composed = "caf\u00e9.png";
    const decomposed = "cafe\u0301.png";
    expect(unique(composed)).toBe(composed);
    expect(unique(decomposed)).toBe("cafe\u0301_1.png");
  });
});

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

  it("keeps a stem that repeats the file's extension (#3380)", () => {
    expect(sanitizeFilename("my.png.photo.png")).toBe("my.png.photo.png");
    expect(sanitizeFilename("my.png.photo-copy.png")).toBe("my.png.photo-copy.png");
    expect(sanitizeFilename("logo.svg.backup.svg")).toBe("logo.svg.backup.svg");
    expect(sanitizeFilename("clip.mp4.final.mp4")).toBe("clip.mp4.final.mp4");
    expect(sanitizeFilename("report.csv.backup.CSV")).toBe("report.csv.backup.CSV");
    expect(sanitizeFilename("report.CSV.backup.csv")).toBe("report.CSV.backup.csv");
    expect(sanitizeFilename(".png.backup.png")).toBe(".png.backup.png");
  });

  it("still drops an unsafe tail after the last repeat", () => {
    expect(sanitizeFilename("my.png.photo.png.php")).toBe("my.png.photo.png");
    expect(sanitizeFilename(".png.php")).toBe(".png");
  });

  it("still truncates at the first safe extension when a different one follows", () => {
    expect(sanitizeFilename("render.jxl.html")).toBe("render.jxl");
    expect(sanitizeFilename("photo.png.backup.jpg")).toBe("photo.png");
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
    expect((result as WellFormable).isWellFormed()).toBe(true);
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
      "svgz",
      "pdf",
    ];
    for (const ext of extensions) {
      const result = sanitizeFilename(`file.${ext}.evil`);
      expect(result).toBe(`file.${ext}`);
    }
  });

  it("truncates double extensions on .svgz and keeps repeated .svgz stems (#3531)", () => {
    expect(sanitizeFilename("diagram.svgz.php")).toBe("diagram.svgz");
    expect(sanitizeFilename("logo.svgz.backup.svgz")).toBe("logo.svgz.backup.svgz");
    expect(sanitizeFilename("diagram.png.svgz")).toBe("diagram.png");
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

  it("strips null bytes before collapsing .. sequences (#3562)", () => {
    const sanitized = sanitizeFilename("a.\0.b.jpg");
    expect(sanitized).toBe("ab.jpg");
    expect(isValidObjectKey(`uploads/job/${sanitized}`)).toBe(true);

    const multiNull = sanitizeFilename("a.\0\0.b..c.png");
    expect(multiNull).toBe("abc.png");
    expect(isValidObjectKey(`uploads/job/${multiNull}`)).toBe(true);

    const trailingNullDots = sanitizeFilename("file.\0.");
    expect(trailingNullDots).toBe("file");
    expect(isValidObjectKey(`uploads/job/${trailingNullDots}`)).toBe(true);

    for (const bare of [".\0.", "..\0."]) {
      const result = sanitizeFilename(bare);
      expect(result).toBe("upload");
      expect(isValidObjectKey(`uploads/job/${result}`)).toBe(true);
    }
  });

  it("falls back to upload for .snapotter-staging reserved name (#3562, #3713)", () => {
    for (const raw of [
      ".snapotter-staging",
      ".SNAPOTTER-STAGING",
      ".\u{017f}napotter-staging",
      ".snapotter-\u{017f}taging",
      ".\u{017f}napotter-\u{017f}taging",
      ".\u{017f}NAPOTTER-\u{017f}TAGING",
      "/tmp/.snapotter-staging",
      "/tmp/.\u{017f}napotter-staging",
      ".\0snapotter-staging",
      ".\0\u{017f}napotter-staging",
      ".snapotter-staging..",
      ".\u{017f}napotter-staging..",
    ]) {
      const sanitized = sanitizeFilename(raw);
      expect(sanitized).toBe("upload");
      expect(isValidObjectKey(`uploads/job/${sanitized}`)).toBe(true);
    }

    const withExt = sanitizeFilename(".snapotter-staging.png.php");
    expect(withExt).toBe(".snapotter-staging.png");
    expect(isValidObjectKey(`uploads/job/${withExt}`)).toBe(true);

    const longSWithExt = sanitizeFilename(".\u{017f}napotter-staging.png.php");
    expect(longSWithExt).toBe(".\u{017f}napotter-staging.png");
    expect(isValidObjectKey(`uploads/job/${longSWithExt}`)).toBe(true);
  });

  it("strips trailing dots from the truncated stem before reattaching the extension (#3691)", () => {
    const dotAtCut = sanitizeFilename(`${"a".repeat(195)}.b.png`);
    expect(dotAtCut).toBe(`${"a".repeat(195)}.png`);
    expect(new TextEncoder().encode(dotAtCut).length).toBe(199);
    expect(isValidObjectKey(`uploads/job/${dotAtCut}`)).toBe(true);

    const leadingDotMultibyte = sanitizeFilename(`.\u00e9.${"b".repeat(198)}`);
    expect(leadingDotMultibyte).toBe(`.${"b".repeat(198)}`);
    expect(new TextEncoder().encode(leadingDotMultibyte).length).toBe(199);
    expect(isValidObjectKey(`uploads/job/${leadingDotMultibyte}`)).toBe(true);
  });

  it("truncates the whole filename when the extension alone reaches or exceeds 200 bytes (#3691)", () => {
    const ext199WithStem = sanitizeFilename(`aa.${"b".repeat(198)}`);
    expect(ext199WithStem).toBe(`a.${"b".repeat(198)}`);
    expect(new TextEncoder().encode(ext199WithStem).length).toBe(200);
    expect(isValidObjectKey(`uploads/job/${ext199WithStem}`)).toBe(true);

    const exact200Ext = sanitizeFilename(`a.${"b".repeat(199)}`);
    expect(exact200Ext).toBe(`a.${"b".repeat(198)}`);
    expect(new TextEncoder().encode(exact200Ext).length).toBe(200);
    expect(isValidObjectKey(`uploads/job/${exact200Ext}`)).toBe(true);

    const over200Ext = sanitizeFilename(`a.${"b".repeat(200)}`);
    expect(over200Ext).toBe(`a.${"b".repeat(198)}`);
    expect(new TextEncoder().encode(over200Ext).length).toBe(200);
    expect(isValidObjectKey(`uploads/job/${over200Ext}`)).toBe(true);

    const trailingDotAfterDrop = sanitizeFilename(`${"a".repeat(199)}.${"b".repeat(200)}`);
    expect(trailingDotAfterDrop).toBe("a".repeat(199));
    expect(new TextEncoder().encode(trailingDotAfterDrop).length).toBe(199);
    expect(isValidObjectKey(`uploads/job/${trailingDotAfterDrop}`)).toBe(true);
  });

  it("drops whole surrogate pairs during 200-byte truncation without leaving lone surrogates (#3705)", () => {
    const emojiAtCut = sanitizeFilename(`${"a".repeat(193)}\u{1F600}.png`);
    expect(emojiAtCut).toBe(`${"a".repeat(193)}.png`);
    expect((emojiAtCut as WellFormable).isWellFormed()).toBe(true);
    expect(new TextEncoder().encode(emojiAtCut).length).toBe(197);
    expect(isValidObjectKey(`uploads/job/${emojiAtCut}`)).toBe(true);

    const dotBeforeEmojiAtCut = sanitizeFilename(`${"a".repeat(192)}.\u{1F600}.png`);
    expect(dotBeforeEmojiAtCut).toBe(`${"a".repeat(192)}.png`);
    expect((dotBeforeEmojiAtCut as WellFormable).isWellFormed()).toBe(true);
    expect(new TextEncoder().encode(dotBeforeEmojiAtCut).length).toBe(196);
    expect(isValidObjectKey(`uploads/job/${dotBeforeEmojiAtCut}`)).toBe(true);

    const emojiFitsWithTrailingTrim = sanitizeFilename(`${"a".repeat(192)}\u{1F600}b.png`);
    expect(emojiFitsWithTrailingTrim).toBe(`${"a".repeat(192)}\u{1F600}.png`);
    expect((emojiFitsWithTrailingTrim as WellFormable).isWellFormed()).toBe(true);
    expect(new TextEncoder().encode(emojiFitsWithTrailingTrim).length).toBe(200);
    expect(isValidObjectKey(`uploads/job/${emojiFitsWithTrailingTrim}`)).toBe(true);

    const noExtEmojiAtCut = sanitizeFilename(`${"a".repeat(197)}\u{1F600}`);
    expect(noExtEmojiAtCut).toBe("a".repeat(197));
    expect((noExtEmojiAtCut as WellFormable).isWellFormed()).toBe(true);
    expect(new TextEncoder().encode(noExtEmojiAtCut).length).toBe(197);
    expect(isValidObjectKey(`uploads/job/${noExtEmojiAtCut}`)).toBe(true);

    const oversizedExtEmojiAtCut = sanitizeFilename(`a.${"b".repeat(195)}\u{1F600}`);
    expect(oversizedExtEmojiAtCut).toBe(`a.${"b".repeat(195)}`);
    expect((oversizedExtEmojiAtCut as WellFormable).isWellFormed()).toBe(true);
    expect(new TextEncoder().encode(oversizedExtEmojiAtCut).length).toBe(197);
    expect(isValidObjectKey(`uploads/job/${oversizedExtEmojiAtCut}`)).toBe(true);
  });
});
