/**
 * #1429: EXR falls back from ImageMagick to ffmpeg, and that ffmpeg must be
 * the one FFMPEG_PATH names, as everywhere else media-engine spawns it.
 * resolveFfmpeg() caches its answer for the life of the module, so this runs
 * in its own file with FFMPEG_PATH set before the first EXR decode.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { decodeToSharpCompat } from "../../../apps/api/src/lib/format-decoders.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const ORIGINAL_PATH = process.env.PATH;
const ORIGINAL_FFMPEG_PATH = process.env.FFMPEG_PATH;
const pathDir = mkdtempSync(join(tmpdir(), "exr-path-"));
const ffmpegDir = mkdtempSync(join(tmpdir(), "exr-ffmpeg-"));

afterAll(() => {
  process.env.PATH = ORIGINAL_PATH;
  if (ORIGINAL_FFMPEG_PATH === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = ORIGINAL_FFMPEG_PATH;
  rmSync(pathDir, { recursive: true, force: true });
  rmSync(ffmpegDir, { recursive: true, force: true });
});

function writeShim(file: string, body: string) {
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

it("EXR's ffmpeg fallback runs the binary FFMPEG_PATH names, off PATH", async () => {
  const png = join(process.cwd(), "tests/fixtures/image/valid/test-200x150.png");
  // ImageMagick rejects the file, so the chain moves on to ffmpeg.
  writeShim(
    join(pathDir, "magick"),
    'if [ "$1" = "--version" ]; then echo "Version: ImageMagick 7"; exit 0; fi\necho "magick: improper image header" >&2\nexit 1',
  );
  // Not on PATH: only reachable through FFMPEG_PATH. Writes its last argument.
  const ffmpeg = join(ffmpegDir, "custom-ffmpeg");
  writeShim(ffmpeg, `for a; do last=$a; done\n/bin/cp "${png}" "$last"`);
  process.env.PATH = pathDir;
  process.env.FFMPEG_PATH = ffmpeg;

  const out = await decodeToSharpCompat(readFixture(fixtures.image.formats("exr")), "exr");

  expect(out.subarray(1, 4).toString("ascii")).toBe("PNG");
});
