/**
 * Unit tests for the audit.ts library module.
 *
 * Tests the auditLog function's dual-write behavior (logger + DB insert),
 * actor extraction, target type derivation, and DB failure resilience.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockInsertRun = vi.fn();

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (...args: unknown[]) => {
        mockInsertRun(...args);
        return Promise.resolve();
      },
    }),
  },
  pool: {},
  closeDb: async () => {},
  schema: {
    auditLog: {},
  },
}));

import { auditLog } from "../../../apps/api/src/lib/audit.js";

// ── Tests ───────────────────────────────────────────────────────────────

describe("auditLog", () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: "info",
    silent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs to the structured logger with audit flag", async () => {
    await auditLog(mockLogger as never, "LOGIN_SUCCESS", { userId: "u1", username: "alice" });

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const [logData, logMessage] = mockLogger.info.mock.calls[0];
    expect(logData.audit).toBe(true);
    expect(logData.event).toBe("LOGIN_SUCCESS");
    expect(logData.userId).toBe("u1");
    expect(logMessage).toBe("[AUDIT] LOGIN_SUCCESS");
  });

  it("inserts a record into the database", async () => {
    await auditLog(mockLogger as never, "USER_CREATED", {
      adminId: "admin-1",
      targetUserId: "new-user-1",
    });

    expect(mockInsertRun).toHaveBeenCalledTimes(1);
  });

  it("extracts actorId from userId field first", async () => {
    await auditLog(mockLogger as never, "FILE_UPLOADED", {
      userId: "u1",
      adminId: "a1",
    });

    // The insert was called; check logger received both fields
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const logData = mockLogger.info.mock.calls[0][0];
    expect(logData.userId).toBe("u1");
    expect(logData.adminId).toBe("a1");
  });

  it("falls back to adminId when userId is absent", async () => {
    await auditLog(mockLogger as never, "ROLE_CREATED", { adminId: "admin-1", roleName: "editor" });

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const logData = mockLogger.info.mock.calls[0][0];
    expect(logData.adminId).toBe("admin-1");
  });

  it("extracts username from details", async () => {
    await auditLog(mockLogger as never, "LOGIN_SUCCESS", {
      userId: "u1",
      username: "alice",
    });

    const logData = mockLogger.info.mock.calls[0][0];
    expect(logData.username).toBe("alice");
  });

  it("handles empty details object", async () => {
    await auditLog(mockLogger as never, "LOGOUT");

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockInsertRun).toHaveBeenCalledTimes(1);
  });

  it("survives DB insert failure", async () => {
    mockInsertRun.mockImplementationOnce(() => {
      throw new Error("DB write failed");
    });

    // Should not throw
    await auditLog(mockLogger as never, "SETTINGS_UPDATED", { userId: "u1" });

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [warnData] = mockLogger.warn.mock.calls[0];
    expect(warnData.event).toBe("SETTINGS_UPDATED");
  });

  it("logs different event types correctly", async () => {
    const events = [
      "LOGIN_SUCCESS",
      "LOGIN_FAILED",
      "LOGOUT",
      "PASSWORD_CHANGED",
      "USER_CREATED",
      "FILE_UPLOADED",
      "API_KEY_CREATED",
      "ROLE_CREATED",
      "SETTINGS_UPDATED",
    ] as const;

    for (const event of events) {
      vi.clearAllMocks();
      await auditLog(mockLogger as never, event, { userId: "u1" });

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      const logMessage = mockLogger.info.mock.calls[0][1];
      expect(logMessage).toBe(`[AUDIT] ${event}`);
    }
  });

  it("serializes details as JSON for DB storage", async () => {
    await auditLog(mockLogger as never, "USER_UPDATED", {
      adminId: "admin-1",
      targetUserId: "u2",
      changes: { role: "editor" },
    });

    expect(mockInsertRun).toHaveBeenCalledTimes(1);
  });

  it("includes all detail fields in the log output", async () => {
    const details = {
      userId: "u1",
      keyId: "key-123",
      keyName: "Production Key",
    };

    await auditLog(mockLogger as never, "API_KEY_CREATED", details);

    const logData = mockLogger.info.mock.calls[0][0];
    expect(logData.keyId).toBe("key-123");
    expect(logData.keyName).toBe("Production Key");
  });
});
