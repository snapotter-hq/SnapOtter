import { randomInt, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config.js";
import { closeDb, db, schema } from "../db/index.js";
import { closeRedis, sharedRedis } from "../jobs/connection.js";
import { auditLog } from "../lib/audit.js";
import { loginThrottleKey } from "../lib/login-throttle.js";
import { normalizePassword } from "../lib/password-form.js";
import {
  getSettingStrict,
  parseNumericSettingValue,
  upsertSetting,
} from "../lib/settings-helpers.js";
import { clearUserMfa } from "../lib/user-mfa.js";
import { isDisabledRole } from "../permissions.js";
import {
  ensureBuiltinRoles,
  ensureDefaultTeam,
  hashPassword,
  validatePasswordStrength,
  validateUsername,
} from "../plugins/auth.js";
import { type MfaPolicy, readMfaPolicySetting } from "../plugins/mfa.js";

// auditLog's first parameter is a FastifyBaseLogger, but a CLI has no request.
// It only calls .info(obj, msg) and .warn(obj, msg), so a console-backed shim
// satisfies it. Cast through unknown because we intentionally implement only
// the two methods auditLog uses.
const cliLogger = {
  info: (obj: unknown, msg?: string) => console.log(`[audit] ${msg ?? ""}`.trim(), obj),
  warn: (obj: unknown, msg?: string) => console.warn(`[audit] ${msg ?? ""}`.trim(), obj),
} as unknown as FastifyBaseLogger;

const PASSWORD_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PASSWORD_LOWER = "abcdefghijklmnopqrstuvwxyz";
const PASSWORD_DIGITS = "0123456789";
const PASSWORD_SPECIAL = "!@#$%&*()-_=+";
const PASSWORD_ALL = PASSWORD_UPPER + PASSWORD_LOWER + DIGITS_AND_SPECIAL();
const DEFAULT_GENERATED_PASSWORD_LENGTH = 20;
const REDIS_CONNECT_TIMEOUT_MS = 5_000;

function DIGITS_AND_SPECIAL(): string {
  return PASSWORD_DIGITS + PASSWORD_SPECIAL;
}

function pickChar(chars: string): string {
  return chars[randomInt(chars.length)];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Delete the per-username login-throttle key in Redis without hanging on
 * ioredis's unbounded offlineQueue when Redis is unreachable.
 */
async function deleteThrottleKey(username: string): Promise<number> {
  const redis = sharedRedis() as unknown as {
    status?: string;
    del: (key: string) => Promise<number>;
    once?: (event: string, listener: (...args: unknown[]) => void) => void;
    off?: (event: string, listener: (...args: unknown[]) => void) => void;
  };
  if (
    redis.status &&
    redis.status !== "ready" &&
    typeof redis.once === "function" &&
    typeof redis.off === "function"
  ) {
    if (redis.status === "reconnecting" || redis.status === "end" || redis.status === "close") {
      throw new Error(`Redis is not connected (status: ${redis.status})`);
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out connecting to Redis"));
      }, REDIS_CONNECT_TIMEOUT_MS);
      timer.unref?.();
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const cleanup = () => {
        clearTimeout(timer);
        redis.off?.("ready", onReady);
        redis.off?.("error", onError);
      };
      redis.once?.("ready", onReady);
      redis.once?.("error", onError);
    });
  }
  return redis.del(loginThrottleKey(username));
}

async function closeRecoveryRedis(): Promise<void> {
  const redis = sharedRedis() as unknown as {
    status?: string;
    disconnect?: (reconnect?: boolean) => void;
  };
  if (redis.status && redis.status !== "ready" && typeof redis.disconnect === "function") {
    redis.disconnect(false);
  }
  await closeRedis();
}

/**
 * Generate a temporary password that satisfies every password-policy rule
 * (uppercase, lowercase, digit, special, and the stored passwordMinLength).
 */
export async function generateRecoveryPassword(): Promise<string> {
  const minLength = parseNumericSettingValue(
    "passwordMinLength",
    await getSettingStrict("passwordMinLength"),
    8,
  );
  const length = Math.max(DEFAULT_GENERATED_PASSWORD_LENGTH, minLength);
  const required = [
    pickChar(PASSWORD_UPPER),
    pickChar(PASSWORD_LOWER),
    pickChar(PASSWORD_DIGITS),
    pickChar(PASSWORD_SPECIAL),
  ];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () =>
    pickChar(PASSWORD_ALL),
  );
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

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

export type ResetPasswordResult =
  | { status: "reset"; generatedPassword?: string }
  | { status: "not-found" }
  | { status: "weak-password"; error: string };

/**
 * Reset a user's local password by username, revoking active sessions and API
 * keys and clearing any failed-login throttle window. When `newPassword` is
 * omitted, generates a temporary password that satisfies the instance policy.
 */
export async function resetUserPassword(
  username: string,
  newPassword?: string,
): Promise<ResetPasswordResult> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!user || user.id === "anonymous") {
    return { status: "not-found" };
  }

  let passwordToSet: string;
  let generatedPassword: string | undefined;
  if (newPassword !== undefined) {
    const pwError = await validatePasswordStrength(newPassword);
    if (pwError) {
      return { status: "weak-password", error: pwError.message };
    }
    passwordToSet = newPassword;
  } else {
    generatedPassword = await generateRecoveryPassword();
    passwordToSet = generatedPassword;
  }

  const passwordHash = await hashPassword(normalizePassword(passwordToSet));

  const updated = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .for("no key update");
    if (!locked) return null;

    await tx
      .update(schema.users)
      .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
    await tx.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, user.id));
    return locked;
  });

  if (!updated) {
    return { status: "not-found" };
  }

  try {
    await deleteThrottleKey(user.username);
  } catch (err) {
    console.warn(
      `Warning: password was reset for "${user.username}", but clearing the Redis login-throttle key failed (${errorMessage(err)}); run "snapotter-admin unlock-user ${user.username}" once Redis is reachable.`,
    );
  }

  if (isDisabledRole(updated.role)) {
    console.warn(
      `Warning: user "${user.username}" is currently disabled (${updated.role}); run "snapotter-admin unlock-user ${user.username}" before signing in.`,
    );
  }

  await auditLog(cliLogger, "PASSWORD_RESET", {
    targetUserId: user.id,
    targetUsername: user.username,
    via: "cli",
  });

  return { status: "reset", generatedPassword };
}

export type CreateAdminResult =
  | { status: "created"; username: string; generatedPassword?: string }
  | { status: "already-exists"; username: string }
  | { status: "invalid-username"; error: string }
  | { status: "weak-password"; error: string };

/**
 * Bootstrap a local admin account on an instance where no admin can log in.
 * Defaults `username` to `env.DEFAULT_USERNAME` and generates a temporary
 * password when omitted.
 */
export async function createAdminUser(
  username = env.DEFAULT_USERNAME,
  password?: string,
): Promise<CreateAdminResult> {
  const usernameError = validateUsername(username);
  if (usernameError) {
    return { status: "invalid-username", error: usernameError };
  }

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username));
  if (existing) {
    return { status: "already-exists", username };
  }

  let passwordToSet: string;
  let generatedPassword: string | undefined;
  if (password !== undefined) {
    const pwError = await validatePasswordStrength(password);
    if (pwError) {
      return { status: "weak-password", error: pwError.message };
    }
    passwordToSet = password;
  } else {
    generatedPassword = await generateRecoveryPassword();
    passwordToSet = generatedPassword;
  }

  await ensureDefaultTeam();
  await ensureBuiltinRoles();

  const [defaultTeam] = await db
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.name, "Default"));
  const teamId = defaultTeam?.id ?? schema.DEFAULT_TEAM_ID;

  const id = randomUUID();
  const passwordHash = await hashPassword(normalizePassword(passwordToSet));

  const inserted = await db
    .insert(schema.users)
    .values({
      id,
      username,
      passwordHash,
      role: "admin",
      team: teamId,
      mustChangePassword: true,
    })
    .onConflictDoNothing({ target: schema.users.username });

  if (!inserted.rowCount) {
    return { status: "already-exists", username };
  }

  try {
    await deleteThrottleKey(username);
  } catch (err) {
    console.warn(
      `Warning: admin user "${username}" was created, but clearing the Redis login-throttle key failed (${errorMessage(err)}).`,
    );
  }

  await auditLog(cliLogger, "USER_CREATED", {
    newUserId: id,
    newUsername: username,
    role: "admin",
    via: "cli",
  });

  return { status: "created", username, generatedPassword };
}

function restoredActiveRole(role: string): string {
  let restored = role;
  while (restored.startsWith("disabled:")) {
    restored = restored.slice("disabled:".length);
  }
  return restored && restored !== "disabled" ? restored : "user";
}

export type UnlockUserResult = "unlocked" | "already-clear" | "not-found";

/**
 * Clear a user's failed-login throttle window in Redis and restore their role
 * if the account was disabled.
 */
export async function unlockUser(username: string): Promise<UnlockUserResult> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!user || user.id === "anonymous") {
    return "not-found";
  }

  const roleOutcome = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        id: schema.users.id,
        role: schema.users.role,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .for("no key update");
    if (!locked) return null;
    if (!isDisabledRole(locked.role)) {
      return {
        wasDisabled: false,
        restoredRole: locked.role,
        hasPassword: Boolean(locked.passwordHash),
      };
    }
    const restoredRole = restoredActiveRole(locked.role);
    await tx
      .update(schema.users)
      .set({ role: restoredRole, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    return {
      wasDisabled: true,
      restoredRole,
      hasPassword: Boolean(locked.passwordHash),
    };
  });

  if (!roleOutcome) {
    return "not-found";
  }

  let removedThrottle = 0;
  try {
    removedThrottle = await deleteThrottleKey(user.username);
  } catch (err) {
    if (!roleOutcome.wasDisabled) {
      throw err;
    }
    console.warn(
      `Warning: re-enabled "${user.username}", but clearing the Redis login-throttle key failed (${errorMessage(err)}); re-run "snapotter-admin unlock-user ${user.username}" once Redis is reachable.`,
    );
  }

  if (!roleOutcome.wasDisabled && removedThrottle === 0) {
    return "already-clear";
  }

  if (roleOutcome.wasDisabled && !roleOutcome.hasPassword) {
    console.warn(
      `Warning: user "${user.username}" has no local password set; run "snapotter-admin reset-password ${user.username}" if local password login is needed.`,
    );
  }

  await auditLog(cliLogger, "USER_UPDATED", {
    targetUserId: user.id,
    targetUsername: user.username,
    ...(roleOutcome.wasDisabled && { changes: { role: roleOutcome.restoredRole } }),
    ...(removedThrottle > 0 && { loginThrottleCleared: true }),
    via: "cli",
  });

  return "unlocked";
}

/** Read-only snapshot for diagnosing which login gate is blocking someone. */
export async function mfaStatus(): Promise<{
  policy: MfaPolicy | null;
  unrecognizedPolicyValue?: string;
  policyError?: string;
  enrolled: string[];
  enrolledError?: string;
}> {
  // The two login gates (the policy, and whether the user is enrolled) are read
  // independently, and each read is reported on its own. This command runs
  // mid-incident against a possibly-degraded DB, so a failed read must surface
  // as a failed read, never be swallowed. That is the #867 fix: readMfaPolicySetting
  // reads the settings row directly and throws on a DB fault, where the old
  // getSettingString path returned "optional". Reporting "optional" over a
  // stored "required" sends the operator to the wrong wall. A read that fails
  // leaves its value empty and records the cause; the other gate is still read
  // and reported, so a partial fault still tells the operator something useful.
  //
  // A successful read of an unrecognized value (an out-of-band DB edit, wrong
  // casing like "REQUIRED") is reported distinctly too (#873): login enforces it
  // as "optional", but a bare "optional" would hide that the stored row is
  // garbage worth cleaning up. `unrecognizedPolicyValue` carries the raw string.
  let policy: MfaPolicy | null = null;
  let unrecognizedPolicyValue: string | undefined;
  let policyError: string | undefined;
  try {
    const { policy: enforced, raw, recognized } = await readMfaPolicySetting();
    policy = enforced;
    if (!recognized) unrecognizedPolicyValue = raw;
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

  return { policy, unrecognizedPolicyValue, policyError, enrolled, enrolledError };
}

const USAGE = `snapotter-admin: offline account and MFA recovery

Usage:
  snapotter-admin status                             Show the MFA policy and enrolled users
  snapotter-admin reset-mfa-policy                   Set the MFA policy back to "optional"
  snapotter-admin disable-mfa <username>             Clear a user's TOTP enrollment
  snapotter-admin reset-password <username> [pass]   Reset a user's password (generates one if omitted)
  snapotter-admin create-admin [username] [pass]     Bootstrap a new admin user
  snapotter-admin unlock-user <username>             Clear failed-login throttle and re-enable user
`;

function hasUnknownFlag(args: string[]): boolean {
  return args.some((arg) => arg.startsWith("-"));
}

export async function runRecoveryCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return 0;
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    console.log(USAGE);
    return 0;
  }

  switch (command) {
    case "status": {
      if (rest.length > 0) {
        console.error("Usage: snapotter-admin status");
        return 1;
      }
      const { policy, unrecognizedPolicyValue, policyError, enrolled, enrolledError } =
        await mfaStatus();
      // A failed read goes loud on stderr with a non-zero exit below, so it can
      // never read as "this gate is fine, look elsewhere" (#867). An unrecognized
      // stored value is surfaced the same way (#873): login enforces it as
      // "optional", but it is a data-integrity problem worth flagging, and a
      // non-zero exit keeps a scripted `status` from passing over it. The line
      // still names the effective policy so the operator knows login isn't the
      // blocker. JSON.stringify quotes the raw value so an empty or whitespace
      // string stays visible.
      if (policyError) {
        console.error(`MFA policy: could not read (${policyError})`);
      } else if (unrecognizedPolicyValue !== undefined) {
        console.error(
          `MFA policy: ${policy} (stored value ${JSON.stringify(unrecognizedPolicyValue)} is not a recognized policy; treated as ${policy})`,
        );
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
      return policyError || enrolledError || unrecognizedPolicyValue !== undefined ? 1 : 0;
    }
    case "reset-mfa-policy": {
      if (rest.length > 0) {
        console.error("Usage: snapotter-admin reset-mfa-policy");
        return 1;
      }
      await resetMfaPolicy();
      console.log(
        'MFA policy reset to "optional". It applies on the next login; no restart needed.',
      );
      return 0;
    }
    case "disable-mfa": {
      const username = rest[0];
      if (!username || rest.length > 1 || hasUnknownFlag(rest)) {
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
    case "reset-password": {
      const username = rest[0];
      const newPassword = rest[1];
      if (!username || rest.length > 2 || username.startsWith("-")) {
        console.error("Usage: snapotter-admin reset-password <username> [password]");
        return 1;
      }
      const result = await resetUserPassword(username, newPassword);
      if (result.status === "not-found") {
        console.error(`No user found with username "${username}".`);
        return 1;
      }
      if (result.status === "weak-password") {
        console.error(`Invalid password: ${result.error}`);
        return 1;
      }
      if (result.generatedPassword) {
        console.log(
          `Password reset for "${username}". Temporary password: ${result.generatedPassword} (password change required on next login).`,
        );
      } else {
        console.log(`Password reset for "${username}". Password change is required on next login.`);
      }
      return 0;
    }
    case "create-admin": {
      if (rest.length > 2 || rest[0]?.startsWith("-")) {
        console.error("Usage: snapotter-admin create-admin [username] [password]");
        return 1;
      }
      const username = rest[0] !== undefined ? rest[0] : env.DEFAULT_USERNAME;
      const password = rest[1];
      const result = await createAdminUser(username, password);
      if (result.status === "invalid-username") {
        console.error(`Invalid username: ${result.error}`);
        return 1;
      }
      if (result.status === "already-exists") {
        console.error(
          `User "${result.username}" already exists. Use reset-password or pass a different username.`,
        );
        return 1;
      }
      if (result.status === "weak-password") {
        console.error(`Invalid password: ${result.error}`);
        return 1;
      }
      if (result.generatedPassword) {
        console.log(
          `Created admin user "${result.username}". Temporary password: ${result.generatedPassword} (password change required on first login).`,
        );
      } else {
        console.log(
          `Created admin user "${result.username}" (password change required on first login).`,
        );
      }
      return 0;
    }
    case "unlock-user": {
      const username = rest[0];
      if (!username || rest.length > 1 || hasUnknownFlag(rest)) {
        console.error("Usage: snapotter-admin unlock-user <username>");
        return 1;
      }
      const result = await unlockUser(username);
      if (result === "not-found") {
        console.error(`No user found with username "${username}".`);
        return 1;
      }
      if (result === "already-clear") {
        console.log(`User "${username}" is not locked out. Nothing to do.`);
        return 0;
      }
      console.log(`Unlocked user "${username}".`);
      return 0;
    }
    default:
      console.error(USAGE);
      return 1;
  }
}

export async function runRecoveryMain(argv: string[]): Promise<void> {
  try {
    const code = await runRecoveryCli(argv);
    await closeRecoveryRedis();
    await closeDb();
    process.exitCode = code;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    await closeRecoveryRedis().catch(() => {});
    await closeDb().catch(() => {});
    process.exitCode = 1;
  }
}

// Run only when executed directly (tsx/node), not when imported by tests.
// Set process.exitCode and let the process end naturally after the pool drains,
// rather than process.exit(), so a piped confirmation line is never truncated.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runRecoveryMain(process.argv.slice(2));
}
