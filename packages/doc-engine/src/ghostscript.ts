import { spawn } from "node:child_process";
import { resolveGs } from "./binaries.js";

export type PdfCompressionPreset = "screen" | "ebook" | "printer";

/** Ghostscript re-distillation with a quality preset; 120s hard kill. */
export async function gsCompressPdf(
  inputPath: string,
  outPath: string,
  preset: PdfCompressionPreset,
): Promise<void> {
  const bin = resolveGs();
  if (!bin) throw new Error("gs binary not found (set GS_PATH or install ghostscript)");
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      bin,
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
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("ghostscript timed out after 120s"));
    }, 120_000);
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
