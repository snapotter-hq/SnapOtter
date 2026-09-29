import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureDir, fixtures, readFixture } from "../../fixtures/index.js";

/**
 * #1533. decodeHeic reads heif-dec's output back with a fallback to the
 * multi-image `-1.png` name. The fallback caught every error, so a read that
 * failed for another reason (V8 unable to allocate the buffer) was replaced by
 * an ENOENT for a file that never existed.
 */
const failures = vi.hoisted(() => ({ next: null as Error | null }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: (async (path: unknown, ...rest: unknown[]) => {
      // Only heif-dec's single-image output, and only once.
      if (failures.next && /heic-out-[^/\\]*\.png$/.test(String(path))) {
        const err = failures.next;
        failures.next = null;
        throw err;
      }
      return (actual.readFile as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readFile,
  };
});

const { decodeHeic } = await import("../../../apps/api/src/lib/heic-converter.js");

afterEach(() => {
  failures.next = null;
});

describe("decodeHeic reading its output", () => {
  it("surfaces a read failure that isn't a missing file", async () => {
    failures.next = new RangeError("Array buffer allocation failed");
    await expect(decodeHeic(readFixture(fixtures.image.formats("heic")))).rejects.toThrow(
      "Array buffer allocation failed",
    );
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
