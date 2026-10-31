import { afterEach, describe, expect, it } from "vitest";
import {
  friendlyError,
  stripControlChars,
  stripInternalPaths,
} from "../../../apps/api/src/lib/errors.js";

const GENERIC = "Processing failed. The file may be in an unsupported or corrupted format.";

describe("friendlyError", () => {
  it("passes the worker's missing-input message through unchanged (#901)", () => {
    const msg = "Input file is no longer available. Upload it again.";
    expect(friendlyError(msg)).toBe(msg);
  });

  it("collapses raw ffmpeg stderr dumps to a safe sentence", () => {
    const dump =
      "ffmpeg exited 234: Input #0, gif ... Pixel format 'gbrap' is not widely supported. Conversion failed!";
    expect(friendlyError(dump)).toBe(GENERIC);
  });

  it("collapses raw ffprobe stderr dumps", () => {
    expect(friendlyError("ffprobe exited 1: moov atom not found")).toBe(GENERIC);
  });

  it("preserves short doc-engine errors that carry the actionable reason", () => {
    // qpdf/gs/pdfcpu stderr is already path-scrubbed and often IS the useful
    // message (e.g. a wrong PDF password), so it must not collapse to generic.
    // Only genuinely verbose dumps collapse, via the length/line-count guard.
    expect(friendlyError("qpdf exited 2: invalid password")).toBe(
      "qpdf exited 2: invalid password",
    );
    expect(friendlyError("pdfcpu exited 1: validation error at object 5")).toBe(
      "pdfcpu exited 1: validation error at object 5",
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

  describe("the host's temp dir (#1430)", () => {
    // os.tmpdir() reads TMPDIR on every call, so each case points it somewhere.
    const original = process.env.TMPDIR;
    afterEach(() => {
      if (original === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = original;
    });
    const withTmp = (dir: string, message: string) => {
      process.env.TMPDIR = dir;
      return stripInternalPaths(message);
    };

    it("strips paths under it wherever it points, outside every hard-coded root", () => {
      // macOS puts it under /var/folders, and a job runner may point it anywhere.
      expect(
        withTmp(
          "/Users/runner/work/_temp",
          "Command failed: heif-convert /Users/runner/work/_temp/heic-in-7-abc.heic /Users/runner/work/_temp/heic-out-7-abc.png",
        ),
      ).toBe("Command failed: heif-convert [internal] [internal]");
    });

    it("strips ImageMagick's backtick-quoted form and the macOS realpath form", () => {
      expect(
        withTmp("/srv/work/t", "magick: improper image header `/srv/work/t/ico-in-1.ico' @ x"),
      ).toBe("magick: improper image header `[internal]' @ x");
      expect(
        withTmp("/var/folders/ab/T/", "failed on /private/var/folders/ab/T/heic-in-1.heic"),
      ).toBe("failed on /private[internal]");
    });

    it("escapes regex characters in the temp dir", () => {
      expect(withTmp("/srv/a.b+(c)[d]$", "at /srv/a.b+(c)[d]$/in.heic")).toBe("at [internal]");
      expect(withTmp("/srv/a.b+(c)[d]$", "at /srv/aXb+(c)[d]$/y")).toBe("at /srv/aXb+(c)[d]$/y");
    });

    it.each([".", "tmp", "/var", "/"])(
      "leaves ordinary text alone when TMPDIR is %j (relative or too shallow)",
      (dir) => {
        expect(withTmp(dir, "Invalid file photo.png: expected 1.5x")).toBe(
          "Invalid file photo.png: expected 1.5x",
        );
        expect(withTmp(dir, "Route GET:/api/v1/tools/various not found")).toBe(
          "Route GET:/api/v1/tools/various not found",
        );
      },
    );

    it("matches the temp dir only as a whole path segment", () => {
      expect(withTmp("/srv/work/t", "see /srv/work/tx/secret")).toBe("see /srv/work/tx/secret");
      expect(withTmp("/tmp", "see /tmpfoo/x")).toBe("see /tmpfoo/x");
    });
  });
});
