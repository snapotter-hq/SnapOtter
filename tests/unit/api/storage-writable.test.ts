import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// storage-writable reads the configured storage paths from config.js. Mock it
// with a mutable env object so each test can point the paths at a temp dir.
// vi.hoisted keeps the object available to the hoisted vi.mock factory.
const mockEnv = vi.hoisted(() => ({
  STORAGE_MODE: "local",
  WORKSPACE_PATH: "",
  FILES_STORAGE_PATH: "",
  LOG_DIR: "",
}));

vi.mock("../../../apps/api/src/config.js", () => ({ env: mockEnv }));

import {
  assertStorageWritable,
  isDirWritable,
  storagePermissionMessage,
} from "../../../apps/api/src/lib/storage-writable.js";

// A read-only directory does not block writes for root (DAC_OVERRIDE), so the
// "not writable" assertions only hold for an unprivileged user.
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "storage-writable-"));
});

afterAll(() => {
  // Restore perms so cleanup can recurse into the read-only dir.
  for (const dir of ["readonly", "logs-ro", "logs-ro-s3"]) {
    try {
      chmodSync(join(root, dir), 0o755);
    } catch {
      /* may not exist */
    }
  }
  rmSync(root, { recursive: true, force: true });
});

describe("isDirWritable", () => {
  it("returns true for an existing writable directory", async () => {
    const dir = join(root, "writable");
    mkdirSync(dir, { recursive: true });
    expect(await isDirWritable(dir)).toBe(true);
  });

  it("returns true for a missing directory whose parent is writable (creates it)", async () => {
    const dir = join(root, "nested", "deep");
    expect(await isDirWritable(dir)).toBe(true);
  });

  it.skipIf(isRoot)("returns false for a read-only directory", async () => {
    const dir = join(root, "readonly");
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o555);
    expect(await isDirWritable(dir)).toBe(false);
  });

  it("rethrows a non-permission error (ENOTDIR) instead of returning false", async () => {
    // A path whose parent component is a regular file makes mkdir fail with
    // ENOTDIR, which is not in NOT_WRITABLE_CODES, so it must propagate rather
    // than be misreported as "not writable".
    const filePath = join(root, "a-file");
    writeFileSync(filePath, "x");
    const dir = join(filePath, "sub");
    await expect(isDirWritable(dir)).rejects.toMatchObject({ code: "ENOTDIR" });
  });
});

describe("storagePermissionMessage", () => {
  it("names the directory and gives an actionable chown remediation", () => {
    const msg = storagePermissionMessage("/tmp/workspace");
    expect(msg).toContain("/tmp/workspace");
    expect(msg.toLowerCase()).toContain("not writable");
    expect(msg).toContain("chown");
    // Includes the running uid and gid so the operator knows what to chown to.
    expect(msg).toMatch(/uid=/);
    expect(msg).toMatch(/gid=/);
    // Lists the non-root remediation and the docs link.
    expect(msg).toContain("PUID/PGID");
    expect(msg).toContain("https://docs.snapotter.com/guide/deployment#storage-permissions");
  });

  it("reports the real numeric uid/gid when getuid/getgid are available", () => {
    // On POSIX, process.getuid()/getgid() exist; the message must echo those
    // exact numbers rather than the "?" fallback.
    if (typeof process.getuid !== "function" || typeof process.getgid !== "function") return;
    const uid = process.getuid();
    const gid = process.getgid();
    const msg = storagePermissionMessage("/srv/files");
    expect(msg).toContain(`uid=${uid} gid=${gid}`);
    expect(msg).toContain(`chown -R ${uid}:${gid} <host-path>`);
  });

  it('falls back to "?" for uid/gid when getuid/getgid are unavailable', () => {
    // Simulate a runtime (e.g. Windows) where these functions do not exist.
    const origUid = process.getuid;
    const origGid = process.getgid;
    // getuid/getgid are optional (undefined on Windows), so this typechecks.
    process.getuid = undefined;
    process.getgid = undefined;
    try {
      const msg = storagePermissionMessage("/srv/files");
      expect(msg).toContain("uid=? gid=?");
      expect(msg).toContain("chown -R ?:? <host-path>");
    } finally {
      process.getuid = origUid;
      process.getgid = origGid;
    }
  });
});

describe("assertStorageWritable", () => {
  it("resolves when the storage paths and the log directory are writable", async () => {
    mockEnv.STORAGE_MODE = "local";
    mockEnv.WORKSPACE_PATH = join(root, "ws-ok");
    mockEnv.FILES_STORAGE_PATH = join(root, "files-ok");
    mockEnv.LOG_DIR = join(root, "logs-ok");
    await expect(assertStorageWritable()).resolves.toBeUndefined();
  });

  it.skipIf(isRoot)(
    "rejects with an actionable message when the workspace is not writable",
    async () => {
      const ws = join(root, "ws-ro");
      mkdirSync(ws, { recursive: true });
      chmodSync(ws, 0o555);
      mockEnv.STORAGE_MODE = "local";
      mockEnv.WORKSPACE_PATH = ws;
      mockEnv.FILES_STORAGE_PATH = join(root, "files-ok2");
      mockEnv.LOG_DIR = join(root, "logs-ok2");
      await expect(assertStorageWritable()).rejects.toThrow(/not writable/i);
      await expect(assertStorageWritable()).rejects.toThrow(ws);
      chmodSync(ws, 0o755);
    },
  );

  it.skipIf(isRoot)(
    "rejects naming the files-storage path when only the second dir is unwritable",
    async () => {
      // Workspace is fine; the loop must advance to FILES_STORAGE_PATH and fail
      // there, and the thrown message must name that second directory.
      const files = join(root, "files-ro");
      mkdirSync(files, { recursive: true });
      chmodSync(files, 0o555);
      mockEnv.STORAGE_MODE = "local";
      mockEnv.WORKSPACE_PATH = join(root, "ws-ok3");
      mockEnv.FILES_STORAGE_PATH = files;
      mockEnv.LOG_DIR = join(root, "logs-ok3");
      await expect(assertStorageWritable()).rejects.toThrow(/not writable/i);
      await expect(assertStorageWritable()).rejects.toThrow(files);
      chmodSync(files, 0o755);
    },
  );

  it.skipIf(isRoot)(
    "rejects naming the log directory when only LOG_DIR is unwritable (#1487)",
    async () => {
      // pino-roll's mkdir would otherwise fail asynchronously in the transport
      // worker as an unhandled 'error' event that names no env var.
      const logs = join(root, "logs-ro");
      mkdirSync(logs, { recursive: true });
      chmodSync(logs, 0o555);
      mockEnv.STORAGE_MODE = "local";
      mockEnv.WORKSPACE_PATH = join(root, "ws-ok4");
      mockEnv.FILES_STORAGE_PATH = join(root, "files-ok4");
      mockEnv.LOG_DIR = logs;
      await expect(assertStorageWritable()).rejects.toThrow(/Log directory .* is not writable/);
      await expect(assertStorageWritable()).rejects.toThrow(logs);
      await expect(assertStorageWritable()).rejects.not.toThrow(/cannot upload/);
      chmodSync(logs, 0o755);
    },
  );

  it("skips the storage paths in S3 mode but still probes the log directory", async () => {
    mockEnv.STORAGE_MODE = "s3";
    mockEnv.WORKSPACE_PATH = "/nonexistent/should-not-be-touched";
    mockEnv.FILES_STORAGE_PATH = "/nonexistent/should-not-be-touched";
    mockEnv.LOG_DIR = join(root, "logs-s3");
    await expect(assertStorageWritable()).resolves.toBeUndefined();
  });

  it.skipIf(isRoot)("rejects an unwritable log directory even in S3 mode", async () => {
    const logs = join(root, "logs-ro-s3");
    mkdirSync(logs, { recursive: true });
    chmodSync(logs, 0o555);
    mockEnv.STORAGE_MODE = "s3";
    mockEnv.WORKSPACE_PATH = "/nonexistent/should-not-be-touched";
    mockEnv.FILES_STORAGE_PATH = "/nonexistent/should-not-be-touched";
    mockEnv.LOG_DIR = logs;
    await expect(assertStorageWritable()).rejects.toThrow(logs);
    chmodSync(logs, 0o755);
  });
});

describe("storagePermissionMessage for the log directory", () => {
  it("names a log directory and what it blocks, without the upload wording", () => {
    const m = storagePermissionMessage("/data/logs", "logs");
    expect(m).toContain('Log directory "/data/logs" is not writable');
    expect(m).toContain("log file");
    expect(m).not.toContain("cannot upload");
    // the remediation block is shared with the storage message
    expect(m).toContain("chown -R");
    expect(m).toContain("docs.snapotter.com/guide/deployment#storage-permissions");
  });
});

// The `code &&` guard short-circuits when the thrown error carries no `code`
// property (not a NodeJS.ErrnoException). Real filesystem faults always set a
// code, so mock node:fs/promises to reject the probe write with a plain Error
// and confirm it propagates rather than being swallowed as "not writable".
describe("isDirWritable with an error that has no code property", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:fs/promises");
  });

  it("rethrows a codeless error (falsy code short-circuits the writable check)", async () => {
    vi.resetModules();
    const codeless = new Error("mystery failure");
    vi.doMock("node:fs/promises", () => ({
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockRejectedValue(codeless),
      rm: vi.fn().mockResolvedValue(undefined),
    }));
    const mod = await import("../../../apps/api/src/lib/storage-writable.js");
    await expect(mod.isDirWritable("/any/dir")).rejects.toThrow("mystery failure");
  });
});
