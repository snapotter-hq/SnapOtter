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
const deleteMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const deletePrefixMock = vi.hoisted(() => vi.fn());
const requestCancelMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
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
function eqLeaves(predicate: unknown): Array<{ op: string; col: unknown; val: unknown }> {
  const node = predicate as { op?: string; conds?: unknown[]; col?: unknown; val?: unknown };
  if (node?.op === "and") return (node.conds ?? []).flatMap(eqLeaves);
  if (node?.op === "eq" || node?.op === "ne")
    return [{ op: node.op, col: node.col, val: node.val }];
  return [];
}

async function buildApp(): Promise<FastifyInstance> {
  vi.resetModules();
  selectMock.mockReset();
  insertMock.mockReset();
  deleteMock.mockReset();
  updateMock.mockReset();
  transactionMock.mockReset();
  deletePrefixMock.mockReset();
  requestCancelMock.mockReset();
  requestCancelMock.mockResolvedValue(true);
  loggerWarnMock.mockReset();
  queueAddMock.mockReset();
  auditMock.mockReset();
  requirePermissionMock.mockReset();
  canManageTargetRoleMock.mockReset();

  selectMock.mockImplementation(() => nextChain());
  insertMock.mockImplementation(() => ({ values: vi.fn(() => Promise.resolve()) }));
  deleteMock.mockImplementation(() => ({ where: vi.fn(() => Promise.resolve()) }));
  updateMock.mockImplementation(() => ({
    set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
  }));
  transactionMock.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ select: selectMock, delete: deleteMock }),
  );
  deletePrefixMock.mockResolvedValue(undefined);
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
    ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
    and: (...conds: unknown[]) => ({ op: "and", conds }),
    inArray: (col: unknown, vals: unknown) => ({ op: "inArray", col, vals }),
  }));

  vi.doMock("../../../apps/api/src/db/index.js", () => ({
    db: {
      select: selectMock,
      insert: insertMock,
      delete: deleteMock,
      update: updateMock,
      transaction: transactionMock,
    },
    schema: {
      users: {
        id: "users.id",
        role: "users.role",
        team: "users.team",
        legalHold: "users.legal_hold",
      },
      teams: { id: "teams.id", legalHold: "teams.legal_hold" },
      jobs: {
        id: "jobs.id",
        userId: "jobs.user_id",
        toolId: "jobs.tool_id",
        status: "jobs.status",
      },
      userFiles: {
        id: "user_files.id",
        storedName: "user_files.stored_name",
        userId: "user_files.user_id",
      },
      auditLog: { actorId: "audit_log.actor_id" },
      sessions: { userId: "sessions.user_id" },
      apiKeys: { userId: "api_keys.user_id" },
      userPreferences: { userId: "user_preferences.user_id" },
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
  vi.doMock("../../../apps/api/src/jobs/cancel.js", () => ({ requestCancel: requestCancelMock }));
  vi.doMock("../../../apps/api/src/lib/logger.js", () => ({
    logger: {
      warn: loggerWarnMock,
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  }));
  vi.doMock("../../../apps/api/src/lib/audit.js", () => ({ auditFromRequest: auditMock }));
  vi.doMock("../../../apps/api/src/lib/last-admin.js", () => ({
    assertNotLastAdmin: vi.fn(() => Promise.resolve()),
    LastAdminError: class LastAdminError extends Error {},
  }));
  vi.doMock("../../../apps/api/src/lib/file-storage.js", () => ({
    deleteStoredFile: vi.fn(),
    deleteThumbnail: vi.fn(),
  }));
  vi.doMock("../../../apps/api/src/routes/file-preview.js", () => ({
    deletePreview: vi.fn(),
  }));
  vi.doMock("../../../apps/api/src/lib/object-storage.js", () => ({
    deletePrefix: deletePrefixMock,
  }));

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
    // Stranded-job reconciliation finds a live export by looking up the row id
    // as the BullMQ job id (#1441), so the enqueue must pass it as jobId.
    // Without that, any export running past the grace window would be failed
    // mid-run.
    const { jobId } = res.json() as { jobId: string };
    expect(queueAddMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobId }),
      expect.objectContaining({ jobId }),
    );
    const rowValues = insertMock.mock.results[0].value.values;
    expect(rowValues).toHaveBeenCalledWith(
      expect.objectContaining({ id: jobId, type: "system", toolId: "gdpr-export" }),
    );
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
        { op: "eq", col: "jobs.id", val: "job-1" },
        { op: "eq", col: "jobs.user_id", val: "victim-1" },
        { op: "eq", col: "jobs.tool_id", val: "gdpr-export" },
      ]),
    );
  });

  it("returns a terminal canceled payload without progress when the export job is canceled (#2633)", async () => {
    app = await buildApp();
    selectResults = [
      [
        {
          id: "job-canceled-1",
          status: "canceled",
          progress: { percent: 45, stage: "archiving" },
          error: null,
        },
      ],
    ];

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/victim-1/export/job-canceled-1",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "canceled",
      error: "Export canceled",
    });
  });

  it("preserves a custom error message on a canceled export job (#2633)", async () => {
    app = await buildApp();
    selectResults = [
      [
        {
          id: "job-canceled-2",
          status: "canceled",
          progress: { percent: 80 },
          error: { message: "Canceled by administrator" },
        },
      ],
    ];

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/victim-1/export/job-canceled-2",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "canceled",
      error: "Canceled by administrator",
    });
  });

  it("returns 404 when the export job does not exist for the target user", async () => {
    app = await buildApp();
    selectResults = [[]];

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/victim-1/export/missing-job",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Export job not found" });
  });

  it("returns failed status with job error message or default fallback", async () => {
    app = await buildApp();
    selectResults = [
      [{ id: "job-failed-1", status: "failed", error: { message: "Storage unreachable" } }],
      [{ id: "job-failed-2", status: "failed", error: null }],
    ];

    const withMessage = await app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/victim-1/export/job-failed-1",
    });
    expect(withMessage.statusCode).toBe(200);
    expect(withMessage.json()).toEqual({
      status: "failed",
      error: "Storage unreachable",
    });

    const fallback = await app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/victim-1/export/job-failed-2",
    });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json()).toEqual({
      status: "failed",
      error: "Export failed",
    });
  });

  it("returns progress for queued and processing export jobs", async () => {
    app = await buildApp();
    selectResults = [
      [{ id: "job-queued", status: "queued", progress: null }],
      [{ id: "job-processing", status: "processing", progress: { percent: 65 } }],
    ];

    const queuedRes = await app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/victim-1/export/job-queued",
    });
    expect(queuedRes.statusCode).toBe(200);
    expect(queuedRes.json()).toEqual({
      status: "queued",
      progress: 0,
    });

    const processingRes = await app.inject({
      method: "GET",
      url: "/api/v1/enterprise/users/victim-1/export/job-processing",
    });
    expect(processingRes.statusCode).toBe(200);
    expect(processingRes.json()).toEqual({
      status: "processing",
      progress: 65,
    });
  });

  it("excludes the synthetic anonymous row when checking whether a team purge removes every admin (#2459)", async () => {
    app = await buildApp();
    selectResults = [
      [{ id: "team-1", legalHold: false }],
      [{ id: "admin-1", role: "admin", legalHold: false }],
      [{ id: "admin-1" }],
    ];
    canManageTargetRoleMock.mockResolvedValue(true);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/teams/team-1/purge",
      payload: { confirm: true },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: "LAST_ADMIN" });
    const adminQueryLeaves = eqLeaves(whereArgs.at(-1));
    expect(adminQueryLeaves).toEqual(
      expect.arrayContaining([
        { op: "eq", col: "users.role", val: "admin" },
        { op: "ne", col: "users.id", val: "anonymous" },
      ]),
    );
  });

  it.each(["uploads/job-1/", "outputs/job-1/"])(
    "aborts user purge before deleting jobs or users rows when deletePrefix fails on %s (#2632)",
    async (failingPrefix) => {
      app = await buildApp();
      selectResults = [
        [{ id: "user-9", role: "user", team: "team-1", legalHold: false }],
        [{ legalHold: false }],
        [],
        [{ id: "job-1" }],
      ];
      canManageTargetRoleMock.mockResolvedValue(true);
      const storageErr = Object.assign(new Error("The server's storage service is unavailable."), {
        statusCode: 503,
        code: "storage-unavailable",
      });
      deletePrefixMock.mockImplementation(async (prefix: string) => {
        if (prefix === failingPrefix) throw storageErr;
      });

      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/user-9/purge",
        payload: { confirm: true },
      });

      expect(res.statusCode).toBe(503);
      const deletedTables = deleteMock.mock.calls.map(([table]) => table);
      expect(deletedTables).toEqual([expect.objectContaining({ id: "user_files.id" })]);
      expect(updateMock).not.toHaveBeenCalled();
      expect(auditMock).not.toHaveBeenCalled();
    },
  );

  it("aborts team purge before deleting jobs, users, or teams rows when deletePrefix fails (#2632)", async () => {
    app = await buildApp();
    selectResults = [
      [{ id: "team-1", legalHold: false }],
      [{ id: "user-9", role: "user", legalHold: false }],
      [{ id: "admin-1" }],
      [],
      [{ id: "job-1" }],
    ];
    canManageTargetRoleMock.mockResolvedValue(true);
    const storageErr = Object.assign(new Error("The server's storage service is unavailable."), {
      statusCode: 503,
      code: "storage-unavailable",
    });
    deletePrefixMock.mockRejectedValueOnce(storageErr);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/teams/team-1/purge",
      payload: { confirm: true },
    });

    expect(res.statusCode).toBe(503);
    const deletedTables = deleteMock.mock.calls.map(([table]) => table);
    expect(deletedTables).toEqual([expect.objectContaining({ id: "user_files.id" })]);
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("logs a warning when requestCancel throws and still marks active jobs canceled and sweeps remainingJobRows (#1496)", async () => {
    app = await buildApp();
    selectResults = [
      [{ id: "user-9", role: "user", team: "team-1", legalHold: false }],
      [{ legalHold: false }],
      [],
      [{ id: "job-1" }],
      [{ id: "job-1" }],
      [{ id: "job-1" }, { id: "job-2" }],
    ];
    canManageTargetRoleMock.mockResolvedValue(true);
    const cancelErr = new Error("Redis connection lost");
    requestCancelMock.mockRejectedValueOnce(cancelErr);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/enterprise/users/user-9/purge",
      payload: { confirm: true },
    });

    expect(res.statusCode).toBe(200);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: cancelErr, userId: "user-9", jobId: "job-1" },
      "gdpr purge: failed to cancel active job",
    );
    expect(deletePrefixMock).toHaveBeenCalledWith("uploads/job-2/");
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/job-2/");
  });
});
