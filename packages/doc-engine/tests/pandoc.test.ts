import { spawn, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpawnHelpers } from "./helpers/spawn-capture.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn(), spawnSync: vi.fn() }));

const mockSpawn = vi.mocked(spawn);
const mockSpawnSync = vi.mocked(spawnSync);
const h = makeSpawnHelpers(mockSpawn);

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.PANDOC_PATH;
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  delete process.env.PANDOC_PATH;
});

describe("buildPandocArgs base shape", () => {
  it("always starts with --sandbox then in -o out", async () => {
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/in.md", "/out.html")).toEqual([
      "--sandbox",
      "/in.md",
      "-o",
      "/out.html",
    ]);
  });

  it("appends extraArgs verbatim after the base args", async () => {
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(
      buildPandocArgs("/in.md", "/out.html", { extraArgs: ["--standalone", "--toc"] }),
    ).toEqual(["--sandbox", "/in.md", "-o", "/out.html", "--standalone", "--toc"]);
  });

  it("does not add self-contained flags when selfContained is false/omitted", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "pandoc 3.1.2\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    const args = buildPandocArgs("/in.md", "/out.html", { selfContained: false });
    expect(args).toEqual(["--sandbox", "/in.md", "-o", "/out.html"]);
    // Version was not probed because selfContained is false.
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("combines selfContained and extraArgs in order (self-contained first)", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "pandoc 3.1.2\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    const args = buildPandocArgs("/in.md", "/out.html", {
      selfContained: true,
      extraArgs: ["--metadata=title:X"],
    });
    expect(args).toEqual([
      "--sandbox",
      "/in.md",
      "-o",
      "/out.html",
      "--embed-resources",
      "--standalone",
      "--metadata=title:X",
    ]);
  });
});

describe("selfContainedArgs version detection", () => {
  it("uses --embed-resources --standalone for pandoc 3.x", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "pandoc 3.1.2\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--embed-resources",
      "--standalone",
    ]);
  });

  it("uses --self-contained for pandoc 2.x", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "pandoc 2.17.1.1\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--self-contained",
    ]);
  });

  it("uses --embed-resources for a future major (4.x -> >= 3 branch)", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "pandoc 4.0.0\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toContain("--embed-resources");
  });

  it("falls back to --self-contained when --version exits non-zero", async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: "" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toContain("--self-contained");
  });

  it("falls back to --self-contained when stdout is empty", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toContain("--self-contained");
  });

  it("defaults the major to 2 when the version string is unparseable", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "some banner without a number\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    // major defaults to 2, so we get the 2.x flag.
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toContain("--self-contained");
  });

  it("caches the detected flags: the version is probed only once", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "pandoc 3.1.2\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    buildPandocArgs("/i", "/o", { selfContained: true });
    buildPandocArgs("/i", "/o", { selfContained: true });
    buildPandocArgs("/i", "/o", { selfContained: true });
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });
});

describe("pandocBin / PANDOC_PATH", () => {
  it("defaults to bare 'pandoc'", async () => {
    mockSpawnSync.mockReturnValue({ status: 0 } as never);
    const { pandocAvailable } = await import("../src/pandoc.js");
    pandocAvailable();
    expect(mockSpawnSync).toHaveBeenCalledWith("pandoc", ["--version"], { stdio: "ignore" });
  });

  it("honors PANDOC_PATH", async () => {
    process.env.PANDOC_PATH = "/opt/pandoc/bin/pandoc";
    mockSpawnSync.mockReturnValue({ status: 0 } as never);
    const { pandocAvailable } = await import("../src/pandoc.js");
    pandocAvailable();
    expect(mockSpawnSync).toHaveBeenCalledWith("/opt/pandoc/bin/pandoc", ["--version"], {
      stdio: "ignore",
    });
  });
});

describe("pandocAvailable", () => {
  it("is true when --version exits 0", async () => {
    mockSpawnSync.mockReturnValue({ status: 0 } as never);
    const { pandocAvailable } = await import("../src/pandoc.js");
    expect(pandocAvailable()).toBe(true);
  });

  it("is false when --version exits non-zero", async () => {
    mockSpawnSync.mockReturnValue({ status: 1 } as never);
    const { pandocAvailable } = await import("../src/pandoc.js");
    expect(pandocAvailable()).toBe(false);
  });

  it("caches the result: --version runs only once", async () => {
    mockSpawnSync.mockReturnValue({ status: 0 } as never);
    const { pandocAvailable } = await import("../src/pandoc.js");
    expect(pandocAvailable()).toBe(true);
    expect(pandocAvailable()).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });
});

describe("runPandoc", () => {
  it("spawns with the built args and resolves on exit 0", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "pandoc 3.1.2\n" } as never);
    h.nextClose({ code: 0 });
    await import("../src/pandoc.js").then((m) => m.runPandoc("/in.md", "/out.html"));
    expect(h.lastBin()).toBe("pandoc");
    expect(h.lastArgs()).toEqual(["--sandbox", "/in.md", "-o", "/out.html"]);
  });

  it("passes selfContained flags through to the spawn argv", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "pandoc 3.1.2\n" } as never);
    h.nextClose({ code: 0 });
    await import("../src/pandoc.js").then((m) =>
      m.runPandoc("/in.md", "/out.html", { selfContained: true }),
    );
    expect(h.lastArgs()).toEqual([
      "--sandbox",
      "/in.md",
      "-o",
      "/out.html",
      "--embed-resources",
      "--standalone",
    ]);
  });

  it("rejects on non-zero exit with the stderr tail", async () => {
    h.nextClose({ stderr: "pandoc: unknown reader", code: 43 });
    await expect(
      import("../src/pandoc.js").then((m) => m.runPandoc("/in.md", "/out.html")),
    ).rejects.toThrow("pandoc exited 43: pandoc: unknown reader");
  });

  it("reports the signal when code is null", async () => {
    h.nextClose({ stderr: "died", code: null, signal: "SIGABRT" });
    await expect(
      import("../src/pandoc.js").then((m) => m.runPandoc("/in.md", "/out.html")),
    ).rejects.toThrow("pandoc exited SIGABRT: died");
  });

  it("rejects on an error event", async () => {
    h.nextError(new Error("spawn pandoc ENOENT"));
    await expect(
      import("../src/pandoc.js").then((m) => m.runPandoc("/in.md", "/out.html")),
    ).rejects.toThrow("spawn pandoc ENOENT");
  });

  it("uses the default 120s timeout and kills with SIGKILL", async () => {
    const mod = await import("../src/pandoc.js");
    vi.useFakeTimers();
    try {
      const child = h.nextManual();
      const settled = expect(mod.runPandoc("/in.md", "/out.html")).rejects.toThrow(
        "pandoc timed out after 120s",
      );
      await vi.advanceTimersByTimeAsync(120_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors a custom timeoutMs in the message", async () => {
    const mod = await import("../src/pandoc.js");
    vi.useFakeTimers();
    try {
      const child = h.nextManual();
      const settled = expect(
        mod.runPandoc("/in.md", "/out.html", { timeoutMs: 5_000 }),
      ).rejects.toThrow("pandoc timed out after 5s");
      await vi.advanceTimersByTimeAsync(5_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });
});
