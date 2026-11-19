// #4763: the generic jobs cancel now reaches AI bundle installs. Owning the
// row or holding files:all (editors do) must not be enough to stop one; the
// caller needs features:manage, the same as the install routes.
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  user: { id: "user-1" } as { id: string },
  granted: new Set<string>(),
  requestCancel: vi.fn(async (_jobId: string) => true),
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  requireAuth: () => state.user,
}));

vi.mock("../../../apps/api/src/jobs/cancel.js", () => ({
  requestCancel: state.requestCancel,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  hasEffectivePermission: vi.fn(async (_user: unknown, permission: string) =>
    state.granted.has(permission),
  ),
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  canReadJob: vi.fn(async () => true),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => (state.row ? [state.row] : []),
      }),
    }),
  },
  schema: { jobs: { id: {}, userId: {}, settings: {} } },
}));

import { registerJobRoutes } from "../../../apps/api/src/routes/jobs.js";

async function postCancel() {
  const app = Fastify({ logger: false });
  registerJobRoutes(app);
  await app.ready();
  return app.inject({ method: "POST", url: "/api/v1/jobs/job-1/cancel" });
}

describe("POST /api/v1/jobs/:jobId/cancel for an AI bundle install (#4763)", () => {
  beforeEach(() => {
    state.user = { id: "user-1" };
    state.granted = new Set();
    state.requestCancel.mockClear();
  });

  it("refuses an editor with files:all but no features:manage", async () => {
    state.row = { userId: "admin-1", settings: { featureInstall: "background-removal" } };
    state.granted = new Set(["files:all"]);

    const res = await postCancel();
    expect(res.statusCode).toBe(404);
    expect(state.requestCancel).not.toHaveBeenCalled();
  });

  it("refuses the install's owner once they no longer hold features:manage", async () => {
    state.row = { userId: "user-1", settings: { featureInstall: "background-removal" } };

    const res = await postCancel();
    expect(res.statusCode).toBe(404);
    expect(state.requestCancel).not.toHaveBeenCalled();
  });

  it("cancels for an admin with features:manage", async () => {
    state.row = { userId: "user-1", settings: { featureInstall: "background-removal" } };
    state.granted = new Set(["features:manage"]);

    const res = await postCancel();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ canceled: true });
    expect(state.requestCancel).toHaveBeenCalledWith("job-1");
  });

  it("leaves an ordinary job to its owner", async () => {
    state.row = { userId: "user-1", settings: { quality: 80 } };

    const res = await postCancel();
    expect(res.statusCode).toBe(200);
    expect(state.requestCancel).toHaveBeenCalledWith("job-1");
  });
});
