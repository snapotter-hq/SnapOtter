import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as OTPAuth from "otpauth";
import { z } from "zod";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { sharedRedis } from "../jobs/connection.js";
import { auditFromRequest } from "../lib/audit.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import { getSettingString } from "../lib/settings-helpers.js";
import { getPermissions, isDisabledRole } from "../permissions.js";
import { createSessionToken, getAuthUser, requireAuth } from "./auth.js";

// ── Constants ─────────────────────────────────────────────────────

const RECOVERY_CODE_COUNT = 8;
const SESSION_DURATION_MS = env.SESSION_DURATION_HOURS * 60 * 60 * 1000;

// ── Zod schemas ───────────────────────────────────────────────────

const verifyCodeSchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
});

const completeSchema = z.object({
  mfaToken: z.string().uuid("Invalid MFA token"),
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
});

const disableSchema = z.object({
  code: z.string().min(1, "Code is required").max(20, "Code too long"),
});

// ── Recovery code helpers ─────────────────────────────────────────

export function hashRecoveryCodes(codes: string[]): string {
  return codes.map((c) => createHash("sha256").update(c).digest("hex")).join(",");
}

export function verifyRecoveryCode(
  code: string,
  hashList: string,
): { valid: boolean; remaining: string } {
  const hashes = hashList.split(",");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const idx = hashes.indexOf(codeHash);
  if (idx === -1) return { valid: false, remaining: hashList };
  hashes.splice(idx, 1);
  return { valid: true, remaining: hashes.join(",") };
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

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const totp = createTotp("verify", secretBase32);
  // Allow 1-step window in either direction for clock drift
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

async function encryptSecret(secretBase32: string): Promise<string> {
  if (env.DATA_ENCRYPTION_KEY) {
    return encrypt(secretBase32, env.DATA_ENCRYPTION_KEY);
  }
  return secretBase32;
}

async function decryptSecret(stored: string): Promise<string | null> {
  if (env.DATA_ENCRYPTION_KEY) {
    return decrypt(stored, env.DATA_ENCRYPTION_KEY, env.DATA_ENCRYPTION_KEY_PREVIOUS || undefined);
  }
  return stored;
}

// ── MFA policy helpers ────────────────────────────────────────────

export type MfaPolicy = "optional" | "admins_only" | "required";

export async function getMfaPolicy(): Promise<MfaPolicy> {
  const raw = await getSettingString("mfaPolicy", "optional");
  if (raw === "required" || raw === "admins_only") return raw;
  return "optional";
}

export function isMfaRequiredForUser(policy: MfaPolicy, userRole: string): boolean {
  if (policy === "required") return true;
  if (policy === "admins_only" && userRole === "admin") return true;
  return false;
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
      let mfaLicensed = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        mfaLicensed = isFeatureEnabled("mfa");
      } catch {
        // Enterprise package not available
      }

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
      const { code } = parsed.data;

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
      const secretBase32 = await decryptSecret(dbUser.totpSecret);
      if (!secretBase32) {
        return reply.status(500).send({
          error: "Failed to decrypt TOTP secret",
          code: "DECRYPTION_FAILED",
        });
      }

      // Validate the code
      if (!verifyTotpCode(secretBase32, code)) {
        return reply.status(401).send({
          error: "Invalid TOTP code",
          code: "INVALID_CODE",
        });
      }

      // Activate MFA
      await db
        .update(schema.users)
        .set({ totpEnabled: true, updatedAt: new Date() })
        .where(eq(schema.users.id, user.id));

      const audit = auditFromRequest(request);
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
      const { mfaToken, code } = parsed.data;

      // Look up the pending MFA challenge in Redis
      const redis = sharedRedis();
      const userId = await redis.get(`mfa:${mfaToken}`);
      if (!userId) {
        return reply.status(401).send({
          error: "MFA challenge expired or invalid",
          code: "MFA_EXPIRED",
        });
      }

      // Load user
      const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!dbUser?.totpSecret || isDisabledRole(dbUser.role)) {
        return reply.status(401).send({
          error: "User not found or MFA not configured",
          code: "MFA_NOT_CONFIGURED",
        });
      }

      // Decrypt the stored secret
      const secretBase32 = await decryptSecret(dbUser.totpSecret);
      if (!secretBase32) {
        return reply.status(500).send({
          error: "Failed to decrypt TOTP secret",
          code: "DECRYPTION_FAILED",
        });
      }

      const audit = auditFromRequest(request);
      let verified = false;
      let recoveryUsed = false;

      // Try TOTP code first
      if (verifyTotpCode(secretBase32, code)) {
        verified = true;
      }

      // Try recovery code if TOTP failed
      if (!verified && dbUser.recoveryCodesHash) {
        const result = verifyRecoveryCode(code, dbUser.recoveryCodesHash);
        if (result.valid) {
          verified = true;
          recoveryUsed = true;
          // Consume the recovery code
          await db
            .update(schema.users)
            .set({ recoveryCodesHash: result.remaining || null, updatedAt: new Date() })
            .where(eq(schema.users.id, userId));
        }
      }

      if (!verified) {
        await audit("MFA_VERIFY_FAILED", { userId, username: dbUser.username });
        return reply.status(401).send({
          error: "Invalid TOTP or recovery code",
          code: "INVALID_CODE",
        });
      }

      // Delete the challenge token
      await redis.del(`mfa:${mfaToken}`);

      // Create session (same as normal login completion)
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      await db.insert(schema.sessions).values({
        id: token,
        userId: dbUser.id,
        expiresAt,
      });

      await audit(recoveryUsed ? "MFA_RECOVERY_USED" : "MFA_VERIFIED", {
        userId: dbUser.id,
        username: dbUser.username,
      });

      const [teamRow] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.id, dbUser.team));

      return reply.send({
        token,
        user: {
          id: dbUser.id,
          username: dbUser.username,
          role: dbUser.role,
          mustChangePassword: env.SKIP_MUST_CHANGE_PASSWORD ? false : dbUser.mustChangePassword,
          permissions: await getPermissions(dbUser.role),
          teamName: teamRow?.name ?? dbUser.team,
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
      const { code } = parsed.data;

      const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      if (!dbUser?.totpEnabled || !dbUser.totpSecret) {
        return reply.status(400).send({
          error: "MFA is not enabled",
          code: "MFA_NOT_ENABLED",
        });
      }

      // Decrypt and verify the code
      const secretBase32 = await decryptSecret(dbUser.totpSecret);
      if (!secretBase32) {
        return reply.status(500).send({
          error: "Failed to decrypt TOTP secret",
          code: "DECRYPTION_FAILED",
        });
      }

      if (!verifyTotpCode(secretBase32, code)) {
        return reply.status(401).send({
          error: "Invalid TOTP code",
          code: "INVALID_CODE",
        });
      }

      // Clear MFA data
      await db
        .update(schema.users)
        .set({
          totpSecret: null,
          totpEnabled: false,
          recoveryCodesHash: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id));

      const audit = auditFromRequest(request);
      await audit("MFA_DISABLED", { userId: user.id, username: user.username });

      return reply.send({ ok: true });
    },
  );

  // POST /api/auth/users/:id/mfa/reset -- admin reset
  app.post(
    "/api/auth/users/:id/mfa/reset",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = getAuthUser(request);
      if (!admin) {
        return reply.status(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" });
      }

      // Check users:manage permission
      const { hasEffectivePermission } = await import("../permissions.js");
      if (!(await hasEffectivePermission(admin, "users:manage"))) {
        return reply.status(403).send({ error: "Insufficient permissions", code: "FORBIDDEN" });
      }

      const { id } = request.params;

      const [targetUser] = await db.select().from(schema.users).where(eq(schema.users.id, id));
      if (!targetUser) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      if (!targetUser.totpEnabled) {
        return reply.status(400).send({
          error: "MFA is not enabled for this user",
          code: "MFA_NOT_ENABLED",
        });
      }

      // Clear MFA data
      await db
        .update(schema.users)
        .set({
          totpSecret: null,
          totpEnabled: false,
          recoveryCodesHash: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, id));

      const audit = auditFromRequest(request);
      await audit("MFA_RESET", {
        adminId: admin.id,
        targetUserId: id,
        targetUsername: targetUser.username,
      });

      return reply.send({ ok: true });
    },
  );
}
