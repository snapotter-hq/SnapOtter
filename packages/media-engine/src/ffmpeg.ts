import { spawn } from "node:child_process";
import {
  engineCrashError,
  isEngineCrashExit,
  markToolInputError,
  SafeError,
  wrapWithMemoryLimit,
} from "@snapotter/shared";
import { resolveFfmpeg } from "./binaries.js";
import { type FfmpegProgress, parseProgressBlock } from "./progress.js";

export interface RunFfmpegOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (p: FfmpegProgress) => void;
}

const STDERR_RING_MAX = 16 * 1024;

// stderr shapes that mean "the input media is unusable", not an ffmpeg bug.
// Marked errors are classified expected upstream and never reach Sentry.
const INPUT_ERROR_PATTERNS = [
  /received no packets/i,
  /invalid data found when processing input/i,
  /could not find codec parameters/i,
  /moov atom not found/i,
];

// ffmpeg ends a failed write with the OS's errno text: "No space left on
// device" for ENOSPC, "Disk quota exceeded" ("Disc" on macOS) for EDQUOT.
// Anchored to the line end so an input path holding the phrase can't match.
const STORAGE_FULL_PATTERNS: [RegExp, "ENOSPC" | "EDQUOT"][] = [
  [/No space left on device\)?\s*$/im, "ENOSPC"],
  [/Dis[ck] quota exceeded\)?\s*$/im, "EDQUOT"],
];

/**
 * Gives a failed run the errno a full disk means, shaped like a failed write,
 * so callers answer it as the server's storage fault rather than a bad input
 * (#4148). Returns undefined when stderr shows no full disk.
 */
function storageFullError(message: string, stderr: string): NodeJS.ErrnoException | undefined {
  const hit = STORAGE_FULL_PATTERNS.find(([re]) => re.test(stderr));
  if (!hit) return undefined;
  return Object.assign(new Error(message), { code: hit[1], syscall: "write" });
}

/**
 * Applies the isToolInputError marker (see @snapotter/shared tool-errors.ts)
 * when the captured stderr matches a known input-failure shape.
 */
export function markIfInputError<E extends Error>(err: E, stderr: string): E {
  return INPUT_ERROR_PATTERNS.some((re) => re.test(stderr)) ? markToolInputError(err) : err;
}

export const ENGINE_CRASHED_MESSAGE =
  "The media engine (ffmpeg) crashed while processing this file.";

function ffmpegSpawnFailure(
  bin: string,
  code: null | 126 | 127,
  signal: NodeJS.Signals | null,
  output: string,
): NodeJS.ErrnoException {
  const errno = code === 127 ? "ENOENT" : code === 126 ? "ENOEXEC" : "ENOMEM";
  const detail = output.slice(-1000).trim();
  const msg = detail ? `ffmpeg exited ${code ?? signal}: ${detail}` : `spawn ${bin} ${errno}`;
  return Object.assign(new Error(msg), {
    code: errno,
    syscall: "spawn",
    path: bin,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Runs ffmpeg with `-progress pipe:1` appended, parsing progress blocks from
 * stdout. Rejects with the tail of stderr on non-zero exit, timeout or abort.
 * Resolves with the captured stderr tail (filters like silencedetect report
 * there). Output must go to a FILE path in args (no stdout piping of media
 * data).
 */
export async function runFfmpeg(args: string[], opts: RunFfmpegOptions = {}): Promise<string> {
  const bin = resolveFfmpeg();
  // Shaped like a failed spawn, so callers can tell a missing install from a
  // bad input (#1576).
  if (!bin) {
    throw Object.assign(new Error("ffmpeg binary not found (set FFMPEG_PATH or install ffmpeg)"), {
      code: "ENOENT",
      syscall: "spawn",
      path: "ffmpeg",
    });
  }
  return new Promise<string>((resolvePromise, reject) => {
    const [limBin, limArgs] = wrapWithMemoryLimit(bin, [
      "-hide_banner",
      "-nostdin",
      "-y",
      ...args,
      "-progress",
      "pipe:1",
    ]);
    const child = spawn(limBin, limArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderrTail = "";
    let settled = false;
    let buffer = "";
    const timeoutMs = opts.timeoutMs;
    const timer = timeoutMs
      ? setTimeout(() => {
          fail(new SafeError("ffmpeg timed out", { kind: "operational", code: "timeout" }));
        }, timeoutMs)
      : undefined;
    const onAbort = () => fail(new Error("Canceled"));
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    function cleanup() {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
    function fail(err: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill("SIGKILL");
      reject(err);
    }
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // Blocks end at the line that starts with "progress="
      let idx = buffer.indexOf("progress=");
      while (idx !== -1) {
        const lineEnd = buffer.indexOf("\n", idx);
        if (lineEnd === -1) break;
        const block = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 1);
        try {
          opts.onProgress?.(parseProgressBlock(block));
        } catch (cbErr) {
          fail(cbErr instanceof Error ? cbErr : new Error(String(cbErr)));
          return;
        }
        idx = buffer.indexOf("progress=");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString("utf8")).slice(-STDERR_RING_MAX);
    });
    child.on("error", (err) => fail(err));
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) {
        resolvePromise(stderrTail);
        return;
      }
      if (isEngineCrashExit(code, signal)) {
        reject(engineCrashError(ENGINE_CRASHED_MESSAGE, "ffmpeg", signal, stderrTail));
        return;
      }
      if (code === null || code === 126 || code === 127) {
        reject(ffmpegSpawnFailure(bin, code, signal, stderrTail));
        return;
      }
      const message = `ffmpeg exited ${code}: ${stderrTail}`;
      // A full disk wins over an input-error shape: it can truncate the
      // output ffmpeg then fails to read back, and it is never the upload's fault.
      reject(
        storageFullError(message, stderrTail) ?? markIfInputError(new Error(message), stderrTail),
      );
    });
  });
}
