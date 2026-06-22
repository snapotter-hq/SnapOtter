import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// storage-writable reads the configured storage paths from config.js. Mock it
// with a mutable env object so each test can point the paths at a temp dir.
// vi.hoisted keeps the object available to the hoisted vi.mock factory.
const mockEnv = vi.hoisted(() => ({
  STORAGE_MODE: "local",
  WORKSPACE_PATH: "",
  FILES_STORAGE_PATH: "",
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
  try {
    chmodSync(join(root, "readonly"), 0o755);
  } catch {
    /* may not exist */
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
});

describe("storagePermissionMessage", () => {
  it("names the directory and gives an actionable chown remediation", () => {
    const msg = storagePermissionMessage("/tmp/workspace");
    expect(msg).toContain("/tmp/workspace");
    expect(msg.toLowerCase()).toContain("not writable");
    expect(msg).toContain("chown");
    // Includes the running uid so the operator knows what to chown to.
    expect(msg).toMatch(/uid=/);
  });
});

describe("assertStorageWritable", () => {
  it("resolves when both storage paths are writable", async () => {
    mockEnv.STORAGE_MODE = "local";
    mockEnv.WORKSPACE_PATH = join(root, "ws-ok");
    mockEnv.FILES_STORAGE_PATH = join(root, "files-ok");
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
      await expect(assertStorageWritable()).rejects.toThrow(/not writable/i);
      await expect(assertStorageWritable()).rejects.toThrow(ws);
      chmodSync(ws, 0o755);
    },
  );

  it("is a no-op in S3 storage mode (does not touch the filesystem)", async () => {
    mockEnv.STORAGE_MODE = "s3";
    mockEnv.WORKSPACE_PATH = "/nonexistent/should-not-be-touched";
    mockEnv.FILES_STORAGE_PATH = "/nonexistent/should-not-be-touched";
    await expect(assertStorageWritable()).resolves.toBeUndefined();
  });
});
