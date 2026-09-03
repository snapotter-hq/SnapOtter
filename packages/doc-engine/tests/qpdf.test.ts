import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChild, type FakeChild, settleClose, settleError } from "./helpers/fake-child.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const mockSpawn = vi.mocked(spawn);

/** Queue one fake child for the next spawn call, pre-programmed to settle. */
function nextChild(
  opts: { stdout?: string; stderr?: string; code?: number | null; signal?: string | null } = {},
): void {
  mockSpawn.mockImplementationOnce(() => {
    const child = createFakeChild();
    settleClose(child, opts);
    return child as never;
  });
}

function nextChildError(err: Error): void {
  mockSpawn.mockImplementationOnce(() => {
    const child = createFakeChild();
    settleError(child, err);
    return child as never;
  });
}

/** Hand back the raw fake child so a test can drive events manually (timeouts). */
function nextManualChild(): FakeChild {
  const child = createFakeChild();
  mockSpawn.mockImplementationOnce(() => child as never);
  return child;
}

function lastSpawnArgs(): string[] {
  const calls = mockSpawn.mock.calls;
  return calls[calls.length - 1][1] as string[];
}
function lastSpawnBin(): string {
  const calls = mockSpawn.mock.calls;
  return calls[calls.length - 1][0] as string;
}
function lastSpawnOpts(): { stdio?: unknown } {
  const calls = mockSpawn.mock.calls;
  return calls[calls.length - 1][2] as { stdio?: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QPDF_PATH = "/usr/bin/qpdf";
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  delete process.env.QPDF_PATH;
});

describe("runQpdf via qpdfCheck (exit-code handling)", () => {
  it("passes the raw binary and args to spawn when no memory limit is set", async () => {
    nextChild({ stdout: "", code: 0 });
    await import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf"));
    expect(lastSpawnBin()).toBe("/usr/bin/qpdf");
    expect(lastSpawnArgs()).toEqual(["--check", "/doc.pdf"]);
  });

  it("spawns with piped stdout+stderr and ignored stdin", async () => {
    nextChild({ code: 0 });
    await import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf"));
    expect(lastSpawnOpts().stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  it("resolves on exit code 0", async () => {
    nextChild({ stdout: "check ok", code: 0 });
    await expect(
      import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf")),
    ).resolves.toBeUndefined();
  });

  it("resolves on exit code 3 (warnings only)", async () => {
    nextChild({ stdout: "minor warning", code: 3 });
    await expect(
      import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf")),
    ).resolves.toBeUndefined();
  });

  it("rejects on exit code 2 with the stderr tail in the message", async () => {
    nextChild({ stderr: "structural damage detected", code: 2 });
    await expect(import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf"))).rejects.toThrow(
      "qpdf exited 2: structural damage detected",
    );
  });

  it("rejects on exit code 1 (not 0/3)", async () => {
    nextChild({ stderr: "generic error", code: 1 });
    await expect(import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf"))).rejects.toThrow(
      "qpdf exited 1: generic error",
    );
  });

  it("falls back to stdout in the error message when stderr is empty", async () => {
    nextChild({ stdout: "stdout-only diagnostic", code: 2 });
    await expect(import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf"))).rejects.toThrow(
      "qpdf exited 2: stdout-only diagnostic",
    );
  });

  it("reports the signal when the exit code is null", async () => {
    nextChild({ stderr: "killed by signal", code: null, signal: "SIGTERM" });
    await expect(import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf"))).rejects.toThrow(
      "qpdf exited SIGTERM: killed by signal",
    );
  });

  it("rejects with the spawn error object on an error event", async () => {
    nextChildError(new Error("spawn qpdf ENOENT"));
    await expect(import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf"))).rejects.toThrow(
      "spawn qpdf ENOENT",
    );
  });

  it("throws a helpful message when the binary cannot be resolved", async () => {
    delete process.env.QPDF_PATH;
    vi.resetModules();
    vi.doMock("../src/binaries.js", () => ({ resolveQpdf: () => null }));
    const mod = await import("../src/qpdf.js");
    await expect(mod.qpdfCheck("/doc.pdf")).rejects.toThrow(
      "qpdf binary not found (set QPDF_PATH or install qpdf)",
    );
    vi.doUnmock("../src/binaries.js");
    vi.resetModules();
  });
});

describe("runQpdf memory-limit wrapping", () => {
  it("wraps the spawn through /bin/sh when SUBPROCESS_MEMORY_LIMIT_MB is set", async () => {
    process.env.SUBPROCESS_MEMORY_LIMIT_MB = "256";
    nextChild({ code: 0 });
    await import("../src/qpdf.js").then((m) => m.qpdfCheck("/doc.pdf"));
    expect(lastSpawnBin()).toBe("/bin/sh");
    const args = lastSpawnArgs();
    // ["-c", script, "sh", <kb>, bin, ...origArgs]; 256 MB => 262144 KB.
    expect(args[0]).toBe("-c");
    expect(args[2]).toBe("sh");
    expect(args[3]).toBe(String(256 * 1024));
    expect(args[4]).toBe("/usr/bin/qpdf");
    expect(args.slice(5)).toEqual(["--check", "/doc.pdf"]);
  });
});

describe("runQpdf timeout", () => {
  it("kills the child with SIGKILL and rejects after the deadline", async () => {
    const mod = await import("../src/qpdf.js");
    vi.useFakeTimers();
    try {
      const child = nextManualChild();
      // Attach the rejection expectation before advancing timers so the reject is
      // never observed as an unhandled rejection.
      const settled = expect(mod.qpdfCheck("/doc.pdf")).rejects.toThrow("qpdf timed out after 30s");
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
      expect(child.killed).toBe(true);
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects with QpdfTimeoutError so callers can tell a timeout from damage", async () => {
    const mod = await import("../src/qpdf.js");
    vi.useFakeTimers();
    try {
      nextManualChild();
      const settled = expect(mod.qpdfCheck("/doc.pdf")).rejects.toBeInstanceOf(
        mod.QpdfTimeoutError,
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("qpdfCheck argument shape", () => {
  it("invokes qpdf --check <file>", async () => {
    nextChild({ code: 0 });
    await import("../src/qpdf.js").then((m) => m.qpdfCheck("/path/to/report.pdf"));
    expect(lastSpawnArgs()).toEqual(["--check", "/path/to/report.pdf"]);
  });
});

describe("qpdfRequiresPassword", () => {
  it("passes --requires-password with stderr-only piping", async () => {
    nextChild({ code: 0 });
    await import("../src/qpdf.js").then((m) => m.qpdfRequiresPassword("/enc.pdf"));
    expect(lastSpawnArgs()).toEqual(["--requires-password", "/enc.pdf"]);
    expect(lastSpawnOpts().stdio).toEqual(["ignore", "ignore", "pipe"]);
  });

  it("returns true on exit code 0 (password required)", async () => {
    nextChild({ code: 0 });
    await expect(
      import("../src/qpdf.js").then((m) => m.qpdfRequiresPassword("/enc.pdf")),
    ).resolves.toBe(true);
  });

  it("returns false on exit code 2 (not encrypted)", async () => {
    nextChild({ code: 2 });
    await expect(
      import("../src/qpdf.js").then((m) => m.qpdfRequiresPassword("/plain.pdf")),
    ).resolves.toBe(false);
  });

  it("returns false on exit code 3 (correct password supplied)", async () => {
    nextChild({ code: 3 });
    await expect(
      import("../src/qpdf.js").then((m) => m.qpdfRequiresPassword("/plain.pdf")),
    ).resolves.toBe(false);
  });

  it("rejects on an error event", async () => {
    nextChildError(new Error("spawn failed hard"));
    await expect(
      import("../src/qpdf.js").then((m) => m.qpdfRequiresPassword("/enc.pdf")),
    ).rejects.toThrow("spawn failed hard");
  });

  it("throws when the binary is missing", async () => {
    vi.resetModules();
    vi.doMock("../src/binaries.js", () => ({ resolveQpdf: () => null }));
    const mod = await import("../src/qpdf.js");
    await expect(mod.qpdfRequiresPassword("/enc.pdf")).rejects.toThrow(
      "qpdf binary not found (set QPDF_PATH or install qpdf)",
    );
    vi.doUnmock("../src/binaries.js");
    vi.resetModules();
  });

  it("kills with SIGKILL and rejects on timeout", async () => {
    const mod = await import("../src/qpdf.js");
    vi.useFakeTimers();
    try {
      const child = nextManualChild();
      const settled = expect(mod.qpdfRequiresPassword("/enc.pdf")).rejects.toThrow(
        "qpdf timed out after 30s",
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects timeouts with QpdfTimeoutError, matching runQpdf", async () => {
    const mod = await import("../src/qpdf.js");
    vi.useFakeTimers();
    try {
      nextManualChild();
      const settled = expect(mod.qpdfRequiresPassword("/enc.pdf")).rejects.toBeInstanceOf(
        mod.QpdfTimeoutError,
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("qpdfPageCount", () => {
  it("passes --show-npages and parses the trimmed integer", async () => {
    nextChild({ stdout: "  17 \n", code: 0 });
    const n = await import("../src/qpdf.js").then((m) => m.qpdfPageCount("/doc.pdf"));
    expect(n).toBe(17);
    expect(lastSpawnArgs()).toEqual(["--show-npages", "/doc.pdf"]);
  });

  it("returns 0 when qpdf reports zero pages", async () => {
    nextChild({ stdout: "0\n", code: 0 });
    await expect(import("../src/qpdf.js").then((m) => m.qpdfPageCount("/doc.pdf"))).resolves.toBe(
      0,
    );
  });

  it("throws on non-numeric output, echoing the trimmed value", async () => {
    nextChild({ stdout: "not-a-number\n", code: 0 });
    await expect(import("../src/qpdf.js").then((m) => m.qpdfPageCount("/doc.pdf"))).rejects.toThrow(
      "qpdf returned a non-numeric page count: not-a-number",
    );
  });

  it("treats blank output as zero (Number('') is 0, which is finite)", async () => {
    nextChild({ stdout: "   \n", code: 0 });
    await expect(import("../src/qpdf.js").then((m) => m.qpdfPageCount("/doc.pdf"))).resolves.toBe(
      0,
    );
  });

  it("rejects Infinity-like tokens that are not finite numbers", async () => {
    nextChild({ stdout: "Infinity\n", code: 0 });
    await expect(import("../src/qpdf.js").then((m) => m.qpdfPageCount("/doc.pdf"))).rejects.toThrow(
      "qpdf returned a non-numeric page count: Infinity",
    );
  });
});
