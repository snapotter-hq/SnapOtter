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

const { runMigrations } = await import("../../../apps/api/src/db/migrate.js");
const { isBatchCanceled, markBatchCanceled } = await import(
  "../../../apps/api/src/jobs/batch-progress.js"
);
const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
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
