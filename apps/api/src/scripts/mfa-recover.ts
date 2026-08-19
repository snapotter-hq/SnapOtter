import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { closeDb, db, schema } from "../db/index.js";
import { auditLog } from "../lib/audit.js";
import { upsertSetting } from "../lib/settings-helpers.js";
import { clearUserMfa } from "../lib/user-mfa.js";
import { getMfaPolicy, type MfaPolicy } from "../plugins/mfa.js";

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
export async function mfaStatus(): Promise<{
  policy: MfaPolicy | null;
  policyError?: string;
  enrolled: string[];
  enrolledError?: string;
}> {
  // The two login gates (the policy, and whether the user is enrolled) are read
  // independently, and each read is reported on its own. This command runs
  // mid-incident against a possibly-degraded DB, so a failed read must surface
  // as a failed read, never be swallowed. That is the #867 fix: getMfaPolicy
  // reads the settings row directly and throws on a DB fault, where the old
  // getSettingString path returned "optional". Reporting "optional" over a
  // stored "required" sends the operator to the wrong wall. A read that fails
  // leaves its value empty and records the cause; the other gate is still read
  // and reported, so a partial fault still tells the operator something useful.
  let policy: MfaPolicy | null = null;
  let policyError: string | undefined;
  try {
    policy = await getMfaPolicy();
  } catch (err) {
    policyError = err instanceof Error ? err.message : String(err);
  }

  let enrolled: string[] = [];
  let enrolledError: string | undefined;
  try {
    const rows = await db
      .select({ username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.totpEnabled, true));
    enrolled = rows.map((r) => r.username);
  } catch (err) {
    enrolledError = err instanceof Error ? err.message : String(err);
  }

  return { policy, policyError, enrolled, enrolledError };
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
      const { policy, policyError, enrolled, enrolledError } = await mfaStatus();
      // A failed read goes loud on stderr with a non-zero exit below, so it can
      // never read as "this gate is fine, look elsewhere" (#867).
      if (policyError) {
        console.error(`MFA policy: could not read (${policyError})`);
      } else {
        console.log(`MFA policy: ${policy}`);
      }
      if (enrolledError) {
        console.error(`Enrolled users: could not read (${enrolledError})`);
      } else {
        console.log(
          enrolled.length
            ? `Enrolled users (${enrolled.length}): ${enrolled.join(", ")}`
            : "Enrolled users: none",
        );
      }
      return policyError || enrolledError ? 1 : 0;
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
