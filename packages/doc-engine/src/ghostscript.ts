import { spawn } from "node:child_process";
import { resolveGs } from "./binaries.js";

export type PdfCompressionPreset = "screen" | "ebook" | "printer";

/** @internal Shared gs CLI runner; not part of the public package API. */
function runGs(args: string[], timeoutMs = 120_000): Promise<void> {
  const bin = resolveGs();
  if (!bin) throw new Error("gs binary not found (set GS_PATH or install ghostscript)");
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
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
      reject(e);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(`gs exited ${code ?? signal}: ${err.slice(-1000)}`));
    });
  });
}

/** Ghostscript re-distillation with a quality preset. */
export async function gsCompressPdf(
  inputPath: string,
  outPath: string,
  preset: PdfCompressionPreset,
): Promise<void> {
  await runGs([
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-dQUIET",
    "-sDEVICE=pdfwrite",
    `-dPDFSETTINGS=/${preset}`,
    "-dCompatibilityLevel=1.6",
    `-sOutputFile=${outPath}`,
    inputPath,
  ]);
}

/** Grayscale re-distillation via DeviceGray color conversion. */
export async function gsGrayscalePdf(inputPath: string, outPath: string): Promise<void> {
  await runGs([
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-dQUIET",
    "-sDEVICE=pdfwrite",
    "-sColorConversionStrategy=Gray",
    "-dProcessColorModel=/DeviceGray",
    `-sOutputFile=${outPath}`,
    inputPath,
  ]);
}

/** PDF/A-2b candidate via ghostscript's PDFA switch (no veraPDF validation this wave). */
export async function gsPdfaConvert(inputPath: string, outPath: string): Promise<void> {
  await runGs([
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
  ]);
}
