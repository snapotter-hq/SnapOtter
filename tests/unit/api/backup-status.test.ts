import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const requirePermissionFactoryMock = vi.hoisted(() =>
  vi.fn((_permission: string) => requirePermissionMock),
);
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  sql: vi.fn(() => "sql"),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: selectMock,
  },
  schema: {
    settings: {
      key: "settings.key",
      value: "settings.value",
    },
  },
}));

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: loggerMock,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requirePermission: requirePermissionFactoryMock,
}));

function mockBackupRow(value?: string) {
  const rows = value === undefined ? [] : [{ value }];
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
  };
  selectMock.mockReturnValue(chain);
  return chain;
}

describe("GET /api/v1/admin/backup-status (#3039)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("stops when requirePermission rejects the request", async () => {
    requirePermissionMock.mockImplementation(
      async (_req: unknown, reply: { status: (c: number) => { send: (b: unknown) => void } }) => {
        reply.status(403).send({ error: "Forbidden" });
        return null;
      },
    );

    const { adminOpsRoutes } = await import("../../../apps/api/src/routes/admin-ops.js");
    const app = Fastify();
    await adminOpsRoutes(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/backup-status",
    });

    expect(res.statusCode).toBe(403);
    expect(requirePermissionFactoryMock).toHaveBeenCalledWith("system:health");
    expect(selectMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns critical with null lastBackup and no warning when backup_last_completed is absent", async () => {
    requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
    const chain = mockBackupRow(undefined);

    const { adminOpsRoutes } = await import("../../../apps/api/src/routes/admin-ops.js");
    const app = Fastify();
    await adminOpsRoutes(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/backup-status",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      lastBackup: null,
      status: "critical",
      ageHours: null,
    });
    expect(chain.where).toHaveBeenCalledWith({
      op: "eq",
      col: "settings.key",
      val: "backup_last_completed",
    });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(loggerMock.warn).not.toHaveBeenCalled();

    await app.close();
  });

  it("logs a warning and returns critical fallback when backup_last_completed is malformed JSON", async () => {
    requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
    mockBackupRow("{corrupt");

    const { adminOpsRoutes } = await import("../../../apps/api/src/routes/admin-ops.js");
    const app = Fastify();
    await adminOpsRoutes(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/backup-status",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      lastBackup: null,
      status: "critical",
      ageHours: null,
    });
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { err: expect.any(SyntaxError), key: "backup_last_completed" },
      "admin-ops: failed to parse stored backup_last_completed JSON",
    );

    await app.close();
  });

  it("logs a warning and returns critical fallback instead of 500 when backup_last_completed is non-object JSON or has an invalid timestamp", async () => {
    requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });

    const { adminOpsRoutes } = await import("../../../apps/api/src/routes/admin-ops.js");
    const app = Fastify();
    await adminOpsRoutes(app);

    for (const raw of [
      "null",
      "42",
      "[]",
      '"str"',
      "{}",
      '{"timestamp":null}',
      '{"timestamp":123}',
      '{"timestamp":""}',
      '{"timestamp":"not-a-date"}',
    ]) {
      loggerMock.warn.mockClear();
      mockBackupRow(raw);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backup-status",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        lastBackup: null,
        status: "critical",
        ageHours: null,
      });
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { key: "backup_last_completed" },
        "admin-ops: stored backup_last_completed is not a valid backup record",
      );
    }

    await app.close();
  });

  it("computes ok, warning, and critical status from a valid backup_last_completed timestamp", async () => {
    const now = new Date("2026-06-29T12:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });

    const { adminOpsRoutes } = await import("../../../apps/api/src/routes/admin-ops.js");
    const app = Fastify();
    await adminOpsRoutes(app);

    const cases: Array<{ ageHours: number; expectedStatus: "ok" | "warning" | "critical" }> = [
      { ageHours: 2, expectedStatus: "ok" },
      { ageHours: 23.9, expectedStatus: "ok" },
      { ageHours: 24, expectedStatus: "warning" },
      { ageHours: 36, expectedStatus: "warning" },
      { ageHours: 47.9, expectedStatus: "warning" },
      { ageHours: 48, expectedStatus: "critical" },
      { ageHours: 72, expectedStatus: "critical" },
    ];

    for (const { ageHours, expectedStatus } of cases) {
      const payload = {
        timestamp: new Date(now - ageHours * 3_600_000).toISOString(),
        type: "full",
        sizeBytes: 1024,
        notes: "",
      };
      mockBackupRow(JSON.stringify(payload));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/backup-status",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        lastBackup: payload,
        status: expectedStatus,
        ageHours,
      });
    }
    expect(loggerMock.warn).not.toHaveBeenCalled();

    await app.close();
  });
});
