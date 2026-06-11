import { spawn } from "node:child_process";
import { resolveQpdf } from "./binaries.js";

/** @internal Shared qpdf CLI runner for doc-engine modules; not part of the public package API. */
export function runQpdf(args: string[], timeoutMs = 30_000): Promise<string> {
  const bin = resolveQpdf();
  if (!bin) throw new Error("qpdf binary not found (set QPDF_PATH or install qpdf)");
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
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
      if (code === 0) resolvePromise(out);
      else
        reject(new Error(`qpdf exited ${code ?? signal}: ${err.slice(-1000) || out.slice(-1000)}`));
    });
  });
}

/** Structural check; throws with qpdf's diagnostics on damage. */
export async function qpdfCheck(filePath: string): Promise<void> {
  await runQpdf(["--check", filePath]);
}

export async function qpdfPageCount(filePath: string): Promise<number> {
  const out = await runQpdf(["--show-npages", filePath]);
  const n = Number(out.trim());
  if (!Number.isFinite(n)) throw new Error(`qpdf returned a non-numeric page count: ${out.trim()}`);
  return n;
}
