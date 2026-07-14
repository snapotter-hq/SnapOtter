import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withRouteScratch } from "../../../apps/api/src/lib/route-scratch.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("withRouteScratch", () => {
  it("removes the complete scratch root after a successful operation", async () => {
    let root = "";

    const result = await withRouteScratch("unit-success", async (path) => {
      root = path;
      roots.push(path);
      expect(dirname(path)).toBe(join(tmpdir(), "snapotter-scratch"));
      expect(basename(path)).toMatch(/^unit-success-/);
      await mkdir(join(path, "nested"));
      await writeFile(join(path, "nested", "temporary.bin"), "temporary");
      return 42;
    });

    expect(result).toBe(42);
    expect(existsSync(root)).toBe(false);
  });

  it("removes the complete scratch root when the operation throws", async () => {
    let root = "";

    await expect(
      withRouteScratch("unit-error", async (path) => {
        root = path;
        roots.push(path);
        await writeFile(join(path, "temporary.bin"), "temporary");
        throw new Error("input rejected");
      }),
    ).rejects.toThrow("input rejected");

    expect(existsSync(root)).toBe(false);
  });

  it("rejects path components instead of deriving roots from client-controlled IDs", async () => {
    await expect(withRouteScratch("../../victim", async () => undefined)).rejects.toThrow(
      "scratch prefix",
    );
  });
});
