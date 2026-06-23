/**
 * Mutual exclusion between Python-venv mutation and venv reads.
 *
 * An AI feature bundle install rewrites files under the shared venv's
 * site-packages (pip + copytree of *.so), while AI tool jobs dlopen native
 * libraries (torch / onnxruntime CUDA) from that same venv. Loading a shared
 * object while it is being overwritten segfaults the sidecar, so installs and
 * AI jobs must never run concurrently.
 *
 * Both sides run in the same Node process (the Fastify route spawns the
 * installer; in-process BullMQ workers run the jobs), so a module-level async
 * mutex is sufficient and is shared via Node's module cache.
 *
 * FIFO, non-reentrant. `acquireVenvLock()` resolves to a release function once
 * the lock is held; always call it (it is idempotent). In the common case
 * (no install running) acquisition resolves on the next microtask.
 */
let tail: Promise<void> = Promise.resolve();

export function acquireVenvLock(): Promise<() => void> {
  let release!: () => void;
  let released = false;
  const gate = new Promise<void>((resolve) => {
    release = () => {
      if (!released) {
        released = true;
        resolve();
      }
    };
  });
  const prev = tail;
  tail = prev.then(() => gate);
  return prev.then(() => release);
}
