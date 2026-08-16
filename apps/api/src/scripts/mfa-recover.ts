import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { db, schema } from "../db/index.js";
import { auditLog } from "../lib/audit.js";
import { getSettingString, upsertSetting } from "../lib/settings-helpers.js";
import { clearUserMfa } from "../lib/user-mfa.js";

// auditLog's first parameter is a FastifyBaseLogger, but a CLI has no request.
// It only calls .info(obj, msg) and .warn(obj, msg), so a console-backed shim
// satisfies it. Cast through unknown because we intentionally implement only
// the two methods auditLog uses.
const cliLogger = {
  info: (obj: unknown, msg?: string) => console.log(`[audit] ${msg ?? ""}`.trim(), obj),
  warn: (obj: unknown, msg?: string) => console.warn(`[audit] ${msg ?? ""}`.trim(), obj),
} as unknown as FastifyBaseLogger;

/** Relax the instance MFA policy to "optional". Only ever writes "optional", so
 * this can never arm the enforcement trap. Takes effect on the next login. */
export async function resetMfaPolicy(): Promise<void> {
  await upsertSetting("mfaPolicy", "optional");
  await auditLog(cliLogger, "SETTINGS_UPDATED", {
    key: "mfaPolicy",
    value: "optional",
    via: "cli-recovery",
  });
}

export type DisableMfaResult = "cleared" | "already-clear" | "not-found";

/** Clear a single user's TOTP enrollment by username. Idempotent: an already
 * un-enrolled user (including a dangling pending secret) is handled cleanly. */
export async function disableUserMfa(username: string): Promise<DisableMfaResult> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!user) return "not-found";
  if (!user.totpEnabled && !user.totpSecret && !user.recoveryCodesHash) {
    return "already-clear";
  }
  await clearUserMfa(user.id);
  await auditLog(cliLogger, "MFA_RESET", {
    targetUserId: user.id,
    targetUsername: username,
    via: "cli",
  });
  return "cleared";
}

/** Read-only snapshot for diagnosing which login gate is blocking someone. */
export async function mfaStatus(): Promise<{ policy: string; enrolled: string[] }> {
  const policy = await getSettingString("mfaPolicy", "optional");
  const rows = await db
    .select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.totpEnabled, true));
  return { policy, enrolled: rows.map((r) => r.username) };
}
