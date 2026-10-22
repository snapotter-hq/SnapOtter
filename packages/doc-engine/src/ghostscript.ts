import { spawn } from "node:child_process";
import { wrapWithMemoryLimit } from "@snapotter/shared";
import { resolveGs } from "./binaries.js";

export type PdfCompressionPreset = "screen" | "ebook" | "printer";

export interface GsOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** @internal Shared gs CLI runner; not part of the public package API. */
function runGs(args: string[], opts: GsOptions = {}): Promise<void> {
  if (opts.signal?.aborted) {
    return Promise.reject(new Error("Canceled"));
  }
  const bin = resolveGs();
  if (!bin) throw new Error("gs binary not found (set GS_PATH or install ghostscript)");
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return new Promise<void>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, args);
    const child = spawn(limBin, limArgs, { stdio: ["ignore", "ignore", "pipe"] });
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
      reject(new Error(`ghostscript timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
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
      if (code === 0) resolvePromise();
      else reject(new Error(`gs exited ${code ?? signal}: ${err.slice(-1000)}`));
    });
    opts.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Ghostscript re-distillation with a quality preset. */
export async function gsCompressPdf(
  inputPath: string,
  outPath: string,
  preset: PdfCompressionPreset,
  opts?: GsOptions,
): Promise<void> {
  await runGs(
    [
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dQUIET",
      "-sDEVICE=pdfwrite",
      `-dPDFSETTINGS=/${preset}`,
      "-dCompatibilityLevel=1.6",
      `-sOutputFile=${outPath}`,
      inputPath,
    ],
    opts,
  );
}

/**
 * Image compression at a target resolution (DPI) and JPEG quality (QFactor).
 * Both are size levers for PDFs: lower DPI and higher QFactor each yield a
 * smaller file, and output size is monotonic in both. Forces re-encode of image
 * streams so QFactor actually applies: Ghostscript otherwise passes already-JPEG
 * images through untouched (PassThroughJPEGImages defaults true), which makes the
 * quality lever a no-op on scans. The compress-pdf tool maps a single quality
 * axis (and a target-size binary search) onto this (dpi, qFactor) pair.
 */
export async function gsCompressPdfTuned(
  inputPath: string,
  outPath: string,
  dpi: number,
  qFactor: number,
  opts?: GsOptions,
): Promise<void> {
  const res = Math.max(9, Math.min(600, Math.round(dpi)));
  const qf = Math.max(0.05, Math.min(4, qFactor));
  // 2x2 chroma subsampling ([2 1 1 2]) keeps photo output small and predictable.
  const dict =
    `<< /ColorImageDict << /QFactor ${qf} /Blend 1 /HSamples [2 1 1 2] /VSamples [2 1 1 2] >>` +
    ` /GrayImageDict << /QFactor ${qf} /Blend 1 >> >> setdistillerparams`;
  await runGs(
    [
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dQUIET",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.6",
      "-dDownsampleColorImages=true",
      "-dColorImageDownsampleType=/Average",
      `-dColorImageResolution=${res}`,
      "-dDownsampleGrayImages=true",
      "-dGrayImageDownsampleType=/Average",
      `-dGrayImageResolution=${res}`,
      "-dDownsampleMonoImages=true",
      "-dMonoImageDownsampleType=/Subsample",
      `-dMonoImageResolution=${Math.min(600, res * 4)}`,
      "-dAutoFilterColorImages=false",
      "-dColorImageFilter=/DCTEncode",
      "-dAutoFilterGrayImages=false",
      "-dGrayImageFilter=/DCTEncode",
      "-dPassThroughJPEGImages=false",
      `-sOutputFile=${outPath}`,
      "-c",
      dict,
      "-f",
      inputPath,
    ],
    opts,
  );
}

/** Grayscale re-distillation via DeviceGray color conversion. */
export async function gsGrayscalePdf(
  inputPath: string,
  outPath: string,
  opts?: GsOptions,
): Promise<void> {
  await runGs(
    [
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dQUIET",
      "-sDEVICE=pdfwrite",
      "-sColorConversionStrategy=Gray",
      "-dProcessColorModel=/DeviceGray",
      `-sOutputFile=${outPath}`,
      inputPath,
    ],
    opts,
  );
}

/** PDF/A-2b candidate via ghostscript's PDFA switch (no veraPDF validation this wave). */
export async function gsPdfaConvert(
  inputPath: string,
  outPath: string,
  opts?: GsOptions,
): Promise<void> {
  await runGs(
    [
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dQUIET",
      "-dPDFA=2",
      "-dPDFACompatibilityPolicy=1",
      "-sColorConversionStrategy=RGB",
      "-sDEVICE=pdfwrite",
      `-sOutputFile=${outPath}`,
      inputPath,
    ],
    opts,
  );
}
