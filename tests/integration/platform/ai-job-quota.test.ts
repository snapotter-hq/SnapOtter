import { readdirSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";

const { buildTestApp, createMultipartPayload, loginAsAdmin } = await import("../test-server.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { countInFlightAiJobs } = await import("../../../apps/api/src/lib/ai-quota.js");
const { enqueueToolJob } = await import("../../../apps/api/src/jobs/enqueue.js");
const { env } = await import("../../../apps/api/src/config.js");

import type { TestApp } from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let adminId: string;
let adminToken: string;

function uploadedFiles(): Set<string> {
  const root = path.join(process.env.WORKSPACE_PATH as string, "uploads");
  try {
    return new Set(
      readdirSync(root).flatMap((dir) =>
        readdirSync(path.join(root, dir)).map((file) => `${dir}/${file}`),
      ),
    );
  } catch {
    return new Set();
  }
}

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
  adminToken = await loginAsAdmin(testApp.app);
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.username, "admin"));
  adminId = admin.id;
});

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

  it("returns 429 from POST /api/v1/tools/image/ocr and removes the uploaded image when the user is at the cap (#2616)", async () => {
    const cap = env.MAX_AI_JOBS_PER_USER;
    expect(cap).toBeGreaterThan(0);
    for (let i = 0; i < cap; i++) await seedAiJob(adminId, "queued", "ai-tool");

    const beforeUploads = uploadedFiles();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "scan.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: "fast" }) },
      { name: "clientJobId", content: "11111111-1111-4111-8111-111111111111" },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(429);
    const parsed = JSON.parse(res.body) as { details?: string; message?: string; error?: string };
    expect(parsed.details ?? parsed.message ?? parsed.error).toBe(
      "Too many concurrent AI jobs. Please wait for existing jobs to finish.",
    );
    expect([...uploadedFiles()].filter((file) => !beforeUploads.has(file))).toEqual([]);
  });
});
