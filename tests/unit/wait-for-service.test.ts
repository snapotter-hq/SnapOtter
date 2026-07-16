import { describe, expect, it } from "vitest";
import { waitForService } from "../../apps/api/src/lib/wait-for-service.js";

// Deterministic fake clock: `sleep` advances virtual time and `now` reads it,
// so we can assert retry timing without real timers slowing the suite down.
function fakeClock() {
  let ms = 0;
  return {
    now: () => ms,
    sleep: async (delta: number) => {
      ms += delta;
    },
    elapsed: () => ms,
  };
}

describe("waitForService", () => {
  it("resolves immediately when the probe succeeds on the first attempt", async () => {
    const clock = fakeClock();
    let attempts = 0;
    await waitForService(
      async () => {
        attempts++;
      },
      { timeoutMs: 30_000, intervalMs: 1_000, now: clock.now, sleep: clock.sleep },
    );
    expect(attempts).toBe(1);
    expect(clock.elapsed()).toBe(0); // never slept
  });

  it("retries until the probe succeeds, then resolves", async () => {
    const clock = fakeClock();
    let attempts = 0;
    await waitForService(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("not ready");
      },
      { timeoutMs: 30_000, intervalMs: 1_000, now: clock.now, sleep: clock.sleep },
    );
    expect(attempts).toBe(3);
    expect(clock.elapsed()).toBe(2_000); // slept twice between three attempts
  });

  it("rejects with the last probe error once the timeout elapses", async () => {
    const clock = fakeClock();
    let attempts = 0;
    await expect(
      waitForService(
        async () => {
          attempts++;
          throw new Error(`refused #${attempts}`);
        },
        { timeoutMs: 3_000, intervalMs: 1_000, now: clock.now, sleep: clock.sleep },
      ),
    ).rejects.toThrow("refused #4"); // attempts fire at t=0,1000,2000,3000
    expect(attempts).toBe(4);
  });

  it("reports each failed attempt through the onRetry callback", async () => {
    const clock = fakeClock();
    let attempts = 0;
    const retried: number[] = [];
    await waitForService(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("not ready");
      },
      {
        timeoutMs: 30_000,
        intervalMs: 1_000,
        now: clock.now,
        sleep: clock.sleep,
        onRetry: (attempt) => retried.push(attempt),
      },
    );
    expect(retried).toEqual([1, 2]); // two failures before the third-attempt success
  });
});
