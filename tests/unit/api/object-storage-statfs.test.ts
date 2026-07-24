// Covers assertLocalCapacity's statfs free-space floor in object-storage.ts
// (source L155-166), which the workspace-cap suite leaves as no-cov because it
// only exercises the aggregate-size branch. statfs cannot be spied in ESM (its
// namespace is non-configurable), so this file mocks node:fs/promises, spreading
// the real module and overriding only statfs. The aggregate cap is disabled here
// (MAX_WORKSPACE_SIZE_GB=0), so assertWorkspaceSizeCap returns before touching
// any other fs/promises call and the spread keeps real behavior everywhere else.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const statfsMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, statfs: statfsMock };
});

import { env } from "../../../apps/api/src/config.js";
import {
  assertLocalCapacity,
  CAPACITY_CRITICAL_GB,
} from "../../../apps/api/src/lib/object-storage.js";

describe("assertLocalCapacity free-space floor (statfs)", () => {
  const originalWorkspace = env.WORKSPACE_PATH;
  const originalMaxGb = env.MAX_WORKSPACE_SIZE_GB;
  let root = "";
  // Each test picks a base timestamp far past any prior so the 30s workspace-size
  // cache never serves a stale total; the cap is off anyway, but keep it clean.
  let nowBase = 3_000_000_000_000;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "snapotter-statfs-floor-"));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0;
    statfsMock.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(nowBase);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = originalWorkspace;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = originalMaxGb;
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
    nowBase += 10 * 60_000;
  });

  it("throws 503 when free space (bavail*bsize) is just under the 0.5 GiB floor", async () => {
    // One byte under the floor: exercises freeBytes computation and the strict <.
    const floorBytes = CAPACITY_CRITICAL_GB * 1024 ** 3;
    statfsMock.mockResolvedValue({ bavail: floorBytes - 1, bsize: 1 });

    await expect(assertLocalCapacity()).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/disk space/i),
    });
  });

  it("passes when free space sits exactly at the floor (boundary is NOT below)", async () => {
    const floorBytes = CAPACITY_CRITICAL_GB * 1024 ** 3;
    statfsMock.mockResolvedValue({ bavail: floorBytes, bsize: 1 });

    await expect(assertLocalCapacity()).resolves.toBeUndefined();
  });

  it("multiplies bavail by bsize (product, not either factor alone)", async () => {
    // Neither factor alone clears the floor, but their product (2 GiB) does. A
    // mutation of `*` to a single operand or `+` would drop below and 503.
    statfsMock.mockResolvedValue({ bavail: 4 * 1024 * 1024, bsize: 512 });

    await expect(assertLocalCapacity()).resolves.toBeUndefined();
    expect(statfsMock).toHaveBeenCalledWith(root);
  });

  it("allows the write when statfs itself rejects (unavailable on the platform)", async () => {
    statfsMock.mockRejectedValue(Object.assign(new Error("ENOSYS"), { code: "ENOSYS" }));

    await expect(assertLocalCapacity()).resolves.toBeUndefined();
  });
});
