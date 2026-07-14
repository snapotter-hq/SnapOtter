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

  it("resolves the tightest cgroup v2 limit when the hierarchy root has no memory.max", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/system.slice/docker:deadbeef.scope\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/system.slice/docker:deadbeef.scope/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/system.slice/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
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

  it("keeps tighter ancestors visible across overlapping cgroup v2 mounts", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/outer/parent/child\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 29 0:26 /outer/parent /sys/fs/cgroup/delegated rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/outer/parent/child/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/outer/parent/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/outer/memory.max", String(2 * GiB)],
      ["/sys/fs/cgroup/memory.max", "max\n"],
      ["/sys/fs/cgroup/delegated/child/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/delegated/memory.max", String(6 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(2 * GiB);
  });

  it("accepts the mount namespace root self-parent sentinel", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "1 1 0:1 / / rw,relatime - overlay overlay rw",
          "29 1 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/memory.max", "max\n"],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
  });

  it("resolves mount visibility by path depth independent of mountinfo order", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 1 0:26 / /cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "1 1 0:1 / / rw,relatime - overlay overlay rw",
        ].join("\n"),
      ],
      ["/cgroup/job/memory.max", String(5 * GiB)],
      ["/cgroup/memory.max", "max\n"],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
  });

  it.each([
    ["a non-root self-cycle", ["40 40 0:99 / /unrelated rw - tmpfs tmpfs rw"]],
    [
      "a multi-record parent cycle",
      ["40 41 0:99 / /cycle-a rw - tmpfs tmpfs rw", "41 40 0:100 / /cycle-b rw - tmpfs tmpfs rw"],
    ],
  ])("fails closed when mountinfo contains %s", (_label, malformedMounts) => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          ...malformedMounts,
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/memory.max", "max\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("fails closed when a same-point cgroup mount covers the matching hierarchy", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/real/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 29 0:26 /decoy /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/real/job/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/real/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", String(6 * GiB)],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("fails closed for a cgroup mount beneath a covered non-cgroup ancestor", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/real/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 29 0:99 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - tmpfs tmpfs rw",
          "31 29 0:26 /real /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/real/job/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/real/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/child/job/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/child/memory.max", String(6 * GiB)],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it.each([
    [
      "topological record order",
      [
        "29 23 0:26 /old /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "30 29 0:26 /old/child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "31 29 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "32 31 0:26 /child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
      ],
    ],
    [
      "adversarial record order",
      [
        "32 31 0:26 /child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "30 29 0:26 /old/child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "31 29 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "29 23 0:26 /old /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
      ],
    ],
    [
      "a same-point stack on the replacement child",
      [
        "33 32 0:26 /child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "30 29 0:26 /old/child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "29 23 0:26 /old /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "32 31 0:26 /child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        "31 29 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
      ],
    ],
  ])("ignores a hidden old child when its replacement has the same mountpoint (%s)", (_label, mounts) => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/child/job\n"],
      ["/proc/self/mountinfo", mounts.join("\n")],
      ["/sys/fs/cgroup/child/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/child/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", String(7 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
  });

  it("fails closed when two reachable mounts claim the same mountpoint", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/child/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 29 0:26 /child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "31 29 0:26 /child /sys/fs/cgroup/child rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/child/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/child/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", String(7 * GiB)],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("fails closed when a nested cgroup mount remaps the process path", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/real/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 29 0:26 /decoy /sys/fs/cgroup/real rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/real/job/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/real/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", "max\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("allows a same-device nested cgroup mount that preserves the logical path", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/real/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "30 29 0:26 /real /sys/fs/cgroup/real rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/real/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/real/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", String(7 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
  });

  it("fails closed when a matching nested cgroup root comes from another device", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/real/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 29 0:27 /real /sys/fs/cgroup/real rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/real/job/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/real/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", "max\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("fails closed when a nested non-cgroup mount shadows the process path", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/real/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 29 0:99 / /sys/fs/cgroup/real rw,nosuid,nodev,noexec,relatime - tmpfs tmpfs rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/real/job/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/real/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", "max\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("does not confuse a sibling mountpoint with a process-path prefix", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/real/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 29 0:99 / /sys/fs/cgroup/real-other rw,nosuid,nodev,noexec,relatime - tmpfs tmpfs rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/real/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/real/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", String(7 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
  });

  it.each([
    ["process directory", "/sys/fs/cgroup/real/job"],
    ["limit file", "/sys/fs/cgroup/real/job/memory.max"],
  ])("fails closed when a non-cgroup mount shadows the exact %s", (_label, mountPoint) => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/real/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          `30 29 8:1 /decoy ${mountPoint} rw,relatime - ext4 /dev/root rw`,
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/real/job/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/real/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/memory.max", "max\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("skips an absent non-root cgroup v2 memory controller and keeps walking", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/delegated/job\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/delegated/job/cgroup.controllers", "cpu\n"],
      ["/sys/fs/cgroup/delegated/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
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

  it("uses the binding v1 memory limit on a deeper-root hybrid hierarchy", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/delegated/job\n5:memory:/legacy/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 /delegated /sys/fs/cgroup/unified rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 23 0:27 / /sys/fs/cgroup/memory rw,nosuid,nodev,noexec,relatime - cgroup cgroup rw,memory",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/unified/job/cgroup.controllers", "cpu\n"],
      ["/sys/fs/cgroup/unified/cgroup.controllers", "cpu\n"],
      ["/sys/fs/cgroup/memory/legacy/job/memory.limit_in_bytes", String(3 * GiB)],
      ["/sys/fs/cgroup/memory/legacy/memory.limit_in_bytes", String(4 * GiB)],
      ["/sys/fs/cgroup/memory/memory.limit_in_bytes", String(16 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(3 * GiB);
  });

  it("ignores an unresolvable inherited cgroup v2 mount when v1 owns memory", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/delegated/job\n5:memory:/legacy/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 /.. /sys/fs/cgroup/unified rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
          "30 23 0:27 / /sys/fs/cgroup/memory rw,nosuid,nodev,noexec,relatime - cgroup cgroup rw,memory",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/memory/legacy/job/memory.limit_in_bytes", String(3 * GiB)],
      ["/sys/fs/cgroup/memory/legacy/memory.limit_in_bytes", String(4 * GiB)],
      ["/sys/fs/cgroup/memory/memory.limit_in_bytes", String(16 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(3 * GiB);
  });

  it("ignores a namespace-relative root on an irrelevant v1 controller mount", () => {
    const files = new Map([
      ["/proc/self/cgroup", "2:cpu:/job\n0::/job\n"],
      [
        "/proc/self/mountinfo",
        [
          "29 23 0:26 /.. /sys/fs/cgroup/cpu rw,nosuid,nodev,noexec,relatime - cgroup cgroup rw,cpu",
          "30 23 0:27 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw",
        ].join("\n"),
      ],
      ["/sys/fs/cgroup/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
  });

  it.each([
    "ENOENT",
    "EACCES",
  ])("fails closed when an absent v2 limit cannot be verified against its cgroup directory (%s)", (coreErrorCode) => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/deleted\n"],
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
          if (value !== undefined) return value;
          const code = path.endsWith("/cgroup.controllers") ? coreErrorCode : "ENOENT";
          throw Object.assign(new Error("unavailable"), { code });
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("fails closed when a cgroup v2 ancestor limit is unreadable", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/system.slice/docker:deadbeef.scope\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/system.slice/docker:deadbeef.scope/memory.max", String(6 * GiB)],
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

  it("fails closed when a cgroup v2 ancestor limit is malformed", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/system.slice/docker:deadbeef.scope\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/system.slice/docker:deadbeef.scope/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/system.slice/memory.max", "not-a-number\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("fails closed when a cgroup v1 memory limit file is absent", () => {
    const files = new Map([
      ["/proc/self/cgroup", "5:memory:/actions/job\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup/memory rw,nosuid,nodev,noexec,relatime - cgroup cgroup rw,memory\n",
      ],
      ["/sys/fs/cgroup/memory/actions/job/memory.limit_in_bytes", String(6 * GiB)],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("treats a numeric zero cgroup limit as binding", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/job\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/job/memory.max", "0\n"],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
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
    ).toBe(0);
  });

  it("retries resolution when the process cgroup membership changes once", () => {
    let membershipReads = 0;
    const stableMembership = "0::/new-job\n";
    const files = new Map([
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/old-job/memory.max", String(6 * GiB)],
      ["/sys/fs/cgroup/new-job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          if (path === "/proc/self/cgroup") {
            membershipReads += 1;
            return membershipReads === 1 ? "0::/old-job\n" : stableMembership;
          }
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
    expect(membershipReads).toBe(4);
  });

  it("retries when the initial cgroup is deleted while the process migrates", () => {
    let migrated = false;
    const oldMembership = "0::/old-job\n";
    const newMembership = "0::/new-job\n";
    const files = new Map([
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/new-job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          if (path === "/proc/self/cgroup") return migrated ? newMembership : oldMembership;
          if (path === "/sys/fs/cgroup/old-job/memory.max") {
            migrated = true;
            throw Object.assign(new Error("deleted"), { code: "ENOENT" });
          }
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toBe(5 * GiB);
    expect(migrated).toBe(true);
  });

  it("fails closed after three unstable cgroup membership snapshots", () => {
    let membershipReads = 0;
    const files = new Map([
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          if (path === "/proc/self/cgroup") {
            const membership = `0::/job-${membershipReads}\n`;
            membershipReads += 1;
            return membership;
          }
          if (/^\/sys\/fs\/cgroup\/job-[0-9]+\/memory\.max$/.test(path)) {
            return String(6 * GiB);
          }
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
    expect(membershipReads).toBe(6);
  });

  it("rejects parent traversal in the process cgroup membership", () => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/tenant/../job\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
      ["/sys/fs/cgroup/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it.each([
    ["mount root", "/..", "/sys/fs/cgroup"],
    ["mount point", "/", "/sys/fs/cgroup/\\056\\056/cgroup"],
  ])("rejects parent traversal in a relevant cgroup %s", (_label, mountRoot, mountPoint) => {
    const files = new Map([
      ["/proc/self/cgroup", "0::/job\n"],
      [
        "/proc/self/mountinfo",
        `29 23 0:26 ${mountRoot} ${mountPoint} rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n`,
      ],
      ["/sys/fs/cgroup/job/memory.max", String(5 * GiB)],
      ["/sys/fs/cgroup/cgroup.controllers", "cpu memory\n"],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it.each([
    "x::/job\n",
    "1::/job\n",
    "0:memory:/job\n",
  ])("rejects invalid Linux cgroup hierarchy metadata: %s", (membership) => {
    const files = new Map([
      ["/proc/self/cgroup", membership],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup/memory rw,nosuid,nodev,noexec,relatime - cgroup cgroup rw,memory\n",
      ],
      ["/sys/fs/cgroup/memory/job/memory.limit_in_bytes", String(5 * GiB)],
      ["/sys/fs/cgroup/memory/memory.limit_in_bytes", String(8 * GiB)],
    ]);

    expect(() =>
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          const value = files.get(path);
          if (value === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return value;
        },
      }),
    ).toThrow("cgroup memory capacity");
  });

  it("accepts a legitimate v1 named hierarchy without treating it as cgroup v2", () => {
    let membershipReads = 0;

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          if (path === "/proc/self/cgroup") {
            membershipReads += 1;
            return "1:name=systemd:/user.slice\n";
          }
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
      }),
    ).toBe(8 * GiB);
    expect(membershipReads).toBe(2);
  });

  it("selects the tightest limit across a complete cgroup v1 ancestry", () => {
    const files = new Map([
      ["/proc/self/cgroup", "1:name=systemd:/actions/job\n5:memory:/actions/job\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup/memory rw,nosuid,nodev,noexec,relatime - cgroup cgroup rw,memory\n",
      ],
      ["/sys/fs/cgroup/memory/actions/job/memory.limit_in_bytes", String(6 * GiB)],
      ["/sys/fs/cgroup/memory/actions/memory.limit_in_bytes", String(5 * GiB)],
      ["/sys/fs/cgroup/memory/memory.limit_in_bytes", String(16 * GiB)],
    ]);

    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "linux",
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

  it("preserves non-Linux fallback handling for a zero limit", () => {
    expect(
      getOcrRuntimeEffectiveMemoryBytes({
        hostPlatform: "darwin",
        physicalMemoryBytes: 8 * GiB,
        readTextFile: (path) => {
          if (path === "/sys/fs/cgroup/memory.max") return "0\n";
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
