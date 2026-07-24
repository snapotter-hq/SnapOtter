import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mutation-focused coverage for apps/api/src/jobs/queues.ts. The sibling
// jobs/queues.behavior.test.ts already exercises the happy paths; this file
// pins the exact literal values a mutant would flip: the per-pool retry
// options object, the getJobCounts/getJobs argument lists, the ?? 0
// count-aggregation fallbacks at their boundary, and the oldest-waiting-age
// subtraction. Every assertion targets a specific value so the corresponding
// mutant dies rather than merely being covered.

interface FakeQueue {
  name: string;
  options: Record<string, unknown>;
  close: ReturnType<typeof vi.fn>;
  getJobCounts: ReturnType<typeof vi.fn>;
  getJobs: ReturnType<typeof vi.fn>;
}

const queueInstances: FakeQueue[] = [];
const queueCtor = vi.hoisted(() => vi.fn());

async function loadQueuesModule() {
  vi.resetModules();
  queueInstances.length = 0;
  queueCtor.mockReset();
  queueCtor.mockImplementation((name: string, options: Record<string, unknown>) => {
    const queue: FakeQueue = {
      name,
      options,
      close: vi.fn().mockResolvedValue(undefined),
      getJobCounts: vi.fn().mockResolvedValue({ active: 0, waiting: 0, delayed: 0, failed: 0 }),
      getJobs: vi.fn().mockResolvedValue([]),
    };
    queueInstances.push(queue);
    return queue;
  });

  vi.doMock("bullmq", () => ({ Queue: queueCtor }));
  vi.doMock("../../../apps/api/src/jobs/connection.js", () => ({
    createBullMQConnection: vi.fn(() => ({ marker: "conn" })),
  }));

  return import("../../../apps/api/src/jobs/queues.js");
}

describe("queues.ts mutation coverage", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getQueue construction", () => {
    it("gives the ai pool exactly 1 attempt and every other pool exactly 2", async () => {
      const { getQueue } = await loadQueuesModule();

      const attemptsFor = (pool: "image" | "media" | "ai" | "docs" | "system") => {
        getQueue(pool);
        const created = queueInstances[queueInstances.length - 1];
        const opts = created.options.defaultJobOptions as { attempts: number };
        return opts.attempts;
      };

      expect(attemptsFor("ai")).toBe(1);
      expect(attemptsFor("image")).toBe(2);
      expect(attemptsFor("media")).toBe(2);
      expect(attemptsFor("docs")).toBe(2);
      expect(attemptsFor("system")).toBe(2);
    });

    it("constructs each queue with the exact defaultJobOptions object", async () => {
      const { getQueue } = await loadQueuesModule();

      getQueue("image");

      expect(queueCtor).toHaveBeenCalledTimes(1);
      const [, options] = queueCtor.mock.calls[0];
      expect(options).toEqual({
        connection: { marker: "conn" },
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: { age: 3600, count: 5000 },
          removeOnFail: { age: 24 * 3600, count: 5000 },
        },
      });
    });

    it("uses the queueName helper output as the BullMQ queue name", async () => {
      const { getQueue } = await loadQueuesModule();
      const { queueName } = await import("../../../apps/api/src/jobs/types.js");

      getQueue("docs");

      expect(queueInstances[0].name).toBe(queueName("docs"));
    });

    it("passes a freshly created connection to the Queue constructor", async () => {
      const { getQueue } = await loadQueuesModule();

      getQueue("media");

      const [, options] = queueCtor.mock.calls[0];
      expect((options as { connection: unknown }).connection).toEqual({ marker: "conn" });
    });

    it("removeOnFail age is 24 hours in seconds, distinct from the 1 hour complete age", async () => {
      const { getQueue } = await loadQueuesModule();
      getQueue("system");

      const opts = queueInstances[0].options.defaultJobOptions as {
        removeOnComplete: { age: number; count: number };
        removeOnFail: { age: number; count: number };
      };
      // 24 * 3600 === 86400; a mutant dropping the *24 (or flipping the *) would
      // leave these equal to the complete age (3600).
      expect(opts.removeOnFail.age).toBe(86_400);
      expect(opts.removeOnComplete.age).toBe(3_600);
      expect(opts.removeOnFail.age).not.toBe(opts.removeOnComplete.age);
      expect(opts.removeOnComplete.count).toBe(5_000);
      expect(opts.removeOnFail.count).toBe(5_000);
    });

    it("uses an exponential backoff with a 1000ms delay", async () => {
      const { getQueue } = await loadQueuesModule();
      getQueue("image");

      const opts = queueInstances[0].options.defaultJobOptions as {
        backoff: { type: string; delay: number };
      };
      expect(opts.backoff.type).toBe("exponential");
      expect(opts.backoff.delay).toBe(1000);
    });

    it("caches the queue so a second getQueue call does not reconstruct it", async () => {
      const { getQueue } = await loadQueuesModule();

      const first = getQueue("image");
      const second = getQueue("image");

      expect(second).toBe(first);
      expect(queueCtor).toHaveBeenCalledTimes(1);
    });
  });

  describe("queueCounts aggregation", () => {
    it("sums active, waiting, and delayed across every created queue", async () => {
      const { getQueue, queueCounts } = await loadQueuesModule();
      getQueue("image");
      getQueue("media");
      getQueue("ai");

      queueInstances[0].getJobCounts.mockResolvedValueOnce({
        active: 1,
        waiting: 10,
        delayed: 100,
      });
      queueInstances[1].getJobCounts.mockResolvedValueOnce({
        active: 2,
        waiting: 20,
        delayed: 200,
      });
      queueInstances[2].getJobCounts.mockResolvedValueOnce({
        active: 4,
        waiting: 40,
        delayed: 400,
      });

      // Distinct powers keep each field's sum unique so a swapped accumulator
      // (active += counts.waiting, etc.) produces a different total.
      await expect(queueCounts()).resolves.toEqual({ active: 7, waiting: 70, delayed: 700 });
    });

    it("requests the active, waiting, and delayed states by name", async () => {
      const { getQueue, queueCounts } = await loadQueuesModule();
      getQueue("image");

      await queueCounts();

      expect(queueInstances[0].getJobCounts).toHaveBeenCalledWith("active", "waiting", "delayed");
    });

    it("falls back to 0 for each missing count key at the aggregation boundary", async () => {
      const { getQueue, queueCounts } = await loadQueuesModule();
      getQueue("image");
      getQueue("media");

      // First queue supplies only active; second only waiting. delayed is
      // absent from both, so all three ?? 0 branches must fire.
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 3 });
      queueInstances[1].getJobCounts.mockResolvedValueOnce({ waiting: 9 });

      await expect(queueCounts()).resolves.toEqual({ active: 3, waiting: 9, delayed: 0 });
    });

    it("skips pools whose queue was never created", async () => {
      const { getQueue, queueCounts } = await loadQueuesModule();
      // Only one of five pools is instantiated.
      getQueue("system");
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 5, waiting: 6, delayed: 7 });

      await expect(queueCounts()).resolves.toEqual({ active: 5, waiting: 6, delayed: 7 });
      // The four skipped pools never call getJobCounts.
      expect(queueInstances).toHaveLength(1);
    });

    it("returns all zeros when no queues have been created", async () => {
      const { queueCounts } = await loadQueuesModule();
      await expect(queueCounts()).resolves.toEqual({ active: 0, waiting: 0, delayed: 0 });
    });
  });

  describe("perPoolCounts", () => {
    it("reports every pool, defaulting uncreated pools to zero", async () => {
      const { getQueue, perPoolCounts } = await loadQueuesModule();
      getQueue("image");
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 11, waiting: 22 });

      await expect(perPoolCounts()).resolves.toEqual({
        image: { active: 11, waiting: 22 },
        media: { active: 0, waiting: 0 },
        ai: { active: 0, waiting: 0 },
        docs: { active: 0, waiting: 0 },
        system: { active: 0, waiting: 0 },
      });
    });

    it("requests only the active and waiting states", async () => {
      const { getQueue, perPoolCounts } = await loadQueuesModule();
      getQueue("image");

      await perPoolCounts();

      expect(queueInstances[0].getJobCounts).toHaveBeenCalledWith("active", "waiting");
    });

    it("defaults each missing count to 0 independently", async () => {
      const { getQueue, perPoolCounts } = await loadQueuesModule();
      getQueue("docs");
      // waiting present, active omitted: both sides of the ?? 0 pair are exercised.
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ waiting: 8 });

      const result = await perPoolCounts();
      expect(result.docs).toEqual({ active: 0, waiting: 8 });
    });
  });

  describe("perPoolHealth", () => {
    it("computes oldestWaitingMs as now minus the oldest job timestamp", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-29T12:00:00.000Z"));

      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("media");
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 3, waiting: 2, failed: 1 });
      queueInstances[0].getJobs.mockResolvedValueOnce([
        { timestamp: new Date("2026-06-29T11:59:30.000Z").getTime() },
      ]);

      const result = await perPoolHealth();
      // 30s between the job timestamp and the frozen clock.
      expect(result.media).toEqual({
        active: 3,
        waiting: 2,
        failed: 1,
        oldestWaitingMs: 30_000,
      });
    });

    it("requests active, waiting, and failed states from getJobCounts", async () => {
      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("image");

      await perPoolHealth();

      expect(queueInstances[0].getJobCounts).toHaveBeenCalledWith("active", "waiting", "failed");
    });

    it("fetches exactly the single oldest waiting job with the correct paging args", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-29T12:00:00.000Z"));

      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("ai");
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 0, waiting: 1, failed: 0 });
      queueInstances[0].getJobs.mockResolvedValueOnce([
        { timestamp: new Date("2026-06-29T11:59:59.000Z").getTime() },
      ]);

      await perPoolHealth();

      // start=0, end=0 (only the first row), asc=true (oldest first).
      expect(queueInstances[0].getJobs).toHaveBeenCalledWith(["waiting"], 0, 0, true);
    });

    it("does not fetch jobs when the waiting count is zero", async () => {
      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("docs");
      // waiting is exactly 0: the (counts.waiting ?? 0) > 0 guard must be false.
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 4, waiting: 0, failed: 2 });

      const result = await perPoolHealth();

      expect(queueInstances[0].getJobs).not.toHaveBeenCalled();
      expect(result.docs).toEqual({ active: 4, waiting: 0, failed: 2, oldestWaitingMs: null });
    });

    it("fetches jobs when the waiting count is exactly 1 (strictly greater than 0)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-29T12:00:00.000Z"));

      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("media");
      // Straddles the > 0 boundary: 1 must trigger the getJobs branch.
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 0, waiting: 1, failed: 0 });
      queueInstances[0].getJobs.mockResolvedValueOnce([
        { timestamp: new Date("2026-06-29T11:59:58.000Z").getTime() },
      ]);

      const result = await perPoolHealth();

      expect(queueInstances[0].getJobs).toHaveBeenCalledTimes(1);
      expect(result.media.oldestWaitingMs).toBe(2_000);
    });

    it("leaves oldestWaitingMs null when getJobs returns an empty page", async () => {
      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("image");
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 0, waiting: 1, failed: 0 });
      queueInstances[0].getJobs.mockResolvedValueOnce([]);

      const result = await perPoolHealth();
      expect(result.image.oldestWaitingMs).toBeNull();
    });

    it("leaves oldestWaitingMs null when the first returned job slot is undefined", async () => {
      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("image");
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 0, waiting: 1, failed: 0 });
      queueInstances[0].getJobs.mockResolvedValueOnce([undefined]);

      const result = await perPoolHealth();
      expect(result.image.oldestWaitingMs).toBeNull();
    });

    it("defaults active, waiting, and failed to 0 for uncreated pools", async () => {
      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("image");
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 0, waiting: 0, failed: 0 });

      const result = await perPoolHealth();
      expect(result.system).toEqual({
        active: 0,
        waiting: 0,
        failed: 0,
        oldestWaitingMs: null,
      });
    });

    it("defaults each missing count field to 0 while still resolving a waiting age", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-29T12:00:00.000Z"));

      const { getQueue, perPoolHealth } = await loadQueuesModule();
      getQueue("ai");
      // active and failed omitted; waiting present so the age still resolves.
      queueInstances[0].getJobCounts.mockResolvedValueOnce({ waiting: 1 });
      queueInstances[0].getJobs.mockResolvedValueOnce([
        { timestamp: new Date("2026-06-29T11:59:52.000Z").getTime() },
      ]);

      const result = await perPoolHealth();
      expect(result.ai).toEqual({
        active: 0,
        waiting: 1,
        failed: 0,
        oldestWaitingMs: 8_000,
      });
    });
  });

  describe("closeQueues", () => {
    it("closes every cached queue and clears the cache", async () => {
      const { getQueue, closeQueues, queueCounts } = await loadQueuesModule();
      getQueue("image");
      getQueue("ai");

      await closeQueues();

      expect(queueInstances[0].close).toHaveBeenCalledTimes(1);
      expect(queueInstances[1].close).toHaveBeenCalledTimes(1);
      // After clearing, aggregation touches no queue and returns all zeros.
      await expect(queueCounts()).resolves.toEqual({ active: 0, waiting: 0, delayed: 0 });
    });

    it("resolves without error when there are no queues to close", async () => {
      const { closeQueues } = await loadQueuesModule();
      await expect(closeQueues()).resolves.toBeUndefined();
    });
  });
});
