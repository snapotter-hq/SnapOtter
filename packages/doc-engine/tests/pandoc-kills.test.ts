import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

// pandoc.ts caches version detection in module-level state, so each case loads a
// fresh module with its own mocked child_process. These target the mutants the
// first suite left alive: the exact spawnSync/spawn option objects, the
// `status !== 0 || !r.stdout` fallback (each operand isolated), the
// `/pandoc\s+(\d+)/` major-version regex, and the settle-once guard in runPandoc.

async function loadWithVersion(status: number | null, stdout: string) {
  vi.resetModules();
  const spawnSync = vi.fn(() => ({ status, stdout }));
  const spawn = vi.fn();
  vi.doMock("node:child_process", () => ({ spawnSync, spawn }));
  const mod = await import("../src/pandoc.js");
  return { mod, spawnSync, spawn };
}

function selfContainedFlags(mod: {
  buildPandocArgs: (i: string, o: string, opts: object) => string[];
}) {
  // Strip the fixed prefix so only the version-derived flags remain.
  return mod.buildPandocArgs("in.md", "out.html", { selfContained: true }).slice(4);
}

describe("pandoc version-detection spawnSync options", () => {
  afterEach(() => vi.resetModules());

  it("probes `pandoc --version` with the exact encoding and stdio options", async () => {
    const { mod, spawnSync } = await loadWithVersion(0, "pandoc 3.1.2\n");
    selfContainedFlags(mod);
    expect(spawnSync).toHaveBeenCalledWith("pandoc", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  });
});

describe("pandoc selfContainedArgs version branch", () => {
  afterEach(() => vi.resetModules());

  it("major 3 yields --embed-resources --standalone", async () => {
    const { mod } = await loadWithVersion(0, "pandoc 3.1.2\n");
    expect(selfContainedFlags(mod)).toEqual(["--embed-resources", "--standalone"]);
  });

  it("major 2 yields --self-contained (multi-space banner also kills \\s+ -> \\s)", async () => {
    const { mod } = await loadWithVersion(0, "pandoc  2.17.1.1\n");
    expect(selfContainedFlags(mod)).toEqual(["--self-contained"]);
  });

  it("a two-digit major (10) still takes the >=3 path (kills \\d+ -> \\d)", async () => {
    const { mod } = await loadWithVersion(0, "pandoc 10.0.1\n");
    expect(selfContainedFlags(mod)).toEqual(["--embed-resources", "--standalone"]);
  });

  it("output with no version token falls back to --embed-resources --standalone without caching", async () => {
    const { mod, spawnSync } = await loadWithVersion(0, "some unexpected banner\n");
    expect(selfContainedFlags(mod)).toEqual(["--embed-resources", "--standalone"]);
    spawnSync.mockReturnValueOnce({ status: 0, stdout: "pandoc 2.17.1.1\n" });
    expect(selfContainedFlags(mod)).toEqual(["--self-contained"]);
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it("nonzero status falls back to --embed-resources --standalone even with a 2.x banner without caching (kills the status operand)", async () => {
    // status !== 0 is true, stdout is a valid 2.x banner: only the || short-circuit reaches the fallback.
    const { mod, spawnSync } = await loadWithVersion(1, "pandoc 2.17.1.1\n");
    expect(selfContainedFlags(mod)).toEqual(["--embed-resources", "--standalone"]);
    spawnSync.mockReturnValueOnce({ status: 0, stdout: "pandoc 2.17.1.1\n" });
    expect(selfContainedFlags(mod)).toEqual(["--self-contained"]);
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it("null/empty stdout with status 0 falls back to --embed-resources --standalone without caching (kills the !stdout operand)", async () => {
    // status !== 0 is false, !stdout is true (null when spawnSync fails to capture stdout):
    // the other || operand must guard r.stdout.match().
    const { mod, spawnSync } = await loadWithVersion(0, null as unknown as string);
    expect(selfContainedFlags(mod)).toEqual(["--embed-resources", "--standalone"]);
    spawnSync.mockReturnValueOnce({ status: 0, stdout: "pandoc 2.17.1.1\n" });
    expect(selfContainedFlags(mod)).toEqual(["--self-contained"]);
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });
});

class FakeChild extends EventEmitter {
  stderr = new EventEmitter();
  kill = vi.fn();
}

describe("pandoc runPandoc spawn options and settle-once", () => {
  afterEach(() => vi.resetModules());

  it("spawns with stdio ignore/pipe/pipe", async () => {
    vi.resetModules();
    const child = new FakeChild();
    const spawn = vi.fn(() => child);
    vi.doMock("node:child_process", () => ({
      spawn,
      spawnSync: vi.fn(() => ({ status: 0, stdout: "pandoc 3.1.2" })),
    }));
    const mod = await import("../src/pandoc.js");
    const p = mod.runPandoc("in.md", "out.html");
    child.emit("close", 0, null);
    await expect(p).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      stdio: ["ignore", "pipe", "pipe"],
    });
  });

  it("settles once: a close after an error does not flip the result", async () => {
    vi.resetModules();
    const child = new FakeChild();
    const spawn = vi.fn(() => child);
    vi.doMock("node:child_process", () => ({
      spawn,
      spawnSync: vi.fn(() => ({ status: 0, stdout: "pandoc 3" })),
    }));
    const mod = await import("../src/pandoc.js");
    const p = mod.runPandoc("in.md", "out.html");
    const boom = new Error("spawn error");
    child.emit("error", boom);
    // A late close(0) must be ignored because `settled` is already true; if the
    // settled guard is inverted, this would try to resolve an already-rejected promise.
    child.emit("close", 0, null);
    await expect(p).rejects.toBe(boom);
  });

  it("rejects with the exit code and stderr tail on nonzero close", async () => {
    vi.resetModules();
    const child = new FakeChild();
    const spawn = vi.fn(() => child);
    vi.doMock("node:child_process", () => ({
      spawn,
      spawnSync: vi.fn(() => ({ status: 0, stdout: "pandoc 3" })),
    }));
    const mod = await import("../src/pandoc.js");
    const p = mod.runPandoc("in.md", "out.html");
    child.stderr.emit("data", Buffer.from("boom detail"));
    child.emit("close", 3, null);
    await expect(p).rejects.toThrow(/pandoc exited 3: .*boom detail/);
  });
});
