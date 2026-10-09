/**
 * The per-worker cancel registry (#2092, #2144). A user cancel is recorded on
 * its own signal, apart from the job's abort signal: once the worker deadline
 * has aborted that controller, a later abort() is a no-op and the reason stays
 * "timeout", so the signal alone can't say whether the user asked for a stop.
 * The writes after the handler wait on the user-cancel signal, which the
 * deadline never fires.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  onMessage: null as ((channel: string, message: string) => void) | null,
}));

vi.mock("../../../../apps/api/src/db/index.js", () => ({ db: {}, schema: {} }));

vi.mock("../../../../apps/api/src/routes/progress.js", () => ({
  cancelSingleJobGuarded: vi.fn(),
}));

vi.mock("../../../../apps/api/src/jobs/batch-progress.js", () => ({
  markBatchCanceled: vi.fn(),
}));

vi.mock("../../../../apps/api/src/jobs/queues.js", () => ({
  getQueue: vi.fn(),
}));

vi.mock("../../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: vi.fn(),
  createRedisSubscriberConnection: () => ({
    on: (event: string, handler: (channel: string, message: string) => void) => {
      if (event === "message") stubs.onMessage = handler;
    },
    subscribe: async () => {},
    unsubscribe: async () => {},
    quit: async () => {},
  }),
}));

const {
  registerCancelable,
  startCancelListener,
  stopCancelListener,
  unregisterCancelable,
  userCancelSignal,
  wasUserCanceled,
} = await import("../../../../apps/api/src/jobs/cancel.js");

/** Deliver a cancel-channel message the way the Redis subscriber would. */
function deliverCancel(jobId: string): void {
  if (!stubs.onMessage) throw new Error("cancel listener not started");
  stubs.onMessage("cancel", jobId);
}

beforeAll(async () => {
  await startCancelListener();
});

afterAll(async () => {
  await stopCancelListener();
});

describe("user-cancel registry (#2092, #2144)", () => {
  it("fires both the job signal and the user-cancel signal on a cancel message", () => {
    const ac = registerCancelable("j-cancel");
    const userCancel = userCancelSignal("j-cancel");
    expect(userCancel.aborted).toBe(false);
    expect(wasUserCanceled("j-cancel")).toBe(false);

    deliverCancel("j-cancel");

    expect(ac.signal.aborted).toBe(true);
    expect(userCancel.aborted).toBe(true);
    expect(wasUserCanceled("j-cancel")).toBe(true);
    unregisterCancelable("j-cancel");
  });

  it("leaves the user-cancel signal alone when only the deadline aborted the job", () => {
    const ac = registerCancelable("j-timeout");
    const userCancel = userCancelSignal("j-timeout");

    ac.abort("timeout");

    expect(ac.signal.reason).toBe("timeout");
    expect(userCancel.aborted).toBe(false);
    expect(wasUserCanceled("j-timeout")).toBe(false);
    unregisterCancelable("j-timeout");
  });

  it("still fires the user-cancel signal when the cancel lands after the deadline", () => {
    // The job controller is already aborted, so this cancel's abort() on it is
    // a no-op and its reason stays "timeout"; the user-cancel signal is what
    // tells the worker a user asked for a stop (#2092).
    const ac = registerCancelable("j-late");
    const userCancel = userCancelSignal("j-late");
    ac.abort("timeout");

    deliverCancel("j-late");

    expect(ac.signal.reason).toBe("timeout");
    expect(userCancel.aborted).toBe(true);
    expect(wasUserCanceled("j-late")).toBe(true);
    unregisterCancelable("j-late");
  });

  it("drops both records on unregister and refuses a job it is not running", () => {
    registerCancelable("j-done");
    deliverCancel("j-done");
    expect(wasUserCanceled("j-done")).toBe(true);

    unregisterCancelable("j-done");

    expect(wasUserCanceled("j-done")).toBe(false);
    expect(() => userCancelSignal("j-done")).toThrow(/not registered/);
  });

  it("ignores a cancel for a job this worker is not running", () => {
    expect(() => deliverCancel("j-elsewhere")).not.toThrow();
    expect(wasUserCanceled("j-elsewhere")).toBe(false);
  });
});
