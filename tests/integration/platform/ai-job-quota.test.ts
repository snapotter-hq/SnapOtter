import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { countInFlightAiJobs } = await import("../../../apps/api/src/lib/ai-quota.js");
const { enqueueToolJob } = await import("../../../apps/api/src/jobs/enqueue.js");
const { env } = await import("../../../apps/api/src/config.js");

import type { TestApp } from "../test-server.js";

let testApp: TestApp;
let adminId: string;

async function seedAiJob(userId: string, status: "queued" | "processing", kind: string) {
  const id = `test-aijob-${Math.random().toString(36).slice(2)}`;
  await db.insert(schema.jobs).values({
    id,
    userId,
    toolId: "colorize",
    pool: "ai",
    type: kind,
    status,
    inputRefs: [`uploads/${id}/x.png`],
    settings: {},
  });
  return id;
}

beforeAll(async () => {
  testApp = await buildTestApp();
  await loginAsAdmin(testApp.app);
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.username, "admin"));
  adminId = admin.id;
}, 30_000);

afterEach(async () => {
  await db.delete(schema.jobs).where(and(eq(schema.jobs.userId, adminId)));
});

describe("countInFlightAiJobs", () => {
  it("counts only queued/processing ai-tool jobs, ignoring other kinds and terminal states", async () => {
    await seedAiJob(adminId, "queued", "ai-tool");
    await seedAiJob(adminId, "processing", "ai-tool");
    await seedAiJob(adminId, "queued", "batch-child"); // different kind: excluded
    const done = await seedAiJob(adminId, "queued", "ai-tool");
    await db.update(schema.jobs).set({ status: "completed" }).where(eq(schema.jobs.id, done));

    expect(await countInFlightAiJobs(adminId)).toBe(2);
  });
});

describe("enqueueToolJob AI quota enforcement", () => {
  it("rejects a new ai-tool job with 429 once the user is at the cap", async () => {
    const cap = env.MAX_AI_JOBS_PER_USER;
    expect(cap).toBeGreaterThan(0);
    for (let i = 0; i < cap; i++) await seedAiJob(adminId, "queued", "ai-tool");

    await expect(
      enqueueToolJob({
        jobId: "test-over-cap-job",
        toolId: "colorize",
        userId: adminId,
        pool: "ai",
        inputRefs: ["uploads/test-over-cap-job/x.png"],
        filename: "x.png",
        settings: {},
        kind: "ai-tool",
      }),
    ).rejects.toMatchObject({ statusCode: 429 });

    // The rejected job left no row behind.
    const [row] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, "test-over-cap-job"));
    expect(row).toBeUndefined();
  });
});
