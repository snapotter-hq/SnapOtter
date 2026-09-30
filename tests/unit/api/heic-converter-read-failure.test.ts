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
  // Which output read fails: heif-dec's single-image name or the -1 fallback.
  pattern: /heic-out-(?![^/\\]*-1\.png$)[^/\\]*\.png$/,
  kill: null as Record<string, unknown> | null,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (async (path: unknown, ...rest: unknown[]) => {
      if (failures.next && failures.pattern.test(String(path))) {
        const err = failures.next;
        failures.next = null;
        throw err;
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
      if (failures.kill && argv.some((arg) => /heic-in-[^/\\]*\.heic$/.test(arg))) {
        const fields = failures.kill;
        failures.kill = null;
        return Promise.reject(Object.assign(new Error("Command failed: heif-dec"), fields));
      }
      return execFileAsync(file, argv, options);
    },
  });
  return { ...actual, execFile };
});

const { decodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");
const { isDecoderUnavailable } = await import("../../../apps/api/src/lib/format-decoders.js");

const SINGLE = /heic-out-(?![^/\\]*-1\.png$)[^/\\]*\.png$/;
const SUFFIXED = /heic-out-[^/\\]*-1\.png$/;

afterEach(() => {
  failures.next = null;
  failures.pattern = SINGLE;
  failures.kill = null;
});

async function decodeError(buffer: Buffer): Promise<Error & { cause?: unknown }> {
  try {
    await decodeHeic(buffer);
  } catch (err) {
    return err as Error & { cause?: unknown };
  }
  throw new Error("decodeHeic resolved");
}

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
