/**
 * Batch cancel (#767): the cooperative cancel flag, requestCancel's batch
 * branch, the batch-child skip, and the finalize's canceled terminal paths.
 *
 * Follows the worker-branches.test.ts harness: no HTTP app is built. The
 * test tool is registered directly in the process registry, flows are
 * enqueued the same way routes/batch.ts builds them, and the real workers
 * drain them against this fork's Postgres + Redis.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { eq } = await import("drizzle-orm");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { runMigrations } = await import("../../../apps/api/src/db/migrate.js");
const { isBatchCanceled, markBatchCanceled } = await import(
  "../../../apps/api/src/jobs/batch-progress.js"
);
const { requestCancel } = await import("../../../apps/api/src/jobs/cancel.js");
const { createRedisSubscriberConnection, sharedRedis } = await import(
  "../../../apps/api/src/jobs/connection.js"
);
const { bullPrefix } = await import("../../../apps/api/src/jobs/types.js");

beforeAll(async () => {
  await runMigrations();
}, 30_000);

afterAll(async () => {
  await sharedRedis().quit();
});

describe("batch cancel flag", () => {
  it("marks and reads the canceled flag with a TTL", async () => {
    const parentId = randomUUID();
    expect(await isBatchCanceled(parentId)).toBe(false);
    await markBatchCanceled(parentId);
    expect(await isBatchCanceled(parentId)).toBe(true);
    const ttl = await sharedRedis().ttl(`${bullPrefix()}:batch:${parentId}:canceled`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });
});

describe("requestCancel on a batch parent", () => {
  async function seedParent(
    overrides: Partial<typeof schema.jobs.$inferInsert> = {},
  ): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.jobs).values({
      id,
      type: "batch",
      toolId: "resize",
      status: "processing",
      inputRefs: [],
      settings: { flowChildCount: 3 },
      ...overrides,
    });
    return id;
  }

  it("flags the batch and publishes a cancel for every flow child id", async () => {
    const id = await seedParent();
    const received: string[] = [];
    const sub = createRedisSubscriberConnection();
    await sub.subscribe(`${bullPrefix()}:cancel`);
    sub.on("message", (_ch: string, msg: string) => received.push(msg));

    try {
      expect(await requestCancel(id)).toBe(true);
      expect(await isBatchCanceled(id)).toBe(true);
      await vi.waitFor(() => {
        expect(received).toEqual([`${id}-f0`, `${id}-f1`, `${id}-f2`]);
      });
    } finally {
      await sub.quit();
    }
  });

  it("leaves the parent row alone: the finalize owns terminal state", async () => {
    const id = await seedParent();
    await requestCancel(id);
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    expect(row.status).toBe("processing");
    expect(row.completedAt).toBeNull();
  });

  it("returns false for a terminal batch and does not flag it", async () => {
    const id = await seedParent({ status: "completed" });
    expect(await requestCancel(id)).toBe(false);
    expect(await isBatchCanceled(id)).toBe(false);
  });

  it("returns false for a pipeline-batch parent", async () => {
    const id = await seedParent({ toolId: "pipeline-batch" });
    expect(await requestCancel(id)).toBe(false);
    expect(await isBatchCanceled(id)).toBe(false);
  });
});
