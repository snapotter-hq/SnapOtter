import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type Permission, SafeError } from "@snapotter/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as OTPAuth from "otpauth";
import { z } from "zod";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { sharedRedis } from "../jobs/connection.js";
import { auditFromRequest } from "../lib/audit.js";
import { decrypt, encrypt, isEncrypted } from "../lib/encryption.js";
import { isEnterpriseFeatureEnabled } from "../lib/enterprise-feature.js";
import { reportError } from "../lib/error-report.js";
import { logger } from "../lib/logger.js";
import {
  evictExcessUserSessions,
  readMaxSessionsPerUser,
  setSessionCookie,
} from "../lib/session-cookie.js";
import { clearUserMfa } from "../lib/user-mfa.js";
import {
  canManageTargetRole,
  getPermissions,
  isDisabledRole,
  requirePermission,
} from "../permissions.js";
import { createSessionToken, requireAuth } from "./auth.js";

// ── Constants ─────────────────────────────────────────────────────

const RECOVERY_CODE_COUNT = 8;
const SESSION_DURATION_MS = env.SESSION_DURATION_HOURS * 60 * 60 * 1000;
/** Wrong-code budget before a pending MFA challenge is burned (forces re-login). */
const MFA_MAX_FAILED_ATTEMPTS = 5;
/** Mirrors the 300s TTL set on `mfa:<token>` at login (auth/oidc/saml). */
const MFA_CHALLENGE_TTL_SECONDS = 300;

/**
 * Atomically reads and deletes a pending MFA challenge key along with its
 * remaining millisecond TTL so concurrent requests with the same token cannot
 * both verify a code, spend two recovery codes, or check guesses past the
 * failed-attempt budget (#2328).
 */
const CLAIM_MFA_CHALLENGE_LUA = `
local val = redis.call('GET', KEYS[1])
if not val then
  return nil
end
local ttl = redis.call('PTTL', KEYS[1])
redis.call('DEL', KEYS[1])
return { val, tostring(ttl) }
`;

/**
 * Atomically increments the failed-attempt counter and either burns the
 * challenge once the budget is reached or puts the challenge back for the
 * remainder of its original TTL.
 */
const FAIL_OR_RESTORE_MFA_CHALLENGE_LUA = `
local challengeKey = KEYS[1]
local attemptsKey = KEYS[2]
local payload = ARGV[1]
local ttlMs = tonumber(ARGV[2])
local maxAttempts = tonumber(ARGV[3])
local attemptsTtlSec = tonumber(ARGV[4])

local attempts = redis.call('INCR', attemptsKey)
if attempts == 1 then
  redis.call('EXPIRE', attemptsKey, attemptsTtlSec)
end
if attempts >= maxAttempts or ttlMs <= 0 then
  redis.call('DEL', challengeKey, attemptsKey)
  return attempts
end
redis.call('SET', challengeKey, payload, 'PX', ttlMs)
return attempts
`;

async function claimMfaChallenge(
  redis: ReturnType<typeof sharedRedis>,
  challengeKey: string,
): Promise<{ payload: string; ttlMs: number; claimedAt: number } | null> {
  const claimedAt = Date.now();
  const claimed = (await redis.eval(CLAIM_MFA_CHALLENGE_LUA, 1, challengeKey)) as
    | [string, string]
    | null;
  if (!claimed) return null;
  const [payload, ttlRaw] = claimed;
  const parsedTtl = Number(ttlRaw);
  const ttlMs = parsedTtl === -1 ? MFA_CHALLENGE_TTL_SECONDS * 1000 : Math.max(0, parsedTtl);
  return { payload, ttlMs, claimedAt };
}

async function restoreMfaChallenge(
  redis: ReturnType<typeof sharedRedis>,
  challengeKey: string,
  claimed: { payload: string; ttlMs: number; claimedAt: number },
): Promise<void> {
  const remainingTtlMs = claimed.ttlMs - (Date.now() - claimed.claimedAt);
  if (remainingTtlMs > 0) {
    try {
      await redis.set(challengeKey, claimed.payload, "PX", remainingTtlMs);
    } catch (rollbackErr) {
      logger.warn(
        { err: rollbackErr, challengeKey },
        "mfa: failed to restore challenge key after error",
      );
    }
  }
}

async function clearMfaAttempts(
  redis: ReturnType<typeof sharedRedis>,
  attemptsKey: string,
): Promise<void> {
  try {
    await redis.del(attemptsKey);
  } catch (err) {
    logger.warn({ err, attemptsKey }, "mfa: failed to delete attempts key");
  }
}

type FailedMfaAttemptOutcome = "restored" | "exhausted" | "expired";

async function recordFailedMfaAttempt(
  redis: ReturnType<typeof sharedRedis>,
  challengeKey: string,
  attemptsKey: string,
  claimed: { payload: string; ttlMs: number; claimedAt: number },
): Promise<FailedMfaAttemptOutcome> {
  const remainingTtlMs = claimed.ttlMs - (Date.now() - claimed.claimedAt);
  const attempts = Number(
    await redis.eval(
      FAIL_OR_RESTORE_MFA_CHALLENGE_LUA,
      2,
      challengeKey,
      attemptsKey,
      claimed.payload,
      String(remainingTtlMs),
      String(MFA_MAX_FAILED_ATTEMPTS),
      String(MFA_CHALLENGE_TTL_SECONDS),
    ),
  );
  if (attempts >= MFA_MAX_FAILED_ATTEMPTS) return "exhausted";
  if (remainingTtlMs <= 0) return "expired";
  return "restored";
}

// ── Zod schemas ───────────────────────────────────────────────────

const verifyCodeSchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
});

const completeSchema = z.object({
  mfaToken: z.string().uuid("Invalid MFA token"),
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
});

const enrollCompleteSchema = z.object({
  enrollmentToken: z.string().uuid("Invalid enrollment token"),
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
});

const disableSchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
});

// ── Recovery code helpers ─────────────────────────────────────────

/**
 * What a person types for a TOTP or recovery code, reduced to what is stored:
 * lowercase, no spaces or dashes. Used on both sides of the hash so a code
 * copied down as "A3F9-C01B" matches the stored "a3f9c01b" (#2050).
 */
export function normalizeMfaCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, "");
}

export function hashRecoveryCodes(codes: string[]): string {
  return codes.map((c) => createHash("sha256").update(normalizeMfaCode(c)).digest("hex")).join(",");
}

export function verifyRecoveryCode(
  code: string,
  hashList: string,
): { valid: boolean; remaining: string } {
  const hashes = hashList.split(",");
  const codeHash = createHash("sha256").update(normalizeMfaCode(code)).digest("hex");
  const idx = hashes.indexOf(codeHash);
  if (idx === -1) return { valid: false, remaining: hashList };
  hashes.splice(idx, 1);
  return { valid: true, remaining: hashes.join(",") };
}

/** What happened when a recovery code was offered at login. */
type RecoveryOutcome = "consumed" | "invalid" | "spent_concurrently";
type RecoveryCodeStore = Pick<typeof db, "update" | "select">;

/**
 * Spends a recovery code. "consumed" only if this call removed it from the
 * stored list: the write is conditional on the list that was read, so two logins
 * at once can't both spend the same code or write back a list that revives one
 * the other just spent (#2275).
 *
 * Losing the race re-reads the list and tries again. Each lost round means a
 * different code was spent, so the list shrinks by at least one and as many
 * rounds as there are hashes can't run out while the code is still spendable:
 * contention never refuses a valid code. "spent_concurrently" is the case where
 * the code was valid when read and gone when re-read, i.e. someone else used
 * this exact code in the same moment. It reads as a wrong code to the caller,
 * but is audited and logged apart, since two people holding one code is worth
 * seeing. The conditional update assumes READ COMMITTED, Postgres's default.
 */
export async function consumeRecoveryCode(
  userId: string,
  code: string,
  storedList: string,
  store: RecoveryCodeStore = db,
): Promise<RecoveryOutcome> {
  let list = storedList;
  const rounds = storedList.split(",").length;
  for (let round = 0; round < rounds; round++) {
    const result = verifyRecoveryCode(code, list);
    if (!result.valid) return round === 0 ? "invalid" : "spent_concurrently";
    const updated = await store
      .update(schema.users)
      .set({ recoveryCodesHash: result.remaining || null, updatedAt: new Date() })
      .where(and(eq(schema.users.id, userId), eq(schema.users.recoveryCodesHash, list)))
      .returning({ id: schema.users.id });
    if (updated.length > 0) return "consumed";
    const [fresh] = await store
      .select({ recoveryCodesHash: schema.users.recoveryCodesHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!fresh?.recoveryCodesHash) return "spent_concurrently";
    list = fresh.recoveryCodesHash;
  }
  return "spent_concurrently";
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => randomBytes(4).toString("hex"));
}

// ── TOTP helpers ──────────────────────────────────────────────────

export function createTotp(username: string, secretBase32?: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: "SnapOtter",
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secretBase32
      ? OTPAuth.Secret.fromBase32(secretBase32)
      : new OTPAuth.Secret({ size: 20 }),
  });
}

/**
 * Window in which a matched TOTP time step (counter + delta, with window=1 and
 * 30s period) could still fall inside a future validate() check: a step at
 * counter+1 remains in [counter'-1, counter'+1] until counter' passes counter+2
 * (up to 3 periods = 90s; 120s adds one full period of margin).
 */
const TOTP_REPLAY_WINDOW_SECONDS = 120;

const CONSUME_TOTP_STEP_LUA = `
local last = redis.call('GET', KEYS[1])
local step = tonumber(ARGV[1])
local ttlSec = tonumber(ARGV[2])
if last and step <= tonumber(last) then
  return nil
end
local prevTtl = -2
if last then
  prevTtl = redis.call('PTTL', KEYS[1])
end
redis.call('SET', KEYS[1], tostring(step), 'EX', ttlSec)
return { last or '', tostring(prevTtl) }
`;

const RESTORE_TOTP_STEP_LUA = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then
  return 0
end
local prevStep = ARGV[2]
local remainingTtlMs = tonumber(ARGV[3])
if prevStep ~= '' and remainingTtlMs > 0 then
  redis.call('SET', KEYS[1], prevStep, 'PX', remainingTtlMs)
else
  redis.call('DEL', KEYS[1])
end
return 1
`;

export function matchTotpStep(
  secretBase32: string,
  code: string,
  timestamp = Date.now(),
): number | null {
  const totp = createTotp("verify", secretBase32);
  // Allow 1-step window in either direction for clock drift
  const delta = totp.validate({ token: code, window: 1, timestamp });
  if (delta === null) return null;
  return totp.counter({ timestamp }) + delta;
}

export function verifyTotpCode(
  secretBase32: string,
  code: string,
  lastAcceptedStep?: number | null,
  timestamp = Date.now(),
): boolean {
  const step = matchTotpStep(secretBase32, code, timestamp);
  if (step === null) return false;
  if (lastAcceptedStep !== undefined && lastAcceptedStep !== null && step <= lastAcceptedStep) {
    return false;
  }
  return true;
}

function totpStepKey(userId: string, secretBase32: string): string {
  const secretFingerprint = createHash("sha256").update(secretBase32).digest("hex").slice(0, 16);
  return `mfa:totp-step:${userId}:${secretFingerprint}`;
}

interface ClaimedTotpStep {
  key: string;
  step: string;
  previousStep: string | null;
  previousTtlMs: number;
  claimedAt: number;
}

async function claimTotpStep(
  redis: ReturnType<typeof sharedRedis>,
  userId: string,
  secretBase32: string,
  code: string,
  timestamp = Date.now(),
): Promise<ClaimedTotpStep | null> {
  const step = matchTotpStep(secretBase32, code, timestamp);
  if (step === null) return null;
  const key = totpStepKey(userId, secretBase32);
  const stepStr = String(step);
  const claimedAt = Date.now();
  const claimed = (await redis.eval(
    CONSUME_TOTP_STEP_LUA,
    1,
    key,
    stepStr,
    String(TOTP_REPLAY_WINDOW_SECONDS),
  )) as [string, string] | null;
  if (!claimed) return null;
  const [prevRaw, prevTtlRaw] = claimed;
  const previousStep = prevRaw || null;
  const parsedTtl = Number(prevTtlRaw);
  const previousTtlMs =
    previousStep === null
      ? 0
      : parsedTtl === -1
        ? TOTP_REPLAY_WINDOW_SECONDS * 1000
        : Math.max(0, parsedTtl);
  return {
    key,
    step: stepStr,
    previousStep,
    previousTtlMs,
    claimedAt,
  };
}

async function restoreTotpStep(
  redis: ReturnType<typeof sharedRedis>,
  claimed: ClaimedTotpStep,
): Promise<void> {
  const remainingTtlMs =
    claimed.previousStep !== null
      ? Math.max(0, claimed.previousTtlMs - (Date.now() - claimed.claimedAt))
      : 0;
  try {
    await redis.eval(
      RESTORE_TOTP_STEP_LUA,
      1,
      claimed.key,
      claimed.step,
      claimed.previousStep ?? "",
      String(remainingTtlMs),
    );
  } catch (rollbackErr) {
    logger.warn(
      { err: rollbackErr, key: claimed.key },
      "mfa: failed to restore TOTP step key after error",
    );
  }
}

/**
 * Validates a TOTP code and atomically records its time step per user so the
 * same step (or any earlier step still inside the drift window) cannot be
 * replayed across challenges or routes (RFC 6238 section 5.2, #2327).
 */
export async function consumeTotpCode(
  userId: string,
  secretBase32: string,
  code: string,
  timestamp = Date.now(),
): Promise<boolean> {
  const claimed = await claimTotpStep(sharedRedis(), userId, secretBase32, code, timestamp);
  return claimed !== null;
}

async function encryptSecret(secretBase32: string): Promise<string> {
  if (env.DATA_ENCRYPTION_KEY) {
    return encrypt(secretBase32, env.DATA_ENCRYPTION_KEY);
  }
  return secretBase32;
}

/**
 * Decrypt a user's stored TOTP secret. When the ciphertext only opens with
 * DATA_ENCRYPTION_KEY_PREVIOUS (mid-rotation), re-encrypt and persist it under
 * DATA_ENCRYPTION_KEY so dropping the previous key later does not lock the user
 * out (#2033).
 */
export async function decryptSecret(userId: string, stored: string): Promise<string | null> {
  if (!isEncrypted(stored)) return stored;
  if (!env.DATA_ENCRYPTION_KEY) return null;

  const current = await decrypt(stored, env.DATA_ENCRYPTION_KEY);
  if (current !== null) return current;

  if (!env.DATA_ENCRYPTION_KEY_PREVIOUS) return null;
  const rotated = await decrypt(stored, env.DATA_ENCRYPTION_KEY_PREVIOUS);
  if (!rotated) return rotated;

  const reencrypted = await encryptSecret(rotated);
  await db
    .update(schema.users)
    .set({ totpSecret: reencrypted, updatedAt: new Date() })
    .where(and(eq(schema.users.id, userId), eq(schema.users.totpSecret, stored)));
  return rotated;
}

/**
 * A stored TOTP secret that won't decrypt means DATA_ENCRYPTION_KEY (and its
 * PREVIOUS key) no longer matches what enrolled it, so every enrolled user hits
 * this at once. The 500 body alone is invisible to an operator: log it and
 * report it as operational (#2020). request.log has no Sentry bridge, and the
 * reply is sent here rather than thrown, so the global handler never sees it.
 */
function replyDecryptionFailed(request: FastifyRequest, reply: FastifyReply, userId: string) {
  request.log.error(
    { userId },
    "mfa: stored TOTP secret could not be decrypted; check DATA_ENCRYPTION_KEY and DATA_ENCRYPTION_KEY_PREVIOUS",
  );
  void reportError(
    new SafeError("Failed to decrypt TOTP secret", {
      kind: "operational",
      code: "MFA_DECRYPTION_FAILED",
      statusCode: 500,
    }),
    {
      source: "http",
      route: request.routeOptions?.url,
      method: request.method,
      statusCode: 500,
      subsystem: "mfa-secret",
    },
  );
  return reply.status(500).send({
    error: "Failed to decrypt TOTP secret",
    code: "DECRYPTION_FAILED",
  });
}

// ── MFA policy helpers ────────────────────────────────────────────

export type MfaPolicy = "optional" | "admins_only" | "required";

/**
 * Read the stored `mfaPolicy` row and classify it. `policy` is what login
 * enforces; `recognized` is false only when the stored value is none of the
 * three known policies, which means the row was written out of band (a hand-run
 * UPDATE, a restored or tampered row, wrong casing like "REQUIRED"), since every
 * in-app write goes through a Zod-validated route.
 *
 * Deliberately not getSettingString: that helper swallows DB errors into its
 * default, which would silently disarm a required policy whenever the settings
 * read fails (#815). A missing row legitimately means "optional"; a failed read
 * must throw so login paths can fail closed.
 *
 * `getMfaPolicy` is the normalizing wrapper most callers want. The recovery CLI
 * uses `raw`/`recognized` to surface a garbage value instead of printing an
 * authoritative-looking "optional" over it (snapotter-hq/SnapOtter#873).
 */
export async function readMfaPolicySetting(): Promise<{
  policy: MfaPolicy;
  raw: string | undefined;
  recognized: boolean;
}> {
  const result = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, "mfaPolicy"))
    .limit(1);
  const raw = result[0]?.value;
  if (raw === "required" || raw === "admins_only") {
    return { policy: raw, raw, recognized: true };
  }
  // A missing row (undefined) legitimately means "optional", and so does a
  // stored "optional". Anything else is an out-of-band value: enforced as
  // optional, but flagged so it does not pass as a genuine one.
  const recognized = raw === undefined || raw === "optional";
  return { policy: "optional", raw, recognized };
}

export async function getMfaPolicy(): Promise<MfaPolicy> {
  const { policy, raw, recognized } = await readMfaPolicySetting();
  if (!recognized) {
    // Writes are Zod-validated, so an unrecognized stored value means the DB
    // was modified out of band. Treating it as "optional" disarms the policy,
    // which must at least be loud (it is indistinguishable from tampering).
    logger.warn(
      { value: raw },
      "mfaPolicy setting holds an unrecognized value; treating as optional",
    );
  }
  return policy;
}

export function isMfaRequiredForUser(policy: MfaPolicy, userRole: string): boolean {
  if (policy === "required") return true;
  if (policy === "admins_only" && userRole === "admin") return true;
  return false;
}

// The post-authentication MFA decision, shared by every login path (local
// password, OIDC, SAML) so a new auth method can't silently diverge from the
// others the way OIDC/SAML once did (they blocked on policy alone, with no
// totpEnabled check and no challenge step -- snapotter-hq/SnapOtter#533).
//
// "unavailable" is the fail-closed sentinel for a failed policy READ (#815):
// callers map a getMfaPolicy() rejection to it instead of guessing a policy.
// An unenrolled user is then denied ("policy_unavailable"), because the
// stored policy may well be "required". An enrolled user still gets the
// challenge: TOTP is at least as strict as any policy, so a flaky settings
// read can't lock out enrolled users (including the admin, mid-incident).
export type ExternalMfaOutcome =
  | "proceed"
  | "challenge"
  | "enrollment_required"
  | "policy_unavailable";

export function resolveExternalLoginMfaOutcome(
  policy: MfaPolicy | "unavailable",
  userRole: string,
  totpEnabled: boolean,
): ExternalMfaOutcome {
  if (totpEnabled) return "challenge";
  if (policy === "unavailable") return "policy_unavailable";
  if (isMfaRequiredForUser(policy, userRole)) return "enrollment_required";
  return "proceed";
}

/**
 * Start a forced TOTP enrollment for a user who just passed password auth but
 * is blocked by a required MFA policy without an enrollment. Mirrors the enroll
 * route's pending-secret storage, but keyed by a short-lived redis token so it
 * can complete without a session. Returns null when MFA is not licensed (the
 * caller keeps the hard 403 in that case).
 */
export async function beginForcedEnrollment(user: {
  id: string;
  username: string;
  passwordHash: string | null;
}): Promise<{ enrollmentToken: string; uri: string; recoveryCodes: string[] } | null> {
  const mfaLicensed = await isEnterpriseFeatureEnabled("mfa");
  if (!mfaLicensed) return null;

  const totp = createTotp(user.username);
  const recoveryCodes = generateRecoveryCodes();
  const encryptedSecret = await encryptSecret(totp.secret.base32);

  await db
    .update(schema.users)
    .set({
      totpSecret: encryptedSecret,
      totpEnabled: false,
      recoveryCodesHash: hashRecoveryCodes(recoveryCodes),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id));

  const enrollmentToken = randomUUID();
  let payload = user.id;
  if (user.passwordHash) {
    const { createHash } = await import("node:crypto");
    const hashFingerprint = createHash("sha256")
      .update(user.passwordHash)
      .digest("hex")
      .substring(0, 16);
    payload = `${user.id}:${hashFingerprint}`;
  }
  await sharedRedis().setex(`mfa:enroll:${enrollmentToken}`, MFA_CHALLENGE_TTL_SECONDS, payload);
  return { enrollmentToken, uri: totp.toString(), recoveryCodes };
}

// ── MFA plugin registration ───────────────────────────────────────

export async function registerMfa(app: FastifyInstance): Promise<void> {
  // POST /api/auth/mfa/enroll -- start MFA enrollment
  app.post(
    "/api/auth/mfa/enroll",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      // Check enterprise feature gate
      const mfaLicensed = await isEnterpriseFeatureEnabled("mfa");

      if (!mfaLicensed) {
        return reply.status(403).send({
          error: "MFA requires an enterprise license",
          code: "FEATURE_NOT_LICENSED",
        });
      }

      // Check if already enrolled
      const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      if (!dbUser) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }
      if (dbUser.totpEnabled) {
        return reply.status(409).send({
          error: "MFA is already enabled. Disable it first to re-enroll.",
          code: "MFA_ALREADY_ENABLED",
        });
      }

      // A pending (unverified) enrollment from an earlier attempt the user
      // canceled or abandoned is intentionally overwritten below rather than
      // blocked: it was never activated, so nothing depends on it, and
      // starting fresh is strictly safer than leaving a stale, possibly
      // already-screenshotted QR code valid.

      // Generate TOTP secret
      const totp = createTotp(user.username);
      const uri = totp.toString();

      // Generate recovery codes
      const recoveryCodes = generateRecoveryCodes();
      const recoveryHash = hashRecoveryCodes(recoveryCodes);

      // Encrypt TOTP secret for storage
      const encryptedSecret = await encryptSecret(totp.secret.base32);

      // Store pending enrollment (not yet active)
      await db
        .update(schema.users)
        .set({
          totpSecret: encryptedSecret,
          totpEnabled: false,
          recoveryCodesHash: recoveryHash,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id));

      return reply.send({ uri, recoveryCodes });
    },
  );

  // POST /api/auth/mfa/verify -- confirm enrollment with a TOTP code
  app.post(
    "/api/auth/mfa/verify",
    {
      config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const parsed = verifyCodeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "A valid TOTP code is required",
          code: "VALIDATION_ERROR",
        });
      }
      const code = normalizeMfaCode(parsed.data.code);
      if (!code) {
        return reply.status(400).send({
          error: "A valid TOTP code is required",
          code: "VALIDATION_ERROR",
        });
      }

      const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      if (!dbUser?.totpSecret) {
        return reply.status(400).send({
          error: "No pending MFA enrollment found. Call /api/auth/mfa/enroll first.",
          code: "NO_PENDING_ENROLLMENT",
        });
      }
      if (dbUser.totpEnabled) {
        return reply.status(409).send({
          error: "MFA is already verified and active",
          code: "MFA_ALREADY_ENABLED",
        });
      }

      // Decrypt the stored secret
      const secretBase32 = await decryptSecret(user.id, dbUser.totpSecret);
      if (!secretBase32) return replyDecryptionFailed(request, reply, user.id);

      const audit = auditFromRequest(request);

      // Validate the code and record its time step so it cannot be replayed (#2574)
      const redis = sharedRedis();
      const claimedStep = await claimTotpStep(redis, user.id, secretBase32, code);
      if (!claimedStep) {
        await audit("MFA_VERIFY_FAILED", { userId: user.id, username: user.username });
        return reply.status(401).send({
          error: "Invalid TOTP code",
          code: "INVALID_CODE",
        });
      }

      // Activate MFA (if the DB write fails, release the consumed step so a retry
      // within the same 30s window is not rejected as a replay)
      try {
        await db
          .update(schema.users)
          .set({ totpEnabled: true, updatedAt: new Date() })
          .where(eq(schema.users.id, user.id));
      } catch (err) {
        await restoreTotpStep(redis, claimedStep);
        throw err;
      }

      await audit("MFA_ENROLLED", { userId: user.id, username: user.username });

      return reply.send({ ok: true });
    },
  );

  // POST /api/auth/mfa/complete -- complete login with TOTP code
  app.post(
    "/api/auth/mfa/complete",
    {
      config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = completeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "MFA token and code are required",
          code: "VALIDATION_ERROR",
        });
      }
      const { mfaToken } = parsed.data;
      // One normalization for both kinds of code, so "123 456" and "A3F9-C01B"
      // behave the same as what the form sends. A code that is empty once
      // cleaned up can't be valid, so it is refused without costing an attempt.
      const code = normalizeMfaCode(parsed.data.code);
      if (!code) {
        return reply.status(400).send({
          error: "MFA token and code are required",
          code: "VALIDATION_ERROR",
        });
      }

      // Atomically claim the pending MFA challenge in Redis so concurrent
      // requests with the same token cannot both verify or exceed the attempt cap.
      const redis = sharedRedis();
      const challengeKey = `mfa:${mfaToken}`;
      const attemptsKey = `mfa:attempts:${mfaToken}`;
      const claimed = await claimMfaChallenge(redis, challengeKey);
      if (!claimed) {
        return reply.status(401).send({
          error: "MFA challenge expired or invalid",
          code: "MFA_EXPIRED",
        });
      }

      const [userId, hashFingerprint] = claimed.payload.split(":");

      let dbUser: typeof schema.users.$inferSelect | undefined;
      let secretBase32: string | null = null;
      let claimedStep: ClaimedTotpStep | null = null;
      let maxSessions = 0;
      let verified = false;
      let recoveryCandidate: string | null = null;

      try {
        // Load user
        [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId));

        if (!dbUser) {
          await clearMfaAttempts(redis, attemptsKey);
          return reply.status(401).send({
            error: "MFA challenge expired or invalid",
            code: "MFA_EXPIRED",
          });
        }

        if (hashFingerprint && dbUser.passwordHash) {
          const { createHash } = await import("node:crypto");
          const currentFingerprint = createHash("sha256")
            .update(dbUser.passwordHash)
            .digest("hex")
            .substring(0, 16);
          if (currentFingerprint !== hashFingerprint) {
            await clearMfaAttempts(redis, attemptsKey);
            const audit = auditFromRequest(request);
            await audit("MFA_VERIFY_FAILED", {
              userId: dbUser.id,
              username: dbUser.username,
              reason: "password_changed",
            });
            return reply.status(401).send({
              error: "MFA challenge expired or invalid",
              code: "MFA_EXPIRED",
            });
          }
        }
        if (isDisabledRole(dbUser.role)) {
          await clearMfaAttempts(redis, attemptsKey);
          const audit = auditFromRequest(request);
          await audit("MFA_VERIFY_FAILED", {
            userId: dbUser.id,
            username: dbUser.username,
            reason: "disabled_user",
          });
          return reply.status(403).send({
            error: "User is disabled",
            code: "USER_DISABLED",
          });
        }
        if (hashFingerprint && !dbUser.passwordHash) {
          await clearMfaAttempts(redis, attemptsKey);
          const audit = auditFromRequest(request);
          await audit("MFA_VERIFY_FAILED", {
            userId: dbUser.id,
            username: dbUser.username,
            reason: "password_removed",
          });
          return reply.status(401).send({
            error: "MFA challenge expired or invalid",
            code: "MFA_EXPIRED",
          });
        }
        if (!dbUser.totpSecret) {
          await clearMfaAttempts(redis, attemptsKey);
          return reply.status(401).send({
            error: "User not found or MFA not configured",
            code: "MFA_NOT_CONFIGURED",
          });
        }

        // Read before consuming a recovery code or TOTP step so a failed
        // settings query restores the challenge without burning one-time
        // credentials (#2540).
        maxSessions = await readMaxSessionsPerUser();

        // Check recovery code first so a user can still sign in when the stored
        // TOTP secret cannot be decrypted (#2034). The database write that spends
        // the recovery code runs inside the session transaction below so a failed
        // or aborted transaction rolls it back (#2602).
        if (dbUser.recoveryCodesHash && verifyRecoveryCode(code, dbUser.recoveryCodesHash).valid) {
          recoveryCandidate = dbUser.recoveryCodesHash;
          verified = true;
        }

        if (!verified) {
          // Decrypt the stored secret
          secretBase32 = await decryptSecret(userId, dbUser.totpSecret);
          if (!secretBase32) {
            await restoreMfaChallenge(redis, challengeKey, claimed);
            return replyDecryptionFailed(request, reply, userId);
          }

          // Try TOTP code (atomically refusing a replayed or earlier time step)
          claimedStep = await claimTotpStep(redis, userId, secretBase32, code);
          if (claimedStep) {
            verified = true;
          }
        }
      } catch (err) {
        if (claimedStep) {
          await restoreTotpStep(redis, claimedStep);
        }
        await restoreMfaChallenge(redis, challengeKey, claimed);
        throw err;
      }

      const audit = auditFromRequest(request);
      const verifiedUser = dbUser;

      const replyInvalidMfaCode = async (recoveryRace: boolean) => {
        // Burn the challenge after a few wrong codes so an attacker who already
        // holds valid credentials cannot grind TOTP guesses within the challenge
        // window, or put the challenge back if attempts remain.
        const attemptOutcome = await recordFailedMfaAttempt(
          redis,
          challengeKey,
          attemptsKey,
          claimed,
        );
        await audit("MFA_VERIFY_FAILED", {
          userId,
          username: verifiedUser.username,
          ...(recoveryRace && { reason: "recovery_code_spent_concurrently" }),
        });
        if (attemptOutcome === "exhausted") {
          return reply.status(401).send({
            error: "Too many invalid codes; MFA challenge expired",
            code: "MFA_ATTEMPTS_EXHAUSTED",
          });
        }
        if (attemptOutcome === "expired") {
          return reply.status(401).send({
            error: "MFA challenge expired or invalid",
            code: "MFA_EXPIRED",
          });
        }
        return reply.status(401).send({
          error: "Invalid TOTP or recovery code",
          code: "INVALID_CODE",
        });
      };

      if (!verified) {
        return replyInvalidMfaCode(false);
      }

      // Create session (same as normal login completion)
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      let inserted:
        | {
            status: "success";
            role: string;
            permissions: Permission[];
            teamName: string;
          }
        | {
            status:
              | "password_changed"
              | "password_removed"
              | "user_disabled"
              | "user_deleted"
              | "recovery_spent_concurrently";
          };
      try {
        inserted = await db.transaction(async (tx) => {
          const [lockedUser] = await tx
            .select({
              passwordHash: schema.users.passwordHash,
              role: schema.users.role,
              team: schema.users.team,
            })
            .from(schema.users)
            .where(eq(schema.users.id, verifiedUser.id))
            .for(recoveryCandidate ? "no key update" : "share");

          if (!lockedUser) {
            return { status: "user_deleted" as const };
          }

          const passwordMismatch = hashFingerprint
            ? (lockedUser.passwordHash
                ? createHash("sha256")
                    .update(lockedUser.passwordHash)
                    .digest("hex")
                    .substring(0, 16)
                : null) !== hashFingerprint
            : lockedUser.passwordHash !== verifiedUser.passwordHash;
          if (passwordMismatch) {
            return {
              status: lockedUser.passwordHash
                ? ("password_changed" as const)
                : isDisabledRole(lockedUser.role)
                  ? ("user_disabled" as const)
                  : ("password_removed" as const),
            };
          }

          if (isDisabledRole(lockedUser.role)) {
            return { status: "user_disabled" as const };
          }

          if (recoveryCandidate) {
            const outcome = await consumeRecoveryCode(verifiedUser.id, code, recoveryCandidate, tx);
            if (outcome !== "consumed") {
              return { status: "recovery_spent_concurrently" as const };
            }
          }

          await tx.insert(schema.sessions).values({
            id: token,
            userId: verifiedUser.id,
            expiresAt,
          });

          await evictExcessUserSessions(tx, verifiedUser.id, maxSessions, token);

          const [teamRow] = await tx
            .select()
            .from(schema.teams)
            .where(eq(schema.teams.id, lockedUser.team));
          const permissions = await getPermissions(lockedUser.role, tx);

          return {
            status: "success" as const,
            role: lockedUser.role,
            permissions,
            teamName: teamRow?.name ?? lockedUser.team,
          };
        });
      } catch (err) {
        if (claimedStep) {
          await restoreTotpStep(redis, claimedStep);
        }
        await restoreMfaChallenge(redis, challengeKey, claimed);
        throw err;
      }

      if (inserted.status === "recovery_spent_concurrently") {
        logger.warn({ userId }, "A recovery code was used by two logins at once; refusing one");
        return replyInvalidMfaCode(true);
      }

      // Clear any failed-attempt counter once the transaction finishes (the
      // challenge key was deleted on claim).
      await clearMfaAttempts(redis, attemptsKey);

      if (inserted.status !== "success") {
        if (claimedStep) {
          await restoreTotpStep(redis, claimedStep);
        }
        if (inserted.status === "user_disabled") {
          await audit("MFA_VERIFY_FAILED", {
            userId: verifiedUser.id,
            username: verifiedUser.username,
            reason: "disabled_user",
          });
          return reply.status(403).send({
            error: "User is disabled",
            code: "USER_DISABLED",
          });
        }
        await audit("MFA_VERIFY_FAILED", {
          userId: verifiedUser.id,
          username: verifiedUser.username,
          reason: inserted.status,
        });
        return reply.status(401).send({
          error: "MFA challenge expired or invalid",
          code: "MFA_EXPIRED",
        });
      }

      await audit(recoveryCandidate ? "MFA_RECOVERY_USED" : "MFA_VERIFIED", {
        userId: verifiedUser.id,
        username: verifiedUser.username,
      });

      setSessionCookie(request, reply, token);

      return reply.send({
        token,
        user: {
          id: verifiedUser.id,
          username: verifiedUser.username,
          role: inserted.role,
          mustChangePassword: env.SKIP_MUST_CHANGE_PASSWORD
            ? false
            : verifiedUser.mustChangePassword,
          permissions: inserted.permissions,
          teamName: inserted.teamName,
        },
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  // POST /api/auth/mfa/enroll-complete confirms a forced enrollment started at
  // login (snapotter-hq/SnapOtter#811) and mints a session. Not session-gated:
  // the whole point is that the user has no session yet. Keyed on a short-lived
  // redis enroll token instead. Only a TOTP code is accepted for the initial
  // confirmation (never a recovery code), same as the self-service verify route.
  app.post(
    "/api/auth/mfa/enroll-complete",
    {
      config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = enrollCompleteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Enrollment token and code are required",
          code: "VALIDATION_ERROR",
        });
      }
      const { enrollmentToken } = parsed.data;
      const code = normalizeMfaCode(parsed.data.code);
      if (!code) {
        return reply.status(400).send({
          error: "Enrollment token and code are required",
          code: "VALIDATION_ERROR",
        });
      }

      const redis = sharedRedis();
      const challengeKey = `mfa:enroll:${enrollmentToken}`;
      const attemptsKey = `mfa:enroll:attempts:${enrollmentToken}`;
      const claimed = await claimMfaChallenge(redis, challengeKey);
      if (!claimed) {
        return reply.status(401).send({
          error: "Enrollment challenge expired or invalid",
          code: "MFA_EXPIRED",
        });
      }

      const [userId, hashFingerprint] = claimed.payload.split(":");

      let dbUser: typeof schema.users.$inferSelect | undefined;
      let secretBase32: string | null = null;
      let claimedStep: ClaimedTotpStep | null = null;
      let maxSessions = 0;

      try {
        [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId));

        if (!dbUser) {
          await clearMfaAttempts(redis, attemptsKey);
          return reply.status(401).send({
            error: "Enrollment challenge expired or invalid",
            code: "MFA_EXPIRED",
          });
        }

        if (hashFingerprint && dbUser.passwordHash) {
          const { createHash } = await import("node:crypto");
          const currentFingerprint = createHash("sha256")
            .update(dbUser.passwordHash)
            .digest("hex")
            .substring(0, 16);
          if (currentFingerprint !== hashFingerprint) {
            await clearMfaAttempts(redis, attemptsKey);
            const audit = auditFromRequest(request);
            await audit("MFA_VERIFY_FAILED", {
              userId: dbUser.id,
              username: dbUser.username,
              reason: "password_changed",
            });
            return reply.status(401).send({
              error: "Enrollment challenge expired or invalid",
              code: "MFA_EXPIRED",
            });
          }
        }
        if (isDisabledRole(dbUser.role)) {
          await clearMfaAttempts(redis, attemptsKey);
          const audit = auditFromRequest(request);
          await audit("MFA_VERIFY_FAILED", {
            userId: dbUser.id,
            username: dbUser.username,
            reason: "disabled_user",
          });
          return reply.status(403).send({
            error: "User is disabled",
            code: "USER_DISABLED",
          });
        }
        if (hashFingerprint && !dbUser.passwordHash) {
          await clearMfaAttempts(redis, attemptsKey);
          const audit = auditFromRequest(request);
          await audit("MFA_VERIFY_FAILED", {
            userId: dbUser.id,
            username: dbUser.username,
            reason: "password_removed",
          });
          return reply.status(401).send({
            error: "Enrollment challenge expired or invalid",
            code: "MFA_EXPIRED",
          });
        }
        if (!dbUser.totpSecret) {
          await clearMfaAttempts(redis, attemptsKey);
          return reply.status(401).send({
            error: "User not found or MFA not configured",
            code: "MFA_NOT_CONFIGURED",
          });
        }
        if (dbUser.totpEnabled) {
          await clearMfaAttempts(redis, attemptsKey);
          // Defensive: the pending secret should be inactive at this point.
          return reply.status(409).send({
            error: "MFA is already verified and active",
            code: "MFA_ALREADY_ENABLED",
          });
        }

        maxSessions = await readMaxSessionsPerUser();

        secretBase32 = await decryptSecret(userId, dbUser.totpSecret);
        if (!secretBase32) {
          await restoreMfaChallenge(redis, challengeKey, claimed);
          return replyDecryptionFailed(request, reply, userId);
        }

        claimedStep = await claimTotpStep(redis, userId, secretBase32, code);
      } catch (err) {
        if (claimedStep) {
          await restoreTotpStep(redis, claimedStep);
        }
        await restoreMfaChallenge(redis, challengeKey, claimed);
        throw err;
      }

      const audit = auditFromRequest(request);

      if (!claimedStep) {
        // Burn the enrollment after a few wrong codes so an attacker who already
        // holds valid credentials cannot grind TOTP guesses within the window,
        // or put the challenge back if attempts remain.
        const attemptOutcome = await recordFailedMfaAttempt(
          redis,
          challengeKey,
          attemptsKey,
          claimed,
        );
        await audit("MFA_VERIFY_FAILED", { userId, username: dbUser.username });
        if (attemptOutcome === "exhausted") {
          return reply.status(401).send({
            error: "Too many invalid codes; enrollment challenge expired",
            code: "MFA_ATTEMPTS_EXHAUSTED",
          });
        }
        if (attemptOutcome === "expired") {
          return reply.status(401).send({
            error: "Enrollment challenge expired or invalid",
            code: "MFA_EXPIRED",
          });
        }
        return reply.status(401).send({
          error: "Invalid TOTP code",
          code: "INVALID_CODE",
        });
      }

      // Activate MFA and create a session atomically inside the password-check transaction.
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
      const verifiedUser = dbUser;

      let inserted:
        | {
            status: "success";
            role: string;
            permissions: Permission[];
            teamName: string;
          }
        | { status: "password_changed" | "password_removed" | "user_disabled" | "user_deleted" };
      try {
        inserted = await db.transaction(async (tx) => {
          const [lockedUser] = await tx
            .select({
              passwordHash: schema.users.passwordHash,
              role: schema.users.role,
              team: schema.users.team,
            })
            .from(schema.users)
            .where(eq(schema.users.id, verifiedUser.id))
            .for("share");

          if (!lockedUser) {
            return { status: "user_deleted" as const };
          }

          const passwordMismatch = hashFingerprint
            ? (lockedUser.passwordHash
                ? createHash("sha256")
                    .update(lockedUser.passwordHash)
                    .digest("hex")
                    .substring(0, 16)
                : null) !== hashFingerprint
            : lockedUser.passwordHash !== verifiedUser.passwordHash;
          if (passwordMismatch) {
            return {
              status: lockedUser.passwordHash
                ? ("password_changed" as const)
                : isDisabledRole(lockedUser.role)
                  ? ("user_disabled" as const)
                  : ("password_removed" as const),
            };
          }

          if (isDisabledRole(lockedUser.role)) {
            return { status: "user_disabled" as const };
          }

          await tx
            .update(schema.users)
            .set({ totpEnabled: true, updatedAt: new Date() })
            .where(eq(schema.users.id, verifiedUser.id));

          await tx.insert(schema.sessions).values({
            id: token,
            userId: verifiedUser.id,
            expiresAt,
          });

          await evictExcessUserSessions(tx, verifiedUser.id, maxSessions, token);

          const [teamRow] = await tx
            .select()
            .from(schema.teams)
            .where(eq(schema.teams.id, lockedUser.team));
          const permissions = await getPermissions(lockedUser.role, tx);

          return {
            status: "success" as const,
            role: lockedUser.role,
            permissions,
            teamName: teamRow?.name ?? lockedUser.team,
          };
        });
      } catch (err) {
        await restoreTotpStep(redis, claimedStep);
        await restoreMfaChallenge(redis, challengeKey, claimed);
        throw err;
      }

      // Clear any failed-attempt counter once the transaction finishes (the
      // challenge key was deleted on claim).
      await clearMfaAttempts(redis, attemptsKey);

      if (inserted.status !== "success") {
        await restoreTotpStep(redis, claimedStep);
        if (inserted.status === "user_disabled") {
          await audit("MFA_VERIFY_FAILED", {
            userId: verifiedUser.id,
            username: verifiedUser.username,
            reason: "disabled_user",
          });
          return reply.status(403).send({
            error: "User is disabled",
            code: "USER_DISABLED",
          });
        }
        await audit("MFA_VERIFY_FAILED", {
          userId: verifiedUser.id,
          username: verifiedUser.username,
          reason: inserted.status,
        });
        return reply.status(401).send({
          error: "Enrollment challenge expired or invalid",
          code: "MFA_EXPIRED",
        });
      }

      await audit("MFA_ENROLLED", { userId: verifiedUser.id, username: verifiedUser.username });
      await audit("LOGIN_SUCCESS", { userId: verifiedUser.id, username: verifiedUser.username });

      setSessionCookie(request, reply, token);

      return reply.send({
        token,
        user: {
          id: verifiedUser.id,
          username: verifiedUser.username,
          role: inserted.role,
          mustChangePassword: env.SKIP_MUST_CHANGE_PASSWORD
            ? false
            : verifiedUser.mustChangePassword,
          permissions: inserted.permissions,
          teamName: inserted.teamName,
        },
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  // POST /api/auth/mfa/disable -- disable MFA (self-service)
  app.post(
    "/api/auth/mfa/disable",
    {
      config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const parsed = disableSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Current TOTP code is required to disable MFA",
          code: "VALIDATION_ERROR",
        });
      }
      const code = normalizeMfaCode(parsed.data.code);
      if (!code) {
        return reply.status(400).send({
          error: "Current TOTP code is required to disable MFA",
          code: "VALIDATION_ERROR",
        });
      }

      const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      if (!dbUser?.totpEnabled || !dbUser.totpSecret) {
        return reply.status(400).send({
          error: "MFA is not enabled",
          code: "MFA_NOT_ENABLED",
        });
      }

      // Decrypt and verify the code
      const secretBase32 = await decryptSecret(user.id, dbUser.totpSecret);
      if (!secretBase32) return replyDecryptionFailed(request, reply, user.id);

      const audit = auditFromRequest(request);

      const redis = sharedRedis();
      const claimedStep = await claimTotpStep(redis, user.id, secretBase32, code);
      if (!claimedStep) {
        await audit("MFA_VERIFY_FAILED", { userId: user.id, username: user.username });
        return reply.status(401).send({
          error: "Invalid TOTP code",
          code: "INVALID_CODE",
        });
      }

      try {
        await clearUserMfa(user.id);
      } catch (err) {
        await restoreTotpStep(redis, claimedStep);
        throw err;
      }

      await audit("MFA_DISABLED", { userId: user.id, username: user.username });

      return reply.send({ ok: true });
    },
  );

  // POST /api/auth/users/:id/mfa/reset -- admin reset
  app.post(
    "/api/auth/users/:id/mfa/reset",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = await requirePermission("users:manage")(request, reply);
      if (!admin) return;

      const { id } = request.params;

      const [targetUser] = await db.select().from(schema.users).where(eq(schema.users.id, id));
      if (!targetUser) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      if (!(await canManageTargetRole(admin, targetUser.role))) {
        return reply.status(403).send({
          error: "Cannot manage a user beyond your role authority",
          code: "ESCALATION_DENIED",
        });
      }

      if (!targetUser.totpEnabled) {
        return reply.status(400).send({
          error: "MFA is not enabled for this user",
          code: "MFA_NOT_ENABLED",
        });
      }

      await clearUserMfa(id);

      const audit = auditFromRequest(request);
      await audit("MFA_RESET", {
        adminId: admin.id,
        username: admin.username,
        targetUserId: id,
        targetUsername: targetUser.username,
      });

      return reply.send({ ok: true });
    },
  );
}
