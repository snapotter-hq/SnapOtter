import { spawn, spawnSync } from "node:child_process";
import { isToolInputError } from "@snapotter/shared";
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

  it("falls back to --embed-resources --standalone without caching when --version exits non-zero", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, stdout: "pandoc 2.17.1.1\n" } as never)
      .mockReturnValueOnce({ status: 0, stdout: "pandoc 2.17.1.1\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--embed-resources",
      "--standalone",
    ]);
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--self-contained",
    ]);
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--self-contained",
    ]);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
  });

  it("falls back to --embed-resources --standalone without caching when stdout is empty", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "" } as never)
      .mockReturnValueOnce({ status: 0, stdout: "pandoc 2.17.1.1\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--embed-resources",
      "--standalone",
    ]);
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--self-contained",
    ]);
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--self-contained",
    ]);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
  });

  it("falls back to --embed-resources --standalone without caching when the version string is unparseable", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "some banner without a number\n" } as never)
      .mockReturnValueOnce({ status: 0, stdout: "pandoc 2.17.1.1\n" } as never);
    const { buildPandocArgs } = await import("../src/pandoc.js");
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--embed-resources",
      "--standalone",
    ]);
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--self-contained",
    ]);
    expect(buildPandocArgs("/i", "/o", { selfContained: true })).toEqual([
      "--sandbox",
      "/i",
      "-o",
      "/o",
      "--self-contained",
    ]);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
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

  it("kills the child with SIGKILL and rejects with Canceled when signal aborts mid-run", async () => {
    const mod = await import("../src/pandoc.js");
    const child = h.nextManual();
    const ac = new AbortController();
    const p = mod.runPandoc("/in.epub", "/out.html", { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow("Canceled");
    expect(child.killSignals).toContain("SIGKILL");
  });

  it("rejects immediately with Canceled without spawning when signal is already aborted", async () => {
    const mod = await import("../src/pandoc.js");
    const ac = new AbortController();
    ac.abort();
    await expect(
      mod.runPandoc("/in.epub", "/out.html", { selfContained: true, signal: ac.signal }),
    ).rejects.toThrow("Canceled");
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("removes the abort listener on normal close and on spawn error", async () => {
    const mod = await import("../src/pandoc.js");
    const ac1 = new AbortController();
    const removeSpy1 = vi.spyOn(ac1.signal, "removeEventListener");
    h.nextClose({ code: 0 });
    await mod.runPandoc("/in.epub", "/out.html", { signal: ac1.signal });
    expect(removeSpy1).toHaveBeenCalledWith("abort", expect.any(Function));

    const ac2 = new AbortController();
    const removeSpy2 = vi.spyOn(ac2.signal, "removeEventListener");
    h.nextError(new Error("spawn failed"));
    await expect(mod.runPandoc("/in.epub", "/out.html", { signal: ac2.signal })).rejects.toThrow(
      "spawn failed",
    );
    expect(removeSpy2).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("marks corrupt/invalid container and parse exits (44, 63, 64, 91) as ToolInputError even with non-matching stderr", async () => {
    const mod = await import("../src/pandoc.js");
    for (const code of [44, 63, 64, 91]) {
      h.nextClose({ stderr: `PandocExit_${code}\n`, code });
      const err = await mod.runPandoc("/bad.epub", "/out.html").catch((e: unknown) => e);
      expect(isToolInputError(err)).toBe(true);
    }
  });

  it("markIfPandocInputError matches each stderr pattern even when exit code is not 44/63/64/91", async () => {
    const { markIfPandocInputError } = await import("../src/pandoc.js");
    const samples = [
      "No entry on path: META-INF/container.xml",
      "Couldn't extract ePub file: Unknown compression method",
      "couldn't parse docx file: DocxError",
      "couldn't unpack docx container",
      "Invalid XML in 'META-INF/container.xml': unexpected EOF",
      "UTF-8 decoding error at byte 42",
      "Error parsing YAML metadata at line 4",
    ];
    for (const stderr of samples) {
      expect(isToolInputError(markIfPandocInputError(new Error("fail"), 1, stderr))).toBe(true);
      expect(isToolInputError(markIfPandocInputError(new Error("fail"), null, stderr))).toBe(true);
    }
    expect(
      isToolInputError(markIfPandocInputError(new Error("fail"), 1, "pandoc: Out of memory")),
    ).toBe(false);
  });

  it("marks DRM/invalid-UTF-8 exception on exit 1 as ToolInputError and strips leading warnings and GHC HasCallStack backtrace", async () => {
    const mod = await import("../src/pandoc.js");
    const ghcStderr = [
      "[WARNING] Could not fetch resource http:/127.0.0.1:9/remote.png",
      "pandoc: Uncaught exception text-2.1.3:Data.Text.Encoding.Error.UnicodeException:",
      "",
      "Cannot decode byte '\\x89': Data.Text.Internal.Encoding: Invalid UTF-8 stream",
      "",
      "HasCallStack backtrace:",
      "  collectExceptionAnnotation, called at libraries/ghc-internal/src/GHC/Internal/Exception.hs:170:37",
      "  throw, called at libraries/text/src/Data/Text/Encoding.Error.hs:101:23",
    ].join("\n");
    h.nextClose({ stderr: ghcStderr, code: 1 });
    const err = (await mod.runPandoc("/drm.epub", "/out.html").catch((e: unknown) => e)) as Error;
    expect(isToolInputError(err)).toBe(true);
    expect(err.message).toContain("Invalid UTF-8 stream");
    expect(err.message).not.toContain("[WARNING]");
    expect(err.message).not.toContain("HasCallStack backtrace");
    expect(err.message.split("\n").length).toBeLessThanOrEqual(2);
  });

  it("leaves non-input pandoc failures unmarked so genuine bugs still report", async () => {
    const mod = await import("../src/pandoc.js");
    h.nextClose({ stderr: "pandoc: unknown reader", code: 43 });
    const err = await mod.runPandoc("/in.md", "/out.html").catch((e: unknown) => e);
    expect(isToolInputError(err)).toBe(false);
  });
});
