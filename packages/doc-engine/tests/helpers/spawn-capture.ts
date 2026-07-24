import type { spawn } from "node:child_process";
import type { Mock } from "vitest";
import { createFakeChild, type FakeChild, settleClose, settleError } from "./fake-child.js";

/**
 * Helpers over a mocked `spawn` for the doc-engine CLI wrappers. All of them
 * spawn(bin, args, opts), pipe stdout/stderr, and settle on close/error, so a
 * single set of helpers drives every wrapper's success and failure paths and
 * exposes the exact argv for assertion.
 */
export function makeSpawnHelpers(mockSpawn: Mock<typeof spawn>) {
  /** Program the next spawn to close with the given code/output. */
  function nextClose(
    opts: { stdout?: string; stderr?: string; code?: number | null; signal?: string | null } = {},
  ): void {
    mockSpawn.mockImplementationOnce(() => {
      const child = createFakeChild();
      settleClose(child, opts);
      return child as never;
    });
  }

  /** Program the next spawn to emit an error event. */
  function nextError(err: Error): void {
    mockSpawn.mockImplementationOnce(() => {
      const child = createFakeChild();
      settleError(child, err);
      return child as never;
    });
  }

  /** Program the next spawn to hand back a child that never settles on its own. */
  function nextManual(): FakeChild {
    const child = createFakeChild();
    mockSpawn.mockImplementationOnce(() => child as never);
    return child;
  }

  function lastCall(): [string, string[], Record<string, unknown>] {
    const calls = mockSpawn.mock.calls;
    const c = calls[calls.length - 1];
    return [c[0] as string, c[1] as string[], c[2] as Record<string, unknown>];
  }
  function lastBin(): string {
    return lastCall()[0];
  }
  function lastArgs(): string[] {
    return lastCall()[1];
  }
  function lastOpts(): Record<string, unknown> {
    return lastCall()[2];
  }

  return { nextClose, nextError, nextManual, lastCall, lastBin, lastArgs, lastOpts };
}
