import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueInstances: Array<{
  name: string;
  options: Record<string, unknown>;
  close: ReturnType<typeof vi.fn>;
  getJobCounts: ReturnType<typeof vi.fn>;
  getJobs: ReturnType<typeof vi.fn>;
}> = [];

async function loadQueuesModule() {
  vi.resetModules();
  queueInstances.length = 0;

  vi.doMock("bullmq", () => ({
    Queue: vi.fn((name: string, options: Record<string, unknown>) => {
      const queue = {
        name,
        options,
        close: vi.fn().mockResolvedValue(undefined),
        getJobCounts: vi.fn().mockResolvedValue({ active: 0, waiting: 0, delayed: 0, failed: 0 }),
        getJobs: vi.fn().mockResolvedValue([]),
      };
      queueInstances.push(queue);
      return queue;
    }),
  }));

  vi.doMock("../../../../apps/api/src/jobs/connection.js", () => ({
    createBullMQConnection: vi.fn(() => ({ mocked: "connection" })),
  }));

  return import("../../../../apps/api/src/jobs/queues.js");
}

describe("job queues", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates one cached queue per pool with pool-specific retry attempts", async () => {
    const { getQueue } = await loadQueuesModule();

    const imageQueue = getQueue("image");
    const sameImageQueue = getQueue("image");
    const aiQueue = getQueue("ai");

    expect(sameImageQueue).toBe(imageQueue);
    expect(aiQueue).not.toBe(imageQueue);
    expect(queueInstances).toHaveLength(2);
    expect(queueInstances[0].name).toContain("image");
    expect(queueInstances[1].name).toContain("ai");
    expect(queueInstances[0].options).toMatchObject({
      defaultJobOptions: { attempts: 2 },
    });
    expect(queueInstances[1].options).toMatchObject({
      defaultJobOptions: { attempts: 1 },
    });
  });

  it("aggregates counts only from queues that have been created", async () => {
    const { getQueue, queueCounts, perPoolCounts } = await loadQueuesModule();
    getQueue("image");
    getQueue("docs");

    queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 2, waiting: 3, delayed: 4 });
    queueInstances[1].getJobCounts.mockResolvedValueOnce({ active: 5, waiting: 7, delayed: 11 });

    await expect(queueCounts()).resolves.toEqual({ active: 7, waiting: 10, delayed: 15 });

    queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 13, waiting: 17 });
    queueInstances[1].getJobCounts.mockResolvedValueOnce({ active: 19, waiting: 23 });

    await expect(perPoolCounts()).resolves.toMatchObject({
      image: { active: 13, waiting: 17 },
      docs: { active: 19, waiting: 23 },
      ai: { active: 0, waiting: 0 },
      media: { active: 0, waiting: 0 },
      system: { active: 0, waiting: 0 },
    });
  });

  it("reports oldest waiting age for per-pool health when waiting jobs exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T12:00:00.000Z"));

    const { getQueue, perPoolHealth } = await loadQueuesModule();
    getQueue("media");
    queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 1, waiting: 1, failed: 2 });
    queueInstances[0].getJobs.mockResolvedValueOnce([
      { timestamp: new Date("2026-06-29T11:59:45.000Z").getTime() },
    ]);

    await expect(perPoolHealth()).resolves.toMatchObject({
      media: { active: 1, waiting: 1, failed: 2, oldestWaitingMs: 15_000 },
      image: { active: 0, waiting: 0, failed: 0, oldestWaitingMs: null },
    });
  });

  it("closes cached queues and clears counts", async () => {
    const { getQueue, closeQueues, queueCounts } = await loadQueuesModule();
    getQueue("image");
    getQueue("ai");

    await closeQueues();

    expect(queueInstances[0].close).toHaveBeenCalledTimes(1);
    expect(queueInstances[1].close).toHaveBeenCalledTimes(1);
    await expect(queueCounts()).resolves.toEqual({ active: 0, waiting: 0, delayed: 0 });
  });

  it("treats missing count keys as zero when aggregating queueCounts", async () => {
    const { getQueue, queueCounts } = await loadQueuesModule();
    getQueue("image");

    // BullMQ can return a counts object that omits states with zero jobs;
    // every field must fall through the ?? 0 branch.
    queueInstances[0].getJobCounts.mockResolvedValueOnce({});

    await expect(queueCounts()).resolves.toEqual({ active: 0, waiting: 0, delayed: 0 });
  });

  it("treats missing count keys as zero in perPoolCounts", async () => {
    const { getQueue, perPoolCounts } = await loadQueuesModule();
    getQueue("system");

    // active present, waiting omitted: exercises both sides of the ?? 0 pair.
    queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 9 });

    await expect(perPoolCounts()).resolves.toMatchObject({
      system: { active: 9, waiting: 0 },
      image: { active: 0, waiting: 0 },
    });
  });

  it("returns oldestWaitingMs null in perPoolHealth when waiting count is missing", async () => {
    const { getQueue, perPoolHealth } = await loadQueuesModule();
    getQueue("docs");

    // No waiting/active/failed keys: (counts.waiting ?? 0) > 0 is false, so
    // getJobs is never consulted and every field falls back to zero/null.
    queueInstances[0].getJobCounts.mockResolvedValueOnce({});

    await expect(perPoolHealth()).resolves.toMatchObject({
      docs: { active: 0, waiting: 0, failed: 0, oldestWaitingMs: null },
    });
    expect(queueInstances[0].getJobs).not.toHaveBeenCalled();
  });

  it("keeps oldestWaitingMs null when waiting is reported but no waiting jobs are returned", async () => {
    const { getQueue, perPoolHealth } = await loadQueuesModule();
    getQueue("media");

    // Count claims a waiting job, but getJobs returns an empty page: the
    // jobs.length > 0 guard must short-circuit and leave oldestWaitingMs null.
    queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 0, waiting: 1, failed: 0 });
    queueInstances[0].getJobs.mockResolvedValueOnce([]);

    await expect(perPoolHealth()).resolves.toMatchObject({
      media: { active: 0, waiting: 1, failed: 0, oldestWaitingMs: null },
    });
    expect(queueInstances[0].getJobs).toHaveBeenCalledTimes(1);
  });

  it("keeps oldestWaitingMs null when the returned waiting job slot is empty", async () => {
    const { getQueue, perPoolHealth } = await loadQueuesModule();
    getQueue("image");

    // getJobs returns a page whose first slot is undefined (BullMQ can hand
    // back holes for expired jobs): the jobs[0] guard must reject it.
    queueInstances[0].getJobCounts.mockResolvedValueOnce({ active: 0, waiting: 1, failed: 0 });
    queueInstances[0].getJobs.mockResolvedValueOnce([undefined]);

    await expect(perPoolHealth()).resolves.toMatchObject({
      image: { active: 0, waiting: 1, failed: 0, oldestWaitingMs: null },
    });
    expect(queueInstances[0].getJobs).toHaveBeenCalledTimes(1);
  });

  it("defaults missing active and failed counts to zero in perPoolHealth", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T12:00:00.000Z"));

    const { getQueue, perPoolHealth } = await loadQueuesModule();
    getQueue("ai");

    // Only waiting is present; active and failed exercise their ?? 0 branches
    // while a real waiting job still resolves oldestWaitingMs.
    queueInstances[0].getJobCounts.mockResolvedValueOnce({ waiting: 1 });
    queueInstances[0].getJobs.mockResolvedValueOnce([
      { timestamp: new Date("2026-06-29T11:59:55.000Z").getTime() },
    ]);

    await expect(perPoolHealth()).resolves.toMatchObject({
      ai: { active: 0, waiting: 1, failed: 0, oldestWaitingMs: 5_000 },
    });
  });
});
