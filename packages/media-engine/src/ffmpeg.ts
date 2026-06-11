import { spawn } from "node:child_process";
import { resolveFfmpeg } from "./binaries.js";
import { type FfmpegProgress, parseProgressBlock } from "./progress.js";

export interface RunFfmpegOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (p: FfmpegProgress) => void;
}

const STDERR_RING_MAX = 16 * 1024;

/**
 * Runs ffmpeg with `-progress pipe:1` appended, parsing progress blocks from
 * stdout. Rejects with the tail of stderr on non-zero exit, timeout or abort.
 * Output must go to a FILE path in args (no stdout piping of media data).
 */
export async function runFfmpeg(args: string[], opts: RunFfmpegOptions = {}): Promise<void> {
  const bin = resolveFfmpeg();
  if (!bin) throw new Error("ffmpeg binary not found (set FFMPEG_PATH or install ffmpeg)");
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(bin, ["-hide_banner", "-nostdin", "-y", ...args, "-progress", "pipe:1"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderrTail = "";
    let settled = false;
    let buffer = "";
    const timeoutMs = opts.timeoutMs;
    const timer = timeoutMs
      ? setTimeout(() => {
          fail(new Error(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`));
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
      if (code === 0) resolvePromise();
      else reject(new Error(`ffmpeg exited ${code ?? signal}: ${stderrTail.slice(-2000)}`));
    });
  });
}
