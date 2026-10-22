import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #1751. The server running out of memory mid-decode is the server's fault, so
 * it answers the same 503 ENGINE_UNAVAILABLE a missing decoder does (#1577,
 * #1629). decodeHeic got that first; the ImageMagick fallback (decodeAnyFormat)
 * and the per-format decoders (decodeToSharpCompat) answered 422 instead.
 *
 * The stderr in these cases is what the shipped image printed under
 * `ulimit -v`: heif-dec for libheif's own allocation failure (#1629), and
 * ImageMagick decoding a HEIC through libheif for the libgomp and
 * std::system_error thread failures.
 */
const failures = vi.hoisted(() => ({
  kill: null as Record<string, unknown> | null,
  probe: null as Record<string, unknown> | null,
  // Per binary, for fallback chains: each listed command's decode fails once.
  byCommand: {} as Record<string, Record<string, unknown>>,
  open: null as Error | null,
  writeFile: null as Error | null,
  closedHandles: 0,
  read: null as Error | null,
  writeOutput: null as Buffer | null,
  sharpToBuffer: null as Error | null,
  spawned: [] as string[],
}));

type SharpPngChain = {
  toBuffer: (...args: unknown[]) => Promise<Buffer>;
};
type SharpInstance = {
  png: (...args: unknown[]) => SharpPngChain;
};
type SharpModule = {
  default: (...args: unknown[]) => SharpInstance;
};

vi.mock("sharp", async (importOriginal) => {
  const actual = await importOriginal<SharpModule>();
  const realSharp = actual.default;
  const wrapped = ((...args: unknown[]) => {
    const instance = realSharp(...args);
    if (failures.sharpToBuffer) {
      const origPng = instance.png.bind(instance);
      instance.png = (...pngArgs: unknown[]) => {
        const pngInstance = origPng(...pngArgs);
        const origToBuffer = pngInstance.toBuffer.bind(pngInstance);
        pngInstance.toBuffer = async (...bufArgs: unknown[]) => {
          if (failures.sharpToBuffer) {
            const err = failures.sharpToBuffer;
            failures.sharpToBuffer = null;
            throw err;
          }
          return origToBuffer(...bufArgs);
        };
        return pngInstance;
      };
    }
    return instance;
  }) as SharpModule["default"];
  Object.assign(wrapped, realSharp);
  return { ...actual, default: wrapped };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: (async (path: unknown, ...rest: unknown[]) => {
      if (failures.open && /(?:dimensions|psd-in|any-in)-[^/\\]*\.\w+$/.test(String(path))) {
        const err = failures.open;
        failures.open = null;
        throw err;
      }
      const handle = (await (actual.open as (...args: unknown[]) => Promise<unknown>)(
        path,
        ...rest,
      )) as { writeFile: (...args: unknown[]) => Promise<unknown>; close: () => Promise<unknown> };
      if (failures.writeFile && /(?:psd-in|any-in)-[^/\\]*\.\w+$/.test(String(path))) {
        const err = failures.writeFile;
        failures.writeFile = null;
        const origClose = handle.close.bind(handle);
        handle.writeFile = async () => {
          throw err;
        };
        handle.close = async () => {
          failures.closedHandles += 1;
          return origClose();
        };
      }
      return handle;
    }) as typeof actual.open,
    readFile: (async (path: unknown, ...rest: unknown[]) => {
      if (
        failures.read &&
        /((?:any|exr|jxl|jp2)-out-[^/\\]*\.png|raw-in-[^/\\]*\.tiff)$/.test(String(path))
      ) {
        const err = failures.read;
        failures.read = null;
        throw err;
      }
      return (actual.readFile as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readFile,
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { writeFile } = await import("node:fs/promises");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(actual.execFile) as (...args: unknown[]) => Promise<unknown>;
  // The decoders call promisify(execFile), which uses this custom form. Only
  // the decode itself fails, not the `--version` probe, and only once.
  const execFile = Object.assign((...args: unknown[]) => actual.execFile(...(args as [string])), {
    [promisify.custom]: async (file: string, argv: string[], options?: unknown) => {
      if (failures.probe && argv.includes("--version")) {
        const fields = failures.probe;
        failures.probe = null;
        throw Object.assign(new Error(`Command failed: ${file} --version`), fields);
      }
      const decoding = !argv.includes("--version");
      const binary = String(file).split(/[/\\]/).pop() as string;
      if (decoding) failures.spawned.push(binary);
      const taggedKey = argv.includes("-PreviewImage") ? `${binary}:-PreviewImage` : binary;
      const chained = failures.byCommand[taggedKey] ?? failures.byCommand[binary];
      if (decoding && chained) {
        if (failures.byCommand[taggedKey]) delete failures.byCommand[taggedKey];
        else delete failures.byCommand[binary];
        throw Object.assign(new Error(`Command failed: ${binary}`), chained);
      }
      if (failures.writeOutput && decoding) {
        const outArg = argv.find((arg) => /^png:|-out-/.test(arg));
        if (outArg) {
          const buf = failures.writeOutput;
          failures.writeOutput = null;
          await writeFile(outArg.replace(/^png:/, ""), buf);
          return { stdout: "", stderr: "" };
        }
      }
      if (failures.kill && argv.some((arg) => /(any|psd)-in-[^/\\]*\.\w+(\[0\])?$/.test(arg))) {
        const fields = failures.kill;
        failures.kill = null;
        throw Object.assign(new Error("Command failed: magick"), fields);
      }
      return execFileAsync(file, argv, options);
    },
  });
  return { ...actual, execFile };
});

const {
  asDecoderOutOfMemory,
  DecoderUnavailableError,
  decodeAnyFormat,
  decodeToSharpCompat,
  isDecoderUnavailable,
  noDecoderFound,
} = await import("../../../apps/api/src/lib/format-decoders.js");

afterEach(() => {
  failures.kill = null;
  failures.probe = null;
  failures.byCommand = {};
  failures.open = null;
  failures.read = null;
  failures.writeOutput = null;
  failures.sharpToBuffer = null;
  failures.spawned = [];
});

const LIBHEIF_ALLOCATION =
  "Could not decode image: Memory allocation error: Unspecified: Allocating 4147215 bytes failed\n";
const THREAD_ABORT =
  "terminate called after throwing an instance of 'std::system_error'\n  what():  Resource temporarily unavailable\n";
const LIBGOMP = "\nlibgomp: Thread creation failed: Resource temporarily unavailable\n";

function failure(fields: Record<string, unknown>): Error {
  return Object.assign(new Error("Command failed: magick"), fields);
}

describe("asDecoderOutOfMemory", () => {
  it.each([
    ["a SIGKILL, the kernel OOM killer's signal", { code: null, signal: "SIGKILL", stderr: "" }],
    ["libheif failing to allocate", { code: 1, signal: null, stderr: LIBHEIF_ALLOCATION }],
  ])("answers %s as running out of memory", (_name, fields) => {
    const err = asDecoderOutOfMemory(failure(fields)) as Error;
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.message).toContain("ran out of memory");
  });

  it.each([
    [
      "an abort when a decoder thread can't start",
      { code: null, signal: "SIGABRT", stderr: THREAD_ABORT },
    ],
    ["libgomp failing to start an OpenMP thread", { code: 1, signal: null, stderr: LIBGOMP }],
  ])("answers %s as a thread or process limit", (_name, fields) => {
    const err = asDecoderOutOfMemory(failure(fields)) as Error;
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.message).toContain("thread or process limit");
  });

  it.each([
    // Our own -limit flags produce this: the file is too big for the
    // configured limits, which is the file's problem.
    [
      "ImageMagick's cache resources exhausted",
      {
        code: 1,
        signal: null,
        stderr: "magick: cache resources exhausted `x.avif' @ error/cache.c/OpenPixelCache/4095.\n",
      },
    ],
    // Not seen under memory pressure, and a crafted file's huge allocation
    // raises it on a healthy host, so like std::bad_alloc it stays the file's.
    [
      "ImageMagick's memory allocation failed",
      {
        code: 1,
        signal: null,
        stderr: "magick: memory allocation failed `x.psd' @ error/psd.c/ReadPSDLayers/1234.\n",
      },
    ],
    [
      "a std::bad_alloc abort",
      {
        code: null,
        signal: "SIGABRT",
        stderr: "terminate called after throwing an instance of 'std::bad_alloc'\n",
      },
    ],
    [
      "libheif's security limit",
      {
        code: 1,
        signal: null,
        stderr:
          "Memory allocation error: Security limit exceeded: Allocating 2147483648 bytes exceeds the security limit of 536870912 bytes\n",
      },
    ],
    ["our own timeout's SIGTERM", { killed: true, code: null, signal: "SIGTERM", stderr: "" }],
    [
      "the thread text without an abort or libgomp",
      { code: 1, signal: null, stderr: "what():  Resource temporarily unavailable\n" },
    ],
  ])("leaves %s alone", (_name, fields) => {
    const err = failure(fields);
    expect(asDecoderOutOfMemory(err)).toBe(err);
  });

  it("answers V8 failing to allocate a buffer as running out of memory", () => {
    const err = asDecoderOutOfMemory(new RangeError("Array buffer allocation failed")) as Error;
    expect(err.name).toBe("DecoderOutOfMemoryError");
  });

  it("reads Buffer stderr from buffer-mode execFile calls and passes existing DecoderOutOfMemoryError through", () => {
    const err = asDecoderOutOfMemory(
      failure({ code: 1, signal: null, stderr: Buffer.from(LIBGOMP, "utf8") }),
    ) as Error;
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(asDecoderOutOfMemory(err)).toBe(err);
  });
});

describe("decoders that run ImageMagick (#1751)", () => {
  // Runs before the decode tests below so cachedMagickCmd is still null and
  // findMagickCmd actually executes its `--version` probe (#1758).
  it("answers a killed ImageMagick --version probe as a 503", async () => {
    failures.probe = { code: null, signal: "SIGKILL", stderr: "" };
    const err = await decodeAnyFormat(Buffer.from("not really an avif"), "avif").catch(
      (e: unknown) => e as Error,
    );
    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("keeps a killed ImageMagick --version probe as DecoderOutOfMemoryError in a fallback chain when the primary cannot start", async () => {
    failures.byCommand.djxl = { code: "ENOENT", syscall: "spawn djxl" };
    failures.probe = { code: null, signal: "SIGKILL", stderr: "" };
    const err = await decodeToSharpCompat(Buffer.from("not really a jxl"), "jxl").catch(
      (e: unknown) => e as Error,
    );
    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("answers a --version probe hitting a thread limit in noDecoderFound as a 503", () => {
    const threadErr = failure({ code: null, signal: "SIGABRT", stderr: THREAD_ABORT });
    const spawnErr = Object.assign(new Error("spawn convert ENOENT"), {
      code: "ENOENT",
      syscall: "spawn convert",
    });
    for (const list of [
      [threadErr, spawnErr],
      [spawnErr, threadErr],
    ]) {
      const err = noDecoderFound("No ImageMagick found.", list);
      expect(isDecoderUnavailable(err)).toBe(true);
      expect(err.name).toBe("DecoderOutOfMemoryError");
      expect(err.cause).toBe(threadErr);
    }
  });

  it("answers decodeAnyFormat running out of memory as a 503", async () => {
    failures.kill = { code: 1, signal: null, stderr: LIBGOMP };
    const err = await decodeAnyFormat(Buffer.from("not really an avif"), "avif").catch(
      (e: unknown) => e as Error,
    );
    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("answers decodeToSharpCompat running out of memory as a 503", async () => {
    failures.kill = { code: null, signal: "SIGKILL", stderr: "" };
    const err = await decodeToSharpCompat(Buffer.from("8BPS not really a psd"), "psd").catch(
      (e: unknown) => e as Error,
    );
    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("keeps ImageMagick's own resource limits a verdict on the file", async () => {
    const fields = {
      code: 1,
      signal: null,
      stderr: "magick: cache resources exhausted `x.avif' @ error/cache.c/OpenPixelCache/4095.\n",
    };
    failures.kill = fields;
    const err = await decodeAnyFormat(Buffer.from("not really an avif"), "avif").catch(
      (e: unknown) => e as Error,
    );
    expect(isDecoderUnavailable(err)).toBe(false);
    expect((err as { stderr?: unknown }).stderr).toBe(fields.stderr);
  });

  it("answers V8 failing to allocate ImageMagick's output as a 503", async () => {
    failures.read = new RangeError("Array buffer allocation failed");
    // A real decode that writes output, so the read is what fails.
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    const err = await decodeAnyFormat(readFixture(fixtures.image.formats("bmp")), "bmp").catch(
      (e: unknown) => e as Error,
    );
    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("reads a chain where one decoder ran out of memory and the next lacks the delegate as memory", async () => {
    // djxl killed, then ImageMagick with no JXL delegate: neither judged the
    // file, and before #1751 the answer named a missing package.
    failures.byCommand.djxl = { code: null, signal: "SIGKILL", stderr: "" };
    const noDelegate = {
      code: 1,
      signal: null,
      stderr:
        "magick: no decode delegate for this image format `JXL' @ error/constitute.c/ReadImage/741.\n",
    };
    failures.byCommand.magick = noDelegate;
    failures.byCommand.convert = noDelegate;
    const err = await decodeToSharpCompat(Buffer.from("not really a jxl"), "jxl").catch(
      (e: unknown) => e as Error,
    );
    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("still lets a real verdict from another decoder in the chain win over running out of memory", async () => {
    failures.byCommand.djxl = { code: null, signal: "SIGKILL", stderr: "" };
    const corrupt = {
      code: 1,
      signal: null,
      stderr: "magick: improper image header `x.jxl' @ error/jxl.c/ReadJXLImage/123.\n",
    };
    failures.byCommand.magick = corrupt;
    failures.byCommand.convert = corrupt;
    const err = await decodeToSharpCompat(Buffer.from("not really a jxl"), "jxl").catch(
      (e: unknown) => e as Error,
    );
    expect(isDecoderUnavailable(err)).toBe(false);
    expect((err as { stderr?: unknown }).stderr).toBe(corrupt.stderr);
  });
});

describe("decodeRaw and preflight/post-decode fault handling (#1758)", () => {
  it("ends decodeRaw as a 503 instead of returning the embedded preview when dcraw_emu is killed", async () => {
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    failures.byCommand.dcraw_emu = { code: null, signal: "SIGKILL", stderr: "" };

    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
    ).catch((e: unknown) => e as Error);

    expect(err).toBeInstanceOf(Error);
    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("ends decodeRaw as a 503 when dcraw_emu hits a thread limit and there is no preview", async () => {
    failures.byCommand.dcraw_emu = { code: 1, signal: null, stderr: LIBGOMP };

    const err = await decodeToSharpCompat(Buffer.from("not really a raw"), "raw", "dng").catch(
      (e: unknown) => e as Error,
    );

    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("ends decodeRaw as a 503 when reading dcraw_emu's TIFF output fails to allocate", async () => {
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    failures.read = new RangeError("Array buffer allocation failed");

    const err = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("dng")),
      "raw",
      "dng",
    ).catch((e: unknown) => e as Error);

    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("ends decodeRaw as a 503 when dcraw_emu rejects and exiftool's preview extract is killed", async () => {
    failures.byCommand.dcraw_emu = {
      code: 1,
      signal: null,
      stderr: "Cannot open raw: Unsupported file format\n",
    };
    failures.byCommand.exiftool = { code: null, signal: "SIGKILL", stderr: "" };

    const err = await decodeToSharpCompat(Buffer.from("not really a raw"), "raw", "dng").catch(
      (e: unknown) => e as Error,
    );

    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("ends decodeRaw as a 503 when exiftool's second preview tier (-PreviewImage) hits a thread limit", async () => {
    failures.byCommand.dcraw_emu = {
      code: 1,
      signal: null,
      stderr: "Cannot open raw: Unsupported file format\n",
    };
    failures.byCommand["exiftool:-PreviewImage"] = {
      code: 1,
      signal: null,
      stderr: Buffer.from(LIBGOMP, "utf8"),
    };

    const err = await decodeToSharpCompat(Buffer.from("not really a raw"), "raw", "dng").catch(
      (e: unknown) => e as Error,
    );

    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("ends decodeRaw as a 503 when dcraw_emu cannot start and the ImageMagick fallback runs out of memory", async () => {
    failures.byCommand.dcraw_emu = { code: "ENOENT", syscall: "spawn dcraw_emu" };
    const oom = { code: null, signal: "SIGKILL", stderr: "" };
    failures.byCommand.magick = oom;
    failures.byCommand.convert = oom;

    const err = await decodeToSharpCompat(Buffer.from("not really a raw"), "raw", "dng").catch(
      (e: unknown) => e as Error,
    );

    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it.each(["ENOSPC", "EMFILE", "EACCES"])(
    "surfaces a %s temp-write failure in preflightEncodedDimensions as a 503 with cause",
    async (code) => {
      const fsErr = Object.assign(new Error(`${code}: open temp file`), {
        code,
        syscall: "open",
      });
      failures.open = fsErr;

      const err = (await decodeToSharpCompat(Buffer.from("not really a jxl"), "jxl", undefined, {
        maxPixels: 100_000,
      }).catch((e: unknown) => e)) as Error;

      expect(err).toBeInstanceOf(DecoderUnavailableError);
      expect(err.name).toBe("DecoderUnavailableError");
      expect(err.message).toMatch(/could not write a temporary file/);
      expect(isDecoderUnavailable(err)).toBe(true);
      expect(err.cause).toBe(fsErr);
    },
  );

  it("surfaces a killed exiftool in preflightEncodedDimensions as a 503 DecoderOutOfMemoryError", async () => {
    const killFields = { code: null, signal: "SIGKILL", stderr: "" };
    failures.byCommand.exiftool = killFields;

    const err = await decodeToSharpCompat(Buffer.from("not really a jxl"), "jxl", undefined, {
      maxPixels: 100_000,
    }).catch((e: unknown) => e as Error);

    expect(isDecoderUnavailable(err)).toBe(true);
    expect((err as Error).name).toBe("DecoderOutOfMemoryError");
  });

  it("surfaces an exiftool timeout in preflightEncodedDimensions as a 503 DecoderUnavailableError", async () => {
    failures.byCommand.exiftool = { killed: true, signal: "SIGTERM", code: null, stderr: "" };

    const err = (await decodeToSharpCompat(Buffer.from("not really a jxl"), "jxl", undefined, {
      maxPixels: 100_000,
    }).catch((e: unknown) => e)) as Error;

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.name).toBe("DecoderUnavailableError");
    expect(err.message).toMatch(/Exiftool timed out or was terminated/);
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.cause).toMatchObject({ killed: true, signal: "SIGTERM" });
  });

  it("surfaces an unstartable exiftool (exit 127) in preflightEncodedDimensions as a 503 DecoderUnavailableError", async () => {
    failures.byCommand.exiftool = { code: 127, signal: null, stderr: "" };

    const err = (await decodeToSharpCompat(Buffer.from("not really a jxl"), "jxl", undefined, {
      maxPixels: 100_000,
    }).catch((e: unknown) => e)) as Error;

    expect(err).toBeInstanceOf(DecoderUnavailableError);
    expect(err.name).toBe("DecoderUnavailableError");
    expect(err.message).toMatch(/could not be started/);
    expect(isDecoderUnavailable(err)).toBe(true);
  });

  it("attaches exiftool's rejection as cause when preflightEncodedDimensions cannot read dimensions", async () => {
    failures.byCommand.exiftool = {
      code: 1,
      signal: null,
      stderr: "Error: File format error\n",
    };

    const err = (await decodeToSharpCompat(Buffer.from("not really a jxl"), "jxl", undefined, {
      maxPixels: 100_000,
    }).catch((e: unknown) => e)) as Error;

    expect(isDecoderUnavailable(err)).toBe(false);
    expect(err.message).toMatch(/encoded dimensions are unavailable/);
    expect((err.cause as { stderr?: string } | undefined)?.stderr).toBe(
      "Error: File format error\n",
    );
  });

  it("keeps Sharp's real error in assertDecodedWithinLimit when the decoded PNG is corrupt", async () => {
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    failures.writeOutput = Buffer.from("not a valid png");

    const err = (await decodeToSharpCompat(
      readFixture(fixtures.image.formats("bmp")),
      "bmp",
      undefined,
      { maxPixels: 1_000_000 },
    ).catch((e: unknown) => e)) as Error;

    expect(err.message).not.toMatch(/configured image safety limits/);
    expect(err.message).toMatch(/unsupported image format|VipsPng/i);
  });

  it("still enforces limitInputPixels and maxDimension in assertDecodedWithinLimit when decoded output exceeds them", async () => {
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    // A 1x1 QOI header passes preflight, then the mocked BMP decode writes a
    // 200x150 PNG that assertDecodedWithinLimit checks.
    const png200 = readFixture(fixtures.image.base.png200);
    const tinyBmp = Buffer.from(readFixture(fixtures.image.formats("bmp")));
    tinyBmp.writeInt32LE(10, 18);
    tinyBmp.writeInt32LE(10, 22);

    failures.writeOutput = png200;
    const pixelErr = (await decodeToSharpCompat(tinyBmp, "bmp", undefined, {
      maxPixels: 500,
    }).catch((e: unknown) => e)) as Error;
    expect(pixelErr.message).toMatch(/input image exceeds pixel limit/i);

    failures.writeOutput = png200;
    const dimErr = (await decodeToSharpCompat(tinyBmp, "bmp", undefined, {
      maxDimension: 150,
      maxPixels: 100_000,
    }).catch((e: unknown) => e)) as Error;
    expect(dimErr.message).toMatch(/pixel dimension safety limit.*200x150/i);
  });
});

describe("decodeNetpbm and EXR/JXL/JP2 primary readFile fault handling (#2884)", () => {
  it("rethrows Sharp's limitInputPixels error in decodeNetpbm without spawning ImageMagick", async () => {
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    failures.sharpToBuffer = new Error("Input image exceeds pixel limit");

    const err = (await decodeToSharpCompat(readFixture(fixtures.image.formats("ppm")), "ppm").catch(
      (e: unknown) => e,
    )) as Error;

    expect(isDecoderUnavailable(err)).toBe(false);
    expect(err.message).toBe("Input image exceeds pixel limit");
    expect(failures.spawned).toEqual([]);
  });

  it("surfaces a V8 buffer allocation failure from Sharp in decodeNetpbm as a 503 without spawning ImageMagick", async () => {
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    const v8Oom = new RangeError("Array buffer allocation failed");
    failures.sharpToBuffer = v8Oom;

    const err = (await decodeToSharpCompat(readFixture(fixtures.image.formats("ppm")), "ppm").catch(
      (e: unknown) => e,
    )) as Error;

    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.cause).toBe(v8Oom);
    expect(failures.spawned).toEqual([]);
  });

  it("surfaces a V8 buffer allocation failure reading ImageMagick's EXR output as a 503 without falling back to ffmpeg", async () => {
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    const v8Oom = new RangeError("Array buffer allocation failed");
    failures.writeOutput = readFixture(fixtures.image.base.png200);
    failures.read = v8Oom;
    failures.byCommand.ffmpeg = {
      code: 1,
      signal: null,
      stderr: "exr: unsupported compression\n",
    };

    const err = (await decodeToSharpCompat(readFixture(fixtures.image.formats("exr")), "exr").catch(
      (e: unknown) => e,
    )) as Error;

    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.cause).toBe(v8Oom);
    expect(failures.spawned).not.toContain("ffmpeg");
  });

  it.each([
    ["jxl", "djxl"],
    ["jp2", "opj_decompress"],
  ] as const)(
    "surfaces a V8 buffer allocation failure reading %s primary output (%s) as a 503 without falling back to ImageMagick",
    async (format, primaryBinary) => {
      const { fixtures, readFixture } = await import("../../fixtures/index.js");
      const v8Oom = new RangeError("Array buffer allocation failed");
      failures.writeOutput = readFixture(fixtures.image.base.png200);
      failures.read = v8Oom;
      const corrupt = {
        code: 1,
        signal: null,
        stderr: `magick: improper image header \`x.${format}'\n`,
      };
      failures.byCommand.magick = corrupt;
      failures.byCommand.convert = corrupt;

      const err = (await decodeToSharpCompat(
        readFixture(fixtures.image.formats(format)),
        format,
      ).catch((e: unknown) => e)) as Error;

      expect(isDecoderUnavailable(err)).toBe(true);
      expect(err.name).toBe("DecoderOutOfMemoryError");
      expect(err.cause).toBe(v8Oom);
      expect(failures.spawned).toEqual([primaryBinary]);
    },
  );
});

describe("writeTempExclusive operational write errors in decodeToSharpCompat and decodeAnyFormat (#2800)", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["ENOSPC", "storage-full"],
    ["EDQUOT", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EPERM", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ];

  it.each(cases)(
    "normalizes %s from writeTempExclusive in decodeToSharpCompat and decodeAnyFormat into a 503 %s SafeError",
    async (errno, expectedCode) => {
      const { fixtures, readFixture } = await import("../../fixtures/index.js");
      const fsErr = Object.assign(new Error(`${errno}: open temp file`), {
        code: errno,
        syscall: "open",
      });

      failures.open = fsErr;
      const psdErr = await decodeToSharpCompat(
        readFixture(fixtures.image.formats("psd")),
        "psd",
        "psd",
      ).catch((e: unknown) => e);
      expect(psdErr).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        statusCode: 503,
        code: expectedCode,
        cause: fsErr,
      });

      failures.open = fsErr;
      const avifErr = await decodeAnyFormat(Buffer.from("avif-bytes"), "avif").catch(
        (e: unknown) => e,
      );
      expect(avifErr).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        statusCode: 503,
        code: expectedCode,
        cause: fsErr,
      });
    },
  );

  it("closes the file handle and normalizes ENOSPC when fh.writeFile fails after open succeeds", async () => {
    const { fixtures, readFixture } = await import("../../fixtures/index.js");
    const writeErr = Object.assign(new Error("ENOSPC: no space left on device, write"), {
      code: "ENOSPC",
      syscall: "write",
    });
    failures.closedHandles = 0;
    failures.writeFile = writeErr;
    const psdErr = await decodeToSharpCompat(
      readFixture(fixtures.image.formats("psd")),
      "psd",
      "psd",
    ).catch((e: unknown) => e);
    expect(psdErr).toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "storage-full",
      cause: writeErr,
    });
    expect(failures.closedHandles).toBe(1);
  });
});
