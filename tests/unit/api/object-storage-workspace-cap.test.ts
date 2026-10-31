import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  assertLocalCapacity,
  computeWorkspaceUsedBytes,
  deleteObject,
  isOverWorkspaceCap,
  putObject,
  putObjectStream,
  workspaceHeadroomBytes,
} from "../../../apps/api/src/lib/object-storage.js";

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

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

  it.skipIf(isRoot)(
    "propagates a permission fault when a prefix root or job directory is unreadable (#2753)",
    async () => {
      root = await mkdtemp(join(tmpdir(), "snapotter-wscap-perm-"));
      const jobDir = join(root, "outputs", "job1");
      await mkdir(jobDir, { recursive: true });
      await writeFile(join(jobDir, "big.bin"), Buffer.alloc(2048));

      await chmod(jobDir, 0o000);
      try {
        await expect(computeWorkspaceUsedBytes(root)).rejects.toMatchObject({
          code: expect.stringMatching(/^(EACCES|EPERM)$/),
        });
      } finally {
        await chmod(jobDir, 0o755).catch(() => {});
      }

      const outputsRoot = join(root, "outputs");
      await chmod(outputsRoot, 0o000);
      try {
        await expect(computeWorkspaceUsedBytes(root)).rejects.toMatchObject({
          code: expect.stringMatching(/^(EACCES|EPERM)$/),
        });
      } finally {
        await chmod(outputsRoot, 0o755).catch(() => {});
      }
    },
  );

  it("propagates non-ENOENT readdir and stat faults while ignoring ENOENT mid-walk (#2753)", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-wscap-eio-"));
    await mkdir(join(root, "uploads", "kept-job"), { recursive: true });
    await mkdir(join(root, "uploads", "vanished-job"), { recursive: true });
    await mkdir(join(root, "uploads", "fault-job"), { recursive: true });
    await writeFile(join(root, "uploads", "kept-job", "kept.bin"), Buffer.alloc(1200));
    await writeFile(join(root, "uploads", "kept-job", "vanished.bin"), Buffer.alloc(500));
    await writeFile(join(root, "uploads", "kept-job", "fault.bin"), Buffer.alloc(300));

    const prefixEio = Object.assign(new Error("EIO: i/o error, scandir prefix"), {
      code: "EIO",
      syscall: "scandir",
    });
    const jobDirEio = Object.assign(new Error("EIO: i/o error, scandir job"), {
      code: "EIO",
      syscall: "scandir",
    });
    const vanishedDir = Object.assign(new Error("ENOENT: no such file or directory, scandir"), {
      code: "ENOENT",
      syscall: "scandir",
    });
    const vanishedFile = Object.assign(new Error("ENOENT: no such file or directory, stat"), {
      code: "ENOENT",
      syscall: "stat",
    });
    const statEio = Object.assign(new Error("EIO: i/o error, stat"), {
      code: "EIO",
      syscall: "stat",
    });

    let failPrefixReaddir = true;
    let failJobDirReaddir = false;
    let failStat = false;

    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        readdir: async (p: Parameters<typeof actual.readdir>[0]) => {
          const pathStr = String(p);
          if (failPrefixReaddir && pathStr.endsWith("/uploads")) throw prefixEio;
          if (pathStr.endsWith("/vanished-job")) throw vanishedDir;
          if (failJobDirReaddir && pathStr.endsWith("/fault-job")) throw jobDirEio;
          return actual.readdir(p);
        },
        stat: async (p: Parameters<typeof actual.stat>[0]) => {
          const pathStr = String(p);
          if (pathStr.endsWith("/vanished.bin")) throw vanishedFile;
          if (failStat && pathStr.endsWith("/fault.bin")) throw statEio;
          return actual.stat(p);
        },
      };
    });

    try {
      const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
      await expect(isolatedStorage.computeWorkspaceUsedBytes(root)).rejects.toBe(prefixEio);

      failPrefixReaddir = false;
      failJobDirReaddir = true;
      await expect(isolatedStorage.computeWorkspaceUsedBytes(root)).rejects.toBe(jobDirEio);

      failJobDirReaddir = false;
      expect(await isolatedStorage.computeWorkspaceUsedBytes(root)).toBe(1500);

      failStat = true;
      await expect(isolatedStorage.computeWorkspaceUsedBytes(root)).rejects.toBe(statEio);
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });
});

// assertLocalCapacity wires the aggregate size cap and the free-space floor to
// the real WORKSPACE_PATH. Each test picks a base timestamp far past any prior
// one so its first check recomputes rather than reusing a cached total from an
// earlier test.
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

  it.skipIf(isRoot)(
    "surfaces a 503 storage-not-writable SafeError and does not cache 0 when an outputs dir is unreadable (#2753)",
    async () => {
      root = await mkdtemp(join(tmpdir(), "snapotter-cap-unreadable-"));
      const jobDir = join(root, "outputs", "job1");
      await mkdir(jobDir, { recursive: true });
      await writeFile(join(jobDir, "big.bin"), Buffer.alloc(2 * 1024 * 1024));
      (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
      (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
      vi.spyOn(Date, "now").mockReturnValue(nowBase);

      await chmod(jobDir, 0o000);
      try {
        const expectedFault = {
          isSafeMessage: true,
          kind: "operational",
          statusCode: 503,
          code: "storage-not-writable",
          cause: expect.objectContaining({
            code: expect.stringMatching(/^(EACCES|EPERM)$/),
          }),
        };
        await expect(assertLocalCapacity()).rejects.toMatchObject(expectedFault);
        await expect(putObject("uploads/job2/in.bin", Buffer.from("x"))).rejects.toMatchObject(
          expectedFault,
        );
        await expect(
          putObjectStream("uploads/job2/in.bin", Readable.from([Buffer.from("x")])),
        ).rejects.toMatchObject(expectedFault);
      } finally {
        await chmod(jobDir, 0o755).catch(() => {});
      }

      // Within the same 30s cache window, restoring permissions must still trip
      // workspace-cap because the failed walk did not cache 0 bytes.
      await expect(assertLocalCapacity()).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        statusCode: 503,
        code: "workspace-cap",
      });
    },
  );

  it("surfaces a 503 storage-write-failed SafeError on simulated EIO in assertLocalCapacity, putObject, putObjectStream, and workspaceHeadroomBytes (#2753)", async () => {
    root = await mkdtemp(join(tmpdir(), "snapotter-cap-eio-"));
    await mkdir(join(root, "outputs", "job1"), { recursive: true });
    await writeFile(join(root, "outputs", "job1", "big.bin"), Buffer.alloc(2 * 1024 * 1024));

    const scandirEio = Object.assign(new Error("EIO: i/o error, scandir"), {
      code: "EIO",
      syscall: "scandir",
    });

    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        readdir: async () => {
          throw scandirEio;
        },
      };
    });

    try {
      const isolatedConfig = await import("../../../apps/api/src/config.js");
      const prevWs = isolatedConfig.env.WORKSPACE_PATH;
      const prevCap = isolatedConfig.env.MAX_WORKSPACE_SIZE_GB;
      (isolatedConfig.env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
      (isolatedConfig.env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
      try {
        const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
        const expectedFault = {
          isSafeMessage: true,
          kind: "operational",
          statusCode: 503,
          code: "storage-write-failed",
          cause: scandirEio,
        };
        await expect(isolatedStorage.assertLocalCapacity()).rejects.toMatchObject(expectedFault);
        await expect(
          isolatedStorage.putObject("uploads/job2/in.bin", Buffer.from("x")),
        ).rejects.toMatchObject(expectedFault);
        await expect(
          isolatedStorage.putObjectStream("uploads/job2/in.bin", Readable.from([Buffer.from("x")])),
        ).rejects.toMatchObject(expectedFault);
        await expect(isolatedStorage.workspaceHeadroomBytes()).rejects.toMatchObject(expectedFault);
      } finally {
        (isolatedConfig.env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = prevWs;
        (isolatedConfig.env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = prevCap;
      }
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
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

  it.skipIf(isRoot)(
    "surfaces a 503 storage-not-writable SafeError instead of reporting full headroom when a job dir is unreadable (#2753)",
    async () => {
      root = await mkdtemp(join(tmpdir(), "snapotter-headroom-unreadable-"));
      const jobDir = join(root, "outputs", "job1");
      await mkdir(jobDir, { recursive: true });
      await writeFile(join(jobDir, "big.bin"), Buffer.alloc(2 * 1024 * 1024));
      (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = root;
      (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
      vi.spyOn(Date, "now").mockReturnValue(nowBase);

      await chmod(jobDir, 0o000);
      try {
        await expect(workspaceHeadroomBytes()).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          statusCode: 503,
          code: "storage-not-writable",
          cause: expect.objectContaining({
            code: expect.stringMatching(/^(EACCES|EPERM)$/),
          }),
        });
      } finally {
        await chmod(jobDir, 0o755).catch(() => {});
      }

      // Failed walk was not cached as 0: once readable again in the same window,
      // headroom reflects the 2 MiB on disk.
      expect(await workspaceHeadroomBytes()).toBe(0);
    },
  );
});
