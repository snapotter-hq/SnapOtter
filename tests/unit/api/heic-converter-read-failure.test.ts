import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureDir, fixtures, readFixture } from "../../fixtures/index.js";

/**
 * #1533. decodeHeic reads heif-dec's output back with a fallback to the
 * multi-image `-1.png` name. The fallback caught every error, so a read that
 * failed for another reason (V8 unable to allocate the buffer) was replaced by
 * an ENOENT for a file that never existed.
 *
 * #1577. The server running out of memory mid-decode is the server's fault, so
 * it comes back as the same 503 ENGINE_UNAVAILABLE a missing decoder does, and
 * every caller that already lets isDecoderUnavailable through answers it right.
 */
const failures = vi.hoisted(() => ({
  next: null as Error | null,
  open: null as Error | null,
  writeFile: null as Error | null,
  close: null as Error | null,
  closedHandles: 0,
  // Which output read fails: heif-dec's single-image name, the -1 fallback, or heif-enc's .heic output.
  pattern: /heic-out-(?![^/\\]*-1\.png$)[^/\\]*\.(?:png|heic)$/,
  kill: null as Record<string, unknown> | null,
  probe: null as Record<string, unknown> | null,
  probed: [] as string[],
  readResult: null as Buffer | null,
  metadataError: null as Error | null,
  toBufferError: null as Error | null,
}));

vi.mock("sharp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sharp")>();
  const realSharp = actual.default;
  const wrapped = ((input?: unknown, options?: unknown) => {
    const instance = realSharp(input as Parameters<typeof realSharp>[0], options as never);
    if (failures.metadataError) {
      const origMetadata = instance.metadata.bind(instance);
      instance.metadata = (async (...args: Parameters<typeof origMetadata>) => {
        if (failures.metadataError) {
          const err = failures.metadataError;
          failures.metadataError = null;
          throw err;
        }
        return origMetadata(...args);
      }) as typeof instance.metadata;
    }
    if (failures.toBufferError) {
      const origToBuffer = instance.toBuffer.bind(instance);
      instance.toBuffer = (async (...args: Parameters<typeof origToBuffer>) => {
        if (failures.toBufferError) {
          const err = failures.toBufferError;
          failures.toBufferError = null;
          throw err;
        }
        return origToBuffer(...args);
      }) as typeof instance.toBuffer;
    }
    return instance;
  }) as typeof realSharp;
  Object.assign(wrapped, realSharp);
  return { ...actual, default: wrapped };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: (async (filePath: unknown, ...rest: unknown[]) => {
      if (failures.open && /heic-in-[^/\\]*\.(?:heic|png)$/.test(String(filePath))) {
        const err = failures.open;
        failures.open = null;
        throw err;
      }
      const handle = (await (actual.open as (...args: unknown[]) => Promise<unknown>)(
        filePath,
        ...rest,
      )) as { writeFile: (...args: unknown[]) => Promise<unknown>; close: () => Promise<unknown> };
      if (
        (failures.writeFile || failures.close) &&
        /heic-in-[^/\\]*\.(?:heic|png)$/.test(String(filePath))
      ) {
        const writeErr = failures.writeFile;
        const closeErr = failures.close;
        failures.writeFile = null;
        failures.close = null;
        const origClose = handle.close.bind(handle);
        if (writeErr) {
          handle.writeFile = async () => {
            throw writeErr;
          };
        }
        handle.close = async () => {
          failures.closedHandles += 1;
          await origClose().catch(() => {});
          if (closeErr) throw closeErr;
        };
      }
      return handle;
    }) as typeof actual.open,
    readFile: (async (path: unknown, ...rest: unknown[]) => {
      if (failures.next && failures.pattern.test(String(path))) {
        const err = failures.next;
        failures.next = null;
        throw err;
      }
      if (failures.readResult && failures.pattern.test(String(path))) {
        const buf = failures.readResult;
        failures.readResult = null;
        return buf;
      }
      return (actual.readFile as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readFile,
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(actual.execFile) as (...args: unknown[]) => Promise<unknown>;
  // decodeHeic calls promisify(execFile), which uses this custom form, so only
  // it needs overriding. Only the decode itself fails, not the decoder probe,
  // and only once.
  const execFile = Object.assign((...args: unknown[]) => actual.execFile(...(args as [string])), {
    [promisify.custom]: (file: string, argv: string[], options?: unknown) => {
      if (argv.includes("--version")) {
        failures.probed.push(file);
        if (failures.probe) {
          const fields = failures.probe;
          failures.probe = null;
          return Promise.reject(
            Object.assign(new Error(`Command failed: ${file} --version`), fields),
          );
        }
      }
      if (failures.kill && argv.some((arg) => /heic-in-[^/\\]*\.(?:heic|png)$/.test(arg))) {
        const fields = failures.kill;
        failures.kill = null;
        const cmdName = file === "heif-enc" ? "heif-enc" : "heif-dec";
        return Promise.reject(Object.assign(new Error(`Command failed: ${cmdName}`), fields));
      }
      if (file === "heif-enc" && failures.next) {
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      return execFileAsync(file, argv, options);
    },
  });
  return { ...actual, execFile };
});

const { decodeHeic, encodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");
const { isDecoderUnavailable } = await import("../../../apps/api/src/lib/format-decoders.js");

const SINGLE = /heic-out-(?![^/\\]*-1\.png$)[^/\\]*\.(?:png|heic)$/;
const SUFFIXED = /heic-out-[^/\\]*-1\.png$/;

afterEach(() => {
  failures.next = null;
  failures.open = null;
  failures.writeFile = null;
  failures.close = null;
  failures.closedHandles = 0;
  failures.pattern = SINGLE;
  failures.kill = null;
  failures.probe = null;
  failures.probed = [];
  failures.readResult = null;
  failures.metadataError = null;
  failures.toBufferError = null;
});

async function decodeError(
  buffer: Buffer,
  options?: Parameters<typeof decodeHeic>[1],
): Promise<Error & { cause?: unknown }> {
  try {
    await decodeHeic(buffer, options);
  } catch (err) {
    return err as Error & { cause?: unknown };
  }
  throw new Error("decodeHeic resolved");
}

async function encodeError(buffer: Buffer, quality?: number): Promise<Error & { cause?: unknown }> {
  try {
    await encodeHeic(buffer, quality);
  } catch (err) {
    return err as Error & { cause?: unknown };
  }
  throw new Error("encodeHeic resolved");
}

function makeHeicHeaderWithoutIspe(): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeUInt32BE(16, 0);
  buf.write("ftyp", 4, 4, "ascii");
  buf.write("heic", 8, 4, "ascii");
  return buf;
}

describe("findDecodeCmd probe fault handling (#2883)", () => {
  // Runs before the decode tests below so cachedDecodeCmd is still null and
  // findDecodeCmd actually executes its `--version` probe (#2883).
  it("surfaces a killed heif-convert --version probe as a 503 DecoderOutOfMemoryError instead of probing heif-dec", async () => {
    failures.probe = { code: null, signal: "SIGKILL", stderr: "" };
    const err = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect((err.cause as { signal?: string } | undefined)?.signal).toBe("SIGKILL");
    expect(failures.probed).toEqual(["heif-convert"]);
  });

  it("surfaces a heif-convert --version probe hitting a thread limit as a 503 DecoderOutOfMemoryError", async () => {
    failures.probe = {
      code: null,
      signal: "SIGABRT",
      stderr:
        "terminate called after throwing an instance of 'std::system_error'\n  what():  Resource temporarily unavailable\n",
    };
    const err = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.message).toContain("thread or process limit");
    expect(failures.probed).toEqual(["heif-convert"]);
  });

  it("still surfaces a killed heif-convert --version probe as a 503 DecoderOutOfMemoryError when Sharp already rejected a corrupt mif1 AV1 container (#2895)", async () => {
    const corruptMif1Av1 = Buffer.from(readFixture(fixtures.image.formats("avif")));
    const ftypSize = corruptMif1Av1.readUInt32BE(0);
    corruptMif1Av1.write("mif1", 8, 4, "ascii");
    for (
      let offset = 16;
      offset + 4 <= ftypSize && offset + 4 <= corruptMif1Av1.length;
      offset += 4
    ) {
      if (corruptMif1Av1.subarray(offset, offset + 4).toString("ascii") === "avif") {
        corruptMif1Av1.write("mif1", offset, 4, "ascii");
      }
    }
    corruptMif1Av1.fill(0xff, corruptMif1Av1.length - 200);

    failures.probe = { code: null, signal: "SIGKILL", stderr: "" };
    const err = await decodeError(corruptMif1Av1);
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect((err.cause as { signal?: string } | undefined)?.signal).toBe("SIGKILL");
    expect(failures.probed).toEqual(["heif-convert"]);
  });
});

describe("verifyDecodedImageLimits and metadata preflight fault handling (#2883)", () => {
  it("keeps Sharp's error in verifyDecodedImageLimits when the decoded PNG is corrupt", async () => {
    failures.readResult = Buffer.from("not a valid png");
    const err = await decodeError(readFixture(fixtures.image.formats("heic")), {
      maxPixels: 10_000_000,
    });
    expect(isDecoderUnavailable(err)).toBe(false);
    expect(err.message).not.toMatch(/configured image safety limits/);
    expect(err.message).toMatch(/unsupported image format|VipsPng/i);
  });

  it("surfaces a V8 buffer allocation RangeError in verifyDecodedImageLimits as a 503 DecoderOutOfMemoryError", async () => {
    const heic = readFixture(fixtures.image.formats("heic"));
    // Trigger metadataError on the post-decode verifyDecodedImageLimits call (when input has an ispe box, preflight metadata() is skipped).
    const oom = new RangeError("Array buffer allocation failed");
    failures.metadataError = oom;
    const err = await decodeError(heic, { maxPixels: 10_000_000 });
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.cause).toBe(oom);
  });

  it("surfaces a libheif allocation failure in decodeHeic's metadata preflight as a 503 DecoderOutOfMemoryError", async () => {
    const libheifOom = new Error(
      "heif: Memory allocation error: Unspecified: Allocating 4147215 bytes failed (4.1000)",
    );
    failures.metadataError = libheifOom;
    const err = await decodeError(makeHeicHeaderWithoutIspe(), { maxPixels: 1_000_000 });
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.cause).toBe(libheifOom);
  });

  it("surfaces a V8 RangeError in decodeHeic's metadata preflight as a 503 DecoderOutOfMemoryError", async () => {
    const v8Oom = new RangeError("Array buffer allocation failed");
    failures.metadataError = v8Oom;
    const err = await decodeError(makeHeicHeaderWithoutIspe(), { maxPixels: 1_000_000 });
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.cause).toBe(v8Oom);
  });

  it("surfaces an in-process Sharp libheif allocation failure or V8 RangeError during decodeHeic's direct decode attempt as a 503 DecoderOutOfMemoryError without falling back to the CLI (#3837)", async () => {
    const heic = readFixture(fixtures.image.formats("heic"));
    for (const oomErr of [
      new Error("heif: Memory allocation error: Unspecified: Allocating 4147215 bytes failed"),
      new RangeError("Array buffer allocation failed"),
    ]) {
      failures.toBufferError = oomErr;
      failures.open = new Error("should not reach CLI temp file open");
      const err = await decodeError(heic, { maxPixels: 10_000_000 });
      expect(isDecoderUnavailable(err)).toBe(true);
      expect(err.name).toBe("DecoderOutOfMemoryError");
      expect(err.cause).toBe(oomErr);
    }
  });

  it("rethrows a pixel safety limit error from decodeHeic's metadata preflight directly", async () => {
    failures.metadataError = new Error("Input image exceeds pixel limit");
    const err = await decodeError(makeHeicHeaderWithoutIspe(), { maxPixels: 50_000 });
    expect(isDecoderUnavailable(err)).toBe(false);
    expect(err.message).toBe("Input image exceeds pixel limit");
  });

  it("still runs metadata preflight when an ispe box has 0x0 dimensions (#2896)", async () => {
    const zeroIspe = Buffer.alloc(20);
    zeroIspe.writeUInt32BE(20, 0);
    zeroIspe.write("ispe", 4, 4, "ascii");
    failures.metadataError = new Error("Input image exceeds pixel limit");
    const err = await decodeError(Buffer.concat([makeHeicHeaderWithoutIspe(), zeroIspe]), {
      maxPixels: 50_000,
    });
    expect(isDecoderUnavailable(err)).toBe(false);
    expect(err.message).toBe("Input image exceeds pixel limit");
  });

  it("attaches Sharp's metadata error as cause when encoded dimensions are unavailable", async () => {
    const err = await decodeError(makeHeicHeaderWithoutIspe(), { maxPixels: 1_000_000 });
    expect(isDecoderUnavailable(err)).toBe(false);
    expect(err.message).toBe("Cannot safely decode HEIF: encoded dimensions are unavailable");
    expect(err.cause).toBeInstanceOf(Error);
  });

  it("still enforces limitInputPixels and maxDimension in verifyDecodedImageLimits when decoded output exceeds them", async () => {
    const heic200 = readFixture(fixtures.image.base.heic200);
    const largePng = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    failures.readResult = largePng;
    const pixelErr = await decodeError(heic200, { maxPixels: 50_000 });
    expect(isDecoderUnavailable(pixelErr)).toBe(false);
    expect(pixelErr.message).toMatch(/input image exceeds pixel limit/i);

    failures.readResult = largePng;
    const dimErr = await decodeError(heic200, { maxDimension: 250, maxPixels: 500_000 });
    expect(isDecoderUnavailable(dimErr)).toBe(false);
    expect(dimErr.message).toMatch(/pixel dimension safety limit.*400x300/i);
  });
});

describe("decodeHeic reading its output", () => {
  it("answers V8 failing to allocate the output as a 503, not a bad file (#1577)", async () => {
    const outOfMemory = new RangeError("Array buffer allocation failed");
    failures.next = outOfMemory;
    const err = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(isDecoderUnavailable(err)).toBe(true);
    // Its own name, so reporting can tell it from a missing decoder (#1628).
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.cause).toBe(outOfMemory);
    expect(err.message).not.toMatch(/libheif|install/i);
  });

  it("does the same when the multi-image fallback read runs out of memory", async () => {
    const outOfMemory = new RangeError("Array buffer allocation failed");
    failures.pattern = SUFFIXED;
    failures.next = outOfMemory;
    const multi = readFixture(path.join(fixtureDir.image.edge, "multi-image-2.heic"));
    const err = await decodeError(multi);
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.cause).toBe(outOfMemory);
  });

  it("leaves a RangeError that isn't an allocation failure alone", async () => {
    // readFile's own limit on a >2 GiB output. Not the server running out of
    // memory, so it isn't reported as one.
    const tooLarge = Object.assign(new RangeError("File size is greater than 2 GiB"), {
      code: "ERR_FS_FILE_TOO_LARGE",
    });
    failures.next = tooLarge;
    const err = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(err).toBe(tooLarge);
    expect(isDecoderUnavailable(err)).toBe(false);
  });

  it("surfaces any other read failure unchanged, without the fallback's ENOENT", async () => {
    const eio = Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" });
    failures.next = eio;
    const err = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(err).toBe(eio);
    expect(isDecoderUnavailable(err)).toBe(false);
  });

  it("still decodes normally when nothing fails", async () => {
    const png = await decodeHeic(readFixture(fixtures.image.formats("heic")));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });

  it("falls back to the first image of a multi-image HEIF", async () => {
    // heif-dec writes <name>-1.png, <name>-2.png for these and no <name>.png,
    // so the first read is an ENOENT: the one case the fallback is for.
    const multi = readFixture(path.join(fixtureDir.image.edge, "multi-image-2.heic"));
    const png = await decodeHeic(multi);
    const meta = await sharp(png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 64, 48]);
  });
});

describe("decodeHeic when heif-dec is killed", () => {
  it("answers a SIGKILL, the kernel OOM killer's signal, as a 503 (#1577)", async () => {
    failures.kill = { killed: false, code: null, signal: "SIGKILL" };
    const err = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect((err.cause as { signal?: string }).signal).toBe("SIGKILL");
  });

  it("keeps its own timeout out of the 503, since that SIGTERM is often a hostile file", async () => {
    failures.kill = { killed: true, code: null, signal: "SIGTERM" };
    const err = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(isDecoderUnavailable(err)).toBe(false);
    expect((err as { signal?: string }).signal).toBe("SIGTERM");
  });
});

/**
 * #1629. Under a memory rlimit or a cgroup that fails malloc instead of
 * killing the process, heif-dec reports the failure itself. The stderr in the
 * 503 cases is what libheif 1.23 printed in the shipped image under
 * `ulimit -v`. libheif files its security limits under the same "Memory
 * allocation error" heading, and those are the file's fault, so they stay a
 * 422. Each 422 case checks the injected error comes back untouched, so a
 * decoder probe that failed first can't pass it.
 */
describe("decodeHeic when libheif runs out of memory", () => {
  const heic = () => readFixture(fixtures.image.formats("heic"));

  async function passedThrough(fields: Record<string, unknown>): Promise<void> {
    failures.kill = fields;
    const err = await decodeError(heic());
    expect(isDecoderUnavailable(err)).toBe(false);
    expect(err.message).toBe("Command failed: heif-dec");
    expect((err as { stderr?: unknown }).stderr).toBe(fields.stderr);
  }

  it("answers libheif failing to allocate as a 503", async () => {
    failures.kill = {
      code: 1,
      signal: null,
      stderr:
        "Could not decode image: Memory allocation error: Unspecified: Allocating 4147215 bytes failed\n",
    };
    const err = await decodeError(heic());
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.message).toContain("ran out of memory");
  });

  it("answers heif-dec aborting when it can't start a decoder thread as a 503 naming the limits", async () => {
    failures.kill = {
      code: null,
      signal: "SIGABRT",
      stderr:
        "terminate called after throwing an instance of 'std::system_error'\n  what():  Resource temporarily unavailable\n",
    };
    const err = await decodeError(heic());
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.message).toContain("thread or process limit");
  });

  it("keeps a security limit, which is the file's fault, out of the 503", async () => {
    await passedThrough({
      code: 1,
      signal: null,
      stderr:
        "Could not decode image: Memory allocation error: Security limit exceeded: Allocating an image of size 90000x90000 exceeds the security limit of 1073741824 pixels\n",
    });
    await passedThrough({
      code: 1,
      signal: null,
      stderr:
        "Could not decode image: Memory allocation error: Security limit exceeded: Allocating 2147483648 bytes exceeds the security limit of 536870912 bytes\n",
    });
  });

  it("keeps a decoder error that a corrupt file also produces out of the 503", async () => {
    await passedThrough({
      code: 1,
      signal: null,
      stderr:
        "Could not decode image: Decoder plugin generated an error: Unspecified: Decoding the input data did not give a decompressed image.\n",
    });
  });

  it("keeps a std::bad_alloc abort out of the 503, since a crafted file can raise it", async () => {
    await passedThrough({
      code: null,
      signal: "SIGABRT",
      stderr:
        "terminate called after throwing an instance of 'std::bad_alloc'\n  what():  std::bad_alloc\n",
    });
  });

  it("keeps any other abort, or one with no output, out of the 503", async () => {
    await passedThrough({
      code: null,
      signal: "SIGABRT",
      stderr: "heif-dec: libde265/slice.cc:1234: assertion failed\n",
    });
    await passedThrough({ code: null, signal: "SIGABRT", stderr: "" });
  });

  it("only reads the thread failure as a limit when heif-dec actually aborted", async () => {
    await passedThrough({
      code: 1,
      signal: null,
      stderr: "what():  Resource temporarily unavailable\n",
    });
  });
});

describe("writeTempExclusive operational write errors in decodeHeic and encodeHeic (#2800)", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["ENOSPC", "storage-full"],
    ["EDQUOT", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EPERM", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ];

  it.each(cases)(
    "normalizes %s from writeTempExclusive in decodeHeic and encodeHeic into a 503 %s SafeError",
    async (errno, expectedCode) => {
      const fsErr = Object.assign(new Error(`${errno}: open temp file`), {
        code: errno,
        syscall: "open",
      });
      failures.open = fsErr;
      const decodeErr = await decodeError(readFixture(fixtures.image.formats("heic")));
      expect(decodeErr).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        statusCode: 503,
        code: expectedCode,
        cause: fsErr,
      });

      failures.open = fsErr;
      const encodeErr = await encodeHeic(readFixture(fixtures.image.base.png200)).catch(
        (e: unknown) => e,
      );
      expect(encodeErr).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        statusCode: 503,
        code: expectedCode,
        cause: fsErr,
      });
    },
  );

  it("closes the file handle and normalizes ENOSPC when fh.writeFile fails after open succeeds", async () => {
    const writeErr = Object.assign(new Error("ENOSPC: no space left on device, write"), {
      code: "ENOSPC",
      syscall: "write",
    });
    failures.writeFile = writeErr;
    const decodeErr = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(decodeErr).toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "storage-full",
      cause: writeErr,
    });
    expect(failures.closedHandles).toBe(1);
  });

  it("preserves a primary fh.writeFile fault when fh.close also rejects, and surfaces fh.close faults when fh.writeFile succeeds in decodeHeic and encodeHeic (#3649)", async () => {
    const writeErr = Object.assign(new Error("ENOSPC: no space left on device, write"), {
      code: "ENOSPC",
      syscall: "write",
    });
    const closeErr = Object.assign(new Error("EIO: close failed"), {
      code: "EIO",
      syscall: "close",
    });

    failures.writeFile = writeErr;
    failures.close = closeErr;
    const decodeErr = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(decodeErr).toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "storage-full",
      cause: writeErr,
    });
    expect(failures.closedHandles).toBe(1);

    failures.writeFile = writeErr;
    failures.close = closeErr;
    const encodeErr = await encodeHeic(readFixture(fixtures.image.base.png200)).catch(
      (e: unknown) => e,
    );
    expect(encodeErr).toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "storage-full",
      cause: writeErr,
    });
    expect(failures.closedHandles).toBe(2);

    const closeEnospc = Object.assign(new Error("ENOSPC: close flush failed"), {
      code: "ENOSPC",
      syscall: "close",
    });
    failures.close = closeEnospc;
    const decodeCloseErr = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(decodeCloseErr).toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "storage-full",
      cause: closeEnospc,
    });
    expect(failures.closedHandles).toBe(3);

    failures.close = closeEnospc;
    const encodeCloseErr = await encodeHeic(readFixture(fixtures.image.base.png200)).catch(
      (e: unknown) => e,
    );
    expect(encodeCloseErr).toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "storage-full",
      cause: closeEnospc,
    });
    expect(failures.closedHandles).toBe(4);
  });

  it("surfaces a V8 buffer allocation RangeError from writeTempExclusive in decodeHeic, encodeHeic, and ImageInputHandler.prepare as a 503 DecoderOutOfMemoryError (#3741)", async () => {
    const v8Oom = new RangeError("Array buffer allocation failed");
    failures.writeFile = v8Oom;
    const decodeErr = await decodeError(readFixture(fixtures.image.formats("heic")));
    expect(isDecoderUnavailable(decodeErr)).toBe(true);
    expect(decodeErr.name).toBe("DecoderOutOfMemoryError");
    expect(decodeErr.cause).toBe(v8Oom);
    expect(failures.closedHandles).toBe(1);

    failures.writeFile = v8Oom;
    const encodeErr = (await encodeHeic(readFixture(fixtures.image.base.png200)).catch(
      (e: unknown) => e,
    )) as Error & { cause?: unknown };
    expect(isDecoderUnavailable(encodeErr)).toBe(true);
    expect(encodeErr.name).toBe("DecoderOutOfMemoryError");
    expect(encodeErr.cause).toBe(v8Oom);
    expect(failures.closedHandles).toBe(2);

    const { ImageInputHandler } = await import("../../../apps/api/src/modality/image-input.js");
    failures.writeFile = v8Oom;
    const prepareErr = await new ImageInputHandler()
      .prepare(readFixture(fixtures.image.formats("heic")), "photo.heic", {
        scratchDir: "/tmp/in",
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
      })
      .then(
        (res) =>
          new Error(
            `Expected prepare() to reject, but resolved (${res.filename}, ${res.buffer.length} bytes)`,
          ),
        (e: unknown) => e,
      );
    expect(prepareErr).toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: expect.objectContaining({
        name: "DecoderOutOfMemoryError",
        cause: v8Oom,
      }),
    });
    expect(failures.closedHandles).toBe(3);
  });
});

describe("encodeHeic heif-enc and output readFile fault classification (#3784)", () => {
  const png = () => readFixture(fixtures.image.base.png200);

  it("surfaces a SIGKILL from heif-enc as a 503 DecoderOutOfMemoryError", async () => {
    failures.kill = { killed: false, code: null, signal: "SIGKILL", stderr: "" };
    const err = await encodeError(png());
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect((err.cause as { signal?: string } | undefined)?.signal).toBe("SIGKILL");
  });

  it("surfaces a thread-creation SIGABRT or libheif allocation failure from heif-enc as a 503 DecoderOutOfMemoryError", async () => {
    failures.kill = {
      code: null,
      signal: "SIGABRT",
      stderr:
        "terminate called after throwing an instance of 'std::system_error'\n  what():  Resource temporarily unavailable\n",
    };
    const threadErr = await encodeError(png());
    expect(isDecoderUnavailable(threadErr)).toBe(true);
    expect(threadErr.name).toBe("DecoderOutOfMemoryError");
    expect(threadErr.message).toContain("thread or process limit");

    failures.kill = {
      code: 1,
      signal: null,
      stderr:
        "Could not encode image: Memory allocation error: Unspecified: Allocating 4147215 bytes failed\n",
    };
    const allocErr = await encodeError(png());
    expect(isDecoderUnavailable(allocErr)).toBe(true);
    expect(allocErr.name).toBe("DecoderOutOfMemoryError");
    expect(allocErr.message).toContain("ran out of memory");
  });

  it("surfaces exit 127 or a missing codec plugin from heif-enc as a 503 DecoderUnavailableError", async () => {
    failures.kill = {
      code: 127,
      signal: null,
      stderr: "heif-enc: error while loading shared libraries\n",
    };
    const exit127Err = await encodeError(png());
    expect(isDecoderUnavailable(exit127Err)).toBe(true);
    expect(exit127Err.name).toBe("DecoderUnavailableError");

    failures.kill = {
      code: 1,
      signal: null,
      stderr: "Cannot encode image: Unsupported feature: Unsupported codec\n",
    };
    const pluginErr = await encodeError(png());
    expect(isDecoderUnavailable(pluginErr)).toBe(true);
    expect(pluginErr.name).toBe("DecoderUnavailableError");
  });

  it("surfaces a V8 buffer allocation RangeError when reading heif-enc's output as a 503 DecoderOutOfMemoryError", async () => {
    const outOfMemory = new RangeError("Array buffer allocation failed");
    failures.next = outOfMemory;
    const err = await encodeError(png());
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.cause).toBe(outOfMemory);
  });

  it("leaves non-OOM heif-enc and readFile failures untouched so withImageEncodeContext still reports genuine encode bugs", async () => {
    failures.kill = { killed: true, code: null, signal: "SIGTERM", stderr: "" };
    const timeoutErr = await encodeError(png());
    expect(isDecoderUnavailable(timeoutErr)).toBe(false);
    expect((timeoutErr as { signal?: string }).signal).toBe("SIGTERM");

    const eio = Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" });
    failures.next = eio;
    const readErr = await encodeError(png());
    expect(readErr).toBe(eio);
    expect(isDecoderUnavailable(readErr)).toBe(false);
  });

  it("passes 503 ENGINE_UNAVAILABLE through withImageEncodeContext instead of wrapping as a bug SafeError", async () => {
    const { withImageEncodeContext } = await import("../../../apps/api/src/lib/image-error.js");
    const wrapped = withImageEncodeContext(
      "Image conversion failed",
      (s: { format: string }) => s.format,
      async (inputBuffer) => ({
        buffer: await encodeHeic(inputBuffer),
        filename: "out.heic",
        contentType: "image/heic",
      }),
    );

    failures.kill = { killed: false, code: null, signal: "SIGKILL", stderr: "" };
    const sigkillErr = await wrapped(png(), { format: "heic" }, "in.png").catch((e: unknown) => e);
    expect(sigkillErr).toMatchObject({
      name: "DecoderOutOfMemoryError",
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
    });

    const v8Oom = new RangeError("Array buffer allocation failed");
    failures.next = v8Oom;
    const readOomErr = await wrapped(png(), { format: "heic" }, "in.png").catch((e: unknown) => e);
    expect(readOomErr).toMatchObject({
      name: "DecoderOutOfMemoryError",
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: v8Oom,
    });
  });
});
