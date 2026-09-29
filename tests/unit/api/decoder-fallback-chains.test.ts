/**
 * #1429: a decoder that runs but has no support for the format (ImageMagick
 * without the delegate, libheif without its HEVC plugin, a binary whose shared
 * libraries won't load) is the host's gap, not the upload's. And inside a
 * fallback chain, the first decoder that actually judged the file decides:
 * its verdict keeps the 422 instead of being replaced by a later fallback's
 * "I can't read this format at all".
 *
 * Each test puts shim decoders on a fresh PATH, so the outcome doesn't depend
 * on which delegates this host's ImageMagick was built with.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  asDecoderUnavailable,
  DecoderUnavailableError,
  decodeToSharpCompat,
  isDecoderUnavailable,
} from "../../../apps/api/src/lib/format-decoders.js";
import { decodeHeic } from "../../../apps/api/src/lib/heic-converter.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const ORIGINAL_PATH = process.env.PATH;
const ORIGINAL_FFMPEG_PATH = process.env.FFMPEG_PATH;
const binDirs: string[] = [];

function restoreEnv() {
  process.env.PATH = ORIGINAL_PATH;
  if (ORIGINAL_FFMPEG_PATH === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = ORIGINAL_FFMPEG_PATH;
}

afterEach(restoreEnv);

afterAll(() => {
  restoreEnv();
  for (const dir of binDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A PATH holding only the given shim scripts (each a POSIX sh body). `which`
 * isn't on it either, so resolveFfmpeg() finds nothing and EXR's fallback
 * spawns a bare `ffmpeg` that isn't there. FFMPEG_PATH is cleared so a
 * developer's own setting can't hand EXR a real ffmpeg.
 */
function useShims(shims: Record<string, string>) {
  delete process.env.FFMPEG_PATH;
  const dir = mkdtempSync(join(tmpdir(), "decoder-shims-"));
  binDirs.push(dir);
  for (const [name, body] of Object.entries(shims)) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  }
  process.env.PATH = dir;
}

const MAGICK_VERSION = 'if [ "$1" = "--version" ]; then echo "Version: ImageMagick 7"; exit 0; fi';
const magickNoDelegate = `${MAGICK_VERSION}
echo "magick: no decode delegate for this image format \\\`x' @ error/constitute.c/ReadImage/752." >&2
exit 1`;
const magickVerdict = `${MAGICK_VERSION}
echo "magick: improper image header \\\`x' @ error/exr.c/ReadEXRImage/200." >&2
exit 1`;
const HEIF_VERSION = 'if [ "$1" = "--version" ]; then echo "1.17.6"; exit 0; fi';

describe("decoders with no support for the format (#1429)", () => {
  it("ImageMagick without the JXL delegate, and no djxl, is an unavailable decoder", async () => {
    useShims({ magick: magickNoDelegate });

    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("jxl")), "jxl").catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(DecoderUnavailableError);
  });

  it("a HEIF decoder without its HEVC plugin is an unavailable decoder", async () => {
    useShims({
      "heif-convert": `${HEIF_VERSION}
echo "Could not decode image: No decoding plugin installed for this compression format" >&2
exit 1`,
    });

    const err = await decodeHeic(readFixture(fixtures.image.base.heic200)).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
  });

  it("a decoder that exits 127 (shared libraries won't load) is an unavailable decoder", async () => {
    useShims({ "heif-convert": `${HEIF_VERSION}\nexit 127` });

    const err = await decodeHeic(readFixture(fixtures.image.base.heic200)).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
  });

  it("a decoder that ran and rejected the file stays a plain decode error", async () => {
    useShims({
      "heif-convert": `${HEIF_VERSION}
echo "Could not decode image: Invalid input: No 'ftyp' box" >&2
exit 1`,
    });

    const err = await decodeHeic(readFixture(fixtures.image.base.heic200)).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(isDecoderUnavailable(err)).toBe(false);
  });
});

describe("fallback chains keep the first real verdict (#1429)", () => {
  it("JXL: djxl's rejection wins over ImageMagick's missing delegate", async () => {
    useShims({
      djxl: 'echo "Error: failed to decode JPEG XL: truncated codestream" >&2\nexit 1',
      magick: magickNoDelegate,
    });

    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("jxl")), "jxl").catch(
      (e) => e,
    );

    expect(isDecoderUnavailable(err)).toBe(false);
    expect(String(err.message)).toMatch(/truncated codestream/);
  });

  it("JP2: opj_decompress's rejection wins over ImageMagick's missing delegate", async () => {
    useShims({
      opj_decompress: 'echo "ERROR -> opj_decompress: failed to decode image!" >&2\nexit 1',
      magick: magickNoDelegate,
    });

    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("jp2")), "jp2").catch(
      (e) => e,
    );

    expect(isDecoderUnavailable(err)).toBe(false);
    expect(String(err.message)).toMatch(/failed to decode image/);
  });

  it("RAW: dcraw_emu's rejection wins over ImageMagick's missing delegate", async () => {
    useShims({
      dcraw_emu: 'echo "Cannot decode file raw-in.dng" >&2\nexit 1',
      exiftool: "exit 0",
      magick: magickNoDelegate,
    });

    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
    ).catch((e) => e);

    expect(isDecoderUnavailable(err)).toBe(false);
    expect(String(err.message)).toMatch(/Cannot decode file/);
  });

  it("RAW: no dcraw_emu and an ImageMagick without the delegate is an unavailable decoder", async () => {
    useShims({ exiftool: "exit 0", magick: magickNoDelegate });

    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
    ).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
  });

  it("EXR: ImageMagick's rejection wins when ffmpeg is missing", async () => {
    useShims({ magick: magickVerdict });

    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("exr")), "exr").catch(
      (e) => e,
    );

    expect(isDecoderUnavailable(err)).toBe(false);
    expect(String(err.message)).toMatch(/improper image header/);
  });

  it("EXR: ImageMagick without the delegate and no ffmpeg is an unavailable decoder", async () => {
    useShims({ magick: magickNoDelegate });

    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("exr")), "exr").catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.message).toMatch(/no support for this format/);
  });

  it("JXL: with djxl missing, the 503 names djxl rather than ImageMagick's delegate", async () => {
    useShims({ magick: magickNoDelegate });

    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("jxl")), "jxl").catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.cause?.syscall).toBe("spawn djxl");
  });

  it("a primary that exits 0 without writing output is no verdict", async () => {
    useShims({ djxl: "exit 0", magick: magickNoDelegate });

    const err = await decodeToSharpCompat(readFixture(fixtures.image.formats("jxl")), "jxl").catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(DecoderUnavailableError);
  });

  it("RAW: a dcraw_emu that can't start decides it, whatever ImageMagick's delegate says", async () => {
    // ImageMagick 6 without ufraw fails like this, which no pattern can tell
    // from a bad file.
    useShims({
      exiftool: "exit 0",
      magick: `${MAGICK_VERSION}
echo "convert: delegate failed \\\`'ufraw-batch' --silent' @ error/delegate.c/InvokeDelegate/1911." >&2
exit 1`,
    });

    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
    ).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.cause?.syscall).toBe("spawn dcraw_emu");
  });

  it("RAW: dcraw_emu exiting 0 with an empty TIFF is no verdict", async () => {
    useShims({
      dcraw_emu: ': > "$5.tiff"\nexit 0',
      exiftool: "exit 0",
      magick: magickNoDelegate,
    });

    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
    ).catch((e) => e);

    expect(err).toBeInstanceOf(DecoderUnavailableError);
  });

  it("a successful fallback after a rejected primary still decodes", async () => {
    const png = join(process.cwd(), "tests/fixtures/image/valid/test-200x150.png");
    useShims({
      djxl: 'echo "Error: failed to decode" >&2\nexit 1',
      magick: `${MAGICK_VERSION}
for a; do last=$a; done
/bin/cp "${png}" "\${last#png:}"`,
    });

    const out = await decodeToSharpCompat(readFixture(fixtures.image.formats("jxl")), "jxl");

    expect(out.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("a cancelled chain stays an abort, not the primary's rejection", async () => {
    useShims({
      djxl: 'echo "Error: failed to decode" >&2\nexit 1',
      magick: `${MAGICK_VERSION}\n/bin/sleep 5`,
    });
    const controller = new AbortController();
    const pending = decodeToSharpCompat(
      readFixture(fixtures.image.formats("jxl")),
      "jxl",
      undefined,
      { signal: controller.signal },
    ).catch((e) => e);
    setTimeout(() => controller.abort(), 300);

    const err = await pending;

    expect(err.name).toBe("AbortError");
  });
});

describe("filenames can't steer the classification (#1429)", () => {
  it("a RAW extension carrying a missing-support phrase keeps dcraw_emu's verdict", async () => {
    // Real dcraw_emu and ImageMagick echo the input path, which is built from
    // the upload's extension.
    useShims({
      dcraw_emu: 'echo "Cannot open $5: Unsupported file format or not RAW file" >&2\nexit 2',
      exiftool: "exit 0",
      magick: `${MAGICK_VERSION}
for a; do last=$a; done
echo "magick: unable to open image \\\`$last'" >&2
exit 1`,
    });

    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "no decode delegate for this image format",
    ).catch((e) => e);

    expect(isDecoderUnavailable(err)).toBe(false);
    expect(String(err.message)).toMatch(/Unsupported file format/);
  });
});

describe("asDecoderUnavailable classification (#1429)", () => {
  const execError = (stderr: string, code: unknown = 1) =>
    Object.assign(new Error(`Command failed: x\n${stderr}`), { stderr, code });

  it.each([
    "magick: no decode delegate for this image format `x.jxl'",
    "convert: delegate library support not built-in (OpenEXR)",
    "Could not decode image: No decoding plugin installed for this compression format",
    "Could not decode image: Unsupported feature: Unsupported codec",
    "Support for this compression format has not been built in",
    "MAGICK: NO DECODE DELEGATE FOR THIS IMAGE FORMAT",
  ])("reads %j as missing support", (stderr) => {
    const converted = asDecoderUnavailable(execError(stderr));
    expect(converted).toBeInstanceOf(DecoderUnavailableError);
    expect((converted as Error).message).toMatch(/no support for this format/);
  });

  it("reads exit 127 as a decoder that could not start", () => {
    const converted = asDecoderUnavailable(execError("", 127));
    expect(converted).toBeInstanceOf(DecoderUnavailableError);
    expect((converted as Error).message).toMatch(/could not be started/);
  });

  it.each([
    ["a real rejection", execError("magick: improper image header `x'")],
    [
      "a phrase only in the command line",
      Object.assign(
        new Error("Command failed: magick no decode delegate for this image format.dng"),
        { stderr: "", code: 1 },
      ),
    ],
    ["an ENOENT code string with no spawn", Object.assign(new Error("gone"), { code: "ENOENT" })],
    ["a non-127 exit", execError("", 2)],
  ])("leaves %s alone", (_label, err) => {
    expect(asDecoderUnavailable(err)).toBe(err);
  });
});
