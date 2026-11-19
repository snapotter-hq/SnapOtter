/**
 * #4400: TGA stores an origin bit, and sample.tga is bottom-left (rows run
 * from the bottom up). ImageMagick 6.9.11 (Debian bookworm, the arm64 image)
 * leaves the rows as stored and only reports orientation=BottomLeft, so
 * writing straight to PNG came out upside down. ImageMagick 6.9.12 and 7 flip
 * the rows while reading and report TopLeft, so they never showed the bug.
 * The decoder now asks ImageMagick to apply the orientation (-auto-orient),
 * which is a no-op on the versions that already did.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { decodeToSharpCompat } from "../../../apps/api/src/lib/format-decoders.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const ORIGINAL_PATH = process.env.PATH;
const tempDirs: string[] = [];

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

afterAll(() => {
  process.env.PATH = ORIGINAL_PATH;
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Mean brightness of the top and bottom thirds. The sample scene has sky on top. */
async function thirds(image: Buffer): Promise<{ top: number; bottom: number }> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const band = Math.floor(height / 3);
  const mean = async (top: number) => {
    // stats() reads the pipeline's input, so the crop has to be materialised first.
    const crop = await sharp(image)
      .extract({ left: 0, top, width, height: band })
      .removeAlpha()
      .png()
      .toBuffer();
    const { channels } = await sharp(crop).stats();
    return channels.reduce((sum, c) => sum + c.mean, 0) / channels.length;
  };
  return { top: await mean(0), bottom: await mean(height - band) };
}

function expectSkyOnTop(result: { top: number; bottom: number }) {
  expect(result.top).toBeGreaterThan(result.bottom * 1.5);
}

/** The same pixels as sample.tga, stored top-down with the top-left origin bit set. */
function topLeftVariant(bottomLeft: Buffer): Buffer {
  const idLength = bottomLeft[0];
  const width = bottomLeft.readUInt16LE(12);
  const height = bottomLeft.readUInt16LE(14);
  const bytesPerPixel = bottomLeft[16] / 8;
  const headerLength = 18 + idLength;
  const rowLength = width * bytesPerPixel;
  const header = Buffer.from(bottomLeft.subarray(0, headerLength));
  header[17] = (header[17] & ~0x30) | 0x20;
  const rows: Buffer[] = [];
  for (let row = height - 1; row >= 0; row--) {
    const start = headerLength + row * rowLength;
    rows.push(bottomLeft.subarray(start, start + rowLength));
  }
  return Buffer.concat([header, ...rows]);
}

const sampleTga = readFixture(fixtures.image.formats("tga"));

describe("TGA orientation (#4400)", () => {
  it("the fixture really is a bottom-left TGA of a sky-on-top scene", async () => {
    expect(sampleTga[2]).toBe(2);
    expect(sampleTga[17] & 0x20).toBe(0);
    expectSkyOnTop(await thirds(readFixture(fixtures.image.formats("png"))));
  });

  it("decodes a bottom-left and a top-left TGA the right way up with this host's ImageMagick", async () => {
    expectSkyOnTop(await thirds(await decodeToSharpCompat(sampleTga, "tga")));
    expectSkyOnTop(await thirds(await decodeToSharpCompat(topLeftVariant(sampleTga), "tga")));
  });

  it("applies the TGA origin when ImageMagick only reports it, as 6.9.11 does", async () => {
    // A shim ImageMagick that behaves like 6.9.11 on sample.tga: without
    // -auto-orient it writes the rows as stored (bottom row first).
    const dir = makeTempDir("tga-orient-");
    const upright = join(dir, "upright.png");
    const asStored = join(dir, "as-stored.png");
    const png = readFixture(fixtures.image.formats("png"));
    writeFileSync(upright, png);
    writeFileSync(asStored, await sharp(png).flip().png().toBuffer());
    const shim = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "Version: ImageMagick 6.9.11-60"; exit 0; fi
src="${asStored}"
for arg in "$@"; do
  [ "$arg" = "-auto-orient" ] && src="${upright}"
  last="$arg"
done
exec /bin/cp "$src" "\${last#png:}"
`;
    const bin = makeTempDir("tga-orient-bin-");
    for (const name of ["magick", "convert"]) {
      writeFileSync(join(bin, name), shim);
      chmodSync(join(bin, name), 0o755);
    }
    process.env.PATH = bin;

    expectSkyOnTop(await thirds(await decodeToSharpCompat(sampleTga, "tga")));
  });
});
