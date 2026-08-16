import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  disableUserMfa,
  mfaStatus,
  resetMfaPolicy,
  runRecoveryCli,
} from "../../../apps/api/src/scripts/mfa-recover.js";

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

  it("returns 0 for status", async () => {
    expect(await runRecoveryCli(["status"])).toBe(0);
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
