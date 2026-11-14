import { isSafeMessageError, SafeError } from "./tool-errors.js";

/**
 * Optional per-subprocess address-space cap (RLIMIT_AS) for the native media and
 * document engines.
 *
 * When SUBPROCESS_MEMORY_LIMIT_MB is a positive integer, the command runs under
 * /bin/sh, which sets `ulimit -v` and then `exec`s the real binary with its exact
 * argv. `exec "$@"` does not re-parse the arguments through the shell, so this
 * stays injection-safe. A decompression bomb or runaway filter graph is then
 * killed at that ceiling instead of driving the whole container to the cgroup
 * OOM-killer (which would take every in-flight job down with it).
 *
 * Disabled by default (unset or 0): the container memory limit remains the
 * primary backstop, and `ulimit -v` is a blunt instrument (it caps virtual
 * address space, not RSS). `|| true` makes it a no-op where `ulimit -v` is
 * unsupported, e.g. macOS.
 *
 * Deliberately NOT applied to the Python AI sidecar: ML frameworks (torch, CUDA)
 * reserve very large virtual address space without touching it, so an RLIMIT_AS
 * cap would break legitimate model loads. Those rely on the container limit.
 */
export function wrapWithMemoryLimit(bin: string, args: string[]): [string, string[]] {
  const mb = Number.parseInt(process.env.SUBPROCESS_MEMORY_LIMIT_MB ?? "", 10);
  if (!Number.isFinite(mb) || mb <= 0) return [bin, args];
  assertSpawnable(bin);
  const script = 'ulimit -v "$1" 2>/dev/null || true; shift; exec "$@"';
  return ["/bin/sh", ["-c", script, "sh", String(mb * 1024), bin, ...args]];
}

/**
 * Fail the way a direct spawn of `bin` would. Under the shim /bin/sh starts
 * fine and a bad binary path only shows up as exit 126 or 127, so callers
 * that key on the errno of a spawn failure (a wrong QPDF_PATH, #1310) would
 * otherwise read it as the binary's own error. A bare command name is left
 * to the shell's PATH lookup, exactly as execvp would.
 */
function assertSpawnable(bin: string): void {
  if (!bin.includes("/")) return;
  // Resolved here, not imported at the top: this package is also loaded by the
  // web app, and the Vite dev server can't link a named import from Node's fs,
  // so a top-level `import ... from "node:fs"` blanks `pnpm dev` (#1394). Only
  // the server ever reaches this line.
  const { accessSync, constants, statSync } = process.getBuiltinModule(
    "node:fs",
  ) as typeof import("node:fs");
  let isFile: boolean;
  try {
    isFile = statSync(bin).isFile();
  } catch (err) {
    throw spawnFailure(bin, (err as NodeJS.ErrnoException).code ?? "ENOENT");
  }
  if (!isFile) throw spawnFailure(bin, "EACCES");
  try {
    accessSync(bin, constants.X_OK);
  } catch {
    throw spawnFailure(bin, "EACCES");
  }
}

function spawnFailure(bin: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`spawn ${bin} ${code}`), { code, syscall: "spawn", path: bin });
}

/**
 * Signals that mean an engine crashed while running, not that it couldn't
 * start or was killed for memory or time (SIGKILL and SIGTERM keep the spawn
 * shape, #3829). SIGILL is an instruction the host CPU lacks (an environment
 * fault); the rest are the engine or a library it links faulting.
 */
const CRASH_SIGNALS: ReadonlySet<string> = new Set([
  "SIGSEGV",
  "SIGBUS",
  "SIGFPE",
  "SIGABRT",
  "SIGTRAP",
  "SIGSYS",
  "SIGILL",
]);

export const ENGINE_CRASHED_CODE = "ENGINE_CRASHED";

/** True for a `close` event that means the engine crashed mid-run. */
export function isEngineCrashExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): signal is NodeJS.Signals {
  return code === null && signal !== null && CRASH_SIGNALS.has(signal);
}

/**
 * A crash mid-run, kept apart from a spawn failure so the worker doesn't call
 * it a missing binary (#4371, #4684). `message` must be a constant per engine;
 * the signal and the output tail ride on the cause instead.
 */
export function engineCrashError(
  message: string,
  bin: string,
  signal: NodeJS.Signals,
  output: string,
): SafeError {
  const detail = output.slice(-1000).trim();
  const cause = Object.assign(
    new Error(detail ? `${bin} exited ${signal}: ${detail}` : `${bin} exited ${signal}`),
    { signal },
  );
  return new SafeError(message, {
    kind: signal === "SIGILL" ? "operational" : "bug",
    code: ENGINE_CRASHED_CODE,
    statusCode: 500,
    cause,
  });
}

/** True for an error built by `engineCrashError`, even after a module-boundary copy. */
export function isEngineCrash(err: unknown): boolean {
  return isSafeMessageError(err) && err.code === ENGINE_CRASHED_CODE;
}
