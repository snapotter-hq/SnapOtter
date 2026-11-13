import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  // Rows handed out one per select before falling back to `row`.
  queue: [] as Array<Record<string, unknown> | null>,
  user: { id: "user-1", username: "alice", role: "user" } as { id: string } | null,
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  requireAuth: () => state.user,
}));

vi.mock("../../../apps/api/src/jobs/cancel.js", () => ({
  requestCancel: vi.fn(async () => false),
}));

// The read rule is shared with the SSE stream. Its own tests cover the rule;
// here it only needs to say yes for the owner.
vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  canReadJob: vi.fn(
    async (row: { userId: string | null }, user: { id: string }) => row.userId === user.id,
  ),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          const row = state.queue.length > 0 ? state.queue.shift() : state.row;
          return row ? [row] : [];
        },
      }),
    }),
  },
  schema: {
    jobs: {
      id: {},
      userId: {},
      type: {},
      settings: {},
      status: {},
      progress: {},
      error: {},
      createdAt: {},
    },
  },
}));

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerJobRoutes } from "../../../apps/api/src/routes/jobs.js";

async function buildApp() {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerJobRoutes(app);
  await app.ready();
  return app;
}

const base = {
  userId: "user-1",
  settings: null,
  createdAt: new Date("2026-11-03T10:00:00Z"),
};

describe("GET /api/v1/jobs/:jobId", () => {
  beforeEach(() => {
    state.user = { id: "user-1" };
    state.row = null;
    state.queue = [];
  });

  it("reports a queued job with zero percent and its progress URL", async () => {
    state.row = { ...base, status: "queued", progress: { percent: 0 }, error: null };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/jobs/job-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      jobId: "job-1",
      status: "queued",
      createdAt: "2026-11-03T10:00:00.000Z",
      progress: { percent: 0 },
      progressUrl: "/api/v1/jobs/job-1/progress",
    });
  });

  it("returns the result of a completed job", async () => {
    state.row = {
      ...base,
      status: "completed",
      progress: { percent: 100, result: { downloadUrl: "/api/v1/download/job-1/out.png" } },
      error: null,
    };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/jobs/job-1" });
    expect(res.json()).toMatchObject({
      status: "completed",
      result: { downloadUrl: "/api/v1/download/job-1/out.png" },
    });
    expect(res.json()).not.toHaveProperty("error");
  });

  it("reports a failed job with its message and code, with internal paths stripped", async () => {
    state.row = {
      ...base,
      status: "failed",
      progress: { percent: 40, stage: "decode" },
      error: { message: "Decode failed at /data/uploads/abc/input.heic", code: "DECODE_FAILED" },
    };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/jobs/job-1" });
    const body = res.json();
    expect(body.status).toBe("failed");
    expect(body.progress).toEqual({ percent: 40, stage: "decode" });
    expect(body.error.code).toBe("DECODE_FAILED");
    expect(body.error.message).not.toContain("/data/uploads");
  });

  it("keeps the partial result of a canceled job and reports the canceled status", async () => {
    state.row = {
      ...base,
      status: "canceled",
      progress: { percent: 60, result: { downloadUrl: "/api/v1/download/job-1/partial.zip" } },
      error: null,
    };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/jobs/job-1" });
    expect(res.json()).toMatchObject({
      status: "canceled",
      result: { downloadUrl: "/api/v1/download/job-1/partial.zip" },
    });
  });

  it("answers 404 for another user's job without revealing it exists", async () => {
    state.row = { ...base, userId: "user-2", status: "completed", progress: {}, error: null };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/jobs/job-1" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "Job not found", code: "NOT_FOUND" });
  });

  it("answers 404 for a job that does not exist", async () => {
    state.row = null;
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/jobs/missing" });
    expect(res.statusCode).toBe(404);
  });

  it("follows a batch alias so a client id reports the server-keyed batch", async () => {
    state.queue = [
      {
        ...base,
        type: "batch-alias",
        settings: { batchJobId: "server-batch-id", batchToolId: "resize" },
        status: "completed",
        progress: null,
        error: null,
      },
      { ...base, type: "batch", status: "processing", progress: { percent: 30 }, error: null },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/jobs/client-id" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      jobId: "client-id",
      status: "processing",
      progress: { percent: 30 },
      progressUrl: "/api/v1/jobs/client-id/progress",
    });
  });

  it("checks ownership on the batch an alias points at", async () => {
    state.queue = [
      {
        ...base,
        type: "batch-alias",
        settings: { batchJobId: "server-batch-id", batchToolId: "resize" },
        status: "completed",
        progress: null,
        error: null,
      },
      { ...base, userId: "user-2", type: "batch", status: "completed", progress: {}, error: null },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/jobs/client-id" });
    expect(res.statusCode).toBe(404);
  });
});
