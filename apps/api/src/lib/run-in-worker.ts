import { Worker } from "node:worker_threads";

export interface RunInWorkerOptions {
  timeoutMs: number;
  /** V8 heap cap for the worker, so a runaway input can't take the API process down with it. */
  maxOldGenerationSizeMb?: number;
}

export class WorkerTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Worker did not finish within ${timeoutMs} ms`);
    this.name = "WorkerTimeoutError";
  }
}

export class WorkerOutOfMemoryError extends Error {
  constructor(cause: unknown) {
    super("Worker ran out of memory", { cause });
    this.name = "WorkerOutOfMemoryError";
  }
}

type WorkerReply =
  | { ok: true; value: unknown }
  | { ok: false; error: { name: string; message: string } };

/**
 * Runs one job on a fresh worker thread so synchronous JS (svgo) can't stall the
 * API event loop, which BullMQ lock renewal, SSE and health checks all share.
 *
 * The module at `workerUrl` must be plain JavaScript: workers don't get tsx's
 * TypeScript loader under every runner. It reads `workerData` and answers once
 * with `{ ok: true, value }` or `{ ok: false, error: { name, message } }`.
 * A failed job is rethrown here with the original error name so callers can
 * match on it.
 */
export function runInWorker<T>(
  workerUrl: URL,
  input: unknown,
  { timeoutMs, maxOldGenerationSizeMb }: RunInWorkerOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: input,
      // Don't inherit the parent's --import preloads (tsx, Sentry instrument.ts):
      // the worker is plain JS and each job would otherwise re-run them.
      execArgv: [],
      resourceLimits: maxOldGenerationSizeMb ? { maxOldGenerationSizeMb } : undefined,
    });
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      settle();
    };

    const timer = setTimeout(
      () => finish(() => reject(new WorkerTimeoutError(timeoutMs))),
      timeoutMs,
    );

    worker.once("message", (reply: WorkerReply) =>
      finish(() => {
        if (reply.ok) return resolve(reply.value as T);
        const err = new Error(reply.error.message);
        err.name = reply.error.name;
        reject(err);
      }),
    );
    worker.once("error", (err: NodeJS.ErrnoException) =>
      finish(() =>
        reject(err.code === "ERR_WORKER_OUT_OF_MEMORY" ? new WorkerOutOfMemoryError(err) : err),
      ),
    );
    worker.once("exit", (code) =>
      finish(() => reject(new Error(`Worker exited with code ${code} before replying`))),
    );
  });
}
