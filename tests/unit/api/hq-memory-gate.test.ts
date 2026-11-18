import { afterEach, describe, expect, it, vi } from "vitest";

const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockFreemem = vi.hoisted(() => vi.fn<() => number>());

vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
}));

vi.mock("node:os", () => ({
  freemem: mockFreemem,
}));

import {
  availableMemoryBytes,
  containerMemoryLimitBytes,
  HR_MATTING_CPU_ESTIMATE_BYTES,
  HR_MATTING_MEMORY_MESSAGE,
  hqCpuMemoryRefusal,
  hrMattingMemoryRefusal,
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
  mockFreemem.mockReset();
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

describe("hrMattingMemoryRefusal", () => {
  it("allows the job when available memory covers the estimate", () => {
    expect(hrMattingMemoryRefusal(false, HR_MATTING_CPU_ESTIMATE_BYTES)).toBeNull();
    expect(hrMattingMemoryRefusal(false, 64 * GIB)).toBeNull();
  });

  it("rejects with the constant message when available memory is short", () => {
    expect(hrMattingMemoryRefusal(false, 16 * GIB)).toBe(HR_MATTING_MEMORY_MESSAGE);
  });

  it("does not echo the measured available memory into the message", () => {
    const msg = hrMattingMemoryRefusal(false, 16.3 * GIB);
    expect(msg).toBe(HR_MATTING_MEMORY_MESSAGE);
    expect(msg).not.toContain("16.3");
  });

  it("skips the check on a GPU host, whatever memory is free", () => {
    expect(hrMattingMemoryRefusal(true, 1 * GIB)).toBeNull();
  });

  it("estimate is 25 GiB, the top of the 16 to 25 GB range measured in #4510", () => {
    expect(HR_MATTING_CPU_ESTIMATE_BYTES).toBe(25 * GIB);
  });
});

describe("availableMemoryBytes", () => {
  it("uses free memory when there is no container limit", () => {
    cgroupFiles({});
    mockFreemem.mockReturnValue(12 * GIB);
    expect(availableMemoryBytes()).toBe(12 * GIB);
  });

  it("caps free memory at the container limit", () => {
    cgroupFiles({ "/sys/fs/cgroup/memory.max": `${8 * GIB}\n` });
    mockFreemem.mockReturnValue(30 * GIB);
    expect(availableMemoryBytes()).toBe(8 * GIB);
  });

  it("uses free memory when it is below the container limit", () => {
    cgroupFiles({ "/sys/fs/cgroup/memory.max": `${32 * GIB}\n` });
    mockFreemem.mockReturnValue(10 * GIB);
    expect(availableMemoryBytes()).toBe(10 * GIB);
  });
});
