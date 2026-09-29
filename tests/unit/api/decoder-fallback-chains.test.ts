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
  DecoderUnavailableError,
  decodeToSharpCompat,
  isDecoderUnavailable,
} from "../../../apps/api/src/lib/format-decoders.js";
import { decodeHeic } from "../../../apps/api/src/lib/heic-converter.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const ORIGINAL_PATH = process.env.PATH;
const binDirs: string[] = [];

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

afterAll(() => {
  process.env.PATH = ORIGINAL_PATH;
  for (const dir of binDirs) rmSync(dir, { recursive: true, force: true });
});

/** A PATH holding only the given shim scripts (each a POSIX sh body). */
function useShims(shims: Record<string, string>) {
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
  });
});
