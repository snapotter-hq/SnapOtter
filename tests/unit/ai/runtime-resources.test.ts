import { describe, expect, it } from "vitest";
import {
  assertOcrRuntimeMemory,
  getOcrRuntimeEffectiveMemoryBytes,
} from "../../../packages/ai/src/runtime-resources.js";

const GiB = 1024 ** 3;

describe("OCR runtime memory compatibility", () => {
  it("uses the smallest configured physical, cgroup v2, or cgroup v1 capacity", () => {
    const files = new Map([
      ["/sys/fs/cgroup/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory/memory.limit_in_bytes", String(5 * GiB)],
      ["/sys/fs/cgroup/memory.limit_in_bytes", String(7 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "darwin",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
  });

  it("resolves a private cgroup namespace from the process membership", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/memory.max", String(6 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(6 * GiB);
  });

  it("resolves host-namespace membership and its tightest ancestor limit", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/system.slice/docker:deadbeef.scope\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/system.slice/docker:deadbeef.scope/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/system.slice/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/memory.max", "max\n"],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
  });

  it("fails closed when an identified process memory controller is unreadable", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/docker/deadbeef\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("denied"), { code: "EACCES" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("fails closed when cgroup membership exists but mount metadata is unreadable", () => {
    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          if (path === "/proc/self/cgroup") return "0::/docker/deadbeef\n";
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("fails closed on Linux when process cgroup membership is unreadable or malformed", () => {
    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: () => {
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        },
      }),
    ).toThrow("cgroup memory capacity");

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          if (path === "/proc/self/cgroup") return "malformed-membership\n";
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("treats cgroup v2 max and missing or malformed limits as unbounded", () => {
    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "darwin",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          if (path === "/sys/fs/cgroup/memory.max") return "max\n";
          if (path.includes("/memory/memory")) return "not-a-number\n";
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
      }),
    ).toBe(8 * GiB);
  });

  it("rejects invalid requirements and reports actionable capacity failures", () => {
    expect(() => assertOcrRuntimeMemory(0, { effectiveMemoryBytes: 8 * GiB })).toThrow(
      "minimum memory",
    );
    expect(() => assertOcrRuntimeMemory(4 * GiB, { effectiveMemoryBytes: 3 * GiB })).toThrow(
      /4294967296 bytes required, 3221225472 available/,
    );
    expect(() => assertOcrRuntimeMemory(4 * GiB, { effectiveMemoryBytes: 4 * GiB })).not.toThrow();
  });
});
