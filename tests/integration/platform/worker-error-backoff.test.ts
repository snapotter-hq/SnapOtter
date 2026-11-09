/**
 * BullMQ's Worker retries moveToActive with no delay when Redis answers with a
 * reply error that isn't a dropped connection, so a full disk (MISCONF) or a
 * missing replica (NOREPLICAS) turns every pool into a busy loop that sends
 * Redis thousands of failing script calls a second (#4530). This drives a real
 * Worker into that state and checks the burst backoff pauses it, keeps
 * pausing it while Redis refuses, and lets it finish the queue once Redis
 * accepts writes again.
 *
 * `CONFIG SET min-replicas-to-write 1` makes every write fail with NOREPLICAS,
 * which is server-wide, so the test runs its own Redis instead of the shared
 * test instance every other fork is writing to.
 */
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createWorkerErrorBackoff,
  WORKER_ERROR_BURST,
} from "../../../apps/api/src/jobs/worker-error-backoff.js";

const JOBS = 20;
const BACKOFF_MS = 300;

/** Far below what the unthrottled loop reaches before its first backoff ends. */
const SPIN_CEILING = WORKER_ERROR_BURST * 4;

/**
 * Resolves on the worker's next `event`. Not events.once: that rejects on the
 * first "error", and this worker emits nothing but errors while Redis refuses.
 */
function next(worker: Worker, event: "paused" | "resumed"): Promise<void> {
  return new Promise((resolve) => worker.once(event, () => resolve()));
}

describe("Worker error burst backoff against a refusing Redis (#4530)", () => {
  let container: StartedRedisContainer;
  let admin: Redis;

  beforeAll(async () => {
    container = await new RedisContainer("redis:8-alpine").start();
    admin = new Redis(container.getConnectionUrl());
  }, 120_000);

  afterAll(async () => {
    await admin?.quit();
    await container?.stop();
  });

  it("pauses a worker spinning on NOREPLICAS and drains the queue after Redis recovers", async () => {
    const connection = {
      host: container.getHost(),
      port: container.getPort(),
      maxRetriesPerRequest: null,
    };
    const queue = new Queue("backoff", { connection });
    let completed = 0;
    const worker = new Worker("backoff", async () => "ok", { connection, autorun: false });
    try {
      let errors = 0;
      let failSpin: (err: Error) => void = () => {};
      const spun = new Promise<never>((_, reject) => {
        failSpin = reject;
      });
      worker.on("error", () => {
        errors++;
        if (errors === 1_000) failSpin(new Error("worker spun to 1,000 errors without pausing"));
      });
      worker.on("error", createWorkerErrorBackoff(worker, "system", BACKOFF_MS));
      const allDone = new Promise<void>((resolve) => {
        worker.on("completed", () => {
          completed++;
          if (completed === JOBS) resolve();
        });
      });

      for (let i = 0; i < JOBS; i++) await queue.add("job", { i });
      await admin.config("SET", "min-replicas-to-write", "1");

      const firstPause = next(worker, "paused");
      worker.run().catch(failSpin);
      await Promise.race([firstPause, spun]);
      expect(errors).toBeGreaterThanOrEqual(WORKER_ERROR_BURST);
      expect(errors).toBeLessThan(SPIN_CEILING);

      // Still refused after the backoff: the worker tries again, then pauses again.
      await next(worker, "resumed");
      await Promise.race([next(worker, "paused"), spun]);
      expect(errors).toBeLessThan(SPIN_CEILING);

      await admin.config("SET", "min-replicas-to-write", "0");
      await Promise.race([allDone, spun]);
      expect(completed).toBe(JOBS);
    } finally {
      await admin.config("SET", "min-replicas-to-write", "0");
      await worker.close();
      await queue.close();
    }
  }, 60_000);
});
