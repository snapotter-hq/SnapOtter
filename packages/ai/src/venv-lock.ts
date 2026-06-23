/**
 * Read/write lock between AI tool jobs (readers) and bundle installs (writers).
 *
 * A bundle install rewrites the shared venv's site-packages (pip + copytree of
 * *.so), while AI tool jobs dlopen native libraries (torch / onnxruntime CUDA)
 * from that same venv. Loading a shared object while it is being overwritten
 * segfaults the sidecar, so an install must not overlap with any AI job.
 *
 * AI jobs may run concurrently with each other -- the persistent dispatcher
 * multiplexes requests by id -- so they are shared readers; only an install
 * needs exclusivity, so it is the writer. Writer-preferring, so an install is
 * not starved by a steady stream of jobs.
 *
 * Both sides live in the same Node process (the Fastify route spawns the
 * installer; in-process BullMQ workers run the jobs), so a module-level lock
 * shared via Node's module cache is sufficient.
 *
 * Readers have a synchronous fast path (tryAcquireVenvRead) so a job's work
 * begins in the same tick when no install is active or pending -- exactly as
 * before this lock existed. Every acquire returns a release function; always
 * call it (it is idempotent).
 */
type Release = () => void;

let readers = 0;
let writerActive = false;
const writeWaiters: Array<() => void> = [];
const readWaiters: Array<() => void> = [];

function readRelease(): Release {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    readers--;
    if (readers === 0 && writeWaiters.length > 0) {
      writerActive = true;
      writeWaiters.shift()?.();
    }
  };
}

function writeRelease(): Release {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    writerActive = false;
    if (writeWaiters.length > 0) {
      writerActive = true;
      writeWaiters.shift()?.();
    } else {
      const granted = readWaiters.splice(0);
      for (const grant of granted) grant();
    }
  };
}

/** AI-job (reader) sync fast path; null if an install is active or waiting. */
export function tryAcquireVenvRead(): Release | null {
  if (writerActive || writeWaiters.length > 0) return null;
  readers++;
  return readRelease();
}

/** AI-job (reader) acquire; waits while an install holds or is awaiting the lock. */
export function acquireVenvRead(): Promise<Release> {
  const r = tryAcquireVenvRead();
  if (r) return Promise.resolve(r);
  return new Promise<Release>((resolve) => {
    readWaiters.push(() => {
      readers++;
      resolve(readRelease());
    });
  });
}

/** Bundle-install (writer) exclusive acquire; waits for in-flight AI jobs. */
export function acquireVenvLock(): Promise<Release> {
  if (!writerActive && readers === 0 && writeWaiters.length === 0) {
    writerActive = true;
    return Promise.resolve(writeRelease());
  }
  return new Promise<Release>((resolve) => {
    writeWaiters.push(() => resolve(writeRelease()));
  });
}
