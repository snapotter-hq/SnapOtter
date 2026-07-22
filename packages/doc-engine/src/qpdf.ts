import { spawn } from "node:child_process";
import { wrapWithMemoryLimit } from "@snapotter/shared";
import { resolveQpdf } from "./binaries.js";

/** @internal Shared qpdf CLI runner for doc-engine modules; not part of the public package API. */
export function runQpdf(args: string[], timeoutMs = 30_000): Promise<string> {
  const bin = resolveQpdf();
  if (!bin) throw new Error("qpdf binary not found (set QPDF_PATH or install qpdf)");
  return new Promise<string>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, args);
    const child = spawn(limBin, limArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`qpdf timed out after ${Math.round(timeoutMs / 1000)}s`));
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
      // qpdf exit codes: 0 = success, 2 = errors (real failure),
      // 3 = warnings only (file processed successfully despite minor
      // structural quirks common in web-generated and scanned PDFs).
      if (code === 0 || code === 3) resolvePromise(out);
      else
        reject(new Error(`qpdf exited ${code ?? signal}: ${err.slice(-1000) || out.slice(-1000)}`));
    });
  });
}

/** Structural check; throws with qpdf's diagnostics on damage. */
export async function qpdfCheck(filePath: string): Promise<void> {
  await runQpdf(["--check", filePath]);
}

/**
 * True when the PDF requires a password to open. qpdf --requires-password
 * exits 0 when a password is required (2 = not encrypted, 3 = encrypted but
 * the correct password was supplied), so this cannot be a throw-on-nonzero
 * call.
 *
 * Verified against qpdf 12.1.0:
 *   encrypted fixture (no pw)  -> exit 0
 *   plain fixture              -> exit 2
 *   encrypted + correct pw     -> exit 3
 *   encrypted + wrong pw       -> exit 0
 */
export async function qpdfRequiresPassword(filePath: string): Promise<boolean> {
  const bin = resolveQpdf();
  if (!bin) throw new Error("qpdf binary not found (set QPDF_PATH or install qpdf)");
  return new Promise<boolean>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, ["--requires-password", filePath]);
    const child = spawn(limBin, limArgs, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("qpdf timed out after 30s"));
    }, 30_000);
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(code === 0);
    });
  });
}

export async function qpdfPageCount(filePath: string): Promise<number> {
  const out = await runQpdf(["--show-npages", filePath]);
  const n = Number(out.trim());
  if (!Number.isFinite(n)) throw new Error(`qpdf returned a non-numeric page count: ${out.trim()}`);
  return n;
}
