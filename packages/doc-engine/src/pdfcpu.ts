import { spawn } from "node:child_process";
import { wrapWithMemoryLimit } from "@snapotter/shared";
import { resolvePdfcpu } from "./binaries.js";

/**
 * Shared pdfcpu CLI runner. Mirrors runQpdf's spawn/settled/(code, signal)
 * shape. The `-c disable` flag prevents config-dir writes on read-only
 * container filesystems.
 */
function runPdfcpu(args: string[], timeoutMs = 60_000): Promise<string> {
  const bin = resolvePdfcpu();
  if (!bin) throw new Error("pdfcpu binary not found (set PDFCPU_PATH or install pdfcpu)");
  return new Promise<string>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, ["-c", "disable", ...args]);
    const child = spawn(limBin, limArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
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
      reject(e);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise(out);
      else
        reject(
          new Error(`pdfcpu exited ${code ?? signal}: ${err.slice(-1000) || out.slice(-1000)}`),
        );
    });
  });
}

/**
 * Crop all pages using a uniform margin in points.
 *
 * Verified CLI shape (pdfcpu v0.13.0):
 *   pdfcpu crop '<margin>' inFile outFile
 * A single number sets all four margins (top, right, bottom, left) uniformly.
 *
 * Sanctioned simplification: the plan's four-sided margins object is replaced
 * by a single uniform margin in points, matching pdfcpu's native single-number
 * form. The route schema (Task 8) follows this shape.
 */
export async function pdfcpuCropMargin(
  inputPath: string,
  marginPoints: number,
  outPath: string,
): Promise<void> {
  if (!Number.isFinite(marginPoints) || marginPoints < 0 || marginPoints > 2000) {
    throw new Error("Crop margin must be 0-2000 points");
  }
  await runPdfcpu(["crop", String(marginPoints), inputPath, outPath]);
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
export async function pdfcpuNup(inputPath: string, n: NupValue, outPath: string): Promise<void> {
  if (!VALID_NUP.has(n)) {
    throw new Error(`Invalid n-up value: ${n}. Must be one of: 2, 3, 4, 8, 9, 12, 16`);
  }
  await runPdfcpu(["nup", outPath, String(n), inputPath]);
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
): Promise<void> {
  if (!VALID_BOOKLET.has(n)) {
    throw new Error(`Invalid booklet value: ${n}. Must be one of: 2, 4, 6, 8`);
  }
  await runPdfcpu(["booklet", outPath, String(n), inputPath]);
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
  await runPdfcpu(["stamp", "add", "--", opts.text, desc, inputPath, outPath]);
}
