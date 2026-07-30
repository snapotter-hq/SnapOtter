import { afterEach, describe, expect, it, vi } from "vitest";

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
}));

import {
  containerMemoryLimitBytes,
  hqCpuMemoryRefusal,
} from "../../../apps/api/src/lib/hq-memory-gate.js";

const GIB = 1024 ** 3;

function cgroupFiles(files: Record<string, string>) {
  mockReadFileSync.mockImplementation((path: string) => {
    if (path in files) return files[path];
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
}

afterEach(() => {
  mockReadFileSync.mockReset();
});

describe("containerMemoryLimitBytes", () => {
  it("reads a numeric cgroup v2 limit", () => {
    cgroupFiles({ "/sys/fs/cgroup/memory.max": `${6 * GIB}\n` });
    expect(containerMemoryLimitBytes()).toBe(6 * GIB);
  });

  it("treats cgroup v2 'max' as unlimited", () => {
    cgroupFiles({ "/sys/fs/cgroup/memory.max": "max\n" });
    expect(containerMemoryLimitBytes()).toBeNull();
  });

  it("falls back to the cgroup v1 file and ignores the unlimited sentinel", () => {
    cgroupFiles({ "/sys/fs/cgroup/memory/memory.limit_in_bytes": "9223372036854771712\n" });
    expect(containerMemoryLimitBytes()).toBeNull();
  });

  it("reads a numeric cgroup v1 limit", () => {
    cgroupFiles({ "/sys/fs/cgroup/memory/memory.limit_in_bytes": `${8 * GIB}\n` });
    expect(containerMemoryLimitBytes()).toBe(8 * GIB);
  });

  it("returns null when no cgroup file exists (bare metal)", () => {
    cgroupFiles({});
    expect(containerMemoryLimitBytes()).toBeNull();
  });
});

describe("hqCpuMemoryRefusal", () => {
  it("refuses a 6g CPU container with an actionable message", () => {
    const msg = hqCpuMemoryRefusal(false, 6 * GIB);
    expect(msg).toContain("8g");
    expect(msg).toContain("fast quality mode");
    expect(msg).toContain("6.0g");
  });

  it("allows 8g on CPU (the measured floor)", () => {
    expect(hqCpuMemoryRefusal(false, 8 * GIB)).toBeNull();
  });

  it("never refuses when a GPU is available", () => {
    expect(hqCpuMemoryRefusal(true, 6 * GIB)).toBeNull();
  });

  it("never refuses when the limit is unknown", () => {
    expect(hqCpuMemoryRefusal(false, null)).toBeNull();
  });
});
