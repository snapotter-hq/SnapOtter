/**
 * Unit tests for audit log route query parsing and response serialization.
 *
 * Tests pagination, action filtering, date range filtering, and the
 * response format for audit log entries.
 */
import { describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () => ({ all: () => [] }),
            }),
          }),
          get: () => ({ count: 0 }),
        }),
        orderBy: () => ({
          limit: () => ({
            offset: () => ({ all: () => [] }),
          }),
        }),
        all: () => [],
      }),
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    auditLog: {
      action: {},
      createdAt: {},
    },
  },
}));

// ── Reproduce query parsing logic from audit-log.ts ────────────────────

function parsePagination(query: { page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "50", 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function parseFilters(query: { action?: string; from?: string; to?: string }) {
  const conditions: Array<{ type: string; value: unknown }> = [];

  if (query.action) {
    conditions.push({ type: "action", value: query.action });
  }
  if (query.from) {
    const fromDate = new Date(query.from);
    if (!Number.isNaN(fromDate.getTime())) {
      conditions.push({ type: "from", value: fromDate });
    }
  }
  if (query.to) {
    const toDate = new Date(query.to);
    if (!Number.isNaN(toDate.getTime())) {
      conditions.push({ type: "to", value: toDate });
    }
  }

  return conditions;
}

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorUsername: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

function serializeEntry(e: AuditEntry) {
  return {
    id: e.id,
    actorId: e.actorId,
    actorUsername: e.actorUsername,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    details: e.details ? JSON.parse(e.details) : null,
    ipAddress: e.ipAddress,
    createdAt: e.createdAt.toISOString(),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("audit log route logic", () => {
  describe("pagination parsing", () => {
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

  describe("filter parsing", () => {
    it("returns empty conditions for no filters", () => {
      const conditions = parseFilters({});
      expect(conditions).toHaveLength(0);
    });

    it("adds action filter", () => {
      const conditions = parseFilters({ action: "LOGIN_SUCCESS" });
      expect(conditions).toHaveLength(1);
      expect(conditions[0].type).toBe("action");
      expect(conditions[0].value).toBe("LOGIN_SUCCESS");
    });

    it("adds from date filter", () => {
      const conditions = parseFilters({ from: "2025-01-01" });
      expect(conditions).toHaveLength(1);
      expect(conditions[0].type).toBe("from");
    });

    it("adds to date filter", () => {
      const conditions = parseFilters({ to: "2025-12-31" });
      expect(conditions).toHaveLength(1);
      expect(conditions[0].type).toBe("to");
    });

    it("handles all filters together", () => {
      const conditions = parseFilters({
        action: "USER_CREATED",
        from: "2025-01-01",
        to: "2025-12-31",
      });
      expect(conditions).toHaveLength(3);
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
      expect(conditions).toHaveLength(2);
      expect(conditions[0].type).toBe("action");
      expect(conditions[1].type).toBe("to");
    });
  });

  describe("entry serialization", () => {
    it("serializes a complete entry", () => {
      const entry: AuditEntry = {
        id: "entry-1",
        actorId: "user-1",
        actorUsername: "alice",
        action: "LOGIN_SUCCESS",
        targetType: "user",
        targetId: "user-1",
        details: JSON.stringify({ ip: "127.0.0.1" }),
        ipAddress: "127.0.0.1",
        createdAt: new Date("2025-06-01T12:00:00Z"),
      };

      const serialized = serializeEntry(entry);
      expect(serialized.id).toBe("entry-1");
      expect(serialized.actorId).toBe("user-1");
      expect(serialized.actorUsername).toBe("alice");
      expect(serialized.action).toBe("LOGIN_SUCCESS");
      expect(serialized.details).toEqual({ ip: "127.0.0.1" });
      expect(serialized.createdAt).toBe("2025-06-01T12:00:00.000Z");
    });

    it("handles null details", () => {
      const entry: AuditEntry = {
        id: "entry-2",
        actorId: null,
        actorUsername: "system",
        action: "SETTINGS_UPDATED",
        targetType: "setting",
        targetId: null,
        details: null,
        ipAddress: null,
        createdAt: new Date("2025-06-01T12:00:00Z"),
      };

      const serialized = serializeEntry(entry);
      expect(serialized.details).toBeNull();
      expect(serialized.actorId).toBeNull();
      expect(serialized.ipAddress).toBeNull();
    });

    it("parses JSON details string", () => {
      const entry: AuditEntry = {
        id: "entry-3",
        actorId: "admin-1",
        actorUsername: "admin",
        action: "USER_CREATED",
        targetType: "user",
        targetId: "new-user-1",
        details: JSON.stringify({ username: "newuser", role: "editor" }),
        ipAddress: "192.168.1.1",
        createdAt: new Date("2025-07-15T08:30:00Z"),
      };

      const serialized = serializeEntry(entry);
      expect(serialized.details).toEqual({ username: "newuser", role: "editor" });
    });
  });
});
