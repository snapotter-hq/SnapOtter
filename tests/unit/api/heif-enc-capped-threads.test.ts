import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #5266. Under SUBPROCESS_MEMORY_LIMIT_MB, heif-enc ran x265 with one worker
 * pool thread per CPU, and most of the address space a 24 MP encode needed was
 * per-thread reservation. A capped install now pins the pool size; an uncapped
 * one keeps x265's default so it loses no speed.
 */
const spawn = vi.hoisted(() => ({ calls: [] as Array<{ file: string; argv: string[] }> }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  const execFile = Object.assign((...args: unknown[]) => actual.execFile(...(args as [string])), {
    [promisify.custom]: async (file: string, argv: string[]) => {
      spawn.calls.push({ file, argv });
      throw new Error("stop after recording argv");
    },
  });
  return { ...actual, execFile };
});

const { encodeHeic, CAPPED_HEIF_ENC_THREADS } = await import(
  "../../../apps/api/src/lib/heic-converter.js"
);

const png = await sharp({
  create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
})
  .png()
  .toBuffer();

const original = process.env.SUBPROCESS_MEMORY_LIMIT_MB;

beforeEach(() => {
  spawn.calls = [];
});

afterEach(() => {
  if (original === undefined) delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
  else process.env.SUBPROCESS_MEMORY_LIMIT_MB = original;
});

/** The heif-enc argv, whether it was spawned directly or behind the ulimit shim. */
function heifEncArgv(): string[] {
  const call = spawn.calls[0];
  const at = call.argv.indexOf("heif-enc");
  return at === -1 ? call.argv : call.argv.slice(at + 1);
}

describe("encodeHeic thread cap (#5266)", () => {
  it("pins x265's pool size when a memory cap is set", async () => {
    process.env.SUBPROCESS_MEMORY_LIMIT_MB = "1024";
    await encodeHeic(png).catch(() => {});
    expect(spawn.calls[0].file).toBe("/bin/sh");
    const argv = heifEncArgv();
    const at = argv.indexOf("-p");
    expect(at).toBeGreaterThan(-1);
    expect(argv[at + 1]).toBe(`x265:pools=${CAPPED_HEIF_ENC_THREADS}`);
    expect(argv).toContain("-q");
  });

  it.each(["", "0"])("leaves x265's default threads when the cap is %j", async (value) => {
    process.env.SUBPROCESS_MEMORY_LIMIT_MB = value;
    await encodeHeic(png).catch(() => {});
    expect(spawn.calls[0].file).toBe("heif-enc");
    expect(heifEncArgv()).not.toContain("-p");
  });
});
