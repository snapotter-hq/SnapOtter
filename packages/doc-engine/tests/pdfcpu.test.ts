import { spawn } from "node:child_process";
import { isSafeMessageError, isToolInputError } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpawnHelpers } from "./helpers/spawn-capture.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const mockSpawn = vi.mocked(spawn);
const h = makeSpawnHelpers(mockSpawn);

const validStamp = { text: "DRAFT", position: "c", fontSize: 24, opacity: 0.5, rotation: 45 };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PDFCPU_PATH = "/usr/bin/pdfcpu";
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  delete process.env.PDFCPU_PATH;
});

describe("runPdfcpu (shared runner via pdfcpuCropMargin)", () => {
  it("prepends -c disable to every invocation", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf"));
    const args = h.lastArgs();
    expect(args[0]).toBe("-c");
    expect(args[1]).toBe("disable");
  });

  it("resolves on exit 0", async () => {
    h.nextClose({ stdout: "done", code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).resolves.toBeUndefined();
  });

  it("rejects on non-zero exit with the stderr tail", async () => {
    h.nextClose({ stderr: "pdfcpu: cannot read file", code: 1 });
    const err = await import("../src/pdfcpu.js")
      .then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf"))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("pdfcpu exited 1: pdfcpu: cannot read file");
    expect((err as NodeJS.ErrnoException).syscall).toBeUndefined();
  });

  it("falls back to stdout in the error when stderr is empty or whitespace-only", async () => {
    h.nextClose({ stdout: "problem on stdout", code: 2 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toThrow("pdfcpu exited 2: problem on stdout");

    h.nextClose({
      stderr: "  \n",
      stdout: "stdout-only diagnostic\n",
      code: null,
      signal: "SIGKILL",
    });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toMatchObject({
      message: "pdfcpu exited SIGKILL: stdout-only diagnostic",
      code: "ENOMEM",
      syscall: "spawn",
      path: "/usr/bin/pdfcpu",
      signal: "SIGKILL",
    });
  });

  it("reports the signal and tags as an errno-coded spawn failure when code is null (#3829)", async () => {
    h.nextClose({ stderr: "killed\n", code: null, signal: "SIGKILL" });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toMatchObject({
      message: "pdfcpu exited SIGKILL: killed",
      code: "ENOMEM",
      syscall: "spawn",
      path: "/usr/bin/pdfcpu",
      signal: "SIGKILL",
    });
  });

  it("reports a crash signal as a bug-kind ENGINE_CRASHED SafeError, not a spawn failure (#4684)", async () => {
    h.nextClose({ stderr: "panic\n", code: null, signal: "SIGBUS" });
    const err = await import("../src/pdfcpu.js")
      .then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf"))
      .catch((e: unknown) => e);
    expect(isSafeMessageError(err)).toBe(true);
    expect(err).toMatchObject({
      message: "The document engine (pdfcpu) crashed while processing this file.",
      kind: "bug",
      code: "ENGINE_CRASHED",
      statusCode: 500,
    });
    expect((err as NodeJS.ErrnoException).syscall).toBeUndefined();
    expect((err as Error).cause).toMatchObject({
      message: "pdfcpu exited SIGBUS: panic",
      signal: "SIGBUS",
    });
  });

  it("falls back to a spawn ENOMEM message when a signal kill produces no output (#3829)", async () => {
    h.nextClose({ stderr: "", stdout: "", code: null, signal: "SIGTERM" });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toMatchObject({
      message: "spawn /usr/bin/pdfcpu ENOMEM",
      code: "ENOMEM",
      syscall: "spawn",
      path: "/usr/bin/pdfcpu",
      signal: "SIGTERM",
    });
  });

  it("tags exit codes 126 and 127 as errno-coded spawn failures (#3829)", async () => {
    h.nextClose({ stderr: "sh: exec format error\n", code: 126 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toMatchObject({
      message: "pdfcpu exited 126: sh: exec format error",
      code: "ENOEXEC",
      syscall: "spawn",
      path: "/usr/bin/pdfcpu",
    });

    h.nextClose({ stderr: "sh: pdfcpu: not found\n", code: 127 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuNup("/in.pdf", 2, "/out.pdf")),
    ).rejects.toMatchObject({
      message: "pdfcpu exited 127: sh: pdfcpu: not found",
      code: "ENOENT",
      syscall: "spawn",
      path: "/usr/bin/pdfcpu",
    });
  });

  it("rejects on an error event", async () => {
    h.nextError(new Error("spawn pdfcpu ENOENT"));
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")),
    ).rejects.toThrow("spawn pdfcpu ENOENT");
  });

  it("throws when the binary is unavailable", async () => {
    vi.resetModules();
    vi.doMock("../src/binaries.js", () => ({ resolvePdfcpu: () => null }));
    const mod = await import("../src/pdfcpu.js");
    await expect(mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")).rejects.toThrow(
      "pdfcpu binary not found (set PDFCPU_PATH or install pdfcpu)",
    );
    vi.doUnmock("../src/binaries.js");
    vi.resetModules();
  });

  it("kills with SIGKILL and rejects after the 60s deadline", async () => {
    const mod = await import("../src/pdfcpu.js");
    vi.useFakeTimers();
    try {
      const child = h.nextManual();
      const settled = expect(mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf")).rejects.toThrow(
        "pdfcpu timed out after 60s",
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects immediately with Canceled without spawning when signal is already aborted", async () => {
    const mod = await import("../src/pdfcpu.js");
    const ac = new AbortController();
    ac.abort();
    await expect(
      mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf", { signal: ac.signal }),
    ).rejects.toThrow("Canceled");
    await expect(mod.pdfcpuNup("/in.pdf", 2, "/out.pdf", { signal: ac.signal })).rejects.toThrow(
      "Canceled",
    );
    await expect(
      mod.pdfcpuBooklet("/in.pdf", 2, "/out.pdf", { signal: ac.signal }),
    ).rejects.toThrow("Canceled");
    await expect(
      mod.pdfcpuTextStamp("/in.pdf", validStamp, "/out.pdf", { signal: ac.signal }),
    ).rejects.toThrow("Canceled");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("kills the child with SIGKILL and rejects with Canceled when signal aborts mid-run across all pdfcpu wrappers", async () => {
    const mod = await import("../src/pdfcpu.js");
    const calls = [
      (signal: AbortSignal) => mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf", { signal }),
      (signal: AbortSignal) => mod.pdfcpuNup("/in.pdf", 2, "/out.pdf", { signal }),
      (signal: AbortSignal) => mod.pdfcpuBooklet("/in.pdf", 2, "/out.pdf", { signal }),
      (signal: AbortSignal) => mod.pdfcpuTextStamp("/in.pdf", validStamp, "/out.pdf", { signal }),
    ];
    for (const invoke of calls) {
      const child = h.nextManual();
      const ac = new AbortController();
      const pending = invoke(ac.signal);
      ac.abort();
      await expect(pending).rejects.toThrow("Canceled");
      expect(child.killSignals).toContain("SIGKILL");
    }
  });

  it("removes the abort listener on close, error, and timeout", async () => {
    const mod = await import("../src/pdfcpu.js");
    const acClose = new AbortController();
    const removeClose = vi.spyOn(acClose.signal, "removeEventListener");
    h.nextClose({ code: 0 });
    await mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf", { signal: acClose.signal });
    expect(removeClose).toHaveBeenCalledWith("abort", expect.any(Function));

    const acErr = new AbortController();
    const removeErr = vi.spyOn(acErr.signal, "removeEventListener");
    h.nextError(new Error("spawn pdfcpu ENOENT"));
    await expect(
      mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf", { signal: acErr.signal }),
    ).rejects.toThrow("spawn pdfcpu ENOENT");
    expect(removeErr).toHaveBeenCalledWith("abort", expect.any(Function));

    vi.useFakeTimers();
    try {
      const acTimeout = new AbortController();
      const removeTimeout = vi.spyOn(acTimeout.signal, "removeEventListener");
      h.nextManual();
      const settled = expect(
        mod.pdfcpuCropMargin("/in.pdf", 10, "/out.pdf", {
          timeoutMs: 5_000,
          signal: acTimeout.signal,
        }),
      ).rejects.toThrow("pdfcpu timed out after 5s");
      await vi.advanceTimersByTimeAsync(5_000);
      await settled;
      expect(removeTimeout).toHaveBeenCalledWith("abort", expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pdfcpuCropMargin", () => {
  it("builds crop <margin> <in> <out> after the -c disable prefix", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 20, "/out.pdf"));
    expect(h.lastArgs()).toEqual(["-c", "disable", "crop", "20", "/in.pdf", "/out.pdf"]);
  });

  it("stringifies the numeric margin", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 0, "/out.pdf"));
    expect(h.lastArgs()[3]).toBe("0");
  });

  it("rejects a negative margin before spawning", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", -1, "/out.pdf")),
    ).rejects.toThrow("Crop margin must be 0-2000 points");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects a margin above 2000", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 2001, "/out.pdf")),
    ).rejects.toThrow("Crop margin must be 0-2000 points");
  });

  it("rejects a non-finite margin (NaN)", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", Number.NaN, "/out.pdf")),
    ).rejects.toThrow("Crop margin must be 0-2000 points");
  });

  it("accepts the boundary values 0 and 2000", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuCropMargin("/in.pdf", 2000, "/out.pdf")),
    ).resolves.toBeUndefined();
  });
});

function pagesInfo(rots: number[]): string {
  const pageBoundaries = Object.fromEntries(
    rots.map((rot, i) => [
      String(i + 1),
      { rot, mediaBox: { rect: { ll: { x: 0, y: 0 }, ur: { x: 612, y: 792 } } } },
    ]),
  );
  return JSON.stringify({ header: {}, infos: [{ pageCount: rots.length, pageBoundaries }] });
}

describe("pdfcpuCrop (#4988)", () => {
  it("passes a uniform margin as a single number", async () => {
    h.nextClose({ code: 0 });
    const m = await import("../src/pdfcpu.js");
    await m.pdfcpuCrop("/in.pdf", { mode: "uniform", margin: 20 }, "/out.pdf");
    expect(h.lastArgs()).toEqual(["-c", "disable", "crop", "20", "/in.pdf", "/out.pdf"]);
  });

  it("passes per-side margins in pdfcpu's top right bottom left order", async () => {
    h.nextClose({ stdout: pagesInfo([0]), code: 0 });
    h.nextClose({ code: 0 });
    const m = await import("../src/pdfcpu.js");
    await m.pdfcpuCrop(
      "/in.pdf",
      { mode: "sides", top: 10, right: 20, bottom: 30, left: 40 },
      "/out.pdf",
    );
    expect(h.lastArgs()).toEqual(["-c", "disable", "crop", "10 20 30 40", "/in.pdf", "/out.pdf"]);
  });

  // pdfcpu's top-left anchor offset is in PDF user space, where y grows
  // upward, so moving the region down the page needs a negative y offset.
  it("anchors a region to each page's top-left corner", async () => {
    h.nextClose({ stdout: pagesInfo([0]), code: 0 });
    h.nextClose({ code: 0 });
    const m = await import("../src/pdfcpu.js");
    await m.pdfcpuCrop(
      "/in.pdf",
      { mode: "region", x: 10, y: 20, width: 288, height: 432 },
      "/out.pdf",
    );
    expect(h.lastArgs()).toEqual([
      "-c",
      "disable",
      "crop",
      "pos:tl, off:10 -20, dim: 288 432 abs",
      "/in.pdf",
      "/out.pdf",
    ]);
  });

  it("writes a zero offset without a minus sign", async () => {
    h.nextClose({ stdout: pagesInfo([0]), code: 0 });
    h.nextClose({ code: 0 });
    const m = await import("../src/pdfcpu.js");
    await m.pdfcpuCrop("/in.pdf", { mode: "region", x: 0, y: 0, width: 306, height: 396 }, "/o");
    expect(h.lastArgs()[3]).toBe("pos:tl, off:0 0, dim: 306 396 abs");
  });

  // The box is given as displayed. pdfcpu measures the unrotated page, so a
  // rotated page anchors to the corner that shows as top-left (#5134).
  it.each([
    [90, "pos:bl, off:20 10, dim: 432 288 abs"],
    [180, "pos:br, off:-10 20, dim: 288 432 abs"],
    [270, "pos:tr, off:-20 -10, dim: 432 288 abs"],
  ])("maps a region onto a page rotated %i degrees", async (rot, description) => {
    h.nextClose({ stdout: pagesInfo([rot]), code: 0 });
    h.nextClose({ code: 0 });
    const m = await import("../src/pdfcpu.js");
    await m.pdfcpuCrop(
      "/in.pdf",
      { mode: "region", x: 10, y: 20, width: 288, height: 432 },
      "/out.pdf",
    );
    expect(h.lastArgs()).toEqual(["-c", "disable", "crop", description, "/in.pdf", "/out.pdf"]);
  });

  it.each([
    [90, "20 30 40 10"],
    [180, "30 40 10 20"],
    [270, "40 10 20 30"],
  ])("rotates per-side margins onto a page rotated %i degrees", async (rot, margins) => {
    h.nextClose({ stdout: pagesInfo([rot]), code: 0 });
    h.nextClose({ code: 0 });
    const m = await import("../src/pdfcpu.js");
    await m.pdfcpuCrop(
      "/in.pdf",
      { mode: "sides", top: 10, right: 20, bottom: 30, left: 40 },
      "/out.pdf",
    );
    expect(h.lastArgs()[3]).toBe(margins);
  });

  it("crops pages with different rotations in one pass each, chaining the output", async () => {
    h.nextClose({ stdout: pagesInfo([0, 90, 0, 90]), code: 0 });
    h.nextClose({ code: 0 });
    h.nextClose({ code: 0 });
    const m = await import("../src/pdfcpu.js");
    await m.pdfcpuCrop(
      "/in.pdf",
      { mode: "region", x: 0, y: 0, width: 288, height: 432 },
      "/out.pdf",
    );
    const crops = mockSpawn.mock.calls.slice(-2).map((c) => (c[1] as string[]).slice(2));
    expect(crops).toEqual([
      ["crop", "-p", "1,3", "pos:tl, off:0 0, dim: 288 432 abs", "/in.pdf", "/out.pdf"],
      ["crop", "-p", "2,4", "pos:bl, off:0 0, dim: 432 288 abs", "/out.pdf"],
    ]);
  });

  it("leaves a uniform margin alone on rotated pages, with no info call", async () => {
    h.nextClose({ code: 0 });
    const m = await import("../src/pdfcpu.js");
    await m.pdfcpuCrop("/in.pdf", { mode: "uniform", margin: 20 }, "/out.pdf");
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("rejects out-of-range values before spawning", async () => {
    const m = await import("../src/pdfcpu.js");
    await expect(
      m.pdfcpuCrop("/in.pdf", { mode: "sides", top: -1, right: 0, bottom: 0, left: 0 }, "/o"),
    ).rejects.toThrow("Crop margins must be 0-2000 points");
    await expect(
      m.pdfcpuCrop(
        "/in.pdf",
        { mode: "sides", top: 0, right: Number.NaN, bottom: 0, left: 0 },
        "/o",
      ),
    ).rejects.toThrow("Crop margins must be 0-2000 points");
    await expect(
      m.pdfcpuCrop("/in.pdf", { mode: "region", x: -1, y: 0, width: 10, height: 10 }, "/o"),
    ).rejects.toThrow("Crop region must start inside the page and have a positive size");
    await expect(
      m.pdfcpuCrop("/in.pdf", { mode: "region", x: 0, y: 0, width: 0, height: 10 }, "/o"),
    ).rejects.toThrow("Crop region must start inside the page and have a positive size");
    await expect(m.pdfcpuCrop("/in.pdf", { mode: "uniform", margin: 2001 }, "/o")).rejects.toThrow(
      "Crop margin must be 0-2000 points",
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("assertCropFits (#4988)", () => {
  const letter = { width: 612, height: 792 };
  const a4 = { width: 595.28, height: 841.89 };

  async function inputError(fn: () => void): Promise<Error> {
    let err: unknown;
    try {
      fn();
    } catch (e) {
      err = e;
    }
    expect(isToolInputError(err)).toBe(true);
    expect(err).toMatchObject({ statusCode: 400, code: "INVALID_SETTINGS" });
    return err as Error;
  }

  it("checks a uniform margin the same way as assertCropMarginFits", async () => {
    const m = await import("../src/pdfcpu.js");
    expect(() => m.assertCropFits({ mode: "uniform", margin: 305 }, [letter])).not.toThrow();
    const err = await inputError(() =>
      m.assertCropFits({ mode: "uniform", margin: 306 }, [letter]),
    );
    expect(err.message).toContain("Crop margin is too large for this PDF");
  });

  it("accepts side margins that leave some area on every page", async () => {
    const m = await import("../src/pdfcpu.js");
    const sides = { mode: "sides", top: 0, right: 300, bottom: 390, left: 0 } as const;
    expect(() => m.assertCropFits(sides, [letter, a4])).not.toThrow();
  });

  it("rejects side margins that meet across the narrowest or shortest page", async () => {
    const m = await import("../src/pdfcpu.js");
    const wide = { mode: "sides", top: 0, right: 300, bottom: 0, left: 295.28 } as const;
    const err = await inputError(() => m.assertCropFits(wide, [letter, a4]));
    expect(err.message).toBe(
      "Crop margins are too large for this PDF. Left plus right must be less than 595.28 points and top plus bottom less than 792 points.",
    );
    const tall = { mode: "sides", top: 400, right: 0, bottom: 392, left: 0 } as const;
    await inputError(() => m.assertCropFits(tall, [letter, a4]));
  });

  it("accepts a region that fits inside every page, edge to edge", async () => {
    const m = await import("../src/pdfcpu.js");
    const quarter = { mode: "region", x: 0, y: 0, width: 306, height: 396 } as const;
    expect(() => m.assertCropFits(quarter, [letter])).not.toThrow();
    const full = { mode: "region", x: 0, y: 0, width: 612, height: 792 } as const;
    expect(() => m.assertCropFits(full, [letter])).not.toThrow();
  });

  // pdfcpu writes a CropBox that runs past the MediaBox instead of failing.
  it("rejects a region that runs off the smallest page", async () => {
    const m = await import("../src/pdfcpu.js");
    const label = { mode: "region", x: 400, y: 0, width: 288, height: 432 } as const;
    const err = await inputError(() => m.assertCropFits(label, [letter, a4]));
    expect(err.message).toBe(
      "Crop region doesn't fit on every page. It must stay within 595.28 x 792 points, the smallest page size.",
    );
    const low = { mode: "region", x: 0, y: 500, width: 288, height: 432 } as const;
    await inputError(() => m.assertCropFits(low, [letter]));
  });
});

describe("pdfcpuPageSizes", () => {
  const box = (llx: number, lly: number, urx: number, ury: number, rot = 0) => ({
    mediaBox: { rect: { ll: { x: llx, y: lly }, ur: { x: urx, y: ury } } },
    rot,
  });
  const info = (pageBoundaries: unknown) =>
    JSON.stringify({ header: {}, infos: [{ pageCount: 3, pageBoundaries }] });

  it("runs info -j over every page and returns the distinct MediaBox sizes", async () => {
    h.nextClose({
      stdout: info({
        "1": box(0, 0, 419.53, 595.28),
        "2": box(0, 0, 612, 792),
        "3": box(0, 0, 419.53, 595.28),
      }),
      code: 0,
    });
    const sizes = await import("../src/pdfcpu.js").then((m) => m.pdfcpuPageSizes("/in.pdf"));
    expect(h.lastArgs()).toEqual(["-c", "disable", "info", "-j", "-p", "1-", "/in.pdf"]);
    expect(sizes).toEqual([
      { width: 419.53, height: 595.28 },
      { width: 612, height: 792 },
    ]);
  });

  // A crop box is given as displayed, so a /Rotate 90 page counts as 792 x 612
  // for the fit check even though its unrotated MediaBox is 612 x 792 (#5134).
  it("reports a rotated page's displayed size, offset from the origin", async () => {
    h.nextClose({
      stdout: info({ "1": box(100, 200, 712, 992, 90), "2": box(0, 0, 612, 792, -90) }),
      code: 0,
    });
    const sizes = await import("../src/pdfcpu.js").then((m) => m.pdfcpuPageSizes("/in.pdf"));
    expect(sizes).toEqual([{ width: 792, height: 612 }]);
  });

  it("rejects output with no usable page sizes", async () => {
    const m = await import("../src/pdfcpu.js");
    for (const stdout of [
      info({}),
      info({ "1": { rot: 0 } }),
      info({ "1": { mediaBox: { rect: { ll: { x: 0, y: 0 }, ur: { x: "wide", y: 10 } } } } }),
      info({ "1": box(0, 0, 612, 792), "2": box(10, 10, 10, 500) }),
      "not json",
    ]) {
      h.nextClose({ stdout, code: 0 });
      await expect(m.pdfcpuPageSizes("/in.pdf")).rejects.toThrow(
        "pdfcpu info reported no page sizes",
      );
    }
  });

  it("propagates a pdfcpu failure", async () => {
    h.nextClose({ stderr: "pdfcpu: cannot read file", code: 1 });
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuPageSizes("/in.pdf")),
    ).rejects.toThrow("pdfcpu exited 1: pdfcpu: cannot read file");
  });
});

describe("pdfcpuPages (#5134)", () => {
  it("returns each page's unrotated size and normalised rotation in page order", async () => {
    h.nextClose({
      stdout: JSON.stringify({
        infos: [
          {
            pageBoundaries: {
              "10": { rot: 450, mediaBox: { rect: { ll: { x: 0, y: 0 }, ur: { x: 10, y: 20 } } } },
              "2": { rot: -90, mediaBox: { rect: { ll: { x: 0, y: 0 }, ur: { x: 30, y: 40 } } } },
              "1": { mediaBox: { rect: { ll: { x: 0, y: 0 }, ur: { x: 50, y: 60 } } } },
            },
          },
        ],
      }),
      code: 0,
    });
    const pages = await import("../src/pdfcpu.js").then((m) => m.pdfcpuPages("/in.pdf"));
    expect(pages).toEqual([
      { page: 1, width: 50, height: 60, rotation: 0 },
      { page: 2, width: 30, height: 40, rotation: 270 },
      { page: 10, width: 10, height: 20, rotation: 90 },
    ]);
  });
});

describe("assertCropMarginFits (#4421)", () => {
  const a5 = { width: 419.53, height: 595.28 };

  it("accepts a margin that leaves some area on every page", async () => {
    const m = await import("../src/pdfcpu.js");
    expect(() => m.assertCropMarginFits(0, [a5])).not.toThrow();
    expect(() => m.assertCropMarginFits(209, [a5])).not.toThrow();
  });

  it("rejects a margin of half the shorter side or more as a 400 input error", async () => {
    const m = await import("../src/pdfcpu.js");
    for (const margin of [209.765, 210, 250]) {
      let err: unknown;
      try {
        m.assertCropMarginFits(margin, [a5]);
      } catch (e) {
        err = e;
      }
      expect(isToolInputError(err)).toBe(true);
      expect(err).toMatchObject({ statusCode: 400, code: "INVALID_SETTINGS" });
      expect((err as Error).message).toBe(
        "Crop margin is too large for this PDF. It must be less than 209.76 points, half the shortest page side.",
      );
    }
  });

  it("measures against the smallest page when sizes differ", async () => {
    const m = await import("../src/pdfcpu.js");
    const sizes = [
      { width: 612, height: 792 },
      { width: 300, height: 100 },
    ];
    expect(() => m.assertCropMarginFits(49, sizes)).not.toThrow();
    expect(() => m.assertCropMarginFits(50, sizes)).toThrow(
      "It must be less than 50 points, half the shortest page side.",
    );
  });
});

describe("pdfcpuNup", () => {
  it("builds nup <out> <n> <in> (out before n and in)", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuNup("/in.pdf", 4, "/out.pdf"));
    expect(h.lastArgs()).toEqual(["-c", "disable", "nup", "/out.pdf", "4", "/in.pdf"]);
  });

  it("accepts each valid n-up value", async () => {
    for (const n of [2, 3, 4, 8, 9, 12, 16] as const) {
      h.nextClose({ code: 0 });
      await import("../src/pdfcpu.js").then((m) => m.pdfcpuNup("/in.pdf", n, "/out.pdf"));
      expect(h.lastArgs()[4]).toBe(String(n));
    }
  });

  it("rejects an invalid n-up value before spawning", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuNup("/in.pdf", 5 as never, "/out.pdf")),
    ).rejects.toThrow("Invalid n-up value: 5. Must be one of: 2, 3, 4, 8, 9, 12, 16");
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("pdfcpuResize", () => {
  it("builds resize 'dim:<w> <h>, enforce:true' <in> <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuResize("/in.pdf", { width: 288, height: 432, keepOrientation: false }, "/out.pdf"),
    );
    expect(h.lastArgs()).toEqual([
      "-c",
      "disable",
      "resize",
      "dim:288 432, enforce:true",
      "/in.pdf",
      "/out.pdf",
    ]);
  });

  it("lets pdfcpu turn the target to each page's orientation when keepOrientation is set", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuResize("/in.pdf", { width: 288, height: 432, keepOrientation: true }, "/out.pdf"),
    );
    expect(h.lastArgs()[3]).toBe("dim:288 432, enforce:false");
  });

  it("rounds the dimensions to two decimals", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuResize(
        "/in.pdf",
        { width: 283.46456, height: 425.19685, keepOrientation: false },
        "/out.pdf",
      ),
    );
    expect(h.lastArgs()[3]).toBe("dim:283.46 425.2, enforce:true");
  });

  it.each([
    [0, 432],
    [288, Number.NaN],
    [35, 432],
    [288, 14401],
  ])("rejects a %s x %s point page before spawning", async (width, height) => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuResize("/in.pdf", { width, height, keepOrientation: false }, "/out.pdf"),
      ),
    ).rejects.toThrow("Page size must be 36-14400 points on each side");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("accepts the boundary sizes 36 and 14400 points", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuResize("/in.pdf", { width: 36, height: 14400, keepOrientation: false }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
  });
});

describe("pdfcpuBooklet", () => {
  it("builds booklet <out> <n> <in>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) => m.pdfcpuBooklet("/in.pdf", 2, "/out.pdf"));
    expect(h.lastArgs()).toEqual(["-c", "disable", "booklet", "/out.pdf", "2", "/in.pdf"]);
  });

  it("accepts each valid booklet value", async () => {
    for (const n of [2, 4, 6, 8] as const) {
      h.nextClose({ code: 0 });
      await import("../src/pdfcpu.js").then((m) => m.pdfcpuBooklet("/in.pdf", n, "/out.pdf"));
      expect(h.lastArgs()[4]).toBe(String(n));
    }
  });

  it("rejects an invalid booklet value (rejects an n-up-only value)", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuBooklet("/in.pdf", 3 as never, "/out.pdf")),
    ).rejects.toThrow("Invalid booklet value: 3. Must be one of: 2, 4, 6, 8");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects 16 (valid for n-up but not booklet)", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) => m.pdfcpuBooklet("/in.pdf", 16 as never, "/out.pdf")),
    ).rejects.toThrow("Invalid booklet value: 16");
  });
});

describe("pdfcpuTextStamp", () => {
  it("builds stamp add -- <text> <desc> <in> <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuTextStamp("/in.pdf", validStamp, "/out.pdf"),
    );
    expect(h.lastArgs()).toEqual([
      "-c",
      "disable",
      "stamp",
      "add",
      "--",
      "DRAFT",
      "pos:c, points:24, op:0.5, rotation:45",
      "/in.pdf",
      "/out.pdf",
    ]);
  });

  it("formats the description with pos/points/op/rotation keys in order", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuTextStamp(
        "/in.pdf",
        { text: "Page %p of %P", position: "br", fontSize: 12, opacity: 1, rotation: -90 },
        "/out.pdf",
      ),
    );
    const args = h.lastArgs();
    expect(args[5]).toBe("Page %p of %P");
    expect(args[6]).toBe("pos:br, points:12, op:1, rotation:-90");
  });

  it.each([
    ["%", "%%"],
    ["100%", "100%%"],
    ["%x", "%%x"],
    ["already %% literal", "already %%%% literal"],
  ])("escapes literal pdfcpu percent markers in %j", async (text, expected) => {
    h.nextClose({ code: 0 });
    await import("../src/pdfcpu.js").then((m) =>
      m.pdfcpuTextStamp("/in.pdf", { ...validStamp, text }, "/out.pdf"),
    );
    expect(h.lastArgs()[5]).toBe(expected);
  });

  it("rejects empty text before spawning", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, text: "" }, "/out.pdf"),
      ),
    ).rejects.toThrow("Stamp text must be 1-200 characters");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects text longer than 200 characters", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, text: "x".repeat(201) }, "/out.pdf"),
      ),
    ).rejects.toThrow("Stamp text must be 1-200 characters");
  });

  it("rejects an unknown position anchor", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, position: "middle" }, "/out.pdf"),
      ),
    ).rejects.toThrow(
      "Invalid stamp position: middle. Must be one of: tl, tc, tr, l, c, r, bl, bc, br",
    );
  });

  it("accepts each valid position anchor", async () => {
    for (const position of ["tl", "tc", "tr", "l", "c", "r", "bl", "bc", "br"]) {
      h.nextClose({ code: 0 });
      await import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, position }, "/out.pdf"),
      );
      expect(h.lastArgs()[6]).toContain(`pos:${position},`);
    }
  });

  it("rejects a font size below 6", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: 5 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Font size must be 6-72");
  });

  it("rejects a font size above 72", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: 73 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Font size must be 6-72");
  });

  it("accepts font sizes at the 6 and 72 boundaries", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: 6 }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: 72 }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects opacity below 0.05", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, opacity: 0.04 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Opacity must be 0.05-1");
  });

  it("rejects opacity above 1", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, opacity: 1.01 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Opacity must be 0.05-1");
  });

  it("rejects rotation below -180", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, rotation: -181 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Rotation must be -180..180");
  });

  it("rejects rotation above 180", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, rotation: 181 }, "/out.pdf"),
      ),
    ).rejects.toThrow("Rotation must be -180..180");
  });

  it("accepts rotation at the -180 and 180 boundaries", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, rotation: -180 }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, rotation: 180 }, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a non-finite font size (NaN)", async () => {
    await expect(
      import("../src/pdfcpu.js").then((m) =>
        m.pdfcpuTextStamp("/in.pdf", { ...validStamp, fontSize: Number.NaN }, "/out.pdf"),
      ),
    ).rejects.toThrow("Font size must be 6-72");
  });
});
