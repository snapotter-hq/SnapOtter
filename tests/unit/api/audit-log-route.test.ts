/**
 * Unit tests for audit log route query parsing and response serialization.
 *
 * Tests pagination, action/IP/date range filtering, and the
 * response format for audit log entries from apps/api/src/routes/audit-log.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  whereArgs: [] as unknown[],
  limitSpy: vi.fn(),
  offsetSpy: vi.fn(),
  entriesRows: [] as unknown[],
  countRows: [{ count: 0 }] as Array<{ count: number }>,
  requirePermission: vi.fn(() => () => Promise.resolve({ id: "admin-1", role: "admin" })),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conds: unknown[]) => ({ op: "and", conds }),
  desc: (col: unknown) => ({ op: "desc", col }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  gte: (col: unknown, val: unknown) => ({ op: "gte", col, val }),
  lte: (col: unknown, val: unknown) => ({ op: "lte", col, val }),
  sql: (strings: TemplateStringsArray) => strings.join("?"),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: (fields?: unknown) => ({
      from: () => ({
        where: (whereClause: unknown) => {
          mocks.whereArgs.push(whereClause);
          if (fields && typeof fields === "object" && "count" in fields) {
            return Promise.resolve(mocks.countRows);
          }
          return {
            orderBy: () => ({
              limit: (n: number) => {
                mocks.limitSpy(n);
                return {
                  offset: (o: number) => {
                    mocks.offsetSpy(o);
                    return Promise.resolve(mocks.entriesRows);
                  },
                };
              },
            }),
          };
        },
      }),
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    auditLog: {
      action: "audit_log.action",
      ipAddress: "audit_log.ip_address",
      createdAt: "audit_log.created_at",
    },
  },
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requirePermission: mocks.requirePermission,
}));

import type { schema } from "../../../apps/api/src/db/index.js";
import {
  auditLogRoutes,
  parseFilters,
  parsePagination,
  serializeEntry,
} from "../../../apps/api/src/routes/audit-log.js";

type AuditLogRow = typeof schema.auditLog.$inferSelect;

// ── Tests ───────────────────────────────────────────────────────────────

describe("audit log route logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.whereArgs = [];
    mocks.entriesRows = [];
    mocks.countRows = [{ count: 0 }];
    mocks.requirePermission.mockImplementation(
      () => () => Promise.resolve({ id: "admin-1", role: "admin" }),
    );
  });

  describe("pagination parsing (parsePagination)", () => {
    it("defaults to page 1, limit 50", () => {
      const result = parsePagination({});
      expect(result).toEqual({ page: 1, limit: 50, offset: 0 });
    });

    it("parses valid page and limit", () => {
      const result = parsePagination({ page: "3", limit: "20" });
      expect(result).toEqual({ page: 3, limit: 20, offset: 40 });
    });

    it("clamps page to minimum 1", () => {
      const result = parsePagination({ page: "0" });
      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    });

    it("clamps negative page to 1", () => {
      const result = parsePagination({ page: "-5" });
      expect(result.page).toBe(1);
    });

    it("clamps limit to maximum 100", () => {
      const result = parsePagination({ limit: "500" });
      expect(result.limit).toBe(100);
    });

    it("clamps limit to minimum 1", () => {
      const result = parsePagination({ limit: "0" });
      expect(result.limit).toBe(50); // 0 falls through to default
    });

    it("handles non-numeric page", () => {
      const result = parsePagination({ page: "abc" });
      expect(result.page).toBe(1);
    });

    it("handles non-numeric limit", () => {
      const result = parsePagination({ limit: "xyz" });
      expect(result.limit).toBe(50);
    });

    it("calculates correct offset for page 2 with limit 25", () => {
      const result = parsePagination({ page: "2", limit: "25" });
      expect(result.offset).toBe(25);
    });

    it("calculates correct offset for page 5 with limit 10", () => {
      const result = parsePagination({ page: "5", limit: "10" });
      expect(result.offset).toBe(40);
    });
  });

  describe("filter parsing (parseFilters)", () => {
    it("returns empty conditions for no filters", () => {
      const conditions = parseFilters({});
      expect(conditions).toHaveLength(0);
    });

    it("adds action filter", () => {
      const conditions = parseFilters({ action: "LOGIN_SUCCESS" });
      expect(conditions).toEqual([{ op: "eq", col: "audit_log.action", val: "LOGIN_SUCCESS" }]);
    });

    it("adds ip filter", () => {
      const conditions = parseFilters({ ip: "192.168.1.10" });
      expect(conditions).toEqual([{ op: "eq", col: "audit_log.ip_address", val: "192.168.1.10" }]);
    });

    it("adds from date filter", () => {
      const conditions = parseFilters({ from: "2025-01-01" });
      expect(conditions).toEqual([
        { op: "gte", col: "audit_log.created_at", val: new Date("2025-01-01") },
      ]);
    });

    it("adds to date filter", () => {
      const conditions = parseFilters({ to: "2025-12-31" });
      expect(conditions).toEqual([
        { op: "lte", col: "audit_log.created_at", val: new Date("2025-12-31") },
      ]);
    });

    it("handles all filters together (action, ip, from, to)", () => {
      const conditions = parseFilters({
        action: "USER_CREATED",
        ip: "10.0.0.1",
        from: "2025-01-01",
        to: "2025-12-31",
      });
      expect(conditions).toEqual([
        { op: "eq", col: "audit_log.action", val: "USER_CREATED" },
        { op: "eq", col: "audit_log.ip_address", val: "10.0.0.1" },
        { op: "gte", col: "audit_log.created_at", val: new Date("2025-01-01") },
        { op: "lte", col: "audit_log.created_at", val: new Date("2025-12-31") },
      ]);
    });

    it("ignores invalid from date", () => {
      const conditions = parseFilters({ from: "not-a-date" });
      expect(conditions).toHaveLength(0);
    });

    it("ignores invalid to date", () => {
      const conditions = parseFilters({ to: "also-not-a-date" });
      expect(conditions).toHaveLength(0);
    });

    it("keeps valid filters even when one is invalid", () => {
      const conditions = parseFilters({
        action: "LOGIN_SUCCESS",
        from: "bad-date",
        to: "2025-12-31",
      });
      expect(conditions).toEqual([
        { op: "eq", col: "audit_log.action", val: "LOGIN_SUCCESS" },
        { op: "lte", col: "audit_log.created_at", val: new Date("2025-12-31") },
      ]);
    });
  });

  describe("entry serialization (serializeEntry)", () => {
    it("serializes a complete entry including requestId and jsonb details", () => {
      const entry: AuditLogRow = {
        id: "entry-1",
        actorId: "user-1",
        actorUsername: "alice",
        action: "LOGIN_SUCCESS",
        targetType: "user",
        targetId: "user-1",
        details: { ip: "127.0.0.1" },
        ipAddress: "127.0.0.1",
        requestId: "req-123",
        integrity: null,
        createdAt: new Date("2025-06-01T12:00:00Z"),
      };

      const serialized = serializeEntry(entry);
      expect(serialized).toEqual({
        id: "entry-1",
        actorId: "user-1",
        actorUsername: "alice",
        action: "LOGIN_SUCCESS",
        targetType: "user",
        targetId: "user-1",
        details: { ip: "127.0.0.1" },
        ipAddress: "127.0.0.1",
        requestId: "req-123",
        createdAt: "2025-06-01T12:00:00.000Z",
      });
      expect(serialized).not.toHaveProperty("integrity");
    });

    it("handles null details, actorId, ipAddress, and requestId", () => {
      const entry: AuditLogRow = {
        id: "entry-2",
        actorId: null,
        actorUsername: "system",
        action: "SETTINGS_UPDATED",
        targetType: "setting",
        targetId: null,
        details: null,
        ipAddress: null,
        requestId: null,
        integrity: null,
        createdAt: new Date("2025-06-01T12:00:00Z"),
      };

      const serialized = serializeEntry(entry);
      expect(serialized.details).toBeNull();
      expect(serialized.actorId).toBeNull();
      expect(serialized.ipAddress).toBeNull();
      expect(serialized.requestId).toBeNull();
    });

    it("preserves structured jsonb details object without JSON.parse", () => {
      const entry: AuditLogRow = {
        id: "entry-3",
        actorId: "admin-1",
        actorUsername: "admin",
        action: "USER_CREATED",
        targetType: "user",
        targetId: "new-user-1",
        details: { username: "newuser", role: "editor" },
        ipAddress: "192.168.1.1",
        requestId: "req-456",
        integrity: "hmac-sig",
        createdAt: new Date("2025-07-15T08:30:00Z"),
      };

      const serialized = serializeEntry(entry);
      expect(serialized.details).toEqual({ username: "newuser", role: "editor" });
      expect(serialized.requestId).toBe("req-456");
    });
  });

  describe("GET /api/v1/audit-log handler", () => {
    type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
    let getHandler: RouteHandler;

    beforeAll(async () => {
      const fakeApp = {
        get: vi.fn((path: string, handler: RouteHandler) => {
          if (path === "/api/v1/audit-log") getHandler = handler;
        }),
        log: { info: vi.fn() },
      };
      await auditLogRoutes(fakeApp as never);
    });

    it("applies pagination, filters (including ip), and serializes entries with requestId", async () => {
      mocks.entriesRows = [
        {
          id: "entry-1",
          actorId: "user-1",
          actorUsername: "alice",
          action: "LOGIN_SUCCESS",
          targetType: "user",
          targetId: "user-1",
          details: { method: "password" },
          ipAddress: "10.0.0.5",
          requestId: "req-789",
          integrity: null,
          createdAt: new Date("2025-06-01T12:00:00Z"),
        },
      ];
      mocks.countRows = [{ count: 1 }];

      let sentPayload: unknown;
      const reply = {
        send: vi.fn((body: unknown) => {
          sentPayload = body;
          return reply;
        }),
      };

      await getHandler(
        {
          query: {
            page: "2",
            limit: "10",
            action: "LOGIN_SUCCESS",
            ip: "10.0.0.5",
          },
        },
        reply,
      );

      expect(mocks.limitSpy).toHaveBeenCalledWith(10);
      expect(mocks.offsetSpy).toHaveBeenCalledWith(10);
      expect(mocks.whereArgs[0]).toEqual({
        op: "and",
        conds: [
          { op: "eq", col: "audit_log.action", val: "LOGIN_SUCCESS" },
          { op: "eq", col: "audit_log.ip_address", val: "10.0.0.5" },
        ],
      });
      expect(sentPayload).toEqual({
        entries: [
          {
            id: "entry-1",
            actorId: "user-1",
            actorUsername: "alice",
            action: "LOGIN_SUCCESS",
            targetType: "user",
            targetId: "user-1",
            details: { method: "password" },
            ipAddress: "10.0.0.5",
            requestId: "req-789",
            createdAt: "2025-06-01T12:00:00.000Z",
          },
        ],
        total: 1,
        page: 2,
        limit: 10,
      });
    });
  });
});
