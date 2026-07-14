import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import {
  type RunTesseractOptions,
  runAdaptiveTesseract,
  type TesseractLanguage,
  type TesseractRuntimeMetadata,
} from "./tesseract.js";

export const MAX_PDF_OCR_PAGES = 50;
/** Shared Fast/accurate UTF-8 text ceiling, including PDF page headings. */
export const MAX_PDF_OCR_OUTPUT_BYTES = 1_000_000;

const DEFAULT_DPI = 300;
const MIN_DPI = 72;
const MAX_DPI = 600;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const FORCE_KILL_DELAY_MS = 1_000;
const MAX_RASTER_DIMENSION = 6_000;
const MAX_RASTER_PIXELS = 25_000_000;
const MAX_PREPARED_RASTER_BYTES = 512n * 1024n * 1024n;
const MIN_SCRATCH_FREE_BYTES = 256n * 1024n * 1024n;
const MAX_DIAGNOSTIC_OUTPUT = 16_384;

const PAGE_COUNT_PROGRAM = "PDFname (r) file runpdfbegin pdfpagecount = quit";
const PAGE_BOX_PROGRAM =
  "PDFname (r) file runpdfbegin /page PageNumber pdfgetpage def /box page /CropBox known { page /CropBox get } { page /MediaBox get } ifelse def box == page /UserUnit known { page /UserUnit get } { 1 } ifelse == quit";

export interface RunTesseractPdfOptions {
  pages?: string;
  language?: TesseractLanguage;
  /** Apply conservative local-contrast preprocessing before Tesseract. */
  enhance?: boolean;
  /** Requested raster resolution. Oversized pages are automatically rendered lower. */
  dpi?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
  /** Override for deployments where Ghostscript is not on PATH. */
  ghostscriptPath?: string;
  /** Override for deployments where Tesseract is not on PATH. */
  tesseractPath?: string;
}

export interface TesseractPdfResult extends TesseractRuntimeMetadata {
  text: string;
  pages: number;
  pageNumbers: number[];
}

export interface PreparedPdfOcrPage {
  page: number;
  path: string;
}

export interface PreparedPdfOcrPages {
  pages: PreparedPdfOcrPage[];
  totalPages: number;
  remainingTimeoutMs: () => number;
  cleanup: () => Promise<void>;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
}

interface PageBox {
  widthPoints: number;
  heightPoints: number;
}

function abortError(): Error {
  const error = new Error("PDF OCR was canceled");
  error.name = "AbortError";
  return error;
}

function validatePositiveInteger(value: number, label: string, maximum?: number): number {
  if (!Number.isInteger(value) || value <= 0 || (maximum !== undefined && value > maximum)) {
    const range = maximum === undefined ? "a positive integer" : `an integer from 1 to ${maximum}`;
    throw new Error(`${label} must be ${range}`);
  }
  return value;
}

/** Parse a strict 1-based page list such as `all`, `1-3,5`, or `2,4-6`. */
export function parsePdfPageSpec(spec: string, totalPages: number): number[] {
  validatePositiveInteger(totalPages, "PDF page count");
  const normalized = spec.trim();
  if (!normalized) throw new Error("No pages specified");

  if (normalized.toLowerCase() === "all") {
    if (totalPages > MAX_PDF_OCR_PAGES) {
      throw new Error(`Too many pages for OCR (max ${MAX_PDF_OCR_PAGES})`);
    }
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const selected = new Set<number>();
  for (const rawPart of normalized.split(",")) {
    const part = rawPart.trim();
    if (!part) throw new Error(`Invalid page selection: "${spec}"`);

    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`Invalid page selection: "${part}"`);

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end < 1) {
      throw new Error(`Invalid page selection: "${part}" (pages start at 1)`);
    }
    if (start > end) {
      throw new Error(`Invalid page selection: "${part}" (range start is after range end)`);
    }
    if (end > totalPages) {
      throw new Error(`Invalid page selection: "${part}" (document has ${totalPages} pages)`);
    }

    for (let page = start; page <= end; page += 1) {
      selected.add(page);
      if (selected.size > MAX_PDF_OCR_PAGES) {
        throw new Error(`Too many pages for OCR (max ${MAX_PDF_OCR_PAGES})`);
      }
    }
  }

  if (selected.size === 0) throw new Error("No pages specified");
  return [...selected].sort((left, right) => left - right);
}

function appendDiagnostic(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString();
  return next.length <= MAX_DIAGNOSTIC_OUTPUT ? next : next.slice(-MAX_DIAGNOSTIC_OUTPUT);
}

function runGhostscript(
  executable: string,
  args: string[],
  timeoutMs: number,
  totalTimeoutMs: number,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let termination: "abort" | "timeout" | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const timeoutTimer = setTimeout(() => terminate("timeout"), timeoutMs);
    timeoutTimer.unref();

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (error?: Error, result?: ProcessResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(result as ProcessResult);
    };

    const finishTermination = () => {
      if (termination === "abort") finish(abortError());
      else if (termination === "timeout") {
        finish(new Error(`PDF OCR timed out after ${totalTimeoutMs}ms`));
      }
    };

    function terminate(reason: "abort" | "timeout") {
      if (settled || termination) return;
      termination = reason;
      try {
        child.kill("SIGTERM");
      } catch {
        // A concurrent process exit owns settlement through close/error.
      }
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Wait for close before deleting the raster scratch directory.
          }
        }
      }, FORCE_KILL_DELAY_MS);
      forceKillTimer.unref();
    }

    const onAbort = () => terminate("abort");
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) terminate("abort");

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout = appendDiagnostic(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr = appendDiagnostic(stderr, chunk);
    });

    child.once("error", (error: NodeJS.ErrnoException) => {
      if (termination) return;
      if (error.code === "ENOENT") {
        finish(
          new Error("Ghostscript executable not found. Install Ghostscript or set GS_PATH.", {
            cause: error,
          }),
        );
        return;
      }
      finish(new Error(`Unable to start Ghostscript: ${error.message}`, { cause: error }));
    });

    child.once("close", (code, closeSignal) => {
      if (termination) {
        finishTermination();
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim();
        const status = code === null ? `signal ${closeSignal ?? "unknown"}` : `code ${code}`;
        finish(new Error(`Ghostscript exited with ${status}${detail ? `: ${detail}` : ""}`));
        return;
      }
      finish(undefined, { stdout, stderr });
    });
  });
}

function parsePageCount(stdout: string): number {
  const count = Number(stdout.trim());
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error("Ghostscript returned an invalid or empty PDF page count");
  }
  return count;
}

function parsePageBox(stdout: string, pageNumber: number): PageBox {
  const arrayMatch = stdout.match(/\[([^\]]+)\]\s*$/m);
  const values = arrayMatch?.[1]
    .trim()
    .split(/\s+/)
    .map((value) => Number(value));
  if (values?.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Ghostscript returned invalid dimensions for PDF page ${pageNumber}`);
  }

  const userUnitMatch = stdout.match(/\]\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)\s*$/);
  const userUnit = userUnitMatch ? Number(userUnitMatch[1]) : 1;
  if (!Number.isFinite(userUnit) || userUnit <= 0) {
    throw new Error(`PDF page ${pageNumber} has an invalid UserUnit`);
  }

  const widthPoints = Math.abs(values[2] - values[0]) * userUnit;
  const heightPoints = Math.abs(values[3] - values[1]) * userUnit;
  if (widthPoints <= 0 || heightPoints <= 0) {
    throw new Error(`PDF page ${pageNumber} has invalid dimensions`);
  }
  return { widthPoints, heightPoints };
}

async function validateRasterPage(path: string, pageNumber: number): Promise<string> {
  const canonicalPath = await realpath(path);
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(canonicalPath, { limitInputPixels: MAX_RASTER_PIXELS }).metadata();
  } catch (error) {
    throw new Error(`PDF page ${pageNumber} produced an unsafe or invalid OCR raster`, {
      cause: error,
    });
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_RASTER_DIMENSION ||
    height > MAX_RASTER_DIMENSION ||
    width * height > MAX_RASTER_PIXELS
  ) {
    throw new Error(`PDF page ${pageNumber} produced unsafe raster dimensions`);
  }
  return canonicalPath;
}

async function retainRasterWithinScratchBudget(
  path: string,
  scratchDir: string,
  retainedBytes: bigint,
): Promise<bigint> {
  const rasterInfo = await stat(path, { bigint: true });
  if (!rasterInfo.isFile()) throw new Error("PDF OCR produced a non-regular raster file");

  const nextRetainedBytes = retainedBytes + rasterInfo.size;
  if (nextRetainedBytes > MAX_PREPARED_RASTER_BYTES) {
    throw new Error("PDF OCR rasters exceed the 512 MiB aggregate scratch limit");
  }

  const scratchInfo = await statfs(scratchDir, { bigint: true });
  const availableBytes = scratchInfo.bavail * scratchInfo.bsize;
  if (availableBytes < MIN_SCRATCH_FREE_BYTES) {
    throw new Error("PDF OCR cannot preserve the 256 MiB free scratch space reserve");
  }
  return nextRetainedBytes;
}

function safeDpi(pageBox: PageBox, requestedDpi: number, pageNumber: number): number {
  const requestedWidth = (pageBox.widthPoints / 72) * requestedDpi;
  const requestedHeight = (pageBox.heightPoints / 72) * requestedDpi;
  const dimensionScale = Math.min(
    1,
    MAX_RASTER_DIMENSION / requestedWidth,
    MAX_RASTER_DIMENSION / requestedHeight,
  );
  const pixelScale = Math.min(1, Math.sqrt(MAX_RASTER_PIXELS / (requestedWidth * requestedHeight)));
  const dpi = Math.max(1, Math.floor(requestedDpi * Math.min(dimensionScale, pixelScale)));
  if (dpi < MIN_DPI) {
    throw new Error(
      `PDF page ${pageNumber} is too large to rasterize at the ${MIN_DPI} DPI quality floor`,
    );
  }
  const width = Math.ceil((pageBox.widthPoints / 72) * dpi);
  const height = Math.ceil((pageBox.heightPoints / 72) * dpi);
  if (
    width > MAX_RASTER_DIMENSION ||
    height > MAX_RASTER_DIMENSION ||
    width * height > MAX_RASTER_PIXELS
  ) {
    throw new Error(`PDF page ${pageNumber} is too large to rasterize safely`);
  }
  return dpi;
}

function remainingTimeout(deadline: number, totalTimeoutMs: number): number {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error(`PDF OCR timed out after ${totalTimeoutMs}ms`);
  return remaining;
}

function ghostscriptBaseArgs(inputPath: string): string[] {
  return [
    "-q",
    "-dNODISPLAY",
    "-dBATCH",
    "-dSAFER",
    `--permit-file-read=${inputPath}`,
    `-sPDFname=${inputPath}`,
  ];
}

/**
 * Rasterize validated, selected PDF pages for an OCR engine. The caller owns
 * the returned lease-like object and must invoke cleanup in a finally block.
 */
export async function preparePdfOcrPages(
  inputPath: string,
  scratchDir: string,
  options: Pick<
    RunTesseractPdfOptions,
    "pages" | "dpi" | "timeoutMs" | "signal" | "onProgress" | "ghostscriptPath"
  > = {},
): Promise<PreparedPdfOcrPages> {
  if (options.signal?.aborted) throw abortError();

  const requestedDpi = options.dpi ?? DEFAULT_DPI;
  if (!Number.isInteger(requestedDpi) || requestedDpi < MIN_DPI || requestedDpi > MAX_DPI) {
    throw new Error(`PDF OCR DPI must be an integer from ${MIN_DPI} to ${MAX_DPI}`);
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("PDF OCR timeout must be a positive number");
  }

  const deadline = performance.now() + timeoutMs;
  const executable = options.ghostscriptPath ?? process.env.GS_PATH ?? "gs";
  const resolvedInputPath = await realpath(inputPath);
  await mkdir(scratchDir, { recursive: true });
  const jobScratchDir = await mkdtemp(join(scratchDir, "ocr-pdf-pages-"));
  const cleanup = () => rm(jobScratchDir, { recursive: true, force: true }).catch(() => {});

  try {
    options.onProgress?.(0, "Opening PDF");
    const countResult = await runGhostscript(
      executable,
      [...ghostscriptBaseArgs(resolvedInputPath), "-c", PAGE_COUNT_PROGRAM],
      remainingTimeout(deadline, timeoutMs),
      timeoutMs,
      options.signal,
    );
    const totalPages = parsePageCount(countResult.stdout);
    const pageNumbers = parsePdfPageSpec(options.pages ?? "all", totalPages);
    const pages: PreparedPdfOcrPage[] = [];
    let retainedRasterBytes = 0n;

    for (const [index, pageNumber] of pageNumbers.entries()) {
      if (options.signal?.aborted) throw abortError();
      options.onProgress?.(
        5 + Math.floor((index / pageNumbers.length) * 40),
        `Rasterizing PDF page ${pageNumber}`,
      );
      const boxResult = await runGhostscript(
        executable,
        [
          ...ghostscriptBaseArgs(resolvedInputPath),
          `-dPageNumber=${pageNumber}`,
          "-c",
          PAGE_BOX_PROGRAM,
        ],
        remainingTimeout(deadline, timeoutMs),
        timeoutMs,
        options.signal,
      );
      const dpi = safeDpi(parsePageBox(boxResult.stdout, pageNumber), requestedDpi, pageNumber);
      const pagePath = join(jobScratchDir, `page-${pageNumber}.png`);
      await runGhostscript(
        executable,
        [
          "-q",
          "-dBATCH",
          "-dNOPAUSE",
          "-dSAFER",
          "-dUseCropBox",
          `-dFirstPage=${pageNumber}`,
          `-dLastPage=${pageNumber}`,
          "-sDEVICE=pnggray",
          "-dTextAlphaBits=4",
          "-dGraphicsAlphaBits=4",
          `-r${dpi}`,
          `-sOutputFile=${pagePath}`,
          resolvedInputPath,
        ],
        remainingTimeout(deadline, timeoutMs),
        timeoutMs,
        options.signal,
      );
      const rasterPath = await validateRasterPage(pagePath, pageNumber);
      retainedRasterBytes = await retainRasterWithinScratchBudget(
        rasterPath,
        jobScratchDir,
        retainedRasterBytes,
      );
      pages.push({ page: pageNumber, path: rasterPath });
    }

    return {
      pages,
      totalPages,
      remainingTimeoutMs: () => remainingTimeout(deadline, timeoutMs),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Rasterize selected PDF pages with Ghostscript and OCR them with built-in Tesseract. */
export async function runTesseractPdf(
  inputPath: string,
  scratchDir: string,
  options: RunTesseractPdfOptions = {},
): Promise<TesseractPdfResult> {
  if (options.signal?.aborted) throw abortError();

  const requestedDpi = options.dpi ?? DEFAULT_DPI;
  if (!Number.isInteger(requestedDpi) || requestedDpi < MIN_DPI || requestedDpi > MAX_DPI) {
    throw new Error(`PDF OCR DPI must be an integer from ${MIN_DPI} to ${MAX_DPI}`);
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("PDF OCR timeout must be a positive number");
  }

  const deadline = performance.now() + timeoutMs;
  const executable = options.ghostscriptPath ?? process.env.GS_PATH ?? "gs";
  const resolvedInputPath = await realpath(inputPath);
  await mkdir(scratchDir, { recursive: true });
  const jobScratchDir = await mkdtemp(join(scratchDir, "ocr-pdf-"));

  try {
    options.onProgress?.(0, "Opening PDF");
    const pageCountResult = await runGhostscript(
      executable,
      [...ghostscriptBaseArgs(resolvedInputPath), "-c", PAGE_COUNT_PROGRAM],
      remainingTimeout(deadline, timeoutMs),
      timeoutMs,
      options.signal,
    );
    const totalPages = parsePageCount(pageCountResult.stdout);
    const pageNumbers = parsePdfPageSpec(options.pages ?? "all", totalPages);
    const pageTexts: string[] = [];
    let retainedOutputBytes = 0;

    for (const [index, pageNumber] of pageNumbers.entries()) {
      if (options.signal?.aborted) throw abortError();
      const pageBaseProgress = 5 + Math.floor((index / pageNumbers.length) * 90);
      options.onProgress?.(pageBaseProgress, `Rasterizing PDF page ${pageNumber}`);

      const pageBoxResult = await runGhostscript(
        executable,
        [
          ...ghostscriptBaseArgs(resolvedInputPath),
          `-dPageNumber=${pageNumber}`,
          "-c",
          PAGE_BOX_PROGRAM,
        ],
        remainingTimeout(deadline, timeoutMs),
        timeoutMs,
        options.signal,
      );
      const dpi = safeDpi(parsePageBox(pageBoxResult.stdout, pageNumber), requestedDpi, pageNumber);
      const pagePath = join(jobScratchDir, `page-${pageNumber}.png`);

      await runGhostscript(
        executable,
        [
          "-q",
          "-dBATCH",
          "-dNOPAUSE",
          "-dSAFER",
          "-dUseCropBox",
          `-dFirstPage=${pageNumber}`,
          `-dLastPage=${pageNumber}`,
          "-sDEVICE=pnggray",
          "-dTextAlphaBits=4",
          "-dGraphicsAlphaBits=4",
          `-r${dpi}`,
          `-sOutputFile=${pagePath}`,
          resolvedInputPath,
        ],
        remainingTimeout(deadline, timeoutMs),
        timeoutMs,
        options.signal,
      );

      const separator = pageTexts.length === 0 ? "" : "\n\n";
      const pageHeading = `--- Page ${pageNumber} ---\n\n`;
      const framingBytes = Buffer.byteLength(separator) + Buffer.byteLength(pageHeading);
      const remainingOutputBytes = MAX_PDF_OCR_OUTPUT_BYTES - retainedOutputBytes - framingBytes;
      if (remainingOutputBytes <= 0) {
        throw new Error(
          `PDF OCR exceeded the ${MAX_PDF_OCR_OUTPUT_BYTES} byte aggregate output limit`,
        );
      }

      const tesseractOptions: RunTesseractOptions = {
        language: options.language ?? "auto",
        timeoutMs: remainingTimeout(deadline, timeoutMs),
        signal: options.signal,
        tesseractPath: options.tesseractPath,
        maxStdoutBytes: remainingOutputBytes,
        onProgress: (progress, stage) => {
          const pageShare = 90 / pageNumbers.length;
          options.onProgress?.(
            Math.min(95, Math.floor(pageBaseProgress + (progress / 100) * pageShare)),
            stage,
          );
        },
      };
      const rasterPath = await validateRasterPage(pagePath, pageNumber);
      let ocrPath = rasterPath;
      if (options.enhance) {
        options.onProgress?.(pageBaseProgress, `Enhancing PDF page ${pageNumber}`);
        const metadata = await sharp(rasterPath, {
          limitInputPixels: MAX_RASTER_PIXELS,
        }).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;
        const enhancedPath = join(jobScratchDir, `enhanced-page-${pageNumber}.png`);
        await sharp(rasterPath, { limitInputPixels: MAX_RASTER_PIXELS })
          .clahe({
            width: Math.max(1, Math.min(256, Math.round(width / 8))),
            height: Math.max(1, Math.min(256, Math.round(height / 8))),
            maxSlope: 2,
          })
          .png()
          .toFile(enhancedPath);
        ocrPath = await validateRasterPage(enhancedPath, pageNumber);
        await rm(rasterPath, { force: true });
      }
      const result = await runAdaptiveTesseract(ocrPath, tesseractOptions).finally(() =>
        rm(ocrPath, { force: true }).catch(() => {}),
      );
      const pageText = `${pageHeading}${result.text.trim()}`;
      const addedBytes = Buffer.byteLength(separator) + Buffer.byteLength(pageText);
      if (retainedOutputBytes + addedBytes > MAX_PDF_OCR_OUTPUT_BYTES) {
        throw new Error(
          `PDF OCR exceeded the ${MAX_PDF_OCR_OUTPUT_BYTES} byte aggregate output limit`,
        );
      }
      pageTexts.push(pageText);
      retainedOutputBytes += addedBytes;
    }

    options.onProgress?.(100, "Tesseract PDF OCR complete");
    return {
      text: pageTexts.join("\n\n"),
      pages: pageNumbers.length,
      pageNumbers,
      engine: "tesseract",
      provider: "native",
      device: "cpu",
    };
  } finally {
    await rm(jobScratchDir, { recursive: true, force: true }).catch(() => {});
  }
}
