import { EventEmitter } from "node:events";

/**
 * A stand-in for a spawned ChildProcess. stdout/stderr are EventEmitters and the
 * process itself is an EventEmitter, matching how the doc-engine wrappers wire up
 * `child.stdout.on("data")`, `child.stderr.on("data")`, `child.on("close")`, and
 * `child.on("error")`.
 */
export interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (signal?: string) => boolean;
  killed: boolean;
  killSignals: string[];
}

export function createFakeChild(): FakeChild {
  const proc = new EventEmitter() as FakeChild;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.killSignals = [];
  proc.kill = (signal?: string) => {
    proc.killed = true;
    proc.killSignals.push(signal ?? "SIGTERM");
    return true;
  };
  return proc;
}

/**
 * Emit stdout chunks then close with the given exit code on the next microtask,
 * so the wrapper's Promise settles after the caller has awaited it.
 */
export function settleClose(
  child: FakeChild,
  opts: { stdout?: string; stderr?: string; code?: number | null; signal?: string | null } = {},
): void {
  queueMicrotask(() => {
    if (opts.stdout !== undefined) child.stdout.emit("data", Buffer.from(opts.stdout, "utf8"));
    if (opts.stderr !== undefined) child.stderr.emit("data", Buffer.from(opts.stderr, "utf8"));
    // Preserve an explicit `code: null` (signal-only exit) instead of coercing it to 0.
    const code = "code" in opts ? (opts.code ?? null) : 0;
    child.emit("close", code, opts.signal ?? null);
  });
}

/** Emit an "error" event (spawn ENOENT style) on the next microtask. */
export function settleError(child: FakeChild, err: Error): void {
  queueMicrotask(() => {
    child.emit("error", err);
  });
}
