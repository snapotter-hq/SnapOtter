/**
 * #5215: #5204 put the image decoders in format-decoders.ts under
 * SUBPROCESS_MEMORY_LIMIT_MB, but the image encoders (opj_compress, cjxl,
 * heif-enc) and the exiftool helpers in exiftool.ts and the info route still
 * spawned their binaries directly, so the setting never reached them. They now
 * run through wrapWithMemoryLimit. The binary probes (`exiftool -ver`) stay
 * unwrapped, like findMagickCmd's.
 *
 * Same harness as decoder-memory-limit.test.ts: the spy passes through to the
 * real wrapper, so the shims below really run under the /bin/sh shim, and the
 * recorded `ulimit -v` is only checked on Linux because macOS can't set it.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@snapotter/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/shared")>();
  return { ...actual, wrapWithMemoryLimit: vi.fn(actual.wrapWithMemoryLimit) };
});

vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/permissions.js")>();
  return { ...actual, requireToolAccess: vi.fn(async () => ({ id: "user-1", role: "admin" })) };
});

vi.mock("../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-decoders.js")>();
  return {
    ...actual,
    decodeToSharpCompat: vi.fn(async () => {
      throw new actual.DecoderUnavailableError("No RAW decoder found.");
    }),
  };
});

const { apiToolPath, wrapWithMemoryLimit } = await import("@snapotter/shared");
const { encodeJp2, encodeJxl } = await import("../../../apps/api/src/lib/format-encoders.js");
const { encodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");
const { inspectMetadata, readImageDimensions, writeMetadata } = await import(
  "../../../apps/api/src/lib/exiftool.js"
);
const { registerErrorHandler } = await import("../../../apps/api/src/plugins/error-handler.js");
const { registerInfo } = await import("../../../apps/api/src/routes/tools/info.js");

const LIMIT_KEY = "SUBPROCESS_MEMORY_LIMIT_MB";
const ORIGINAL = { PATH: process.env.PATH, [LIMIT_KEY]: process.env[LIMIT_KEY] };
const PNG_PATH = join(process.cwd(), "tests/fixtures/image/valid/test-200x150.png");
const PNG = readFileSync(PNG_PATH);
const DNG = readFileSync(join(process.cwd(), "tests/fixtures/image/formats/sample.dng"));
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
  binDir = mkdtempSync(join(tmpdir(), "image-spawn-limit-"));
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

/**
 * A shim that logs its name and its `ulimit -v`, then runs `body`. `probe`
 * runs before the log line, so an unwrapped `--version` probe that exits
 * there doesn't read as an uncapped run.
 */
function shim(name: string, body: string, probe = ""): void {
  const file = join(binDir, name);
  writeFileSync(
    file,
    `#!/bin/sh\n${probe}\necho "${name} $(ulimit -v)" >> "${limitLog}"\n${body}\n`,
  );
  chmodSync(file, 0o755);
}

const EXIFTOOL_JSON = `printf '[{"SourceFile":"x","ImageWidth":200,"ImageHeight":150,"EXIF:Artist":"a"}]\\n'`;
const EXIFTOOL_VER = `if [ "$1" = "-ver" ]; then echo 13.00; exit 0; fi`;

function wrappedBinaries(): string[] {
  return vi.mocked(wrapWithMemoryLimit).mock.calls.map(([bin]) => bin);
}

function expectCapped(name: string) {
  if (process.platform !== "linux") return;
  const lines = readFileSync(limitLog, "utf8").trim().split("\n");
  const limits = lines
    .filter((line) => line.startsWith(`${name} `))
    .map((line) => line.split(" ")[1]);
  expect(limits.length).toBeGreaterThan(0);
  for (const limit of limits) expect(limit).toBe(String(256 * 1024));
}

describe("image encoders under SUBPROCESS_MEMORY_LIMIT_MB (#5215)", () => {
  it("caps opj_compress", async () => {
    shim("opj_compress", `/bin/cp "${PNG_PATH}" "$4"`);

    const out = await encodeJp2(PNG, 80);

    expect(out.equals(PNG)).toBe(true);
    expect(wrappedBinaries()).toEqual(["opj_compress"]);
    expectCapped("opj_compress");
  });

  it("caps cjxl", async () => {
    shim("cjxl", `/bin/cp "${PNG_PATH}" "$2"`);

    const out = await encodeJxl(PNG, 80);

    expect(out.equals(PNG)).toBe(true);
    expect(wrappedBinaries()).toEqual(["cjxl"]);
    expectCapped("cjxl");
  });

  it("still falls back to ImageMagick when the shim can't find cjxl", async () => {
    shim(
      "magick",
      `if [ "$1" = "--version" ]; then echo "Version: ImageMagick 7"; exit 0; fi
for a; do last=$a; done
/bin/cp "${PNG_PATH}" "\${last#jxl:}"`,
    );

    const out = await encodeJxl(PNG, 80);

    expect(out.equals(PNG)).toBe(true);
    expect(wrappedBinaries()).toEqual(["cjxl"]);
  });

  it("caps heif-enc", async () => {
    shim("heif-enc", `/bin/cp "${PNG_PATH}" "$4"`);

    const out = await encodeHeic(PNG, 80);

    expect(out.equals(PNG)).toBe(true);
    expect(wrappedBinaries()).toEqual(["heif-enc"]);
    expectCapped("heif-enc");
  });
});

describe("exiftool helpers under SUBPROCESS_MEMORY_LIMIT_MB (#5215)", () => {
  it("caps the metadata read, write and dimension probe but not the -ver probe", async () => {
    shim("exiftool", EXIFTOOL_JSON, EXIFTOOL_VER);

    const inspected = await inspectMetadata(PNG, "photo.png");
    const written = await writeMetadata(PNG, "photo.png", ["-Artist=b"]);
    const dimensions = await readImageDimensions(PNG, "png");

    expect(inspected.exif).toEqual({ Artist: "a" });
    expect(written.equals(PNG)).toBe(true);
    expect(dimensions).toEqual({ width: 200, height: 150 });
    expect(wrappedBinaries()).toEqual(["exiftool", "exiftool", "exiftool"]);
    expectCapped("exiftool");
  });

  it("caps the info route's RAW exiftool enrichment", async () => {
    shim("exiftool", EXIFTOOL_JSON, EXIFTOOL_VER);
    const app = Fastify({ logger: false });
    await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
    registerErrorHandler(app);
    registerInfo(app);
    await app.ready();
    const boundary = "----unit";

    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("info"),
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.dng"\r\nContent-Type: image/x-adobe-dng\r\n\r\n`,
          ),
          DNG,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
      });

      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ width: 200, height: 150 });
    } finally {
      await app.close();
    }
    expect(wrappedBinaries()).toEqual(["exiftool"]);
    expectCapped("exiftool");
  });
});
