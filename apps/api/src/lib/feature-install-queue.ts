/**
 * Server-side feature-install queue (in-memory, FIFO).
 *
 * The queue lives on the server so a POST is always durable: the client POSTs
 * immediately and the server serializes installs behind the existing file lock.
 * A queued-but-not-yet-started install therefore has a real server footprint
 * (this module), instead of only living in a browser tab that can close and
 * silently drop it.
 *
 * This is a LEAF module: it imports NOTHING from feature-status.ts. The
 * dependency runs the other way (feature-status.ts imports getQueuedBundleIds
 * from here to surface "queued" status), so importing back would form a cycle.
 *
 * In-memory is deliberate, not a shortcut. The active install is a child of the
 * API process and does not survive a server restart (recoverInterruptedInstalls
 * clears the lock on boot because any previous install is dead). This queue
 * matches that exact contract: it survives a browser tab close (the bug it
 * fixes) but not a server restart.
 */

export interface QueuedInstall {
  bundleId: string;
  jobId: string;
}

let activeInstall: QueuedInstall | null = null;
const queue: QueuedInstall[] = [];

/** The bundle currently installing (holding the file lock), or null. */
export function getActiveBundleId(): string | null {
  return activeInstall?.bundleId ?? null;
}

/** Bundle ids waiting in the queue, in FIFO order (excludes the active one). */
export function getQueuedBundleIds(): string[] {
  return queue.map((entry) => entry.bundleId);
}

/** True when the bundle is currently installing or already waiting in the queue. */
export function isQueuedOrActive(bundleId: string): boolean {
  return activeInstall?.bundleId === bundleId || queue.some((entry) => entry.bundleId === bundleId);
}

/**
 * Add a bundle to the FIFO queue and return the effective jobId to track.
 *
 * Server-side dedup: if the bundle is already the active install or already in
 * the queue, no second entry is added and the existing job's id is returned so
 * the caller can attach to the in-flight progress stream.
 */
export function enqueue(entry: QueuedInstall): string {
  if (activeInstall?.bundleId === entry.bundleId) {
    return activeInstall.jobId;
  }
  const existing = queue.find((q) => q.bundleId === entry.bundleId);
  if (existing) {
    return existing.jobId;
  }
  queue.push(entry);
  return entry.jobId;
}

/** Peek the head of the queue without removing it. */
export function peekQueue(): QueuedInstall | null {
  return queue[0] ?? null;
}

/** Remove and return the head of the queue. */
export function dequeue(): QueuedInstall | null {
  return queue.shift() ?? null;
}

/** Mark a bundle as the active install (called by the pump when it starts one). */
export function setActive(entry: QueuedInstall | null): void {
  activeInstall = entry;
}

/** Clear the active install (called when the installer child exits). */
export function clearActive(): void {
  activeInstall = null;
}

/** Test helper: wipe all queue state. */
export function resetQueueState(): void {
  activeInstall = null;
  queue.length = 0;
}
