import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// storage-writable.ts imports the resolved storage paths from config.js at module
// load. Stub it so the module imports without a real config, matching the sibling
// storage-writable.test.ts. vi.hoisted keeps the object reachable from the
// hoisted vi.mock factory.
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

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "storage-writable-mut-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("storagePermissionMessage pins every line of the remediation text", () => {
  const msg = () => storagePermissionMessage("/data/workspace");

  it('includes the "Storage directory ... is not writable" opener with the dir', () => {
    const m = msg();
    expect(m).toContain('Storage directory "/data/workspace" is not writable by the current user');
  });

  it("includes the SnapOtter-cannot-upload summary line (line 49)", () => {
    // Kills the L49 quasi -> "" mutant; this exact phrase lives only on that line.
    expect(msg()).toContain("SnapOtter cannot upload, process, or store files until this is fixed");
  });

  it("includes the chown host-volume remediation (line 50)", () => {
    expect(msg()).toContain("Host volume owned by another user");
    expect(msg()).toContain("chown -R");
  });

  it("includes the container-user hint continuation (line 51)", () => {
    // Kills the L51 quasi -> "" mutant.
    expect(msg()).toContain("or set the container user to match the volume's owner");
  });

  it("includes the non-root runtime remediation header (line 52)", () => {
    // Kills the L52 quasi -> "" mutant.
    expect(msg()).toContain(
      "Running as a non-root user (TrueNAS, Kubernetes runAsUser, OpenShift)",
    );
  });

  it("includes the PUID/PGID and supplementary-group guidance (lines 53-54)", () => {
    // Kills the L54 quasi -> "" mutant (the fsGroup phrase lives only there).
    const m = msg();
    expect(m).toContain("set PUID/PGID to match the volume");
    expect(m).toContain("supplementary group 0 (Kubernetes fsGroup: 0)");
  });

  it("includes the deployment docs link (line 55)", () => {
    expect(msg()).toContain("https://docs.snapotter.com/guide/deployment#storage-permissions");
  });

  it("joins the lines with newlines, not an empty separator (line 56)", () => {
    // The message is an array joined by "\n". Kills the L56 `"\n"` -> `""`
    // separator mutant: with "" the six lines would concatenate into one line.
    const m = msg();
    expect(m).toContain("\n");
    // Five array entries (some source lines are concatenated with `+`) joined by
    // "\n" -> five newline-separated segments. With the "" mutant they collapse
    // into a single line.
    expect(m.split("\n").length).toBe(5);
    // A specific adjacent pair must remain on separate lines.
    expect(m).toContain("Common fixes:\n  - Host volume owned by another user");
  });

  it("echoes the real numeric uid/gid when getuid/getgid exist", () => {
    if (typeof process.getuid !== "function" || typeof process.getgid !== "function") return;
    const uid = process.getuid();
    const gid = process.getgid();
    const m = storagePermissionMessage("/srv/files");
    expect(m).toContain(`uid=${uid} gid=${gid}`);
    expect(m).toContain(`chown -R ${uid}:${gid} <host-path>`);
  });
});

describe("isDirWritable returns a real writability verdict", () => {
  it("returns exactly true for a freshly created writable directory", async () => {
    const dir = join(root, "ok");
    mkdirSync(dir, { recursive: true });
    const result = await isDirWritable(dir);
    expect(result).toBe(true);
  });

  it("creates a missing directory and returns true (probe write + cleanup succeed)", async () => {
    const dir = join(root, "made", "here");
    expect(await isDirWritable(dir)).toBe(true);
  });
});

describe("assertStorageWritable wiring", () => {
  it("resolves to undefined when both configured paths are writable", async () => {
    mockEnv.STORAGE_MODE = "local";
    mockEnv.WORKSPACE_PATH = join(root, "assert-ws");
    mockEnv.FILES_STORAGE_PATH = join(root, "assert-files");
    await expect(assertStorageWritable()).resolves.toBeUndefined();
  });

  it("is a no-op in s3 mode even with unwritable paths configured", async () => {
    mockEnv.STORAGE_MODE = "s3";
    mockEnv.WORKSPACE_PATH = "/definitely/not/writable/xyz";
    mockEnv.FILES_STORAGE_PATH = "/definitely/not/writable/xyz";
    await expect(assertStorageWritable()).resolves.toBeUndefined();
  });
});
