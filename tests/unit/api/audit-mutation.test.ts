/**
 * Mutation-focused unit tests for apps/api/src/lib/audit.ts.
 *
 * These target the survived / no-coverage mutants the existing audit-lib and
 * audit-helpers suites leave alive:
 *   - sanitizeAuditInput: the strip regex, the 200-char slice boundary, and the
 *     "(empty)" fallback.
 *   - isToolAuditEnabled: the settings === "true" comparison, the enterprise
 *     "audit_export" fallback, and the fail-closed catch paths.
 *   - auditLog: the EXACT values written to the DB (actorId / actorUsername /
 *     targetType / targetId coalescing chains) and the tamper-resistant HMAC
 *     branch (the DATA_ENCRYPTION_KEY gate, the tamperResistantAudit === "true"
 *     gate, and the integrity UPDATE it issues).
 *   - deriveTargetType: driven through the REAL auditLog insert (the existing
 *     audit-helpers test only exercises a hand-copied reproduction, so the real
 *     function's branches survive).
 *
 * This lane is container-free: the db, config, enterprise, and encryption
 * modules are mocked so no Postgres/Redis is required.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ──────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  insertValues: [] as Record<string, unknown>[],
  updateSet: [] as Record<string, unknown>[],
  updateWhereCalled: 0,
  // Rows returned by db.select().from().where().limit() in call order.
  selectRows: [] as unknown[][],
  selectIdx: 0,
  selectThrows: false,
  insertThrows: false,
  encryptionKey: "" as string,
  auditExportEnabled: false,
  enterpriseThrows: false,
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    get DATA_ENCRYPTION_KEY() {
      return state.encryptionKey;
    },
  },
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        state.insertValues.push(v);
        if (state.insertThrows) throw new Error("DB write failed");
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        state.updateSet.push(v);
        return {
          where: () => {
            state.updateWhereCalled += 1;
            return Promise.resolve();
          },
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (state.selectThrows) return Promise.reject(new Error("settings query failed"));
            return Promise.resolve(state.selectRows[state.selectIdx++] ?? []);
          },
        }),
      }),
    }),
  },
  schema: {
    auditLog: { id: "id" },
    settings: { key: "key", value: "value" },
  },
}));

vi.mock("@snapotter/enterprise", () => ({
  isFeatureEnabled: (feature: string) => {
    if (state.enterpriseThrows) throw new Error("enterprise unavailable");
    return feature === "audit_export" ? state.auditExportEnabled : false;
  },
}));

// deriveAuditHmacKey / computeHmac are real: we assert a real hex string lands in
// the integrity UPDATE, which pins the HMAC branch end-to-end.

import {
  auditFromRequest,
  auditLog,
  isToolAuditEnabled,
  sanitizeAuditInput,
} from "../../../apps/api/src/lib/audit.js";

function makeLogger() {
  return {
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
}

beforeEach(() => {
  state.insertValues = [];
  state.updateSet = [];
  state.updateWhereCalled = 0;
  state.selectRows = [];
  state.selectIdx = 0;
  state.selectThrows = false;
  state.insertThrows = false;
  state.encryptionKey = "";
  state.auditExportEnabled = false;
  state.enterpriseThrows = false;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── sanitizeAuditInput ──────────────────────────────────────────────────

describe("sanitizeAuditInput", () => {
  it("strips every disallowed character", () => {
    // Contains <, >, &, dquote, squote, CR, LF, NUL, NEL, LS(U+2028), PS(U+2029).
    const raw = "a<b>c&d\"e'f\r\n\0g\x85h\u2028i\u2029j";
    expect(sanitizeAuditInput(raw)).toBe("abcdefghij");
  });

  it("keeps a clean string unchanged", () => {
    expect(sanitizeAuditInput("plain-value_123")).toBe("plain-value_123");
  });

  it("truncates to exactly 200 characters", () => {
    const result = sanitizeAuditInput("x".repeat(250));
    expect(result.length).toBe(200);
    expect(result).toBe("x".repeat(200));
  });

  it("does not truncate a string of exactly 200 characters", () => {
    const result = sanitizeAuditInput("y".repeat(200));
    expect(result.length).toBe(200);
  });

  it("keeps 199 characters intact (slice boundary is 200, not off-by-one)", () => {
    const result = sanitizeAuditInput("z".repeat(199));
    expect(result.length).toBe(199);
  });

  it("returns the (empty) sentinel when the input is empty", () => {
    expect(sanitizeAuditInput("")).toBe("(empty)");
  });

  it("returns the (empty) sentinel when every character is stripped", () => {
    expect(sanitizeAuditInput("<>&\"'\r\n")).toBe("(empty)");
  });
});

// ── isToolAuditEnabled ──────────────────────────────────────────────────

describe("isToolAuditEnabled", () => {
  it("returns true when the setting value is exactly the string 'true'", async () => {
    state.selectRows = [[{ value: "true" }]];
    await expect(isToolAuditEnabled()).resolves.toBe(true);
  });

  it("does not treat a non-'true' setting value as enabled", async () => {
    // "1" / "TRUE" / "yes" must NOT count: pins the === "true" comparison.
    state.selectRows = [[{ value: "1" }]];
    state.auditExportEnabled = false;
    await expect(isToolAuditEnabled()).resolves.toBe(false);
  });

  it("falls back to the enterprise audit_export feature when the setting is absent", async () => {
    state.selectRows = [[]];
    state.auditExportEnabled = true;
    await expect(isToolAuditEnabled()).resolves.toBe(true);
  });

  it("checks the audit_export feature specifically, not some other feature", async () => {
    // isFeatureEnabled returns true ONLY for "audit_export"; if the source passed
    // a different feature id the mock would return false. Asserting true pins the
    // literal "audit_export".
    state.selectRows = [[]];
    state.auditExportEnabled = true;
    await expect(isToolAuditEnabled()).resolves.toBe(true);
  });

  it("returns false when neither the setting nor the enterprise feature enable it", async () => {
    state.selectRows = [[]];
    state.auditExportEnabled = false;
    await expect(isToolAuditEnabled()).resolves.toBe(false);
  });

  it("falls through to the enterprise check when the settings query throws", async () => {
    // The first try/catch swallows the DB error and reaches the enterprise path,
    // which here enables audit_export -> true. Pins that the catch does not
    // short-circuit to false.
    state.selectThrows = true;
    state.auditExportEnabled = true;
    await expect(isToolAuditEnabled()).resolves.toBe(true);
  });

  it("returns false when the settings query throws and enterprise is unavailable", async () => {
    state.selectThrows = true;
    state.enterpriseThrows = true;
    await expect(isToolAuditEnabled()).resolves.toBe(false);
  });
});

// ── auditLog: exact DB-write values + actor/target derivation ────────────

describe("auditLog DB write values", () => {
  it("writes userId as actorId in preference to adminId", async () => {
    await auditLog(makeLogger() as never, "USER_UPDATED", {
      userId: "user-1",
      adminId: "admin-9",
      targetUserId: "target-7",
    });
    expect(state.insertValues).toHaveLength(1);
    expect(state.insertValues[0].actorId).toBe("user-1");
  });

  it("falls back to adminId for actorId when userId is absent", async () => {
    await auditLog(makeLogger() as never, "ROLE_CREATED", {
      adminId: "admin-9",
      roleName: "editor",
    });
    expect(state.insertValues[0].actorId).toBe("admin-9");
  });

  it("writes actorId null when neither userId nor adminId is present", async () => {
    await auditLog(makeLogger() as never, "LOGOUT");
    expect(state.insertValues[0].actorId).toBeNull();
  });

  it("prefers username over newUsername for actorUsername", async () => {
    await auditLog(makeLogger() as never, "USER_UPDATED", {
      username: "alice",
      newUsername: "bob",
    });
    expect(state.insertValues[0].actorUsername).toBe("alice");
  });

  it("falls back to newUsername for actorUsername", async () => {
    await auditLog(makeLogger() as never, "USER_CREATED", { newUsername: "bob" });
    expect(state.insertValues[0].actorUsername).toBe("bob");
  });

  it("defaults actorUsername to 'system' when no username is present", async () => {
    await auditLog(makeLogger() as never, "SETTINGS_UPDATED", {});
    expect(state.insertValues[0].actorUsername).toBe("system");
  });

  it("prefers targetUserId over keyId for targetId", async () => {
    await auditLog(makeLogger() as never, "USER_DELETED", {
      targetUserId: "target-7",
      keyId: "key-3",
    });
    expect(state.insertValues[0].targetId).toBe("target-7");
  });

  it("falls back to keyId for targetId", async () => {
    await auditLog(makeLogger() as never, "API_KEY_DELETED", { keyId: "key-3" });
    expect(state.insertValues[0].targetId).toBe("key-3");
  });

  it("writes targetId null when neither targetUserId nor keyId is present", async () => {
    await auditLog(makeLogger() as never, "LOGOUT");
    expect(state.insertValues[0].targetId).toBeNull();
  });

  it("passes the event through as the action, and ip/requestId through verbatim", async () => {
    await auditLog(makeLogger() as never, "LOGIN_SUCCESS", { userId: "u1" }, "10.0.0.4", "req-abc");
    expect(state.insertValues[0].action).toBe("LOGIN_SUCCESS");
    expect(state.insertValues[0].ipAddress).toBe("10.0.0.4");
    expect(state.insertValues[0].requestId).toBe("req-abc");
  });

  it("stores the details object on the row", async () => {
    const details = { userId: "u1", changes: { role: "editor" } };
    await auditLog(makeLogger() as never, "USER_UPDATED", details);
    expect(state.insertValues[0].details).toEqual(details);
  });

  it("defaults ip and requestId to null when not supplied", async () => {
    await auditLog(makeLogger() as never, "LOGOUT", { userId: "u1" });
    expect(state.insertValues[0].ipAddress).toBeNull();
    expect(state.insertValues[0].requestId).toBeNull();
  });
});

// ── auditLog: deriveTargetType via the real insert path ──────────────────

describe("auditLog targetType derivation (real deriveTargetType)", () => {
  it.each([
    ["USER_CREATED", "user"],
    ["LOGIN_SUCCESS", "user"],
    ["LOGIN_FAILED", "user"],
    ["PASSWORD_CHANGED", "user"],
    ["OIDC_LOGIN_FAILED", "user"],
    ["SAML_USER_LINKED", "user"],
    ["SCIM_USER_CREATED", "user"],
    ["MFA_ENABLED", "user"],
    ["LOGOUT", "user"],
    ["API_KEY_CREATED", "api_key"],
    ["FILE_UPLOADED", "file"],
    ["ROLE_UPDATED", "role"],
    ["SETTINGS_UPDATED", "setting"],
    ["IP_ALLOWLIST_UPDATED", "setting"],
    ["TOOL_EXECUTED", "tool"],
    ["BATCH_STARTED", "tool"],
    ["PIPELINE_RUN", "tool"],
    ["LEGAL_HOLD_PLACED", "compliance"],
    ["SIEM_FORWARD_FAILED", "integration"],
    ["WEBHOOK_DELIVERED", "integration"],
  ])("maps %s to targetType %s", async (event, expected) => {
    await auditLog(makeLogger() as never, event, {});
    expect(state.insertValues[0].targetType).toBe(expected);
  });

  it("maps an unknown event to a null targetType", async () => {
    await auditLog(makeLogger() as never, "SOMETHING_ELSE", {});
    expect(state.insertValues[0].targetType).toBeNull();
  });

  it("does not classify LOGIC_ONLY (LOGI prefix, not LOGIN/LOGOUT) as a user event", async () => {
    // Pins the LOGIN prefix and the exact LOGOUT equality: "LOGIC_..." must miss.
    await auditLog(makeLogger() as never, "LOGIC_TRACE", {});
    expect(state.insertValues[0].targetType).toBeNull();
  });

  it("requires exact equality for LOGOUT (LOGOUT_X is not a user target via that branch)", async () => {
    // LOGOUT_ALL does not start with USER_/LOGIN/PASSWORD and is not === LOGOUT,
    // and no other prefix matches, so it is null. Pins the === "LOGOUT" check.
    await auditLog(makeLogger() as never, "LOGOUT_ALL", {});
    expect(state.insertValues[0].targetType).toBeNull();
  });

  it("does not treat SETTINGS_CHANGED as a setting (SETTINGS_UPDATED is exact)", async () => {
    await auditLog(makeLogger() as never, "SETTINGS_CHANGED", {});
    expect(state.insertValues[0].targetType).toBeNull();
  });
});

// ── auditLog: DB failure resilience ──────────────────────────────────────

describe("auditLog failure handling", () => {
  it("logs a warning and returns without throwing when the insert fails", async () => {
    const logger = makeLogger();
    state.insertThrows = true;
    await expect(
      auditLog(logger as never, "SETTINGS_UPDATED", { userId: "u1" }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toEqual({ event: "SETTINGS_UPDATED" });
  });

  it("does not attempt the HMAC branch after an insert failure", async () => {
    state.insertThrows = true;
    state.encryptionKey = "a".repeat(64);
    state.selectRows = [[{ value: "true" }]];
    await auditLog(makeLogger() as never, "USER_CREATED", { userId: "u1" });
    // Early return after the failed insert: no integrity UPDATE issued.
    expect(state.updateWhereCalled).toBe(0);
  });
});

// ── auditLog: tamper-resistant HMAC branch ───────────────────────────────

describe("auditLog tamper-resistant integrity", () => {
  it("computes and stores an integrity HMAC when encryption + tamperResistant are on", async () => {
    state.encryptionKey = "a".repeat(64);
    state.selectRows = [[{ value: "true" }]]; // tamperResistantAudit === "true"
    await auditLog(makeLogger() as never, "USER_CREATED", { userId: "u1" });

    expect(state.updateWhereCalled).toBe(1);
    expect(state.updateSet).toHaveLength(1);
    const integrity = state.updateSet[0].integrity;
    expect(typeof integrity).toBe("string");
    expect(integrity).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("skips the HMAC entirely when DATA_ENCRYPTION_KEY is unset", async () => {
    state.encryptionKey = "";
    state.selectRows = [[{ value: "true" }]];
    await auditLog(makeLogger() as never, "USER_CREATED", { userId: "u1" });
    expect(state.updateWhereCalled).toBe(0);
    expect(state.selectIdx).toBe(0); // never even queried tamperResistantAudit
  });

  it("skips the HMAC when tamperResistantAudit is not exactly 'true'", async () => {
    state.encryptionKey = "a".repeat(64);
    state.selectRows = [[{ value: "1" }]]; // not "true"
    await auditLog(makeLogger() as never, "USER_CREATED", { userId: "u1" });
    expect(state.updateWhereCalled).toBe(0);
  });

  it("skips the HMAC when the tamperResistantAudit setting row is absent", async () => {
    state.encryptionKey = "a".repeat(64);
    state.selectRows = [[]]; // no row
    await auditLog(makeLogger() as never, "USER_CREATED", { userId: "u1" });
    expect(state.updateWhereCalled).toBe(0);
  });

  it("warns but does not throw when the HMAC update fails", async () => {
    const logger = makeLogger();
    state.encryptionKey = "a".repeat(64);
    state.selectRows = [[{ value: "true" }]];
    // Make the update throw by swapping the mock's where to reject once.
    // Simpler: force computeHmac path but break update via selectRows shape is not
    // possible; instead assert the happy path already covered and that a thrown
    // update is caught. We trigger a throw by making update().set().where reject.
    const dbModule = await import("../../../apps/api/src/db/index.js");
    const original = dbModule.db.update;
    (dbModule.db as { update: unknown }).update = () => ({
      set: () => ({
        where: () => {
          throw new Error("update failed");
        },
      }),
    });
    try {
      await expect(
        auditLog(logger as never, "USER_CREATED", { userId: "u1" }),
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0][0]).toEqual({ event: "USER_CREATED" });
    } finally {
      (dbModule.db as { update: unknown }).update = original;
    }
  });
});

// ── auditFromRequest: request.ip / request.id capture ─────────────────────

describe("auditFromRequest", () => {
  it("captures request.ip and request.id and forwards them to the DB write", async () => {
    const logger = makeLogger();
    const request = { log: logger, ip: "203.0.113.7", id: "req-xyz" };
    const emit = auditFromRequest(request as never);

    await emit("LOGIN_SUCCESS", { userId: "u1" });

    expect(state.insertValues).toHaveLength(1);
    expect(state.insertValues[0].ipAddress).toBe("203.0.113.7");
    expect(state.insertValues[0].requestId).toBe("req-xyz");
    expect(state.insertValues[0].action).toBe("LOGIN_SUCCESS");
  });

  it("defaults details to an empty object when called with only an event", async () => {
    const logger = makeLogger();
    const emit = auditFromRequest({ log: logger, ip: "10.1.1.1", id: "r-2" } as never);

    await emit("LOGOUT");

    expect(state.insertValues[0].actorUsername).toBe("system");
    expect(state.insertValues[0].actorId).toBeNull();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});
