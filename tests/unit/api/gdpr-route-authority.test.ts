/**
 * Authority checks on the GDPR export routes.
 *
 * The purge routes have always gated on `canManageTargetRole`, so a compliance
 * operator cannot act on an account above their own authority. Export needs the
 * same gate: the archive carries the target's entire library plus their profile,
 * so exporting an administrator is a data-disclosure path, not a read-only status
 * call. These run against a bare Fastify instance because the real routes sit
 * behind an enterprise licence that CI has no signing key to mint.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const canManageTargetRoleMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const queueAddMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

/** Rows handed back by the next `select(...).from(...).where(...)` chain. */
let selectResults: unknown[][] = [];
/** Predicates passed to each `.where(...)`, in call order, for assertions. */
let whereArgs: unknown[] = [];

function nextChain() {
  const rows = selectResults.shift() ?? [];
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((predicate: unknown) => {
      whereArgs.push(predicate);
      return Promise.resolve(rows);
    }),
  };
  return chain;
}

/** Flatten the nested `and(eq(...), eq(...))` shape into its leaf comparisons. */
function eqLeaves(predicate: unknown): Array<{ col: unknown; val: unknown }> {
  const node = predicate as { op?: string; conds?: unknown[]; col?: unknown; val?: unknown };
  if (node?.op === "and") return (node.conds ?? []).flatMap(eqLeaves);
  if (node?.op === "eq") return [{ col: node.col, val: node.val }];
  return [];
}

async function buildApp(): Promise<FastifyInstance> {
  vi.resetModules();
  selectMock.mockReset();
  insertMock.mockReset();
  queueAddMock.mockReset();
  auditMock.mockReset();
  requirePermissionMock.mockReset();
  canManageTargetRoleMock.mockReset();

  selectMock.mockImplementation(() => nextChain());
  insertMock.mockImplementation(() => ({ values: vi.fn(() => Promise.resolve()) }));
  auditMock.mockImplementation(() => vi.fn(() => Promise.resolve()));
  // Set after the resets above, otherwise buildApp() would wipe it and the route
  // would bail at `if (!user) return`, answering 200 with an empty body.
  requirePermissionMock.mockResolvedValue(COMPLIANCE_OPERATOR);

  vi.doMock("@snapotter/enterprise", () => ({
    isFeatureEnabled: () => true,
  }));

  // Plain objects instead of SQL nodes so a test can read back which columns the
  // query actually constrained.
  vi.doMock("drizzle-orm", () => ({
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    and: (...conds: unknown[]) => ({ op: "and", conds }),
    inArray: (col: unknown, vals: unknown) => ({ op: "inArray", col, vals }),
  }));

  vi.doMock("../../../apps/api/src/db/index.js", () => ({
    db: { select: selectMock, insert: insertMock, delete: vi.fn(), update: vi.fn() },
    schema: {
      users: { id: "users.id", role: "users.role" },
      jobs: { id: "jobs.id", userId: "jobs.user_id", toolId: "jobs.tool_id" },
    },
  }));

  vi.doMock("../../../apps/api/src/permissions.js", () => ({
    requirePermission: () => requirePermissionMock,
    canManageTargetRole: canManageTargetRoleMock,
  }));

  vi.doMock("../../../apps/api/src/jobs/queues.js", () => ({
    getQueue: () => ({ add: queueAddMock }),
  }));
  vi.doMock("../../../apps/api/src/jobs/system-jobs.js", () => ({
    SYSTEM_JOBS: { gdprExport: "gdpr-export" },
  }));
  vi.doMock("../../../apps/api/src/jobs/cancel.js", () => ({ requestCancel: vi.fn() }));
  vi.doMock("../../../apps/api/src/lib/audit.js", () => ({ auditFromRequest: auditMock }));
  vi.doMock("../../../apps/api/src/lib/file-storage.js", () => ({
    deleteStoredFile: vi.fn(),
    deleteThumbnail: vi.fn(),
  }));
  vi.doMock("../../../apps/api/src/lib/object-storage.js", () => ({ deletePrefix: vi.fn() }));

  const { registerGdprRoutes } = await import("../../../apps/api/src/routes/enterprise/gdpr.js");
  const app = Fastify();
  await registerGdprRoutes(app);
  await app.ready();
  return app;
}

const COMPLIANCE_OPERATOR = { id: "operator-1", username: "compliance", role: "compliance" };

describe("GDPR export route authority", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    selectResults = [];
    whereArgs = [];
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it("refuses to export a user whose role outranks the caller", async () => {
    app = await buildApp();
    selectResults = [[{ id: "admin-1", role: "admin" }]];
    canManageTargetRoleMock.mockResolvedValue(false);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/admin-1/export",
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "ESCALATION_DENIED" });
    // The job must never be enqueued: the archive is the disclosure.
    expect(queueAddMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("exports a user within the caller's authority", async () => {
    app = await buildApp();
    selectResults = [[{ id: "user-9", role: "user" }]];
    canManageTargetRoleMock.mockResolvedValue(true);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/user-9/export",
    });

    expect(res.statusCode).toBe(202);
    expect(queueAddMock).toHaveBeenCalledTimes(1);
  });

  it("still 404s an unknown target before consulting role authority", async () => {
    app = await buildApp();
    selectResults = [[]];

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/enterprise/users/ghost/export",
    });

    expect(res.statusCode).toBe(404);
    expect(canManageTargetRoleMock).not.toHaveBeenCalled();
  });

  it("scopes the export status lookup to the named user and the export job type", async () => {
    app = await buildApp();
    // A completed job row exists. Without a scoped predicate the route would hand
    // back its download URL for any job id in the system, whoever owns it.
    selectResults = [
      [{ id: "job-1", status: "completed", outputRefs: ["outputs/job-1/gdpr-export.zip"] }],
    ];

    await app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/victim-1/export/job-1",
    });

    const leaves = eqLeaves(whereArgs.at(-1));
    expect(leaves).toEqual(
      expect.arrayContaining([
        { col: "jobs.id", val: "job-1" },
        { col: "jobs.user_id", val: "victim-1" },
        { col: "jobs.tool_id", val: "gdpr-export" },
      ]),
    );
  });
});
