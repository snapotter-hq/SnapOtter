/**
 * Vitest 4 resolves a run of queued vi.doMock calls in parallel and registers
 * each one when its path resolution settles, so two doMock calls for the same
 * path with nothing in between land in completion order, not call order (#4750).
 * Any module request drains the queue first. Call this between a default mock
 * and an override of the same path, before the next import of the code under test.
 */
export async function drainDoMockQueue(): Promise<void> {
  await import("./mock-queue-drain-target.js");
}
