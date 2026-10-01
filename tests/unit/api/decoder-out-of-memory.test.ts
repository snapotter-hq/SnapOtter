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
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(actual.execFile) as (...args: unknown[]) => Promise<unknown>;
  // The decoders call promisify(execFile), which uses this custom form. Only
  // the decode itself fails, not the `--version` probe, and only once.
  const execFile = Object.assign((...args: unknown[]) => actual.execFile(...(args as [string])), {
    [promisify.custom]: (file: string, argv: string[], options?: unknown) => {
      if (failures.kill && argv.some((arg) => /(any|psd)-in-[^/\\]*\.\w+(\[0\])?$/.test(arg))) {
        const fields = failures.kill;
        failures.kill = null;
        return Promise.reject(Object.assign(new Error("Command failed: magick"), fields));
      }
      return execFileAsync(file, argv, options);
    },
  });
  return { ...actual, execFile };
});

const { asDecoderOutOfMemory, decodeAnyFormat, decodeToSharpCompat, isDecoderUnavailable } =
  await import("../../../apps/api/src/lib/format-decoders.js");

afterEach(() => {
  failures.kill = null;
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
});

describe("decoders that run ImageMagick (#1751)", () => {
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
});
