/**
 * #5204: SUBPROCESS_MEMORY_LIMIT_MB capped the media and document engines'
 * native processes, but the image decoders spawned ffmpeg, exiftool, djxl and
 * opj_decompress directly, so a crafted upload that reached one of them could
 * still grow until the container's OOM killer took every in-flight job with
 * it. Those now run through wrapWithMemoryLimit. ImageMagick and dcraw_emu
 * stay outside it: both use OpenMP, whose threads reserve far more address
 * space than they touch, and ImageMagick has its own -limit flags.
 *
 * The spy passes through to the real wrapper, so the shims below really run
 * under the /bin/sh shim. macOS can't set `ulimit -v`, so the recorded limit
 * is only checked on Linux.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@snapotter/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/shared")>();
  return { ...actual, wrapWithMemoryLimit: vi.fn(actual.wrapWithMemoryLimit) };
});

const { wrapWithMemoryLimit } = await import("@snapotter/shared");
const { DecoderUnavailableError, decodeToSharpCompat } = await import(
  "../../../apps/api/src/lib/format-decoders.js"
);
const { fixtures, readFixture } = await import("../../fixtures/index.js");

const LIMIT_KEY = "SUBPROCESS_MEMORY_LIMIT_MB";
const ORIGINAL = {
  PATH: process.env.PATH,
  FFMPEG_PATH: process.env.FFMPEG_PATH,
  [LIMIT_KEY]: process.env[LIMIT_KEY],
};
const PNG = join(process.cwd(), "tests/fixtures/image/valid/test-200x150.png");
const JPEG = join(process.cwd(), "tests/fixtures/image/formats/sample.jpg");
const dirs: string[] = [];
let binDir: string;
let limitLog: string;

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  vi.mocked(wrapWithMemoryLimit).mockClear();
  delete process.env.FFMPEG_PATH;
  binDir = mkdtempSync(join(tmpdir(), "decoder-limit-"));
  dirs.push(binDir);
  limitLog = join(binDir, "limits.log");
  process.env.PATH = binDir;
  process.env[LIMIT_KEY] = "256";
});

afterEach(restoreEnv);

afterAll(() => {
  restoreEnv();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A shim that logs its name and its `ulimit -v`, then runs `body`. */
function shim(name: string, body: string, dir = binDir): string {
  const file = join(dir, name);
  writeFileSync(file, `#!/bin/sh\necho "${name} $(ulimit -v)" >> "${limitLog}"\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

const MAGICK_REJECTS = `if [ "$1" = "--version" ]; then echo "Version: ImageMagick 7"; exit 0; fi
echo "magick: improper image header" >&2
exit 1`;
const WRITE_LAST_ARG_AS_PNG = `for a; do last=$a; done\n/bin/cp "${PNG}" "$last"`;

function wrappedBinaries(): string[] {
  return vi.mocked(wrapWithMemoryLimit).mock.calls.map(([bin]) => bin);
}

function loggedLimits(): Map<string, string> {
  const lines = readFileSync(limitLog, "utf8").trim().split("\n");
  return new Map(lines.map((line) => line.split(" ") as [string, string]));
}

function expectCapped(...names: string[]) {
  if (process.platform !== "linux") return;
  const limits = loggedLimits();
  for (const name of names) expect(limits.get(name)).toBe(String(256 * 1024));
}

describe("image decoders under SUBPROCESS_MEMORY_LIMIT_MB (#5204)", () => {
  it("caps EXR's ffmpeg fallback and leaves ImageMagick to its own -limit flags", async () => {
    shim("magick", MAGICK_REJECTS);
    const ffmpegDir = mkdtempSync(join(tmpdir(), "decoder-limit-ffmpeg-"));
    dirs.push(ffmpegDir);
    process.env.FFMPEG_PATH = shim("custom-ffmpeg", WRITE_LAST_ARG_AS_PNG, ffmpegDir);

    const out = await decodeToSharpCompat(readFixture(fixtures.image.formats("exr")), "exr");

    expect(out.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(wrappedBinaries()).toEqual([process.env.FFMPEG_PATH]);
    expectCapped("custom-ffmpeg");
  });

  it("caps the exiftool dimension preflight and the JpgFromRaw extraction", async () => {
    shim("dcraw_emu", "echo 'dcraw_emu: unsupported file format' >&2\nexit 1");
    shim(
      "exiftool",
      `if [ "$1" = "-fast2" ]; then printf '200\\n150\\n'; exit 0; fi
if [ "$2" = "-JpgFromRaw" ]; then /bin/cat "${JPEG}"; exit 0; fi
exit 1`,
    );

    const out = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
      {
        maxPixels: 100_000_000,
      },
    );

    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(wrappedBinaries()).toEqual(["exiftool", "exiftool"]);
    expectCapped("exiftool");
  });

  it("caps the exiftool PreviewImage extraction", async () => {
    shim("dcraw_emu", "exit 1");
    shim("exiftool", `if [ "$2" = "-PreviewImage" ]; then /bin/cat "${JPEG}"; fi\nexit 0`);

    const out = await decodeToSharpCompat(readFixture(fixtures.image.formats("dng")), "raw", "dng");

    expect(out[0]).toBe(0xff);
    expect(wrappedBinaries()).toEqual(["exiftool", "exiftool"]);
    expectCapped("exiftool");
  });

  it("caps djxl and opj_decompress", async () => {
    shim("djxl", WRITE_LAST_ARG_AS_PNG);
    shim("opj_decompress", WRITE_LAST_ARG_AS_PNG);

    await decodeToSharpCompat(readFixture(fixtures.image.formats("jxl")), "jxl");
    await decodeToSharpCompat(readFixture(fixtures.image.formats("jp2")), "jp2");

    expect(wrappedBinaries()).toEqual(["djxl", "opj_decompress"]);
    expectCapped("djxl", "opj_decompress");
  });

  it("still reports a missing exiftool by name, though the shell shim exits 127 instead of ENOENT", async () => {
    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
      { maxPixels: 100_000_000 },
    ).catch((e) => e);

    expect(wrappedBinaries()).toEqual(["exiftool"]);
    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.message).toMatch(/No exiftool found/);
  });
});
