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
    let nextInstall: (() => void) | null = null;
    const installPending = lock.acquireVenvLock().then((release) => {
      nextInstall = release;
    });
    releaseKept();
    await installPending;
    expect(nextInstall).not.toBeNull();
    nextInstall?.();
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
