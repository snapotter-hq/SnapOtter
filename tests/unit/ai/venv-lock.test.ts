import { beforeEach, describe, expect, it, vi } from "vitest";

type VenvLock = typeof import("../../../packages/ai/src/venv-lock.js");

let lock: VenvLock;

beforeEach(async () => {
  vi.resetModules();
  lock = await import("../../../packages/ai/src/venv-lock.js");
});

describe("venv lock reader cancellation (#4201)", () => {
  it("rejects a reader cancelled while an install holds the lock", async () => {
    const releaseInstall = await lock.acquireVenvLock();
    const controller = new AbortController();
    const pending = lock.acquireVenvRead(controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    releaseInstall();
  });

  it("rejects at once when the signal is already aborted", async () => {
    const releaseInstall = await lock.acquireVenvLock();
    const controller = new AbortController();
    controller.abort();

    await expect(lock.acquireVenvRead(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    releaseInstall();
  });

  it("does not count a cancelled reader once the install finishes", async () => {
    const releaseInstall = await lock.acquireVenvLock();
    const controller = new AbortController();
    const cancelled = lock.acquireVenvRead(controller.signal);
    const kept = lock.acquireVenvRead();

    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    releaseInstall();

    const releaseKept = await kept;
    // A ghost reader left by the cancelled waiter would keep the next install waiting.
    const installPending = lock.acquireVenvLock();
    releaseKept();
    const releaseNextInstall = await installPending;
    releaseNextInstall();
    expect(lock.tryAcquireVenvRead()).not.toBeNull();
  });

  it("ignores an abort that arrives after the reader was granted", async () => {
    const controller = new AbortController();
    const releaseRead = await lock.acquireVenvRead(controller.signal);
    controller.abort();

    let installGranted = false;
    const installPending = lock.acquireVenvLock().then((release) => {
      installGranted = true;
      release();
    });
    await Promise.resolve();
    expect(installGranted).toBe(false);

    releaseRead();
    await installPending;
    expect(installGranted).toBe(true);
  });
});

describe("venv lock writer cancellation (#4608)", () => {
  it("lets new jobs start at once when a queued install is cancelled", async () => {
    const runningJob = lock.tryAcquireVenvRead();
    expect(runningJob).not.toBeNull();
    const controller = new AbortController();
    const install = lock.acquireVenvLock(controller.signal);
    expect(lock.tryAcquireVenvRead()).toBeNull();

    controller.abort();
    await expect(install).rejects.toMatchObject({ name: "AbortError" });

    const nextJob = lock.tryAcquireVenvRead();
    expect(nextJob).not.toBeNull();
    nextJob?.();
    runningJob?.();
  });

  it("grants readers that queued behind a cancelled install", async () => {
    const runningJob = lock.tryAcquireVenvRead();
    const controller = new AbortController();
    const install = lock.acquireVenvLock(controller.signal);
    let waitingJobGranted = false;
    const waitingJob = lock.acquireVenvRead().then((release) => {
      waitingJobGranted = true;
      return release;
    });
    await Promise.resolve();
    expect(waitingJobGranted).toBe(false);

    controller.abort();
    await expect(install).rejects.toMatchObject({ name: "AbortError" });
    (await waitingJob)();
    expect(waitingJobGranted).toBe(true);
    runningJob?.();
  });

  it("rejects at once when the signal is already aborted, without queueing", async () => {
    const runningJob = lock.tryAcquireVenvRead();
    const controller = new AbortController();
    controller.abort();
    await expect(lock.acquireVenvLock(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    const nextJob = lock.tryAcquireVenvRead();
    expect(nextJob).not.toBeNull();
    nextJob?.();
    runningJob?.();
  });

  it("hands the lock to the next install, not the cancelled one, once jobs drain", async () => {
    const runningJob = lock.tryAcquireVenvRead();
    const controller = new AbortController();
    const cancelled = lock.acquireVenvLock(controller.signal);
    const next = lock.acquireVenvLock();
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    // The live install is still queued, so jobs keep waiting for it.
    expect(lock.tryAcquireVenvRead()).toBeNull();

    runningJob?.();
    const releaseNext = await next;
    expect(lock.tryAcquireVenvRead()).toBeNull();
    releaseNext();
    const after = lock.tryAcquireVenvRead();
    expect(after).not.toBeNull();
    after?.();
  });

  it("keeps the lock held when the signal aborts after it was granted", async () => {
    const controller = new AbortController();
    const release = await lock.acquireVenvLock(controller.signal);
    controller.abort();
    expect(lock.tryAcquireVenvRead()).toBeNull();
    release();
    const job = lock.tryAcquireVenvRead();
    expect(job).not.toBeNull();
    job?.();
  });
});
