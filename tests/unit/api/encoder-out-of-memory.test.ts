import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #5263. Under SUBPROCESS_MEMORY_LIMIT_MB, a cjxl or heif-enc that runs out of
 * address space failed the request as a generic error instead of the 503 out of
 * memory answer a capped decoder gets. The stderr is what the shipped 2.3.0
 * image printed for a 24 MP encode under `ulimit -v` (512 and 1024 MB).
 */
const spawn = vi.hoisted(() => ({
  failures: {} as Record<string, Record<string, unknown>>,
  spawned: [] as string[],
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  const execFile = Object.assign((...args: unknown[]) => actual.execFile(...(args as [string])), {
    [promisify.custom]: async (file: string, argv: string[]) => {
      const binary = String(file).split(/[/\\]/).pop() as string;
      if (argv.includes("--version")) return { stdout: "Version: ImageMagick 7", stderr: "" };
      spawn.spawned.push(binary);
      const fields = spawn.failures[binary];
      if (fields) throw Object.assign(new Error(`Command failed: ${binary}`), fields);
      throw new Error(`unexpected spawn of ${binary} in this test`);
    },
  });
  return { ...actual, execFile };
});

const { asDecoderOutOfMemory, asEncoderOutOfMemory, isDecoderUnavailable } = await import(
  "../../../apps/api/src/lib/format-decoders.js"
);
const { encodeJxl } = await import("../../../apps/api/src/lib/format-encoders.js");
const { encodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");

afterEach(() => {
  spawn.failures = {};
  spawn.spawned = [];
});

const HEIF_ENC_BAD_ALLOC = {
  code: null,
  signal: "SIGABRT",
  stderr:
    "terminate called after throwing an instance of 'std::bad_alloc'\n  what():  std::bad_alloc\n",
};
const X265_MALLOC = {
  code: 1,
  signal: null,
  stderr:
    "x265 [error]: malloc of size 52047872 failed\nx265 [error]: memory allocation failure, aborting encode\n",
};
const CJXL_ALLOCATION = {
  code: null,
  signal: "SIGILL",
  stderr: "./lib/jxl/image.cc:94: JXL_CHECK: bytes_.get()\n",
};

function failure(fields: Record<string, unknown>): Error {
  return Object.assign(new Error("Command failed: encoder"), fields);
}

async function rejection(promise: Promise<unknown>): Promise<Error & { cause?: unknown }> {
  try {
    await promise;
  } catch (err) {
    return err as Error & { cause?: unknown };
  }
  throw new Error("encode resolved");
}

const png = await sharp({
  create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
})
  .png()
  .toBuffer();

describe("asEncoderOutOfMemory", () => {
  it.each([
    ["heif-enc's std::bad_alloc abort", HEIF_ENC_BAD_ALLOC],
    ["x265's memory allocation failure", X265_MALLOC],
    ["libjxl's allocation check firing", CJXL_ALLOCATION],
  ])("answers %s as running out of memory", (_name, fields) => {
    const raw = failure(fields);
    const err = asEncoderOutOfMemory(raw) as Error;
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.message).toContain("encoder ran out of memory");
    expect(err.cause).toBe(raw);
  });

  it("reads Buffer stderr", () => {
    const err = asEncoderOutOfMemory(
      failure({ ...X265_MALLOC, stderr: Buffer.from(X265_MALLOC.stderr, "utf8") }),
    ) as Error;
    expect(err.name).toBe("DecoderOutOfMemoryError");
  });

  it("still answers the decoder shapes, keeping their own message", () => {
    const err = asEncoderOutOfMemory(
      failure({ code: null, signal: "SIGKILL", stderr: "" }),
    ) as Error;
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(err.message).toContain("decoder ran out of memory");
  });

  it.each([
    ["std::bad_alloc without an abort", { ...HEIF_ENC_BAD_ALLOC, signal: null, code: 1 }],
    [
      "a different libjxl check under SIGILL",
      { ...CJXL_ALLOCATION, stderr: "JXL_CHECK: xsize == xsize_\n" },
    ],
    ["the libjxl allocation check without SIGILL", { ...CJXL_ALLOCATION, signal: null, code: 1 }],
    ["our own timeout's SIGTERM", { killed: true, code: null, signal: "SIGTERM", stderr: "" }],
    ["an ordinary encoder error", { code: 1, signal: null, stderr: "Error: invalid input\n" }],
  ])("leaves %s alone", (_name, fields) => {
    const err = failure(fields);
    expect(asEncoderOutOfMemory(err)).toBe(err);
  });

  it("leaves the decoder rule alone: an upload's std::bad_alloc is still the file's", () => {
    const err = failure(HEIF_ENC_BAD_ALLOC);
    expect(asDecoderOutOfMemory(err)).toBe(err);
  });
});

describe("encoders under SUBPROCESS_MEMORY_LIMIT_MB (#5263)", () => {
  it.each([
    ["std::bad_alloc", HEIF_ENC_BAD_ALLOC],
    ["x265's allocation failure", X265_MALLOC],
  ])("answers heif-enc's %s as a 503", async (_name, fields) => {
    spawn.failures["heif-enc"] = fields;
    const err = await rejection(encodeHeic(png));
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(spawn.spawned).toEqual(["heif-enc"]);
  });

  it("answers cjxl's allocation failure as a 503 without falling back to ImageMagick", async () => {
    spawn.failures.cjxl = CJXL_ALLOCATION;
    const err = await rejection(encodeJxl(png, 75));
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(spawn.spawned).toEqual(["cjxl"]);
  });

  it("answers a std::bad_alloc abort from cjxl as a 503 without falling back", async () => {
    spawn.failures.cjxl = HEIF_ENC_BAD_ALLOC;
    const err = await rejection(encodeJxl(png, 75));
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(spawn.spawned).toEqual(["cjxl"]);
  });

  it("does not fall back to ImageMagick when cjxl is killed", async () => {
    spawn.failures.cjxl = { code: null, signal: "SIGKILL", stderr: "" };
    const err = await rejection(encodeJxl(png, 75));
    expect(err.name).toBe("DecoderOutOfMemoryError");
    expect(spawn.spawned).toEqual(["cjxl"]);
  });

  it("still falls back to ImageMagick when cjxl can't start", async () => {
    spawn.failures.cjxl = { code: "ENOENT", errno: -2, syscall: "spawn cjxl", path: "cjxl" };
    spawn.failures.magick = { code: 1, signal: null, stderr: "magick: some encoder error\n" };
    const err = await rejection(encodeJxl(png, 75));
    expect(err.name).not.toBe("DecoderOutOfMemoryError");
    expect((err as { stderr?: string }).stderr).toContain("magick: some encoder error");
    expect(spawn.spawned).toEqual(["cjxl", "magick"]);
  });
});
