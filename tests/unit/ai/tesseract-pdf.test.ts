import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readdirSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import { PassThrough } from "node:stream";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSpawn, mockRunAdaptiveTesseract, mockStatfs } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockRunAdaptiveTesseract: vi.fn(),
  mockStatfs: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  statfs: mockStatfs,
}));
vi.mock("../../../packages/ai/src/tesseract.js", () => ({
  runAdaptiveTesseract: mockRunAdaptiveTesseract,
  runTesseract: vi.fn(),
}));

import {
  MAX_PDF_OCR_OUTPUT_BYTES,
  MAX_PDF_OCR_PAGES,
  parsePdfPageSpec,
  preparePdfOcrPages,
  runTesseractPdf,
} from "../../../packages/ai/src/tesseract-pdf.js";

interface MockChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
}

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  return child;
}

function completeChild(
  child: MockChild,
  { stdout = "", stderr = "", code = 0 }: { stdout?: string; stderr?: string; code?: number } = {},
) {
  queueMicrotask(() => {
    if (stdout) child.stdout.write(stdout);
    if (stderr) child.stderr.write(stderr);
    child.emit("close", code, null);
  });
}

function mockSuccessfulGhostscript(totalPages = 3, pageBox = "[0 0 612 792]") {
  mockSpawn.mockImplementation((_executable: string, args: string[]) => {
    const child = createMockChild();
    if (args.some((arg) => arg.includes("pdfpagecount"))) {
      completeChild(child, { stdout: `${totalPages}\n` });
    } else if (args.some((arg) => arg.includes("/CropBox"))) {
      completeChild(child, { stdout: `${pageBox}\n` });
    } else {
      const outputArg = args.find((arg) => arg.startsWith("-sOutputFile="));
      if (!outputArg) throw new Error("render command did not include an output file");
      writeFileSync(outputArg.slice("-sOutputFile=".length), rasterBuffer);
      completeChild(child);
    }
    return child;
  });
}

let scratchDir: string;
let inputPath: string;
let rasterBuffer: Buffer;

beforeEach(async () => {
  vi.clearAllMocks();
  mockStatfs.mockResolvedValue({ bavail: 1_000_000n, bsize: 4_096n });
  scratchDir = mkdtempSync(join(tmpdir(), "snapotter-tesseract-pdf-"));
  inputPath = join(scratchDir, "input with spaces.pdf");
  writeFileSync(inputPath, "%PDF mock");
  rasterBuffer = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  mockRunAdaptiveTesseract.mockImplementation(async (pagePath: string) => ({
    text: `Text from ${basename(pagePath)}\n`,
    engine: "tesseract",
    provider: "native",
    device: "cpu",
  }));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("parsePdfPageSpec", () => {
  it("selects every page for all", () => {
    expect(parsePdfPageSpec(" all ", 4)).toEqual([1, 2, 3, 4]);
  });

  it("expands ranges, removes duplicates, and restores document order", () => {
    expect(parsePdfPageSpec("5, 1-3, 2, 7-8", 10)).toEqual([1, 2, 3, 5, 7, 8]);
  });

  it.each([
    "",
    "1,,2",
    "0",
    "-1",
    "3-1",
    "1-a",
    "1-2-3",
    "2,",
  ])("rejects invalid page selection %j", (spec) => {
    expect(() => parsePdfPageSpec(spec, 10)).toThrow(/Invalid|No pages/);
  });

  it("rejects pages outside the document", () => {
    expect(() => parsePdfPageSpec("1,11", 10)).toThrow("document has 10 pages");
  });

  it("rejects selections over the fixed safety cap before rasterization", () => {
    expect(MAX_PDF_OCR_PAGES).toBe(50);
    expect(() => parsePdfPageSpec("1-51", 100)).toThrow("Too many pages for OCR (max 50)");
    expect(() => parsePdfPageSpec("all", 51)).toThrow("Too many pages for OCR (max 50)");
  });
});

describe("runTesseractPdf", () => {
  it("can prepare ordered raster pages for the isolated accurate runtime", async () => {
    mockSuccessfulGhostscript(3);

    const prepared = await preparePdfOcrPages(inputPath, scratchDir, { pages: "3,1" });

    expect(prepared.pages.map(({ page }) => page)).toEqual([1, 3]);
    expect(prepared.pages.every(({ path }) => existsSync(path))).toBe(true);
    expect(prepared.remainingTimeoutMs()).toBeGreaterThan(0);
    await prepared.cleanup();
    expect(readdirSync(scratchDir)).toEqual(["input with spaces.pdf"]);
  });

  it("rejects accurate PDF rasters that exceed the aggregate scratch-byte cap", async () => {
    mockSpawn.mockImplementation((_executable: string, args: string[]) => {
      const child = createMockChild();
      if (args.some((arg) => arg.includes("pdfpagecount"))) {
        completeChild(child, { stdout: "2\n" });
      } else if (args.some((arg) => arg.includes("/CropBox"))) {
        completeChild(child, { stdout: "[0 0 612 792]\n" });
      } else {
        const outputArg = args.find((arg) => arg.startsWith("-sOutputFile="));
        if (!outputArg) throw new Error("render command did not include an output file");
        const outputPath = outputArg.slice("-sOutputFile=".length);
        writeFileSync(outputPath, rasterBuffer);
        truncateSync(outputPath, 300 * 1024 * 1024);
        completeChild(child);
      }
      return child;
    });

    await expect(preparePdfOcrPages(inputPath, scratchDir)).rejects.toThrow(
      "aggregate scratch limit",
    );

    expect(readdirSync(scratchDir)).toEqual(["input with spaces.pdf"]);
  });

  it("rejects an accurate PDF raster when scratch free space falls below its reserve", async () => {
    mockSuccessfulGhostscript(1);
    mockStatfs.mockResolvedValue({ bavail: 1n, bsize: 4_096n });

    await expect(preparePdfOcrPages(inputPath, scratchDir)).rejects.toThrow(
      "free scratch space reserve",
    );

    expect(readdirSync(scratchDir)).toEqual(["input with spaces.pdf"]);
  });

  it("rasterizes selected pages without a shell and returns ordered page text and metadata", async () => {
    mockSuccessfulGhostscript();
    const onProgress = vi.fn();

    const result = await runTesseractPdf(inputPath, scratchDir, {
      pages: "3,1",
      language: "ja",
      ghostscriptPath: "/usr/local/bin/gs",
      tesseractPath: "/usr/local/bin/tesseract",
      onProgress,
    });

    expect(result).toEqual({
      text: "--- Page 1 ---\n\nText from page-1.png\n\n--- Page 3 ---\n\nText from page-3.png",
      pages: 2,
      pageNumbers: [1, 3],
      engine: "tesseract",
      provider: "native",
      device: "cpu",
    });
    expect(mockRunAdaptiveTesseract).toHaveBeenCalledTimes(2);
    expect(mockRunAdaptiveTesseract.mock.calls[0][1]).toMatchObject({
      language: "ja",
      tesseractPath: "/usr/local/bin/tesseract",
    });

    for (const [executable, args, options] of mockSpawn.mock.calls) {
      expect(executable).toBe("/usr/local/bin/gs");
      expect(options).toMatchObject({ shell: false, windowsHide: true });
      expect(args).toContain("-dSAFER");
    }
    const renderCalls = mockSpawn.mock.calls.filter(([, args]) =>
      (args as string[]).some((arg) => arg.startsWith("-sOutputFile=")),
    );
    expect(renderCalls).toHaveLength(2);
    expect(renderCalls[0][1]).toEqual(
      expect.arrayContaining(["-dFirstPage=1", "-dLastPage=1", "-r300"]),
    );
    expect(renderCalls[1][1]).toEqual(
      expect.arrayContaining(["-dFirstPage=3", "-dLastPage=3", "-r300"]),
    );
    expect(onProgress).toHaveBeenCalledWith(100, "Tesseract PDF OCR complete");
  });

  it("applies requested local-contrast preprocessing to Fast PDF pages", async () => {
    rasterBuffer = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#888888" },
    })
      .png()
      .toBuffer();
    mockSuccessfulGhostscript(1);

    await runTesseractPdf(inputPath, scratchDir, { pages: "1", enhance: true });

    expect(basename(mockRunAdaptiveTesseract.mock.calls[0][0])).toBe("enhanced-page-1.png");
  });

  it("reduces DPI to keep oversized pages under dimension and pixel limits", async () => {
    mockSuccessfulGhostscript(1, "[0 0 3600 3600]");

    await runTesseractPdf(inputPath, scratchDir, { pages: "1", dpi: 300 });

    const renderCall = mockSpawn.mock.calls.find(([, args]) =>
      (args as string[]).some((arg) => arg.startsWith("-sOutputFile=")),
    );
    expect(renderCall?.[1]).toContain("-r100");
  });

  it("rejects pages that cannot meet the minimum OCR raster quality", async () => {
    mockSuccessfulGhostscript(1, "[0 0 7200 7200]");

    await expect(runTesseractPdf(inputPath, scratchDir, { pages: "1", dpi: 300 })).rejects.toThrow(
      "72 DPI quality floor",
    );
    expect(mockRunAdaptiveTesseract).not.toHaveBeenCalled();
  });

  it("applies PDF UserUnit before calculating the safe raster DPI", async () => {
    mockSuccessfulGhostscript(1, "[0 0 72 72]\n100");

    await expect(runTesseractPdf(inputPath, scratchDir, { pages: "1", dpi: 300 })).rejects.toThrow(
      "72 DPI quality floor",
    );
    expect(
      mockSpawn.mock.calls.some(([, args]) =>
        (args as string[]).some((arg) => arg.startsWith("-sOutputFile=")),
      ),
    ).toBe(false);
    expect(mockRunAdaptiveTesseract).not.toHaveBeenCalled();
  });

  it("rejects a raster whose actual dimensions exceed the calculated cap", async () => {
    rasterBuffer = await sharp({
      create: { width: 6_001, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    mockSuccessfulGhostscript(1);

    await expect(runTesseractPdf(inputPath, scratchDir, { pages: "1" })).rejects.toThrow(
      "unsafe raster dimensions",
    );
    expect(mockRunAdaptiveTesseract).not.toHaveBeenCalled();
  });

  it("passes one deadline and AbortSignal through to every Tesseract page", async () => {
    mockSuccessfulGhostscript(2);
    const controller = new AbortController();

    await runTesseractPdf(inputPath, scratchDir, {
      timeoutMs: 12_000,
      signal: controller.signal,
    });

    expect(mockRunAdaptiveTesseract).toHaveBeenCalledTimes(2);
    for (const [, options] of mockRunAdaptiveTesseract.mock.calls) {
      expect(options.signal).toBe(controller.signal);
      expect(options.timeoutMs).toBeGreaterThan(0);
      expect(options.timeoutMs).toBeLessThanOrEqual(12_000);
    }
  });

  it("uses a monotonic deadline for prepared accurate-runtime pages", async () => {
    vi.useFakeTimers();
    const monotonicNow = vi.spyOn(performance, "now").mockReturnValue(0);
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    mockSuccessfulGhostscript(1);

    const prepared = await preparePdfOcrPages(inputPath, scratchDir, { timeoutMs: 100 });
    monotonicNow.mockReturnValue(25);
    vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));

    expect(prepared.remainingTimeoutMs()).toBe(75);
    await prepared.cleanup();
  });

  it("uses a monotonic aggregate deadline across PDF OCR wall-clock jumps", async () => {
    vi.useFakeTimers();
    const monotonicNow = vi.spyOn(performance, "now").mockReturnValue(0);
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    mockSuccessfulGhostscript(2);
    mockRunAdaptiveTesseract.mockImplementation(async (pagePath: string) => {
      if (mockRunAdaptiveTesseract.mock.calls.length === 1) {
        monotonicNow.mockReturnValue(60);
        vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));
      }
      return {
        text: `Text from ${basename(pagePath)}\n`,
        engine: "tesseract",
        provider: "native",
        device: "cpu",
      };
    });

    await runTesseractPdf(inputPath, scratchDir, { timeoutMs: 100 });

    expect(mockRunAdaptiveTesseract.mock.calls[0]?.[1].timeoutMs).toBe(100);
    expect(mockRunAdaptiveTesseract.mock.calls[1]?.[1].timeoutMs).toBe(40);
  });

  it("enforces one aggregate text budget across a 50-page PDF", async () => {
    mockSuccessfulGhostscript(50);
    const textPerPage = "x".repeat(Math.ceil(MAX_PDF_OCR_OUTPUT_BYTES / 50));
    mockRunAdaptiveTesseract.mockResolvedValue({
      text: textPerPage,
      engine: "tesseract",
      provider: "native",
      device: "cpu",
    });

    await expect(runTesseractPdf(inputPath, scratchDir, { pages: "all" })).rejects.toThrow(
      "aggregate output limit",
    );

    expect(mockRunAdaptiveTesseract).toHaveBeenCalledTimes(50);
  });

  it("gives each Tesseract page only the remaining aggregate stdout budget", async () => {
    mockSuccessfulGhostscript(2);
    mockRunAdaptiveTesseract
      .mockResolvedValueOnce({
        text: "x".repeat(100),
        engine: "tesseract",
        provider: "native",
        device: "cpu",
      })
      .mockResolvedValueOnce({
        text: "done",
        engine: "tesseract",
        provider: "native",
        device: "cpu",
      });

    await runTesseractPdf(inputPath, scratchDir, { pages: "all" });

    const firstBudget = mockRunAdaptiveTesseract.mock.calls[0][1].maxStdoutBytes;
    const secondBudget = mockRunAdaptiveTesseract.mock.calls[1][1].maxStdoutBytes;
    expect(firstBudget).toBeLessThan(MAX_PDF_OCR_OUTPUT_BYTES);
    expect(secondBudget).toBe(
      firstBudget - Buffer.byteLength(`${"x".repeat(100)}\n\n--- Page 2 ---\n\n`),
    );
  });

  it("cleans generated page files when page OCR fails", async () => {
    mockSuccessfulGhostscript(1);
    let generatedPage = "";
    mockRunAdaptiveTesseract.mockImplementation(async (pagePath: string) => {
      generatedPage = pagePath;
      expect(existsSync(pagePath)).toBe(true);
      throw new Error("OCR failed");
    });

    await expect(runTesseractPdf(inputPath, scratchDir)).rejects.toThrow("OCR failed");

    expect(generatedPage).not.toBe("");
    expect(existsSync(generatedPage)).toBe(false);
    expect(readdirSync(scratchDir)).toEqual(["input with spaces.pdf"]);
  });

  it("rejects invalid page specs before any raster page is created", async () => {
    mockSuccessfulGhostscript(3);

    await expect(runTesseractPdf(inputPath, scratchDir, { pages: "1,,2" })).rejects.toThrow(
      "Invalid page selection",
    );

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockRunAdaptiveTesseract).not.toHaveBeenCalled();
  });

  it("reports an actionable error when Ghostscript is missing", async () => {
    mockSpawn.mockImplementation(() => {
      const child = createMockChild();
      queueMicrotask(() => {
        child.emit("error", Object.assign(new Error("spawn gs ENOENT"), { code: "ENOENT" }));
      });
      return child;
    });

    await expect(runTesseractPdf(inputPath, scratchDir)).rejects.toThrow(
      "Ghostscript executable not found. Install Ghostscript or set GS_PATH.",
    );
  });

  it("cancels an in-flight Ghostscript process and removes scratch output", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);
    const controller = new AbortController();

    const resultPromise = runTesseractPdf(inputPath, scratchDir, { signal: controller.signal });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    controller.abort();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(readdirSync(scratchDir)).toEqual(["input with spaces.pdf"]);
  });

  it("does not miss cancellation that races with Ghostscript startup", async () => {
    const child = createMockChild();
    const controller = new AbortController();
    mockSpawn.mockImplementation(() => {
      controller.abort();
      return child;
    });

    const resultPromise = runTesseractPdf(inputPath, scratchDir, { signal: controller.signal });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cleans scratch output even when a progress callback throws", async () => {
    mockSuccessfulGhostscript(1);

    await expect(
      runTesseractPdf(inputPath, scratchDir, {
        onProgress: () => {
          throw new Error("progress failed");
        },
      }),
    ).rejects.toThrow("progress failed");

    expect(readdirSync(scratchDir)).toEqual(["input with spaces.pdf"]);
  });

  it("force-kills a Ghostscript process that ignores the overall timeout", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseractPdf(inputPath, scratchDir, { timeoutMs: 100 });
    let settled = false;
    void resultPromise
      .finally(() => {
        settled = true;
      })
      .catch(() => {});
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(1_000);

    expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");
    expect(settled).toBe(false);
    child.emit("close", null, "SIGKILL");
    await expect(resultPromise).rejects.toThrow("PDF OCR timed out after 100ms");
  });
});
