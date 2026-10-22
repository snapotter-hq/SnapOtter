import { spawn } from "node:child_process";
import { wrapWithMemoryLimit } from "@snapotter/shared";
import { resolveQpdf } from "./binaries.js";

/**
 * A qpdf invocation outlived its time budget and was killed. Distinct from a
 * structural failure: the file may be perfectly healthy, just slow to process
 * on this host.
 */
export class QpdfTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QpdfTimeoutError";
  }
}

function qpdfSpawnFailure(
  bin: string,
  code: null | 126 | 127,
  signal: NodeJS.Signals | null,
  output: string,
): NodeJS.ErrnoException {
  const errno = code === 127 ? "ENOENT" : code === 126 ? "ENOEXEC" : "ENOMEM";
  const detail = output.slice(-1000).trim();
  const msg = detail ? `qpdf exited ${code ?? signal}: ${detail}` : `spawn ${bin} ${errno}`;
  return Object.assign(new Error(msg), {
    code: errno,
    syscall: "spawn",
    path: bin,
    ...(signal ? { signal } : {}),
  });
}

export interface QpdfOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** @internal Shared qpdf CLI runner for doc-engine modules; not part of the public package API. */
export function runQpdf(
  args: string[],
  timeoutOrOpts: number | QpdfOptions = 30_000,
  opts?: QpdfOptions,
): Promise<string> {
  const resolvedOpts: QpdfOptions =
    typeof timeoutOrOpts === "number"
      ? { ...opts, timeoutMs: opts?.timeoutMs ?? timeoutOrOpts }
      : timeoutOrOpts;
  if (resolvedOpts.signal?.aborted) {
    return Promise.reject(new Error("Canceled"));
  }
  const bin = resolveQpdf();
  if (!bin) throw new Error("qpdf binary not found (set QPDF_PATH or install qpdf)");
  const timeoutMs = resolvedOpts.timeoutMs ?? 30_000;
  const abortSignal = resolvedOpts.signal;
  return new Promise<string>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, args);
    const child = spawn(limBin, limArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
      child.kill("SIGKILL");
      reject(new Error("Canceled"));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      abortSignal?.removeEventListener("abort", onAbort);
      child.kill("SIGKILL");
      reject(new QpdfTimeoutError(`qpdf timed out after ${Math.round(timeoutMs / 1000)}s`));
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
      abortSignal?.removeEventListener("abort", onAbort);
      reject(e);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
      // qpdf exit codes: 0 = success, 2 = errors (real failure),
      // 3 = warnings only (file processed successfully despite minor
      // structural quirks common in web-generated and scanned PDFs).
      if (code === 0 || code === 3) {
        resolvePromise(out);
        return;
      }
      const detail = err.slice(-1000).trim() ? err.slice(-1000) : out.slice(-1000);
      if (code === null || code === 126 || code === 127) {
        reject(qpdfSpawnFailure(bin, code, signal, detail));
        return;
      }
      reject(new Error(`qpdf exited ${code}: ${detail}`));
    });
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Structural check; throws with qpdf's diagnostics on damage. */
export async function qpdfCheck(filePath: string, opts?: QpdfOptions): Promise<void> {
  await runQpdf(["--check", filePath], opts);
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
export async function qpdfRequiresPassword(
  filePath: string,
  opts: QpdfOptions = {},
): Promise<boolean> {
  if (opts.signal?.aborted) {
    throw new Error("Canceled");
  }
  const bin = resolveQpdf();
  if (!bin) throw new Error("qpdf binary not found (set QPDF_PATH or install qpdf)");
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise<boolean>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, ["--requires-password", filePath]);
    const child = spawn(limBin, limArgs, {
      stdio: ["ignore", "ignore", "pipe"],
    });
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
      reject(new QpdfTimeoutError(`qpdf timed out after ${Math.round(timeoutMs / 1000)}s`));
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
      if (code === 0) {
        resolvePromise(true);
        return;
      }
      if (code === 2 || code === 3) {
        resolvePromise(false);
        return;
      }
      if (code === null || code === 126 || code === 127) {
        reject(qpdfSpawnFailure(bin, code, signal, err));
        return;
      }
      reject(new Error(`qpdf exited ${code}: ${err.slice(-1000)}`));
    });
    opts.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function qpdfPageCount(filePath: string, opts?: QpdfOptions): Promise<number> {
  const out = await runQpdf(["--show-npages", filePath], opts);
  const n = Number(out.trim());
  if (!Number.isFinite(n)) throw new Error(`qpdf returned a non-numeric page count: ${out.trim()}`);
  return n;
}
