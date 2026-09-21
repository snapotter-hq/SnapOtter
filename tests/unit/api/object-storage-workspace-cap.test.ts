import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  assertLocalCapacity,
  computeWorkspaceUsedBytes,
  deleteObject,
  isOverWorkspaceCap,
  workspaceHeadroomBytes,
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

// assertLocalCapacity wires the aggregate size cap and the free-space floor to
// the real WORKSPACE_PATH. This file never calls putObject, so the module's
// 30s workspace-size cache starts empty; each test picks a base timestamp far
// past any prior one so its first check recomputes rather than reusing a stale
// cached total.
describe("assertLocalCapacity capacity guard", () => {
  const originalWorkspace = env.WORKSPACE_PATH;
  const originalMaxGb = env.MAX_WORKSPACE_SIZE_GB;
  let root = "";
  let nowBase = 1_000_000_000_000;

  afterEach(async () => {
    vi.restoreAllMocks();
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = originalWorkspace;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = originalMaxGb;
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
    // Advance the base well past the 30s cache window for the next test.
    nowBase += 10 * 60_000;
  });

  it("returns without error when the workspace root does not exist yet", async () => {
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = join(
      tmpdir(),
      `snapotter-absent-${process.pid}-${Date.now()}`,
    );
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.000001;
    await expect(assertLocalCapacity()).resolves.toBeUndefined();
  });

  it("passes when usage is under the configured aggregate cap", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-cap-under-"));
    await mkdir(join(root, "uploads", "job1"), { recursive: true });
    await writeFile(join(root, "uploads", "job1", "a.bin"), Buffer.alloc(4096));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 10;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    await expect(assertLocalCapacity()).resolves.toBeUndefined();
  });

  it("does not enforce the aggregate cap when MAX_WORKSPACE_SIZE_GB is 0", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-cap-off-"));
    await mkdir(join(root, "outputs", "job1"), { recursive: true });
    await writeFile(join(root, "outputs", "job1", "big.bin"), Buffer.alloc(2 * 1024 * 1024));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    // Cap disabled: even a tiny disk must not 503 on the cap path. statfs on a
    // real temp dir reports the (ample) host free space, so the floor passes too.
    await expect(assertLocalCapacity()).resolves.toBeUndefined();
  });

  it("throws a 503 when aggregate usage exceeds the cap", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-cap-over-"));
    await mkdir(join(root, "outputs", "job1"), { recursive: true });
    // 2 MiB of files; cap of 0.001 GB (~1 MiB) is exceeded.
    await writeFile(join(root, "outputs", "job1", "big.bin"), Buffer.alloc(2 * 1024 * 1024));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    await expect(assertLocalCapacity()).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/storage limit/i),
    });
  });

  it("classifies the cap error as an operational SafeError, not a bug", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-cap-class-"));
    await mkdir(join(root, "outputs", "job1"), { recursive: true });
    await writeFile(join(root, "outputs", "job1", "big.bin"), Buffer.alloc(2 * 1024 * 1024));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    // "Disk full" is the canonical operational condition in error-report.ts.
    // As a plain Error it lands in Sentry as a bug-class event (NODE-5Y).
    // The code is what the error handler forwards to clients, and the
    // message must name the two knobs an operator can turn (#1161).
    await expect(assertLocalCapacity()).rejects.toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      statusCode: 503,
      code: "workspace-cap",
      message: expect.stringMatching(/MAX_WORKSPACE_SIZE_GB[\s\S]*FILE_MAX_AGE_HOURS/),
    });
  });

  it("reuses the cached workspace total within the cache window", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-cap-cache-"));
    await mkdir(join(root, "outputs", "job1"), { recursive: true });
    const big = join(root, "outputs", "job1", "big.bin");
    await writeFile(big, Buffer.alloc(2 * 1024 * 1024));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
    // Freeze time so both calls fall inside the 30s window.
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    // First call computes the real total (2 MiB) and trips the cap.
    await expect(assertLocalCapacity()).rejects.toMatchObject({ statusCode: 503 });

    // Delete every file so a fresh recompute would report 0 bytes and pass. The
    // second call still trips the cap, proving it read the cached total, not disk.
    await unlink(big);
    expect(existsSync(big)).toBe(false);
    await expect(assertLocalCapacity()).rejects.toMatchObject({ statusCode: 503 });
  });

  it("forgets the cached total when an object is deleted through the store", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-cap-invalidate-"));
    await mkdir(join(root, "outputs", "job1"), { recursive: true });
    await writeFile(join(root, "outputs", "job1", "big.bin"), Buffer.alloc(2 * 1024 * 1024));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    await expect(assertLocalCapacity()).rejects.toMatchObject({ statusCode: 503 });

    // The batch route deletes what it stored when ingress fails so the next
    // request can go through; a cached "full" for 30 s after that would
    // refuse the retry the message asked for (#1161).
    await deleteObject("outputs/job1/big.bin");
    await expect(assertLocalCapacity()).resolves.toBeUndefined();
  });
});

// The batch route asks for the remaining headroom before it reads an upload,
// so a batch that cannot fit is refused from its Content-Length instead of
// being buffered whole and failing at the first store (#1161).
describe("workspaceHeadroomBytes", () => {
  const originalWorkspace = env.WORKSPACE_PATH;
  const originalMaxGb = env.MAX_WORKSPACE_SIZE_GB;
  let root = "";
  let nowBase = 2_000_000_000_000;

  afterEach(async () => {
    vi.restoreAllMocks();
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = originalWorkspace;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = originalMaxGb;
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
    nowBase += 10 * 60_000;
  });

  it("is null when the cap is disabled", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-headroom-off-"));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    expect(await workspaceHeadroomBytes()).toBeNull();
  });

  it("is null on the S3 backend, where the local cap does not apply", async () => {
    const originalMode = env.STORAGE_MODE;
    (env as { STORAGE_MODE: string }).STORAGE_MODE = "s3";
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 1;
    try {
      expect(await workspaceHeadroomBytes()).toBeNull();
    } finally {
      (env as { STORAGE_MODE: string }).STORAGE_MODE = originalMode;
    }
  });

  it("is null before the workspace root exists", async () => {
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = join(
      tmpdir(),
      `snapotter-headroom-absent-${process.pid}-${Date.now()}`,
    );
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 1;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    expect(await workspaceHeadroomBytes()).toBeNull();
  });

  it("is the cap minus the bytes already stored", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-headroom-"));
    await mkdir(join(root, "uploads", "job1"), { recursive: true });
    await writeFile(join(root, "uploads", "job1", "a.bin"), Buffer.alloc(4096));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 1;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    expect(await workspaceHeadroomBytes()).toBe(1024 ** 3 - 4096);
  });

  it("never goes below zero once the cap is already exceeded", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-headroom-over-"));
    await mkdir(join(root, "outputs", "job1"), { recursive: true });
    await writeFile(join(root, "outputs", "job1", "big.bin"), Buffer.alloc(2 * 1024 * 1024));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
    vi.spyOn(Date, "now").mockReturnValue(nowBase);

    expect(await workspaceHeadroomBytes()).toBe(0);
  });
});
