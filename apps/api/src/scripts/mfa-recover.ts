import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { closeDb, db, schema } from "../db/index.js";
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

const USAGE = `snapotter-admin: offline MFA recovery

Usage:
  snapotter-admin status                  Show the MFA policy and enrolled users
  snapotter-admin reset-mfa-policy        Set the MFA policy back to "optional"
  snapotter-admin disable-mfa <username>  Clear a user's TOTP enrollment
`;

export async function runRecoveryCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "status": {
      const { policy, enrolled } = await mfaStatus();
      console.log(`MFA policy: ${policy}`);
      console.log(
        enrolled.length
          ? `Enrolled users (${enrolled.length}): ${enrolled.join(", ")}`
          : "Enrolled users: none",
      );
      return 0;
    }
    case "reset-mfa-policy": {
      await resetMfaPolicy();
      console.log(
        'MFA policy reset to "optional". It applies on the next login; no restart needed.',
      );
      return 0;
    }
    case "disable-mfa": {
      const username = rest[0];
      if (!username) {
        console.error("Usage: snapotter-admin disable-mfa <username>");
        return 1;
      }
      const result = await disableUserMfa(username);
      if (result === "not-found") {
        console.error(`No user found with username "${username}".`);
        return 1;
      }
      if (result === "already-clear") {
        console.log(`MFA is already disabled for "${username}". Nothing to do.`);
        return 0;
      }
      console.log(`Cleared MFA enrollment for "${username}".`);
      return 0;
    }
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return 0;
    default:
      console.error(USAGE);
      return 1;
  }
}

// Run only when executed directly (tsx/node), not when imported by tests.
// Set process.exitCode and let the process end naturally after the pool drains,
// rather than process.exit(), so a piped confirmation line is never truncated.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRecoveryCli(process.argv.slice(2))
    .then(async (code) => {
      await closeDb();
      process.exitCode = code;
    })
    .catch(async (err) => {
      console.error(err instanceof Error ? err.message : err);
      await closeDb();
      process.exitCode = 1;
    });
}
