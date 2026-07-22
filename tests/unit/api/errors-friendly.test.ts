import { describe, expect, it } from "vitest";
import {
  friendlyError,
  stripControlChars,
  stripInternalPaths,
} from "../../../apps/api/src/lib/errors.js";

const GENERIC = "Processing failed. The file may be in an unsupported or corrupted format.";

describe("friendlyError", () => {
  it("collapses raw ffmpeg stderr dumps to a safe sentence", () => {
    const dump =
      "ffmpeg exited 234: Input #0, gif ... Pixel format 'gbrap' is not widely supported. Conversion failed!";
    expect(friendlyError(dump)).toBe(GENERIC);
  });

  it("collapses raw ffprobe stderr dumps", () => {
    expect(friendlyError("ffprobe exited 1: moov atom not found")).toBe(GENERIC);
  });

  it("collapses raw doc-engine stderr dumps (qpdf, gs, pandoc, pdfcpu, LibreOffice)", () => {
    // These are thrown verbatim by doc-engine wrappers and, unlike ffmpeg, used
    // to pass through path-scrubbed but otherwise raw when short enough.
    expect(friendlyError("qpdf exited 2: operation for offset 1234 is invalid")).toBe(GENERIC);
    expect(friendlyError("gs exited 1: Error: /invalidfileaccess in --.outputpage--")).toBe(
      GENERIC,
    );
    expect(friendlyError("pandoc exited 64: unknown reader")).toBe(GENERIC);
    expect(friendlyError("pdfcpu exited 1: validation error at object 5")).toBe(GENERIC);
    expect(friendlyError("LibreOffice exited 81: source file could not be loaded")).toBe(GENERIC);
  });

  it("collapses tool dumps when killed by signal (no numeric exit code)", () => {
    expect(friendlyError("gs exited SIGKILL: ")).toBe(GENERIC);
  });

  it("does NOT collapse benign words that merely contain a tool substring", () => {
    // "pngs exited the queue" contains the substring "gs exited" but is not a
    // tool-failure dump; a word boundary before the tool name prevents a false hit.
    expect(friendlyError("3 pngs exited the pipeline cleanly")).toBe(
      "3 pngs exited the pipeline cleanly",
    );
  });

  it("collapses python tracebacks", () => {
    expect(friendlyError("Traceback (most recent call last):\n  File x\nValueError: boom")).toBe(
      GENERIC,
    );
  });

  it("collapses very long (>280 char) messages", () => {
    expect(friendlyError("x".repeat(400))).toBe(GENERIC);
  });

  it("collapses multi-line dumps (>3 lines)", () => {
    expect(friendlyError("l1\nl2\nl3\nl4\nl5")).toBe(GENERIC);
  });

  it("preserves intentional, user-facing validation messages", () => {
    for (const msg of [
      "This video has no audio track to normalize",
      "Reverse is limited to clips up to 5 minutes",
      "Crop rectangle 9999x9999+0+0 exceeds video size 640x360",
      "No subtitle track found in this video",
    ]) {
      expect(friendlyError(msg)).toBe(msg);
    }
  });

  it("does NOT collapse clean messages that merely contain tool-ish words (false-positive guard)", () => {
    // The old regex matched "conversion failed" / "pixel format" and would have
    // wrongly collapsed these legitimate messages.
    expect(friendlyError("SVG conversion failed")).toBe("SVG conversion failed");
    expect(friendlyError("PDF conversion failed")).toBe("PDF conversion failed");
    expect(friendlyError("Unsupported pixel format in source")).toBe(
      "Unsupported pixel format in source",
    );
  });

  it("scrubs internal filesystem paths", () => {
    expect(friendlyError("decode failed at /data/ai/models/whisper")).toBe(
      "decode failed at [internal]",
    );
    expect(friendlyError("wrote /tmp/workspace/out.mp4")).toBe("wrote [internal]");
  });

  it("is idempotent (safe to apply at every error surface)", () => {
    const dump = "ffmpeg exited 1: boom";
    expect(friendlyError(friendlyError(dump))).toBe(friendlyError(dump));
    const ok = "Region exceeds image bounds";
    expect(friendlyError(friendlyError(ok))).toBe(ok);
  });

  it("strips ANSI/terminal control chars from surfaced subprocess errors", () => {
    // caire's progress spinner emits ANSI cursor/color sequences into stderr.
    const raw = "\x1B[2K\x1B[1G\x1B[36mcarving\x1B[0m 42%\x08\x08done";
    expect(friendlyError(raw)).toBe("carving 42%done");
  });
});

describe("stripControlChars", () => {
  it("removes ANSI CSI sequences but keeps visible text", () => {
    expect(stripControlChars("\x1B[31mred\x1B[0m text")).toBe("red text");
  });

  it("removes residual C0 control chars but preserves tab and newline", () => {
    expect(stripControlChars("a\x00b\x07c\td\ne")).toBe("abc\td\ne");
  });

  it("leaves plain text and accented locale strings untouched", () => {
    expect(stripControlChars("Café déjà vu")).toBe("Café déjà vu");
  });
});

describe("stripInternalPaths", () => {
  it("strips POSIX internal roots", () => {
    expect(stripInternalPaths("wrote /tmp/workspace/out.mp4 ok")).toBe("wrote [internal] ok");
    expect(stripInternalPaths("model at /data/ai/models/whisper")).toBe("model at [internal]");
  });

  it("strips Windows drive-letter paths (native Windows runs)", () => {
    // Matches sentry-scrub's PATH_RE so client responses and Sentry agree.
    expect(stripInternalPaths("failed reading C:\\Users\\snap\\secret.pdf")).toBe(
      "failed reading [internal]",
    );
  });

  it("leaves messages with no path untouched", () => {
    expect(stripInternalPaths("Region exceeds image bounds")).toBe("Region exceeds image bounds");
  });
});
