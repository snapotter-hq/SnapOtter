import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { loginThrottleKey } from "../../../apps/api/src/lib/login-throttle.js";
import { hashPassword, verifyPassword } from "../../../apps/api/src/plugins/auth.js";
import {
  createAdminUser,
  disableUserMfa,
  mfaStatus,
  resetMfaPolicy,
  resetUserPassword,
  runRecoveryCli,
  unlockUser,
} from "../../../apps/api/src/scripts/admin-recovery.js";

async function readPolicy(): Promise<string | undefined> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, "mfaPolicy"));
  return row?.value;
}

async function countAudit(action: string): Promise<number> {
  const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, action));
  return rows.length;
}

describe("resetMfaPolicy", () => {
  it("sets mfaPolicy to optional even when it was required", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });

    await resetMfaPolicy();

    expect(await readPolicy()).toBe("optional");
  });

  it("writes a SETTINGS_UPDATED audit row", async () => {
    const before = await countAudit("SETTINGS_UPDATED");
    await resetMfaPolicy();
    expect(await countAudit("SETTINGS_UPDATED")).toBe(before + 1);
  });
});

async function insertUser(
  opts: {
    role?: string;
    passwordHash?: string | null;
    mustChangePassword?: boolean;
    totpEnabled?: boolean;
    totpSecret?: string | null;
    recoveryCodesHash?: string | null;
  } = {},
) {
  const id = randomUUID();
  const username = `recover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.users).values({
    id,
    username,
    role: opts.role ?? "user",
    passwordHash: opts.passwordHash ?? null,
    mustChangePassword: opts.mustChangePassword ?? false,
    totpEnabled: opts.totpEnabled ?? false,
    totpSecret: opts.totpSecret ?? null,
    recoveryCodesHash: opts.recoveryCodesHash ?? null,
  });
  return { id, username };
}

describe("disableUserMfa", () => {
  it("clears an enrolled user's MFA columns and returns 'cleared'", async () => {
    const { id, username } = await insertUser({
      totpEnabled: true,
      totpSecret: "secret",
      recoveryCodesHash: "a,b",
    });
    const other = await insertUser({ totpEnabled: true, totpSecret: "other" });

    const result = await disableUserMfa(username);

    expect(result).toBe("cleared");
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row.totpEnabled).toBe(false);
    expect(row.totpSecret).toBeNull();
    expect(row.recoveryCodesHash).toBeNull();

    const [otherRow] = await db.select().from(schema.users).where(eq(schema.users.id, other.id));
    expect(otherRow.totpSecret).toBe("other");
  });

  it("clears a dangling pending enrollment (secret set, totpEnabled false)", async () => {
    const { id, username } = await insertUser({ totpEnabled: false, totpSecret: "pending" });
    const result = await disableUserMfa(username);
    expect(result).toBe("cleared");
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row.totpSecret).toBeNull();
  });

  it("returns 'already-clear' and writes no audit row when nothing is set", async () => {
    const { username } = await insertUser();
    const before = await countAudit("MFA_RESET");
    const result = await disableUserMfa(username);
    expect(result).toBe("already-clear");
    expect(await countAudit("MFA_RESET")).toBe(before);
  });

  it("returns 'not-found' for an unknown username", async () => {
    expect(await disableUserMfa("no-such-user-xyz")).toBe("not-found");
  });

  it("writes an MFA_RESET audit row targeting the user when cleared", async () => {
    const { id, username } = await insertUser({ totpEnabled: true, totpSecret: "s" });
    await disableUserMfa(username);
    const [row] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, "MFA_RESET"), eq(schema.auditLog.targetId, id)));
    expect(row).toBeDefined();
  });
});

describe("mfaStatus", () => {
  it("reports the current policy and enrolled usernames", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "admins_only" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "admins_only" } });
    const { username } = await insertUser({ totpEnabled: true, totpSecret: "s" });

    const status = await mfaStatus();

    expect(status.policy).toBe("admins_only");
    expect(status.enrolled).toContain(username);
  });
});

describe("runRecoveryCli", () => {
  it("returns 0 for reset-mfa-policy and relaxes the policy", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });
    const code = await runRecoveryCli(["reset-mfa-policy"]);
    expect(code).toBe(0);
    expect(await readPolicy()).toBe("optional");
  });

  it("returns 0 for status and prints the policy to stdout", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runRecoveryCli(["status"])).toBe(0);
      expect(logSpy).toHaveBeenCalledWith("MFA policy: required");
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("returns 1 for disable-mfa with no username", async () => {
    expect(await runRecoveryCli(["disable-mfa"])).toBe(1);
  });

  it("returns 1 for an unknown command", async () => {
    expect(await runRecoveryCli(["frobnicate"])).toBe(1);
  });

  it("returns 1 for no command", async () => {
    expect(await runRecoveryCli([])).toBe(1);
  });

  it("returns 0 for help", async () => {
    expect(await runRecoveryCli(["help"])).toBe(0);
  });
});

// #867: the status diagnostic must never report a failed policy read as
// "optional". An operator runs this mid-incident against a possibly-degraded
// DB; a swallowed read that prints "optional" over a stored "required" sends
// them to the wrong login wall.
describe("mfaStatus when the policy read fails (#867)", () => {
  // Fail only the settings {value} read (what getMfaPolicy issues); the
  // enrolled-users {username} read must still reach the real DB.
  function failSettingsRead(): ReturnType<typeof vi.spyOn> {
    const originalSelect = db.select.bind(db);
    return vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      const selection = args[0] as Record<string, unknown> | undefined;
      if (selection && "value" in selection) {
        throw new Error("simulated settings read failure");
      }
      // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real overloaded implementation
      return (originalSelect as any)(...args);
    });
  }

  it("reports the read failure instead of defaulting to optional, and still lists enrolled users", async () => {
    // Arm a required policy: a swallowed read would masquerade as "optional".
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });
    const { username } = await insertUser({ totpEnabled: true, totpSecret: "s" });

    const selectSpy = failSettingsRead();
    try {
      const status = await mfaStatus();
      expect(status.policy).toBeNull();
      expect(status.policyError).toContain("simulated settings read failure");
      // The independent enrollment gate is still reported.
      expect(status.enrolled).toContain(username);
    } finally {
      selectSpy.mockRestore();
    }
  });

  it("runRecoveryCli status exits 1 and prints a 'could not read' line when the policy read fails", async () => {
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value: "required" })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: "required" } });

    const selectSpy = failSettingsRead();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await runRecoveryCli(["status"]);
      expect(code).toBe(1);
      // The underlying cause must ride along, not just the "could not read"
      // label: the whole point is the operator sees WHY, so they don't read it
      // as "MFA is fine."
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining("MFA policy: could not read (simulated settings read failure)"),
      );
    } finally {
      selectSpy.mockRestore();
      errSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  // The recovery CLI's whole job is to run mid-incident against a degraded DB,
  // and a full outage is the most likely one. Both reads must then degrade to a
  // reported failure with a clean non-zero exit, never an unhandled rejection or
  // a masqueraded "optional".
  it("mfaStatus reports both reads as failed, without throwing, when the whole DB is down", async () => {
    const selectSpy = vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("whole DB down");
    });
    try {
      const status = await mfaStatus();
      expect(status.policy).toBeNull();
      expect(status.policyError).toContain("whole DB down");
      expect(status.enrolled).toEqual([]);
      expect(status.enrolledError).toContain("whole DB down");
    } finally {
      selectSpy.mockRestore();
    }
  });

  it("runRecoveryCli status resolves to 1 (never rejects) and reports both gates when the whole DB is down", async () => {
    const selectSpy = vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("whole DB down");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await runRecoveryCli(["status"]);
      expect(code).toBe(1);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("MFA policy: could not read"));
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining("Enrolled users: could not read"),
      );
    } finally {
      selectSpy.mockRestore();
      errSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

// #873: a *successful* read of an unrecognized stored mfaPolicy value (an
// out-of-band DB edit, wrong casing like "REQUIRED", a restored/tampered row)
// must be reported distinctly, not flattened to a bare "optional". Login treats
// such a value as optional too, so this is not a lockout mislead, but the
// operator must learn the stored row holds a garbage value worth cleaning up.
describe("mfaStatus with an unrecognized stored policy (#873)", () => {
  async function setRawPolicy(value: string): Promise<void> {
    await db
      .insert(schema.settings)
      .values({ key: "mfaPolicy", value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }

  it("reports the raw value alongside the enforced optional, without an error", async () => {
    await setRawPolicy("REQUIRED"); // wrong casing: not one of the three known policies

    const status = await mfaStatus();

    expect(status.policy).toBe("optional"); // what login actually enforces
    expect(status.unrecognizedPolicyValue).toBe("REQUIRED");
    expect(status.policyError).toBeUndefined();
  });

  it("does not flag a legitimately missing policy row as unrecognized", async () => {
    // A fresh install has no mfaPolicy row; that is a genuine "optional", not a
    // tampered value, and must never trip the unrecognized-value path.
    await db.delete(schema.settings).where(eq(schema.settings.key, "mfaPolicy"));

    const status = await mfaStatus();

    expect(status.policy).toBe("optional");
    expect(status.unrecognizedPolicyValue).toBeUndefined();
    expect(status.policyError).toBeUndefined();
  });

  it("runRecoveryCli status exits 1 and surfaces the raw value on stderr", async () => {
    await setRawPolicy("REQUIRED");

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await runRecoveryCli(["status"]);
      expect(code).toBe(1);
      // The line names the raw stored value and the effective policy, so the
      // operator sees both the anomaly and that login is not the blocker.
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('stored value "REQUIRED" is not a recognized policy'),
      );
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("MFA policy: optional"));
      // It must NOT also print a bare, authoritative-looking "optional" line.
      expect(logSpy).not.toHaveBeenCalledWith("MFA policy: optional");
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it("runRecoveryCli status stays clean (exit 0, stdout) for a legitimately missing row", async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "mfaPolicy"));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await runRecoveryCli(["status"])).toBe(0);
      expect(logSpy).toHaveBeenCalledWith("MFA policy: optional");
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

describe("resetUserPassword (#812)", () => {
  it("resets password with an explicit value, revokes sessions and API keys, clears login throttle, and writes PASSWORD_RESET", async () => {
    const oldHash = await hashPassword("OldValidPass1");
    const { id, username } = await insertUser({
      role: "admin",
      passwordHash: oldHash,
      mustChangePassword: false,
    });
    const sessionId = randomUUID();
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const keyId = randomUUID();
    await db.insert(schema.apiKeys).values({
      id: keyId,
      userId: id,
      keyHash: "hash",
      keyPrefix: "prefix1234567890",
      name: "Test Key",
    });
    await sharedRedis().zadd(loginThrottleKey(username), Date.now(), `${Date.now()}:1`);

    const result = await resetUserPassword(username, "NewValidPass1");

    expect(result).toEqual({ status: "reset", generatedPassword: undefined });
    const [updated] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(updated.passwordHash).toBeTruthy();
    expect(updated.passwordHash).not.toBe(oldHash);
    expect(await verifyPassword("NewValidPass1", updated.passwordHash ?? "")).toBe(true);
    expect(updated.mustChangePassword).toBe(true);

    const remainingSessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, id));
    expect(remainingSessions).toHaveLength(0);

    const remainingKeys = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, id));
    expect(remainingKeys).toHaveLength(0);

    expect(await sharedRedis().exists(loginThrottleKey(username))).toBe(0);

    const [auditRow] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, "PASSWORD_RESET"), eq(schema.auditLog.targetId, id)));
    expect(auditRow).toBeDefined();
    expect(auditRow.details).toMatchObject({
      targetUserId: id,
      targetUsername: username,
      via: "cli",
    });
  });

  it("generates a strong temporary password when newPassword is omitted", async () => {
    const { id, username } = await insertUser({ role: "admin" });

    const result = await resetUserPassword(username);

    expect(result.status).toBe("reset");
    if (result.status !== "reset") throw new Error("expected reset");
    expect(result.generatedPassword).toBeDefined();
    expect(result.generatedPassword?.length).toBeGreaterThanOrEqual(20);

    const [updated] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(await verifyPassword(result.generatedPassword ?? "", updated.passwordHash ?? "")).toBe(
      true,
    );
    expect(updated.mustChangePassword).toBe(true);
  });

  it("rejects a weak explicit password without mutating the user or writing an audit row", async () => {
    const oldHash = await hashPassword("OldValidPass1");
    const { id, username } = await insertUser({
      passwordHash: oldHash,
      mustChangePassword: false,
    });
    const beforeAudit = await countAudit("PASSWORD_RESET");

    const result = await resetUserPassword(username, "short");

    expect(result.status).toBe("weak-password");
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row.passwordHash).toBe(oldHash);
    expect(row.mustChangePassword).toBe(false);
    expect(await countAudit("PASSWORD_RESET")).toBe(beforeAudit);
  });

  it("returns not-found for an unknown username or the reserved anonymous user", async () => {
    expect(await resetUserPassword("no-such-user-xyz", "ValidPass1")).toEqual({
      status: "not-found",
    });
    expect(await resetUserPassword("anonymous", "ValidPass1")).toEqual({
      status: "not-found",
    });
  });
});

describe("createAdminUser (#812)", () => {
  it("creates an admin user with an explicit password and writes USER_CREATED", async () => {
    const username = `cli_admin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const result = await createAdminUser(username, "AdminBootstrap1");

    expect(result).toEqual({
      status: "created",
      username,
      generatedPassword: undefined,
    });

    const [created] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username));
    expect(created).toBeDefined();
    expect(created.role).toBe("admin");
    expect(created.mustChangePassword).toBe(true);
    expect(await verifyPassword("AdminBootstrap1", created.passwordHash ?? "")).toBe(true);

    const [auditRow] = await db
      .select()
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.action, "USER_CREATED"), eq(schema.auditLog.targetId, created.id)),
      );
    expect(auditRow).toBeDefined();
    expect(auditRow.details).toMatchObject({
      newUserId: created.id,
      newUsername: username,
      role: "admin",
      via: "cli",
    });
  });

  it("generates a strong password when password is omitted, and defaults username to env.DEFAULT_USERNAME", async () => {
    const customDefault = `def_admin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const prevDefault = env.DEFAULT_USERNAME;
    env.DEFAULT_USERNAME = customDefault;
    try {
      const result = await createAdminUser();
      expect(result.status).toBe("created");
      if (result.status !== "created") throw new Error("expected created");
      expect(result.username).toBe(customDefault);
      expect(result.generatedPassword).toBeDefined();
      expect(result.generatedPassword?.length).toBeGreaterThanOrEqual(20);

      const [created] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, customDefault));
      expect(created.role).toBe("admin");
      expect(await verifyPassword(result.generatedPassword ?? "", created.passwordHash ?? "")).toBe(
        true,
      );
    } finally {
      env.DEFAULT_USERNAME = prevDefault;
    }
  });

  it("returns already-exists when the username is already taken", async () => {
    const { username } = await insertUser({ role: "user" });
    const beforeAudit = await countAudit("USER_CREATED");

    const result = await createAdminUser(username, "AdminBootstrap1");

    expect(result).toEqual({ status: "already-exists", username });
    expect(await countAudit("USER_CREATED")).toBe(beforeAudit);
  });

  it("returns invalid-username for invalid or reserved usernames", async () => {
    const shortRes = await createAdminUser("ab", "AdminBootstrap1");
    expect(shortRes.status).toBe("invalid-username");

    const anonRes = await createAdminUser("anonymous", "AdminBootstrap1");
    expect(anonRes.status).toBe("invalid-username");

    const badCharRes = await createAdminUser("bad user!", "AdminBootstrap1");
    expect(badCharRes.status).toBe("invalid-username");
  });

  it("returns weak-password when an explicit password violates the policy", async () => {
    const username = `weak_admin_${Date.now()}`;
    const result = await createAdminUser(username, "weak");
    expect(result.status).toBe("weak-password");

    const [row] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    expect(row).toBeUndefined();
  });
});

describe("unlockUser (#812)", () => {
  it("clears the Redis login-throttle key for a throttled user and writes USER_UPDATED", async () => {
    const { id, username } = await insertUser({ role: "admin" });
    await sharedRedis().zadd(loginThrottleKey(username), Date.now(), `${Date.now()}:1`);

    const result = await unlockUser(username);

    expect(result).toBe("unlocked");
    expect(await sharedRedis().exists(loginThrottleKey(username))).toBe(0);

    const [auditRow] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, "USER_UPDATED"), eq(schema.auditLog.targetId, id)));
    expect(auditRow).toBeDefined();
    expect(auditRow.details).toMatchObject({
      targetUserId: id,
      targetUsername: username,
      via: "cli",
    });
  });

  it("restores a disabled user role and writes USER_UPDATED", async () => {
    const { id, username } = await insertUser({ role: "disabled:admin" });

    const result = await unlockUser(username);

    expect(result).toBe("unlocked");
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row.role).toBe("admin");

    const [auditRow] = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, "USER_UPDATED"), eq(schema.auditLog.targetId, id)));
    expect(auditRow).toBeDefined();
  });

  it("returns already-clear and writes no audit row when the user is neither throttled nor disabled", async () => {
    const { username } = await insertUser({ role: "admin" });
    const beforeAudit = await countAudit("USER_UPDATED");

    const result = await unlockUser(username);

    expect(result).toBe("already-clear");
    expect(await countAudit("USER_UPDATED")).toBe(beforeAudit);
  });

  it("returns not-found for an unknown username without touching its throttle key", async () => {
    const ghost = `ghost_${Date.now()}`;
    await sharedRedis().zadd(loginThrottleKey(ghost), Date.now(), `${Date.now()}:1`);
    try {
      expect(await unlockUser(ghost)).toBe("not-found");
      expect(await sharedRedis().exists(loginThrottleKey(ghost))).toBe(1);
    } finally {
      await sharedRedis().del(loginThrottleKey(ghost));
    }
  });
});

describe("runRecoveryCli for reset-password, create-admin, and unlock-user (#812)", () => {
  it("dispatches reset-password with explicit and generated passwords, and rejects missing/unknown/weak args", async () => {
    const { username } = await insertUser({ role: "admin" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runRecoveryCli(["reset-password"])).toBe(1);
      expect(await runRecoveryCli(["reset-password", "no-such-user"])).toBe(1);
      expect(await runRecoveryCli(["reset-password", username, "weak"])).toBe(1);
      expect(await runRecoveryCli(["reset-password", username, "NewValidPass1"])).toBe(0);
      expect(await runRecoveryCli(["reset-password", username])).toBe(0);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("dispatches create-admin and rejects duplicate/invalid/weak args", async () => {
    const username = `cli_create_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runRecoveryCli(["create-admin", "ab"])).toBe(1);
      expect(await runRecoveryCli(["create-admin", username, "weak"])).toBe(1);
      expect(await runRecoveryCli(["create-admin", username, "ValidPass1"])).toBe(0);
      expect(await runRecoveryCli(["create-admin", username, "ValidPass1"])).toBe(1);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("dispatches unlock-user for unlocked, already-clear, not-found, and missing username", async () => {
    const { username } = await insertUser({ role: "disabled:admin" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runRecoveryCli(["unlock-user"])).toBe(1);
      expect(await runRecoveryCli(["unlock-user", "no-such-user"])).toBe(1);
      expect(await runRecoveryCli(["unlock-user", username])).toBe(0);
      expect(await runRecoveryCli(["unlock-user", username])).toBe(0);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
