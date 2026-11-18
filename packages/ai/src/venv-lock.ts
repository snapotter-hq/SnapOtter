/**
 * Read/write lock between AI tool jobs (readers) and bundle installs (writers).
 *
 * A bundle install rewrites the shared venv's site-packages (pip + copytree of
 * *.so), while AI tool jobs dlopen native libraries (torch / onnxruntime CUDA)
 * from that same venv. Loading a shared object while it is being overwritten
 * segfaults the sidecar, so an install's venv-write phase must not overlap
 * with any AI job. The installer asks for the writer lock only when it reaches
 * that phase; its download and extract run alongside jobs (#4201).
 *
 * AI jobs may run concurrently with each other -- the persistent dispatcher
 * multiplexes requests by id -- so they are shared readers; only an install
 * needs exclusivity, so it is the writer. Writer-preferring, so an install is
 * not starved by a steady stream of jobs.
 *
 * Both sides live in the same Node process (the Fastify route spawns the
 * installer; in-process BullMQ workers run the jobs), so the lock is module
 * state shared via Node's module cache. It does not reach a second API
 * replica on the same data volume: that replica's dispatcher keeps the old
 * libraries mapped while this one rewrites the venv. The deployment guide
 * tells operators to drain other replicas before changing AI bundles (#4309).
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

function abortError(): Error {
  const error = new Error("Venv lock wait canceled");
  error.name = "AbortError";
  return error;
}

/**
 * AI-job (reader) acquire; waits while an install holds or is awaiting the lock.
 * Aborting `signal` while waiting drops the request and rejects at once, so a
 * cancelled job neither waits out the install nor leaves a reader behind.
 */
export function acquireVenvRead(signal?: AbortSignal): Promise<Release> {
  if (signal?.aborted) return Promise.reject(abortError());
  const r = tryAcquireVenvRead();
  if (r) return Promise.resolve(r);
  return new Promise<Release>((resolve, reject) => {
    const onAbort = () => {
      const index = readWaiters.indexOf(grant);
      if (index !== -1) readWaiters.splice(index, 1);
      reject(abortError());
    };
    const grant = () => {
      signal?.removeEventListener("abort", onAbort);
      readers++;
      resolve(readRelease());
    };
    readWaiters.push(grant);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Bundle-install (writer) exclusive acquire; waits for in-flight AI jobs.
 * Aborting `signal` while waiting drops the request and rejects at once. If
 * it was the last queued writer, jobs that were held off behind it start
 * right away instead of waiting for the running ones to finish (#4608).
 */
export function acquireVenvLock(signal?: AbortSignal): Promise<Release> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!writerActive && readers === 0 && writeWaiters.length === 0) {
    writerActive = true;
    return Promise.resolve(writeRelease());
  }
  return new Promise<Release>((resolve, reject) => {
    const onAbort = () => {
      // Splice it out rather than flag it: a release grants writeWaiters.shift().
      const index = writeWaiters.indexOf(grant);
      if (index !== -1) writeWaiters.splice(index, 1);
      if (!writerActive && writeWaiters.length === 0) {
        const granted = readWaiters.splice(0);
        for (const grantRead of granted) grantRead();
      }
      reject(abortError());
    };
    const grant = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve(writeRelease());
    };
    writeWaiters.push(grant);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
