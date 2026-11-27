import { spawn } from "node:child_process";
import {
  engineCrashError,
  engineCrashSignal,
  ToolInputError,
  wrapWithMemoryLimit,
} from "@snapotter/shared";
import { resolvePdfcpu } from "./binaries.js";

export interface PdfcpuOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const PDFCPU_CRASHED_MESSAGE = "The document engine (pdfcpu) crashed while processing this file.";

function pdfcpuSpawnFailure(
  bin: string,
  code: null | 126 | 127,
  signal: NodeJS.Signals | null,
  output: string,
): NodeJS.ErrnoException {
  const errno = code === 127 ? "ENOENT" : code === 126 ? "ENOEXEC" : "ENOMEM";
  const detail = output.slice(-1000).trim();
  const msg = detail ? `pdfcpu exited ${code ?? signal}: ${detail}` : `spawn ${bin} ${errno}`;
  return Object.assign(new Error(msg), {
    code: errno,
    syscall: "spawn",
    path: bin,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Shared pdfcpu CLI runner. Mirrors runQpdf's spawn/settled/(code, signal)
 * shape. The `-c disable` flag prevents config-dir writes on read-only
 * container filesystems.
 */
function runPdfcpu(args: string[], opts: PdfcpuOptions = {}): Promise<string> {
  if (opts.signal?.aborted) {
    return Promise.reject(new Error("Canceled"));
  }
  const bin = resolvePdfcpu();
  if (!bin)
    return Promise.reject(new Error("pdfcpu binary not found (set PDFCPU_PATH or install pdfcpu)"));
  const timeoutMs = opts.timeoutMs ?? 60_000;
  return new Promise<string>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, ["-c", "disable", ...args]);
    const child = spawn(limBin, limArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      child.kill("SIGKILL");
      reject(new Error("Canceled"));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
      child.kill("SIGKILL");
      reject(new Error(`pdfcpu timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    child.stderr.on("data", (c: Buffer) => {
      err = (err + c.toString("utf8")).slice(-4096);
    });
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      reject(e);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (code === 0) {
        resolvePromise(out);
        return;
      }
      const detail = err.slice(-1000).trim() ? err.slice(-1000) : out.slice(-1000);
      const crashSignal = engineCrashSignal(code, signal);
      if (crashSignal) {
        reject(engineCrashError(PDFCPU_CRASHED_MESSAGE, "pdfcpu", crashSignal, detail));
        return;
      }
      if (code === null || code === 126 || code === 127) {
        reject(pdfcpuSpawnFailure(bin, code, signal, detail));
        return;
      }
      reject(new Error(`pdfcpu exited ${code}: ${detail}`));
    });
    opts.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * How to crop every page, in points, as the page is displayed. `sides` margins
 * are measured inward from each edge. A `region` is measured from each page's
 * top-left corner, so the same box lands on the same spot of every page
 * whatever its size (#4988). A page with a `/Rotate` entry is measured in its
 * rotated orientation (#5134).
 */
export type PdfCropBox =
  | { mode: "uniform"; margin: number }
  | { mode: "sides"; top: number; right: number; bottom: number; left: number }
  | { mode: "region"; x: number; y: number; width: number; height: number };

/** The largest page side pdfcpu and the PDF spec accept, in points. */
const MAX_PAGE_SIDE = 14_400;

function isMargin(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 2000;
}

/** A page's `/Rotate` value, normalised to 0, 90, 180 or 270 degrees clockwise. */
export type PageRotation = 0 | 90 | 180 | 270;

/**
 * The `pdfcpu crop` description for a crop box on a page with the given
 * rotation. Verified CLI shapes (pdfcpu v0.13.0), all relative to the page's
 * unrotated MediaBox:
 *   '20'                                 uniform margin
 *   '10 20 30 40'                        top right bottom left margins
 *   'pos:tl, off:x -y, dim: w h abs'     region anchored to a corner
 * The anchor offset is in PDF user space, where y grows upward, hence the
 * sign flips. The box is given as displayed, so a rotated page anchors to the
 * user-space corner that shows as top-left and swaps width and height (#5134):
 *   90:  bl corner, off (y, x),    dim h w
 *   180: br corner, off (-x, y),   dim w h
 *   270: tr corner, off (-y, -x),  dim h w
 */
function cropDescription(box: PdfCropBox, rotation: PageRotation = 0): string {
  switch (box.mode) {
    case "uniform":
      if (!isMargin(box.margin)) throw new Error("Crop margin must be 0-2000 points");
      return String(box.margin);
    case "sides": {
      const { top, right, bottom, left } = box;
      if (![top, right, bottom, left].every(isMargin)) {
        throw new Error("Crop margins must be 0-2000 points");
      }
      // pdfcpu wants user-space top right bottom left; rotate the displayed edges into it.
      const bySide: Record<PageRotation, number[]> = {
        0: [top, right, bottom, left],
        90: [right, bottom, left, top],
        180: [bottom, left, top, right],
        270: [left, top, right, bottom],
      };
      return bySide[rotation].join(" ");
    }
    case "region": {
      const { x, y, width, height } = box;
      const valid =
        [x, y, width, height].every((n) => Number.isFinite(n) && n <= MAX_PAGE_SIDE) &&
        x >= 0 &&
        y >= 0 &&
        width > 0 &&
        height > 0;
      if (!valid) {
        throw new Error("Crop region must start inside the page and have a positive size");
      }
      const neg = (n: number) => (n === 0 ? 0 : -n);
      switch (rotation) {
        case 0:
          return `pos:tl, off:${x} ${neg(y)}, dim: ${width} ${height} abs`;
        case 90:
          return `pos:bl, off:${y} ${x}, dim: ${height} ${width} abs`;
        case 180:
          return `pos:br, off:${neg(x)} ${y}, dim: ${width} ${height} abs`;
        case 270:
          return `pos:tr, off:${neg(y)} ${neg(x)}, dim: ${height} ${width} abs`;
      }
    }
  }
}

/**
 * Crop all pages to a crop box. Check it with assertCropFits first. pdfcpu
 * takes one description per run, so a document whose pages carry different
 * rotations is cropped in one pass per rotation (#5134).
 */
export async function pdfcpuCrop(
  inputPath: string,
  box: PdfCropBox,
  outPath: string,
  opts?: PdfcpuOptions,
): Promise<void> {
  if (box.mode === "uniform") {
    await runPdfcpu(["crop", cropDescription(box), inputPath, outPath], opts);
    return;
  }
  cropDescription(box); // validate before spawning anything
  const byRotation = new Map<PageRotation, number[]>();
  for (const { page, rotation } of await pdfcpuPages(inputPath, opts)) {
    byRotation.set(rotation, [...(byRotation.get(rotation) ?? []), page]);
  }
  const passes = [...byRotation];
  for (const [i, [rotation, pages]] of passes.entries()) {
    const selection = passes.length > 1 ? ["-p", pages.join(",")] : [];
    // Later passes edit the first pass's output in place.
    const files = i === 0 ? [inputPath, outPath] : [outPath];
    await runPdfcpu(["crop", ...selection, cropDescription(box, rotation), ...files], opts);
  }
}

/** Crop all pages using a uniform margin in points. */
export async function pdfcpuCropMargin(
  inputPath: string,
  marginPoints: number,
  outPath: string,
  opts?: PdfcpuOptions,
): Promise<void> {
  await pdfcpuCrop(inputPath, { mode: "uniform", margin: marginPoints }, outPath, opts);
}

export interface PdfPageSize {
  width: number;
  height: number;
}

interface Point {
  x: unknown;
  y: unknown;
}

function coord(v: unknown): number {
  return typeof v === "number" ? v : Number.NaN;
}

export interface PdfPage {
  /** 1-based page number. */
  page: number;
  /** Unrotated MediaBox size, which is what `pdfcpu crop` measures from. */
  width: number;
  height: number;
  rotation: PageRotation;
}

function normalizeRotation(rot: unknown): PageRotation {
  const n = typeof rot === "number" && Number.isFinite(rot) ? ((rot % 360) + 360) % 360 : 0;
  return (n === 90 || n === 180 || n === 270 ? n : 0) as PageRotation;
}

/**
 * Every page's unrotated MediaBox size and rotation, from
 * `pdfcpu info -j -p 1-`. `pdfcpu crop` measures from the MediaBox (a page
 * that already has a CropBox is re-cropped from its MediaBox). The size comes
 * from the per-page boundaries rather than `pageSizes`, which swaps width and
 * height on a rotated page while crop still works on the unrotated box
 * (#4988).
 */
export async function pdfcpuPages(inputPath: string, opts?: PdfcpuOptions): Promise<PdfPage[]> {
  const out = await runPdfcpu(["info", "-j", "-p", "1-", inputPath], opts);
  let boundaries: unknown;
  try {
    boundaries = (JSON.parse(out) as { infos?: { pageBoundaries?: unknown }[] }).infos?.[0]
      ?.pageBoundaries;
  } catch {
    boundaries = undefined;
  }
  const pages: PdfPage[] = [];
  for (const [key, entry] of Object.entries(boundaries ?? {})) {
    const info = entry as {
      rot?: unknown;
      mediaBox?: { rect?: { ll?: Point; ur?: Point } };
    } | null;
    const rect = info?.mediaBox?.rect;
    const width = coord(rect?.ur?.x) - coord(rect?.ll?.x);
    const height = coord(rect?.ur?.y) - coord(rect?.ll?.y);
    const page = Number(key);
    if (
      !(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)) ||
      !Number.isInteger(page)
    ) {
      throw new Error("pdfcpu info reported no page sizes");
    }
    pages.push({ page, width, height, rotation: normalizeRotation(info?.rot) });
  }
  if (pages.length === 0) throw new Error("pdfcpu info reported no page sizes");
  return pages.sort((a, b) => a.page - b.page);
}

/**
 * The distinct page sizes of a PDF in points as displayed, so a 90 or 270
 * degree page has its width and height swapped. These are the sizes a crop
 * box, which is given as displayed, has to fit inside (#5134).
 */
export async function pdfcpuPageSizes(
  inputPath: string,
  opts?: PdfcpuOptions,
): Promise<PdfPageSize[]> {
  const sizes = new Map<string, PdfPageSize>();
  for (const { width, height, rotation } of await pdfcpuPages(inputPath, opts)) {
    const sideways = rotation === 90 || rotation === 270;
    const size = sideways ? { width: height, height: width } : { width, height };
    sizes.set(`${size.width}x${size.height}`, size);
  }
  return [...sizes.values()];
}

/**
 * A uniform margin of half the shortest page side or more leaves no area, and
 * pdfcpu writes an inverted CropBox for it instead of failing (#4421).
 */
export function assertCropMarginFits(marginPoints: number, sizes: PdfPageSize[]): void {
  const shortestSide = Math.min(...sizes.flatMap((s) => [s.width, s.height]));
  if (2 * marginPoints < shortestSide) return;
  const limit = Math.floor((shortestSide / 2) * 100) / 100;
  throw new ToolInputError(
    `Crop margin is too large for this PDF. It must be less than ${limit} points, half the shortest page side.`,
    { code: "INVALID_SETTINGS" },
  );
}

function floorPoints(n: number): number {
  return Math.floor(n * 100) / 100;
}

/**
 * A crop that leaves no area, or a region that runs off a page, makes pdfcpu
 * write an inverted or oversized CropBox instead of failing, so check the box
 * against every page size first. The narrowest width and shortest height can
 * come from different pages; a box fits every page exactly when it fits both.
 */
export function assertCropFits(box: PdfCropBox, sizes: PdfPageSize[]): void {
  if (box.mode === "uniform") {
    assertCropMarginFits(box.margin, sizes);
    return;
  }
  const minWidth = Math.min(...sizes.map((s) => s.width));
  const minHeight = Math.min(...sizes.map((s) => s.height));
  if (box.mode === "sides") {
    if (box.left + box.right < minWidth && box.top + box.bottom < minHeight) return;
    throw new ToolInputError(
      `Crop margins are too large for this PDF. Left plus right must be less than ${floorPoints(minWidth)} points and top plus bottom less than ${floorPoints(minHeight)} points.`,
      { code: "INVALID_SETTINGS" },
    );
  }
  if (box.x + box.width <= minWidth && box.y + box.height <= minHeight) return;
  throw new ToolInputError(
    `Crop region doesn't fit on every page. It must stay within ${floorPoints(minWidth)} x ${floorPoints(minHeight)} points, the smallest page size.`,
    { code: "INVALID_SETTINGS" },
  );
}

/** Valid n-up values per pdfcpu v0.13.0 help. */
export type NupValue = 2 | 3 | 4 | 8 | 9 | 12 | 16;

const VALID_NUP = new Set<number>([2, 3, 4, 8, 9, 12, 16]);

/**
 * N-up imposition: arrange multiple pages per sheet.
 *
 * Verified CLI shape (pdfcpu v0.13.0):
 *   pdfcpu nup outFile n inFile
 * Note: outFile comes BEFORE n and inFile.
 */
export async function pdfcpuNup(
  inputPath: string,
  n: NupValue,
  outPath: string,
  opts?: PdfcpuOptions,
): Promise<void> {
  if (!VALID_NUP.has(n)) {
    throw new Error(`Invalid n-up value: ${n}. Must be one of: 2, 3, 4, 8, 9, 12, 16`);
  }
  await runPdfcpu(["nup", outPath, String(n), inputPath], opts);
}

export interface PdfResizeOptions {
  /** Target page width in points. */
  width: number;
  /** Target page height in points. */
  height: number;
  /** Swap the target per page to match each page's orientation instead of forcing width x height. */
  keepOrientation: boolean;
}

/** The PDF spec caps a page side at 14400 points (200 in); pdfcpu writes bigger pages anyway. */
const MAX_PAGE_SIDE_POINTS = 14400;
const MIN_PAGE_SIDE_POINTS = 36;

/**
 * Resize every page to a target size. pdfcpu scales the content to fit,
 * centred, keeps vectors (so barcodes stay sharp), and measures from the
 * CropBox when a page has one, so crop-pdf followed by this works as a chain.
 *
 * Verified CLI shape (pdfcpu v0.13.0):
 *   pdfcpu resize 'dim:<w> <h>, enforce:<bool>' inFile outFile
 * Dimensions are in points (the default display unit). Without enforce,
 * pdfcpu turns the target to each page's own orientation.
 */
export async function pdfcpuResize(
  inputPath: string,
  opts: PdfResizeOptions,
  outPath: string,
  runOpts?: PdfcpuOptions,
): Promise<void> {
  const inRange = (v: number) =>
    Number.isFinite(v) && v >= MIN_PAGE_SIDE_POINTS && v <= MAX_PAGE_SIDE_POINTS;
  if (!inRange(opts.width) || !inRange(opts.height)) {
    throw new Error(
      `Page size must be ${MIN_PAGE_SIDE_POINTS}-${MAX_PAGE_SIDE_POINTS} points on each side`,
    );
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  const desc = `dim:${round(opts.width)} ${round(opts.height)}, enforce:${!opts.keepOrientation}`;
  await runPdfcpu(["resize", desc, inputPath, outPath], runOpts);
}

/** Valid booklet values per pdfcpu v0.13.0 help. */
export type BookletValue = 2 | 4 | 6 | 8;

const VALID_BOOKLET = new Set<number>([2, 4, 6, 8]);

/**
 * Booklet imposition: arrange pages for folding into a small book.
 *
 * Verified CLI shape (pdfcpu v0.13.0):
 *   pdfcpu booklet outFile n inFile
 * Note: outFile comes BEFORE n and inFile.
 */
export async function pdfcpuBooklet(
  inputPath: string,
  n: BookletValue,
  outPath: string,
  opts?: PdfcpuOptions,
): Promise<void> {
  if (!VALID_BOOKLET.has(n)) {
    throw new Error(`Invalid booklet value: ${n}. Must be one of: 2, 4, 6, 8`);
  }
  await runPdfcpu(["booklet", outPath, String(n), inputPath], opts);
}

const STAMP_POSITIONS = new Set(["tl", "tc", "tr", "l", "c", "r", "bl", "bc", "br"]);

export interface TextStampOptions {
  text: string;
  /** Position anchor: tl|tc|tr|l|c|r|bl|bc|br */
  position: string;
  /** Font size in points: 6..72 */
  fontSize: number;
  /** Opacity: 0.05..1 */
  opacity: number;
  /** Rotation in degrees: -180..180 */
  rotation: number;
}

/**
 * pdfcpu interprets percent signs as page-template markers and v0.13 panics
 * on a dangling `%`. Preserve its supported page tokens while doubling every
 * literal or unsupported marker so user text is rendered verbatim.
 */
function escapePdfcpuStampText(text: string): string {
  return text.replace(/%(?![pP])/g, "%%");
}

/**
 * Text stamp/watermark on every page. Image stamps deferred to a later wave.
 *
 * Verified CLI shape (pdfcpu v0.13.0):
 *   pdfcpu stamp add -- 'text' 'description' inFile outFile
 * --mode text is the default; no need to pass it explicitly.
 *
 * Description key names verified against pdfcpu v0.13.0 help:
 *   pos:      position anchor
 *   points:   font size (NOT "fontsize:")
 *   op:       opacity (NOT "opacity:")
 *   rotation: rotation in degrees
 *
 * %p and %P are supported for page-number expansion:
 *   %p  = current page number
 *   %P  = total pages
 * Verified in-container: stamp text "Page %p of %P" on a 3-page PDF produces
 * "Page 1 of 3", "Page 2 of 3", "Page 3 of 3" on pages 1-3 respectively.
 */
export async function pdfcpuTextStamp(
  inputPath: string,
  opts: TextStampOptions,
  outPath: string,
  runOpts?: PdfcpuOptions,
): Promise<void> {
  if (opts.text.length === 0 || opts.text.length > 200) {
    throw new Error("Stamp text must be 1-200 characters");
  }
  if (!STAMP_POSITIONS.has(opts.position)) {
    throw new Error(
      `Invalid stamp position: ${opts.position}. Must be one of: tl, tc, tr, l, c, r, bl, bc, br`,
    );
  }
  if (!Number.isFinite(opts.fontSize) || opts.fontSize < 6 || opts.fontSize > 72) {
    throw new Error("Font size must be 6-72");
  }
  if (!Number.isFinite(opts.opacity) || opts.opacity < 0.05 || opts.opacity > 1) {
    throw new Error("Opacity must be 0.05-1");
  }
  if (!Number.isFinite(opts.rotation) || opts.rotation < -180 || opts.rotation > 180) {
    throw new Error("Rotation must be -180..180");
  }
  const desc = `pos:${opts.position}, points:${opts.fontSize}, op:${opts.opacity}, rotation:${opts.rotation}`;
  await runPdfcpu(
    ["stamp", "add", "--", escapePdfcpuStampText(opts.text), desc, inputPath, outPath],
    runOpts,
  );
}
