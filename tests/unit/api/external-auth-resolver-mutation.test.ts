/**
 * Mutation-focused unit tests for apps/api/src/lib/external-auth-resolver.ts.
 *
 * The existing external-auth-resolver.test.ts covers sanitizeUsername and
 * findUniqueUsername well, plus one auto-create-denied case. This file drives
 * resolveExternalUser through every decision branch so the survived / no-cov
 * mutants there die:
 *   - match-by-externalId (matched) + the disabled-role guard on that path
 *   - the "email changed" UPDATE (issued only when email differs)
 *   - auto-link-by-email (linked): the autoLink && email && emailVerified gate,
 *     the disabled guard, and the externalId/authProvider UPDATE it writes
 *   - auto-create (created): the MAX_USERS >= limit guard, the "Default" team
 *     lookup with its fallback id, and the exact INSERT values
 *   - the terminal denied path (user_not_authorized) with sanitized externalId
 * Every canned DB row and the audit events are asserted so operator/string/
 * boolean mutants cannot survive undetected.
 *
 * Container-free: db, config, and audit are mocked; isDisabledRole is the real
 * function (it is pure).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock state ──────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  // Rows returned by each db.select() chain, in call order.
  selectRows: [] as unknown[][],
  selectIdx: 0,
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  // rowCount returned by each insert, in call order (default 1). A 0 models
  // losing a unique-constraint race under onConflictDoNothing.
  insertRowCounts: [] as number[],
  maxUsers: 0,
  auditCalls: [] as { event: string; details: Record<string, unknown> }[],
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    get MAX_USERS() {
      return state.maxUsers;
    },
  },
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditLog: (_logger: unknown, event: string, details: Record<string, unknown> = {}) => {
    state.auditCalls.push({ event, details });
    return Promise.resolve();
  },
  // sanitizeAuditInput is used on the denied path; keep the real strip behavior
  // so we can assert the value that reaches the audit call.
  sanitizeAuditInput: (raw: string) => raw.replace(/[<>&"'\r\n\0]/g, "").slice(0, 200) || "(empty)",
}));

// A select chain that is both awaitable and chainable through
// .from()/.where()/.orderBy()/.limit(). resolveExternalUser awaits the terminal
// at three different depths (.limit(1) for id/email matches, .from() for the
// COUNT, and .where() for the username/team lookups), so every level is a
// thenable. Only
// the terminal await consumes one canned row set (settle() increments the index
// lazily), which keeps call-order pulls correct across the mixed shapes.
function makeSelectChain() {
  const settle = () => {
    const value = state.selectRows[state.selectIdx++] ?? [];
    return Promise.resolve(value);
  };
  const node: Record<string, unknown> = {
    from: () => node,
    where: () => node,
    orderBy: () => node,
    limit: () => settle(),
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mocking an awaitable Drizzle query builder
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      settle().then(onFulfilled, onRejected),
  };
  return node;
}

vi.mock("../../../apps/api/src/db/index.js", () => {
  // Shared by db.insert and tx.insert: the auto-create insert runs inside
  // the transaction (issue #928) and still needs the #927 rowCount machinery.
  const insert = () => ({
    values: (v: Record<string, unknown>) => {
      const rowCount = state.insertRowCounts[state.inserts.length] ?? 1;
      state.inserts.push(v);
      const result = Promise.resolve({ rowCount });
      return Object.assign(result, { onConflictDoNothing: () => result });
    },
  });
  return {
    db: {
      select: () => makeSelectChain(),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          state.updates.push(v);
          return { where: () => Promise.resolve() };
        },
      }),
      insert,
      // The tx reuses the same canned select chain and insert recorder;
      // execute() is the advisory lock, a no-op here.
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ execute: () => Promise.resolve(), select: () => makeSelectChain(), insert }),
    },
    schema: {
      users: {
        id: "id",
        username: "username",
        email: "email",
        role: "role",
        team: "team",
        externalId: "external_id",
        authProvider: "auth_provider",
      },
      teams: { id: "id", name: "name" },
    },
  };
});

import {
  resolveExternalUser,
  UsernameRaceExhaustedError,
} from "../../../apps/api/src/lib/external-auth-resolver.js";

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    provider: "oidc",
    externalId: "ext-1",
    email: undefined as string | undefined,
    emailVerified: undefined as boolean | undefined,
    username: "alice",
    autoCreate: false,
    autoLink: false,
    defaultRole: "user",
    logger: makeLogger() as never,
    ip: "10.0.0.1",
    requestId: "req-1",
    ...overrides,
  };
}

const dbUser = (over: Record<string, unknown> = {}) => ({
  id: "u-existing",
  username: "existing",
  email: "old@example.com",
  role: "editor",
  team: "team-a",
  externalId: "ext-1",
  authProvider: "oidc",
  ...over,
});

beforeEach(() => {
  state.selectRows = [];
  state.selectIdx = 0;
  state.updates = [];
  state.inserts = [];
  state.insertRowCounts = [];
  state.maxUsers = 0;
  state.auditCalls = [];
  vi.clearAllMocks();
});

// ── 1. Match by externalId ───────────────────────────────────────────────

describe("resolveExternalUser: match by externalId", () => {
  it("returns the matched user mapped to id/username/role/team", async () => {
    state.selectRows = [[dbUser()]];
    const result = await resolveExternalUser(baseParams());
    expect(result).toEqual({
      user: { id: "u-existing", username: "existing", role: "editor", team: "team-a" },
      action: "matched",
    });
  });

  it("denies a matched user whose role is disabled and audits user_disabled", async () => {
    state.selectRows = [[dbUser({ role: "disabled" })]];
    const result = await resolveExternalUser(baseParams());
    expect(result).toEqual({ user: null, action: "denied", deniedReason: "user_disabled" });
    expect(state.auditCalls[0]).toEqual({
      event: "OIDC_LOGIN_FAILED",
      details: { reason: "user_disabled", userId: "u-existing" },
    });
  });

  it("does NOT issue an email UPDATE when the incoming email equals the stored email", async () => {
    state.selectRows = [[dbUser({ email: "same@example.com" })]];
    await resolveExternalUser(baseParams({ email: "same@example.com" }));
    expect(state.updates).toHaveLength(0);
  });

  it("issues an email UPDATE only when the incoming email differs", async () => {
    state.selectRows = [[dbUser({ email: "old@example.com" })]];
    const result = await resolveExternalUser(baseParams({ email: "new@example.com" }));
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].email).toBe("new@example.com");
    expect(result.action).toBe("matched");
  });

  it("does not issue an email UPDATE when no email is supplied", async () => {
    state.selectRows = [[dbUser({ email: "old@example.com" })]];
    await resolveExternalUser(baseParams({ email: undefined }));
    expect(state.updates).toHaveLength(0);
  });

  it("uppercases the provider for the audit event prefix (saml -> SAML)", async () => {
    state.selectRows = [[dbUser({ role: "disabled" })]];
    await resolveExternalUser(baseParams({ provider: "saml" }));
    expect(state.auditCalls[0].event).toBe("SAML_LOGIN_FAILED");
  });
});

// ── 2. Auto-link by email ────────────────────────────────────────────────

describe("resolveExternalUser: auto-link by email", () => {
  it("links a verified email match, writes externalId/authProvider, audits USER_LINKED", async () => {
    state.selectRows = [
      [], // no externalId match
      [dbUser({ id: "u-link", username: "linkme", externalId: null, authProvider: null })],
    ];
    const result = await resolveExternalUser(
      baseParams({ autoLink: true, email: "known@example.com", emailVerified: true }),
    );

    expect(result).toEqual({
      user: { id: "u-link", username: "linkme", role: "editor", team: "team-a" },
      action: "linked",
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].externalId).toBe("ext-1");
    expect(state.updates[0].authProvider).toBe("oidc");
    expect(state.auditCalls.at(-1)).toEqual({
      event: "OIDC_USER_LINKED",
      details: { userId: "u-link", username: "linkme", email: "known@example.com" },
    });
  });

  it("denies linking when the email-matched user is disabled", async () => {
    state.selectRows = [[], [dbUser({ id: "u-dis", role: "disabled:pending" })]];
    const result = await resolveExternalUser(
      baseParams({ autoLink: true, email: "known@example.com", emailVerified: true }),
    );
    expect(result).toEqual({ user: null, action: "denied", deniedReason: "user_disabled" });
    expect(state.updates).toHaveLength(0);
  });

  it("does not auto-link when emailVerified is false (falls through to denied)", async () => {
    state.selectRows = [[]]; // only the extId query runs; email branch is gated off
    const result = await resolveExternalUser(
      baseParams({ autoLink: true, email: "known@example.com", emailVerified: false }),
    );
    expect(result.action).toBe("denied");
    expect(result.deniedReason).toBe("user_not_authorized");
  });

  it("does not auto-link when autoLink is false", async () => {
    state.selectRows = [[]];
    const result = await resolveExternalUser(
      baseParams({ autoLink: false, email: "known@example.com", emailVerified: true }),
    );
    expect(result.deniedReason).toBe("user_not_authorized");
  });

  it("does not auto-link when no email is provided", async () => {
    state.selectRows = [[]];
    const result = await resolveExternalUser(
      baseParams({ autoLink: true, email: undefined, emailVerified: true }),
    );
    expect(result.deniedReason).toBe("user_not_authorized");
  });
});

// ── 3. Auto-create ───────────────────────────────────────────────────────

describe("resolveExternalUser: auto-create", () => {
  it("creates a new user with the default role/team and audits USER_CREATED", async () => {
    state.selectRows = [
      [], // extId miss
      [], // findUniqueUsername: base free
      [{ id: "team-default" }], // Default team lookup
    ];
    const result = await resolveExternalUser(
      baseParams({ autoCreate: true, email: "new@example.com", username: "alice" }),
    );

    expect(result.action).toBe("created");
    expect(result.user).toEqual({
      id: expect.any(String),
      username: "alice",
      role: "user",
      team: "team-default",
    });
    expect(state.inserts).toHaveLength(1);
    const row = state.inserts[0];
    expect(row.username).toBe("alice");
    expect(row.role).toBe("user");
    expect(row.team).toBe("team-default");
    expect(row.authProvider).toBe("oidc");
    expect(row.externalId).toBe("ext-1");
    expect(row.email).toBe("new@example.com");
    expect(row.passwordHash).toBeNull();
    expect(row.mustChangePassword).toBe(false);
    expect(state.auditCalls.at(-1)?.event).toBe("OIDC_USER_CREATED");
  });

  it("falls back to the sentinel team id when no Default team exists", async () => {
    state.selectRows = [[], [], []]; // extId miss, username free, NO default team
    const result = await resolveExternalUser(
      baseParams({ autoCreate: true, email: "new@example.com" }),
    );
    expect(result.user?.team).toBe("default-team-00000000");
    expect(state.inserts[0].team).toBe("default-team-00000000");
  });

  it("stores null email on the new row when no email is supplied", async () => {
    state.selectRows = [[], [], [{ id: "team-default" }]];
    await resolveExternalUser(baseParams({ autoCreate: true, email: undefined }));
    expect(state.inserts[0].email).toBeNull();
  });

  it("denies auto-create when the default role is disabled (no insert)", async () => {
    state.selectRows = [[]]; // extId miss; disabled-role guard fires before any lookup
    const result = await resolveExternalUser(
      baseParams({ autoCreate: true, defaultRole: "disabled" }),
    );
    expect(result).toEqual({ user: null, action: "denied", deniedReason: "user_disabled" });
    expect(state.inserts).toHaveLength(0);
    expect(state.auditCalls.at(-1)?.event).toBe("OIDC_LOGIN_FAILED");
  });

  it("denies auto-create when the user count is at the MAX_USERS limit", async () => {
    state.maxUsers = 5;
    // The count runs last, inside the transaction (issue #928), so the
    // username and team lookups consume their slots first.
    state.selectRows = [
      [], // extId miss
      [], // username free
      [{ id: "team-default" }], // Default team lookup
      [{ count: 5 }], // locked count: exactly at the cap (>= limit)
    ];
    const logger = makeLogger();
    const result = await resolveExternalUser(
      baseParams({
        autoCreate: true,
        externalId: "ext<cap>1",
        email: "capped@example.com",
        logger: logger as never,
      }),
    );
    expect(result).toEqual({ user: null, action: "denied", deniedReason: "user_limit_reached" });
    expect(state.inserts).toHaveLength(0);
    // Mirrors the user_not_authorized terminal (issue #967): an audit row with
    // the sanitized externalId, plus a warn naming who was turned away.
    expect(state.auditCalls.at(-1)).toEqual({
      event: "OIDC_LOGIN_FAILED",
      details: { reason: "user_limit_reached", externalId: "extcap1" },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { externalId: "ext<cap>1", email: "capped@example.com" },
      expect.stringContaining("user limit reached"),
    );
  });

  it("joins the concurrent winner at the cap without auditing a denial", async () => {
    // Two tabs of one new identity finish first login at once while the
    // instance sits at the cap: the loser's insert is refused by the limit,
    // but the winner re-check finds the row this same identity just created,
    // so the login is "matched". The limit audit must stay behind that
    // re-check or this success would leave a false LOGIN_FAILED row.
    state.maxUsers = 5;
    const logger = makeLogger();
    state.selectRows = [
      [], // extId miss
      [], // username free
      [{ id: "team-default" }], // Default team lookup
      [{ count: 5 }], // locked count: at the cap
      [dbUser({ id: "u-winner", username: "alice", role: "user", team: "team-default" })],
    ];
    const result = await resolveExternalUser(
      baseParams({ autoCreate: true, logger: logger as never }),
    );
    expect(result.action).toBe("matched");
    expect(result.user?.id).toBe("u-winner");
    expect(state.inserts).toHaveLength(0);
    expect(state.auditCalls).toHaveLength(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("allows auto-create when the count is one below the limit (boundary)", async () => {
    state.maxUsers = 5;
    state.selectRows = [
      [], // extId miss
      [], // username free
      [{ id: "team-default" }],
      [{ count: 4 }], // locked count: below cap
    ];
    const result = await resolveExternalUser(baseParams({ autoCreate: true }));
    expect(result.action).toBe("created");
  });

  it("skips the count query entirely when MAX_USERS is 0 (unlimited)", async () => {
    state.maxUsers = 0;
    state.selectRows = [
      [], // extId miss
      [], // username free (NO count query consumed)
      [{ id: "team-default" }],
    ];
    const result = await resolveExternalUser(baseParams({ autoCreate: true }));
    expect(result.action).toBe("created");
  });
});

// ── 3b. Auto-create username races (issue #927) ─────────────────────────
//
// The insert carries onConflictDoNothing, so losing a race surfaces as
// rowCount 0 instead of a thrown 23505. The resolver must then re-check
// whether the same external identity won (two-tabs case) and otherwise
// re-run the username scan.

describe("resolveExternalUser: auto-create username race", () => {
  it("returns the winner's user when the same identity created it concurrently", async () => {
    state.insertRowCounts = [0];
    state.selectRows = [
      [], // extId miss
      [], // findUniqueUsername: base free
      [{ id: "team-default" }], // Default team lookup
      // Post-conflict re-check by externalId finds the winner.
      [dbUser({ id: "u-winner", username: "alice", role: "user", team: "team-default" })],
    ];
    const result = await resolveExternalUser(baseParams({ autoCreate: true }));

    expect(result).toEqual({
      user: { id: "u-winner", username: "alice", role: "user", team: "team-default" },
      action: "matched",
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.auditCalls.map((c) => c.event)).not.toContain("OIDC_USER_CREATED");
  });

  it("denies when the concurrently created winner is disabled", async () => {
    state.insertRowCounts = [0];
    state.selectRows = [
      [], // extId miss
      [], // base free
      [{ id: "team-default" }],
      [dbUser({ id: "u-winner", role: "disabled" })], // winner re-check
    ];
    const result = await resolveExternalUser(baseParams({ autoCreate: true }));
    expect(result).toEqual({ user: null, action: "denied", deniedReason: "user_disabled" });
    expect(state.auditCalls.at(-1)?.event).toBe("OIDC_LOGIN_FAILED");
  });

  it("joins the winner when the scan picked a suffixed name and the identity index refused the insert", async () => {
    // Issue #969: the loser stalled after the externalId miss, so by the time
    // its scan ran the winner's "alice" was committed and it went for
    // "alice_2". Only the (auth_provider, external_id) index can refuse that
    // insert, and the recovery has to land on the winner, not rescan.
    state.insertRowCounts = [0];
    state.selectRows = [
      [], // extId miss
      [{ username: "alice" }], // scan: base taken by the winner
      [], // scan: alice_2 free
      [{ id: "team-default" }],
      [dbUser({ id: "u-winner", username: "alice", role: "user", team: "team-default" })], // winner re-check
    ];
    const result = await resolveExternalUser(baseParams({ autoCreate: true }));

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].username).toBe("alice_2");
    expect(result).toEqual({
      user: { id: "u-winner", username: "alice", role: "user", team: "team-default" },
      action: "matched",
    });
    expect(state.auditCalls.map((c) => c.event)).not.toContain("OIDC_USER_CREATED");
  });

  it("re-runs the username scan and creates when a different user took the name", async () => {
    state.insertRowCounts = [0, 1];
    state.selectRows = [
      [], // extId miss
      [], // attempt 1: base "alice" free
      [{ id: "team-default" }],
      [], // winner re-check: not our identity
      [{ username: "alice" }], // attempt 2 scan: base now taken
      [], // attempt 2 scan: alice_2 free
      [{ id: "team-default" }],
    ];
    const result = await resolveExternalUser(baseParams({ autoCreate: true }));

    expect(result.action).toBe("created");
    expect(result.user?.username).toBe("alice_2");
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[1].username).toBe("alice_2");
    const created = state.auditCalls.at(-1);
    expect(created?.event).toBe("OIDC_USER_CREATED");
    expect(created?.details.username).toBe("alice_2");
  });

  it("throws after exhausting the retry budget instead of looping forever", async () => {
    state.insertRowCounts = [0, 0, 0];
    // Three identical attempts, each consuming: username scan (base free),
    // Default team lookup, then the post-conflict re-check (no winner).
    state.selectRows = [
      [], // extId miss
      [], // attempt 1: scan
      [{ id: "team-default" }], // attempt 1: team
      [], // attempt 1: re-check miss
      [], // attempt 2: scan
      [{ id: "team-default" }], // attempt 2: team
      [], // attempt 2: re-check miss
      [], // attempt 3: scan
      [{ id: "team-default" }], // attempt 3: team
      [], // attempt 3: re-check miss
    ];
    const exhausted = resolveExternalUser(baseParams({ autoCreate: true }));
    await expect(exhausted).rejects.toThrow(/username race/);
    // The SSO callbacks catch this one error by type (issue #978), so the
    // resolver has to keep throwing exactly it, not a plain Error.
    await expect(exhausted).rejects.toBeInstanceOf(UsernameRaceExhaustedError);
    expect(state.inserts).toHaveLength(3);
  });
});

// ── 4. Terminal denied ───────────────────────────────────────────────────

describe("resolveExternalUser: terminal denied", () => {
  it("denies with user_not_authorized when nothing matches and auto-create is off", async () => {
    state.selectRows = [[]];
    const result = await resolveExternalUser(baseParams());
    expect(result).toEqual({ user: null, action: "denied", deniedReason: "user_not_authorized" });
  });

  it("audits the sanitized externalId on the not-authorized path", async () => {
    state.selectRows = [[]];
    await resolveExternalUser(baseParams({ externalId: "ext<script>1" }));
    const denied = state.auditCalls.at(-1);
    expect(denied?.event).toBe("OIDC_LOGIN_FAILED");
    expect(denied?.details.reason).toBe("user_not_authorized");
    // sanitizeAuditInput strips < and > from the raw external id.
    expect(denied?.details.externalId).toBe("extscript1");
  });
});
