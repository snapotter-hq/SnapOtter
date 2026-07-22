import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeWorkspaceUsedBytes,
  isOverWorkspaceCap,
} from "../../../apps/api/src/lib/object-storage.js";

describe("isOverWorkspaceCap", () => {
  it("is disabled (never over) when maxGb is 0", () => {
    expect(isOverWorkspaceCap(999 * 1024 ** 3, 0)).toBe(false);
  });

  it("is false when usage is under the cap", () => {
    expect(isOverWorkspaceCap(5 * 1024 ** 3, 10)).toBe(false);
  });

  it("is true when usage exceeds the cap", () => {
    expect(isOverWorkspaceCap(11 * 1024 ** 3, 10)).toBe(true);
  });
});

describe("computeWorkspaceUsedBytes", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
  });

  it("sums file sizes across uploads/ and outputs/ job dirs", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-wscap-"));
    await mkdir(join(root, "uploads", "job1"), { recursive: true });
    await mkdir(join(root, "outputs", "job2"), { recursive: true });
    await writeFile(join(root, "uploads", "job1", "a.bin"), Buffer.alloc(1000));
    await writeFile(join(root, "outputs", "job2", "b.bin"), Buffer.alloc(2000));
    expect(await computeWorkspaceUsedBytes(root)).toBe(3000);
  });

  it("returns 0 for an empty or missing workspace", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-wscap-"));
    expect(await computeWorkspaceUsedBytes(root)).toBe(0);
    expect(await computeWorkspaceUsedBytes(join(root, "nope"))).toBe(0);
  });
});
