import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { sharedRedis } from "../jobs/connection.js";
import { auditFromRequest, sanitizeAuditInput } from "../lib/audit.js";
import { authAttempts } from "../lib/metrics.js";
import { getSettingNumber, getSettingString } from "../lib/settings-helpers.js";
import {
  canAssignRole,
  getPermissions,
  isDisabledRole,
  requirePermission,
} from "../permissions.js";

const scryptAsync = promisify(scrypt);

// ── Types ─────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  apiKeyPermissions?: string[];
}

const MAX_USERS = env.MAX_USERS;

// ── Password hashing ──────────────────────────────────────────────

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuf = Buffer.from(hash, "hex");
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}

/**
 * Fixed-cost hash used to equalize login timing for usernames that don't
 * exist (or have no local password). Computed once per process and cached;
 * without this, a login attempt for an unknown username returns as soon as
 * the user lookup misses, while a wrong password for a real user waits on a
 * full scrypt run. That gap is a timing side-channel an attacker can use to
 * enumerate valid usernames even though both cases return an identical 401
 * body. Running verifyPassword against this dummy hash pays the same scrypt
 * cost on the "unknown user" path so the two cases are timing-indistinguishable.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(randomBytes(SALT_LENGTH).toString("hex"));
  }
  return dummyHashPromise;
}

/**
 * Compute a fast lookup prefix for an API key.
 * Uses SHA-256 (not scrypt) so lookups are O(1) instead of O(n).
 */
export function computeKeyPrefix(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex").slice(0, 16);
}

async function validatePasswordStrength(password: string): Promise<string | null> {
  const minLength = await getSettingNumber("passwordMinLength", 8);
  if (password.length < minLength) return `Password must be at least ${minLength} characters`;

  const requireUpper = await getSettingString("passwordRequireUppercase", "true");
  const requireLower = await getSettingString("passwordRequireLowercase", "true");
  const requireDigit = await getSettingString("passwordRequireDigit", "true");
  const requireSpecial = await getSettingString("passwordRequireSpecial", "false");

  if (requireUpper === "true" && !/[A-Z]/.test(password))
    return "Password must contain an uppercase letter";
  if (requireLower === "true" && !/[a-z]/.test(password))
    return "Password must contain a lowercase letter";
  if (requireDigit === "true" && !/\d/.test(password)) return "Password must contain a digit";
  if (requireSpecial === "true" && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password))
    return "Password must contain a special character";

  return null;
}

function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 50) {
    return "Username must be between 3 and 50 characters";
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return "Username can only contain letters, numbers, dots, hyphens, and underscores";
  }
  return null;
}

// ── Zod schemas for auth request bodies ──────────────────────────

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required").max(255, "Username too long"),
  password: z.string().min(1, "Password is required").max(1024, "Password too long"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(1024, "Password too long"),
  newPassword: z.string().min(1, "New password is required").max(1024, "Password too long"),
});

export const registerSchema = z.object({
  username: z.string().min(1, "Username is required").max(255, "Username too long"),
  password: z.string().min(1, "Password is required").max(1024, "Password too long"),
  role: z.string().optional(),
  team: z.string().optional(),
});

const updateUserSchema = z.object({
  role: z.string().optional(),
  team: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(1, "New password is required").max(1024, "Password too long"),
});

// ── Request helpers ───────────────────────────────────────────────

/** Extract the authenticated user attached by authMiddleware. */
export function getAuthUser(request: FastifyRequest): AuthUser | null {
  return (request as FastifyRequest & { user?: AuthUser }).user ?? null;
}

/** Require an authenticated user, sending 401 if missing. */
export function requireAuth(request: FastifyRequest, reply: FastifyReply): AuthUser | null {
  const user = getAuthUser(request);
  if (!user) {
    reply.status(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" });
    return null;
  }
  return user;
}

/** Require an admin user, sending 403 if not admin. */
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): AuthUser | null {
  const user = requireAuth(request, reply);
  if (!user) return null;
  if (user.role !== "admin") {
    reply.status(403).send({ error: "Admin access required", code: "FORBIDDEN" });
    return null;
  }
  return user;
}

// ── Session helpers ────────────────────────────────────────────────

const SESSION_DURATION_MS = env.SESSION_DURATION_HOURS * 60 * 60 * 1000;

export function createSessionToken(): string {
  return randomUUID();
}

// ── Default team + admin creation ──────────────────────────────────

/**
 * Seed the "Default" team that the rest of the platform assumes exists.
 *
 * The frontend People form always submits team "Default", and register,
 * external-auth-resolver, and SCIM all fall back to a "default-team-00000000"
 * placeholder ID for it. None of those create the row, so a fresh install has
 * no Default team and adding a member via the UI fails with "Team not found".
 * Seeding it here (idempotent) fixes that. The ID matches the placeholder the
 * fallback paths use so a real row and a fallback reference line up.
 */
export async function ensureDefaultTeam(): Promise<void> {
  await db
    .insert(schema.teams)
    .values({ id: "default-team-00000000", name: "Default" })
    .onConflictDoNothing();
}

export async function ensureAnonymousUser(): Promise<void> {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, "anonymous"));
  if (existing) return;

  await db
    .insert(schema.users)
    .values({
      id: "anonymous",
      username: "anonymous",
      role: "admin",
      mustChangePassword: false,
      authProvider: "local",
    })
    .onConflictDoNothing();
}

export async function ensureDefaultAdmin(): Promise<void> {
  const existingUsers = await db.select().from(schema.users);
  if (existingUsers.length > 0) return;

  const id = randomUUID();
  const passwordHash = await hashPassword(env.DEFAULT_PASSWORD);

  const mustChange = !env.SKIP_MUST_CHANGE_PASSWORD;
  const result = await db
    .insert(schema.users)
    .values({
      id,
      username: env.DEFAULT_USERNAME,
      passwordHash,
      role: "admin",
      mustChangePassword: mustChange,
    })
    .onConflictDoNothing();

  if (result.rowCount && result.rowCount > 0) {
    console.log(
      mustChange
        ? `Default admin user '${env.DEFAULT_USERNAME}' created - password change required on first login`
        : `Default admin user '${env.DEFAULT_USERNAME}' created (password change skipped via env)`,
    );
  }
}

/**
 * Seed the three built-in roles (admin, editor, user) that the legacy SQLite
 * migration 0007_custom_roles.sql used to insert.  The Postgres baseline is
 * DDL-only, so these must be created at boot time instead.
 *
 * Uses onConflictDoNothing so the function is safe to call when:
 *  - Roles already exist from a previous boot
 *  - Roles were imported by the 1.x SQLite-to-Postgres data migrator
 */
// Must match ROLE_PERMISSIONS in permissions.ts (the 1.x post-0010 state).
export async function ensureBuiltinRoles(): Promise<void> {
  const builtinRoles = [
    {
      id: "builtin-admin",
      name: "admin",
      description: "Full administrative access",
      permissions: [
        "tools:use",
        "files:own",
        "files:all",
        "apikeys:own",
        "apikeys:all",
        "pipelines:own",
        "pipelines:all",
        "settings:read",
        "settings:write",
        "users:manage",
        "teams:manage",
        "features:manage",
        "system:health",
        "audit:read",
        "compliance:manage",
        "webhooks:manage",
        "security:manage",
      ],
      isBuiltin: true,
    },
    {
      id: "builtin-editor",
      name: "editor",
      description: "Can see all files and pipelines",
      permissions: [
        "tools:use",
        "files:own",
        "files:all",
        "apikeys:own",
        "pipelines:own",
        "pipelines:all",
        "settings:read",
      ],
      isBuiltin: true,
    },
    {
      id: "builtin-user",
      name: "user",
      description: "Basic tool access",
      permissions: ["tools:use", "files:own", "apikeys:own", "pipelines:own", "settings:read"],
      isBuiltin: true,
    },
  ];

  for (const role of builtinRoles) {
    await db.insert(schema.roles).values(role).onConflictDoNothing();
  }
}

// ── Login attempt limit ──────────────────────────────────────────

async function getLoginAttemptLimit(): Promise<number> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "loginAttemptLimit"));
  if (row) {
    const parsed = parseInt(row.value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return env.LOGIN_ATTEMPT_LIMIT;
}

// ── Auth routes ────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: getLoginAttemptLimit, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!env.AUTH_ENABLED) {
        return reply.status(403).send({ error: "Authentication is disabled" });
      }

      // SSO enforcement check
      const ssoEnforced = await getSettingString("ssoEnforcement", "false");
      if (ssoEnforced === "true") {
        let isEnabled = false;
        try {
          const { isFeatureEnabled } = await import("@snapotter/enterprise");
          isEnabled = isFeatureEnabled("sso_enforcement");
        } catch {}

        if (isEnabled) {
          const breakGlassUsername = await getSettingString("ssoBreakGlassUsername", "");
          const { username } = loginSchema.parse(request.body);

          if (username !== breakGlassUsername) {
            return reply.status(403).send({
              error: "Local password login is disabled. Please use SSO.",
              code: "SSO_ENFORCED",
            });
          }
        }
      }

      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Username and password are required" });
      }
      const body = parsed.data;

      // Postgres rejects NUL bytes (\x00) in text columns.  Valid usernames
      // never contain NUL, so such credentials can never match -- return 401
      // immediately (same result SQLite produced by running the query).
      if (body.username.includes("\x00") || body.password.includes("\x00")) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, body.username));

      const audit = auditFromRequest(request);

      if (user && isDisabledRole(user.role)) {
        authAttempts.inc({ method: "password", result: "failure" });
        await audit("LOGIN_FAILED", {
          username: sanitizeAuditInput(body.username),
          reason: "disabled_user",
        });
        return reply.status(403).send({ error: "User is disabled", code: "USER_DISABLED" });
      }

      if (!user?.passwordHash) {
        // Pay the same scrypt cost a real password check would take, so
        // response timing doesn't reveal whether the username exists.
        await verifyPassword(body.password, await getDummyHash());
        authAttempts.inc({ method: "password", result: "failure" });
        await audit("LOGIN_FAILED", {
          username: sanitizeAuditInput(body.username),
          reason: "unknown_user",
        });
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        authAttempts.inc({ method: "password", result: "failure" });
        await audit("LOGIN_FAILED", {
          username: sanitizeAuditInput(body.username),
          reason: "bad_password",
        });
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      let mfaRequiredByPolicy = false;
      try {
        const { getMfaPolicy, isMfaRequiredForUser } = await import("./mfa.js");
        const policy = await getMfaPolicy();
        mfaRequiredByPolicy = isMfaRequiredForUser(policy, user.role);
      } catch {
        // MFA plugin not loaded
      }

      // ── MFA challenge ──────────────────────────────────────────
      if (user.totpEnabled) {
        const mfaToken = randomUUID();
        const redis = sharedRedis();
        await redis.setex(`mfa:${mfaToken}`, 300, user.id);

        await audit("MFA_CHALLENGE_ISSUED", { userId: user.id, username: user.username });

        return reply.status(200).send({
          requiresMfa: true,
          mfaToken,
          mfaRequired: mfaRequiredByPolicy,
          message: "MFA verification required",
        });
      }

      if (mfaRequiredByPolicy) {
        authAttempts.inc({ method: "password", result: "failure" });
        await audit("LOGIN_FAILED", {
          userId: user.id,
          username: user.username,
          reason: "mfa_enrollment_required",
        });
        return reply.status(403).send({
          error: "MFA enrollment is required before login",
          code: "MFA_ENROLLMENT_REQUIRED",
        });
      }

      // Create session
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      await db.insert(schema.sessions).values({
        id: token,
        userId: user.id,
        expiresAt,
      });

      // ── Concurrent session limit (FIFO eviction) ──────────────
      const maxSessions = await getSettingNumber("maxSessionsPerUser");
      if (maxSessions > 0) {
        const sessions = await db
          .select({ id: schema.sessions.id, createdAt: schema.sessions.createdAt })
          .from(schema.sessions)
          .where(eq(schema.sessions.userId, user.id))
          .orderBy(asc(schema.sessions.createdAt));

        if (sessions.length > maxSessions) {
          const toDelete = sessions.slice(0, sessions.length - maxSessions);
          for (const s of toDelete) {
            await db.delete(schema.sessions).where(eq(schema.sessions.id, s.id));
          }
        }
      }

      authAttempts.inc({ method: "password", result: "success" });
      await audit("LOGIN_SUCCESS", { userId: user.id, username: user.username });

      const [teamRow] = await db.select().from(schema.teams).where(eq(schema.teams.id, user.team));

      const cookieReply = reply as FastifyReply & {
        setCookie?: (name: string, value: string, opts: Record<string, unknown>) => FastifyReply;
      };
      if (typeof cookieReply.setCookie === "function") {
        cookieReply.setCookie("snapotter-session", token, {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: env.EXTERNAL_URL.startsWith("https"),
          maxAge: SESSION_DURATION_MS / 1000,
        });
      }

      return reply.send({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          mustChangePassword: env.SKIP_MUST_CHANGE_PASSWORD ? false : user.mustChangePassword,
          permissions: await getPermissions(user.role),
          teamName: teamRow?.name ?? user.team,
        },
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(request);
    const user = getAuthUser(request);
    let logoutUrl: string | undefined;

    if (token) {
      const [session] = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, token));

      if (session?.idToken && env.OIDC_ENABLED) {
        try {
          const { getOidcEndSessionEndpoint } = await import("./oidc.js");
          const endSessionEndpoint = getOidcEndSessionEndpoint();
          if (endSessionEndpoint) {
            const params = new URLSearchParams({
              id_token_hint: session.idToken,
              post_logout_redirect_uri: `${env.EXTERNAL_URL}/login`,
            });
            logoutUrl = `${endSessionEndpoint}?${params.toString()}`;
          }
        } catch {
          // OIDC plugin not loaded or discovery not cached
        }
      }

      await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
    }

    // Clear the session cookie
    const cookieReply = reply as FastifyReply & {
      clearCookie?: (name: string, opts: Record<string, unknown>) => void;
    };
    if (typeof cookieReply.clearCookie === "function") {
      cookieReply.clearCookie("snapotter-session", { path: "/" });
    }

    await auditFromRequest(request)("LOGOUT", { userId: user?.id });
    return reply.send({ ok: true, ...(logoutUrl && { logoutUrl }) });
  });

  // GET /api/auth/session
  app.get("/api/auth/session", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!env.AUTH_ENABLED) {
      return reply.send({
        user: {
          id: "anonymous",
          username: "anonymous",
          role: "admin",
          mustChangePassword: false,
          permissions: await getPermissions("admin"),
        },
        expiresAt: null,
      });
    }

    const token = extractToken(request);
    if (!token) {
      return reply.status(401).send({ error: "No session token provided" });
    }

    const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, token));

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
      }
      return reply.status(401).send({ error: "Session expired or invalid" });
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId));

    if (!user) {
      return reply.status(401).send({ error: "User not found" });
    }

    if (isDisabledRole(user.role)) {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
      return reply.status(403).send({ error: "User is disabled", code: "USER_DISABLED" });
    }

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: env.SKIP_MUST_CHANGE_PASSWORD ? false : user.mustChangePassword,
        permissions: await getPermissions(user.role),
        authProvider: user.authProvider ?? "local",
        loginMethod: session.idToken ? "oidc" : user.authProvider === "saml" ? "saml" : "local",
        email: user.email ?? null,
        hasLocalPassword: !!user.passwordHash,
        hasOidcLink: !!user.externalId,
      },
      expiresAt: session.expiresAt.toISOString(),
    });
  });

  // POST /api/auth/change-password
  app.post(
    "/api/auth/change-password",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = requireAuth(request, reply);
      if (!authUser) return;

      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Current password and new password are required",
          code: "VALIDATION_ERROR",
        });
      }
      const body = parsed.data;

      const pwError = await validatePasswordStrength(body.newPassword);
      if (pwError) {
        return reply.status(400).send({
          error: pwError,
          code: "VALIDATION_ERROR",
        });
      }

      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, authUser.id));

      if (!user) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      if (!user.passwordHash) {
        return reply.status(400).send({
          error: "Password changes are managed by your identity provider.",
          code: "OIDC_NO_PASSWORD",
        });
      }

      const valid = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!valid) {
        return reply
          .status(401)
          .send({ error: "Current password is incorrect", code: "INVALID_PASSWORD" });
      }

      const newHash = await hashPassword(body.newPassword);

      await db
        .update(schema.users)
        .set({ passwordHash: newHash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(schema.users.id, authUser.id));

      // Invalidate all other sessions for this user
      const currentToken = extractToken(request);
      if (currentToken) {
        await db
          .delete(schema.sessions)
          .where(
            and(eq(schema.sessions.userId, authUser.id), ne(schema.sessions.id, currentToken)),
          );
      }

      // Revoke all API keys - if credentials were compromised, keys must be rotated too
      await db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, authUser.id));

      await auditFromRequest(request)("PASSWORD_CHANGED", {
        userId: authUser.id,
        username: authUser.username,
      });

      return reply.send({ ok: true });
    },
  );

  // GET /api/auth/users (admin only)
  app.get("/api/auth/users", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("users:manage")(request, reply);
    if (!admin) return;

    const users = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
        team: schema.users.team,
        authProvider: schema.users.authProvider,
        email: schema.users.email,
        externalId: schema.users.externalId,
        passwordHash: schema.users.passwordHash,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users);

    // Build a team ID -> name lookup
    const allTeams = await db.select().from(schema.teams);
    const teamNameById = new Map(allTeams.map((t) => [t.id, t.name]));

    return reply.send({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        team: teamNameById.get(u.team) ?? u.team,
        authProvider: u.authProvider ?? "local",
        email: u.email ?? null,
        hasLocalPassword: !!u.passwordHash,
        hasOidcLink: !!u.externalId,
        createdAt: u.createdAt.toISOString(),
      })),
      maxUsers: MAX_USERS,
    });
  });

  // POST /api/auth/register (admin only)
  app.post("/api/auth/register", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("users:manage")(request, reply);
    if (!admin) return;

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Username and password are required",
        code: "VALIDATION_ERROR",
      });
    }
    const body = parsed.data;

    const usernameError = validateUsername(body.username);
    if (usernameError) {
      return reply.status(400).send({
        error: usernameError,
        code: "VALIDATION_ERROR",
      });
    }

    const registerPwError = await validatePasswordStrength(body.password);
    if (registerPwError) {
      return reply.status(400).send({
        error: registerPwError,
        code: "VALIDATION_ERROR",
      });
    }

    const validBuiltinRoles = ["admin", "editor", "user"];
    let role: string = "user";
    if (body.role) {
      if (validBuiltinRoles.includes(body.role)) {
        role = body.role;
      } else {
        const [customRole] = await db
          .select()
          .from(schema.roles)
          .where(eq(schema.roles.name, body.role));
        if (customRole) {
          role = body.role;
        }
      }
    }

    // Escalation prevention
    const roleHierarchy: Record<string, number> = { admin: 3, editor: 2, user: 1 };
    const actorLevel = roleHierarchy[admin.role] ?? 0;
    const targetLevel = roleHierarchy[role] ?? 0;
    if (targetLevel > actorLevel) {
      return reply.status(403).send({
        error: "Cannot create a user with a higher role than your own",
        code: "ESCALATION_DENIED",
      });
    }
    if (!(await canAssignRole(admin, role))) {
      return reply.status(403).send({
        error: "Cannot create a user with permissions you don't have",
        code: "ESCALATION_DENIED",
      });
    }

    // Resolve team -- frontend sends team name (e.g. "Default"), not ID
    const requestedTeam = body.team;
    let teamId: string;
    let teamName: string;

    if (requestedTeam) {
      // Look up by name first, then fall back to ID
      const [teamByName] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, requestedTeam));
      const [teamById] = teamByName
        ? [null]
        : await db.select().from(schema.teams).where(eq(schema.teams.id, requestedTeam));
      const found = teamByName || teamById;
      if (!found)
        return reply.status(400).send({ error: "Team not found", code: "VALIDATION_ERROR" });
      teamId = found.id;
      teamName = found.name;
    } else {
      const [defaultTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, "Default"));
      teamId = defaultTeam?.id || "default-team-00000000";
      teamName = defaultTeam?.name || "Default";
    }

    // Check for duplicate username first (so 409 takes priority over limit)
    const [existing] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, body.username));

    if (existing) {
      return reply.status(409).send({
        error: "Username already exists",
        code: "CONFLICT",
      });
    }

    // Check user limit (0 = unlimited)
    if (MAX_USERS > 0) {
      const allUsers = await db.select().from(schema.users);
      const userCount = allUsers.length;
      if (userCount >= MAX_USERS) {
        return reply.status(403).send({
          error: `User limit reached (${MAX_USERS} max)`,
          code: "USER_LIMIT_REACHED",
        });
      }
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(body.password);

    await db.insert(schema.users).values({
      id,
      username: body.username,
      passwordHash,
      role,
      team: teamId,
      mustChangePassword: true,
    });

    await auditFromRequest(request)("USER_CREATED", {
      adminId: admin.id,
      newUserId: id,
      newUsername: body.username,
      role,
    });

    return reply.status(201).send({
      id,
      username: body.username,
      role,
      team: teamName,
    });
  });

  // PUT /api/auth/users/:id (admin only — update role/team)
  app.put(
    "/api/auth/users/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = await requirePermission("users:manage")(request, reply);
      if (!admin) return;

      const { id } = request.params;
      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
          code: "VALIDATION_ERROR",
        });
      }
      const body = parsed.data;

      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));

      if (!user) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      const updates: { role?: string; team?: string; updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (body.role) {
        const validBuiltinRoles = ["admin", "editor", "user"];
        const [customRoleRow] = validBuiltinRoles.includes(body.role)
          ? [null]
          : await db.select().from(schema.roles).where(eq(schema.roles.name, body.role));
        const isValid = validBuiltinRoles.includes(body.role) || customRoleRow;
        if (isValid) {
          const roleHierarchy: Record<string, number> = { admin: 3, editor: 2, user: 1 };
          const actorLevel = roleHierarchy[admin.role] ?? 0;
          const targetLevel = roleHierarchy[body.role] ?? 0;
          if (targetLevel > actorLevel) {
            return reply.status(403).send({
              error: "Cannot assign a role higher than your own",
              code: "ESCALATION_DENIED",
            });
          }
          if (!(await canAssignRole(admin, body.role))) {
            return reply.status(403).send({
              error: "Cannot assign a role with permissions you don't have",
              code: "ESCALATION_DENIED",
            });
          }

          // Prevent removing your own admin role
          if (id === admin.id && body.role !== "admin") {
            return reply.status(400).send({
              error: "Cannot remove your own admin role",
              code: "SELF_DEMOTE",
            });
          }

          // Last admin protection
          if (user.role === "admin" && body.role !== "admin") {
            const [adminCount] = await db
              .select({ count: sql<number>`COUNT(*)` })
              .from(schema.users)
              .where(eq(schema.users.role, "admin"));
            if (adminCount && adminCount.count <= 1) {
              return reply.status(400).send({
                error: "Cannot demote the last admin",
                code: "LAST_ADMIN",
              });
            }
          }

          updates.role = body.role;
        }
      }

      if (body.team?.trim()) {
        // Look up by name first, then fall back to ID
        const [teamByName] = await db
          .select()
          .from(schema.teams)
          .where(eq(schema.teams.name, body.team.trim()));
        const [teamById] = teamByName
          ? [null]
          : await db.select().from(schema.teams).where(eq(schema.teams.id, body.team.trim()));
        const found = teamByName || teamById;
        if (!found) {
          return reply.status(400).send({ error: "Team not found", code: "VALIDATION_ERROR" });
        }
        updates.team = found.id;
      }

      await db.update(schema.users).set(updates).where(eq(schema.users.id, id));

      // Invalidate all sessions when role changes to force re-login with new permissions
      if (updates.role && updates.role !== user.role) {
        await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
        request.log.info(
          { targetUserId: id, oldRole: user.role, newRole: updates.role },
          "Sessions invalidated due to role change",
        );
      }

      await auditFromRequest(request)("USER_UPDATED", {
        adminId: admin.id,
        targetUserId: id,
        changes: { role: updates.role, team: updates.team },
      });

      return reply.send({ ok: true });
    },
  );

  // POST /api/auth/users/:id/reset-password (admin only)
  app.post(
    "/api/auth/users/:id/reset-password",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = await requirePermission("users:manage")(request, reply);
      if (!admin) return;

      const { id } = request.params;
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "New password is required",
          code: "VALIDATION_ERROR",
        });
      }
      const body = parsed.data;

      const pwError = await validatePasswordStrength(body.newPassword);
      if (pwError) {
        return reply.status(400).send({
          error: pwError,
          code: "VALIDATION_ERROR",
        });
      }

      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));

      if (!user) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      if (!user.passwordHash) {
        return reply.status(400).send({
          error: "Cannot reset password for OIDC user.",
          code: "OIDC_NO_PASSWORD",
        });
      }

      const newHash = await hashPassword(body.newPassword);

      await db
        .update(schema.users)
        .set({ passwordHash: newHash, mustChangePassword: true, updatedAt: new Date() })
        .where(eq(schema.users.id, id));

      // Invalidate all sessions for this user
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));

      // Revoke all API keys
      await db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, id));

      await auditFromRequest(request)("PASSWORD_RESET", {
        adminId: admin.id,
        targetUserId: id,
        targetUsername: user.username,
      });

      return reply.send({ ok: true });
    },
  );

  // DELETE /api/auth/users/:id (admin only, can't delete self)
  app.delete(
    "/api/auth/users/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = await requirePermission("users:manage")(request, reply);
      if (!admin) return;

      const { id } = request.params;

      if (id === admin.id) {
        return reply.status(400).send({
          error: "Cannot delete your own account",
          code: "SELF_DELETE",
        });
      }

      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));

      if (!user) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      // Delete associated sessions
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));

      // Delete the user (cascades to api_keys via FK)
      await db.delete(schema.users).where(eq(schema.users.id, id));

      await auditFromRequest(request)("USER_DELETED", {
        adminId: admin.id,
        deletedUserId: id,
        deletedUsername: user.username,
      });

      return reply.send({ ok: true });
    },
  );
}

// ── Token extraction ───────────────────────────────────────────────

function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookies = (request as FastifyRequest & { cookies?: Record<string, string> }).cookies;
  if (cookies?.["snapotter-session"]) {
    return cookies["snapotter-session"];
  }
  return null;
}

// ── Auth middleware ────────────────────────────────────────────────

const PUBLIC_PATHS = [
  "/api/v1/health",
  "/api/v1/readyz",
  "/api/v1/config/",
  "/api/auth/",
  "/api/v1/download/",
  "/api/v1/jobs/",
  "/api/docs",
  "/api/v1/openapi.yaml",
  "/api/v1/meme-templates/",
  "/api/v1/scim/",
];

function isPublicRoute(url: string): boolean {
  // Non-API routes are public (SPA static files — auth is handled client-side)
  if (!url.startsWith("/api/")) return true;
  // Download URLs use unguessable UUIDs as capability tokens — no auth needed
  return PUBLIC_PATHS.some((path) => url.startsWith(path));
}

/** SPA bundle assets are public by definition (the login page needs them). */
export function isStaticAssetRequest(method: string, url: string): boolean {
  return (
    (method === "GET" || method === "HEAD") && url.startsWith("/assets/") && !url.includes("..")
  );
}

export async function authMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip the session DB lookup for bundle assets: they are served on every
    // page load and an unreachable DB must not 500 them (Sentry NODE-1D).
    if (isStaticAssetRequest(request.method, request.url)) return;

    if (!env.AUTH_ENABLED) {
      (request as FastifyRequest & { user?: AuthUser }).user = {
        id: "anonymous",
        username: "anonymous",
        role: "admin",
      };
      return;
    }

    const isPublic = isPublicRoute(request.url);

    const token = extractToken(request);
    if (!token) {
      // Public routes don't require a token
      if (isPublic) return;
      return reply.status(401).send({ error: "Authentication required" });
    }

    const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, token));

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
      }

      // Try API key authentication if token has si_ prefix
      if (token.startsWith("si_")) {
        const prefix = computeKeyPrefix(token);
        // Lookup by prefix (O(1) instead of scanning all keys)
        const candidates = await db
          .select()
          .from(schema.apiKeys)
          .where(eq(schema.apiKeys.keyPrefix, prefix));
        // Fall back to full scan for legacy keys without a prefix (bounded to 100)
        let keysToCheck: typeof candidates;
        if (candidates.length > 0) {
          keysToCheck = candidates;
        } else {
          request.log.warn(
            "Legacy API key lookup triggered (no keyPrefix match). Migrate keys to use prefix-based lookup.",
          );
          const allKeys = await db.select().from(schema.apiKeys);
          keysToCheck = allKeys.filter((k) => !k.keyPrefix).slice(0, 100);
        }
        for (const key of keysToCheck) {
          const matches = await verifyPassword(token, key.keyHash);
          if (matches) {
            // Check expiration
            if (key.expiresAt && key.expiresAt < new Date()) {
              // Key expired - skip it
              continue;
            }
            // Backfill prefix for legacy keys
            if (!key.keyPrefix) {
              await db
                .update(schema.apiKeys)
                .set({ keyPrefix: prefix, lastUsedAt: new Date() })
                .where(eq(schema.apiKeys.id, key.id));
            } else {
              await db
                .update(schema.apiKeys)
                .set({ lastUsedAt: new Date() })
                .where(eq(schema.apiKeys.id, key.id));
            }
            // Load the user
            const [apiUser] = await db
              .select()
              .from(schema.users)
              .where(eq(schema.users.id, key.userId));
            if (apiUser && !isDisabledRole(apiUser.role)) {
              authAttempts.inc({ method: "apikey", result: "success" });
              const keyPermissions = key.permissions ?? undefined;
              (request as FastifyRequest & { user?: AuthUser }).user = {
                id: apiUser.id,
                username: apiUser.username,
                role: apiUser.role,
                apiKeyPermissions: keyPermissions,
              };
              return;
            }
          }
        }
        authAttempts.inc({ method: "apikey", result: "failure" });
      }

      // Public routes can proceed without a valid session
      if (isPublic) return;
      return reply.status(401).send({ error: "Session expired or invalid" });
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId));

    if (!user) {
      if (isPublic) return;
      return reply.status(401).send({ error: "User not found" });
    }

    if (isDisabledRole(user.role)) {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
      if (isPublic) return;
      return reply.status(403).send({ error: "User is disabled", code: "USER_DISABLED" });
    }

    // ── Idle timeout enforcement ───────────────────────────────────
    const idleTimeoutMinutes = await getSettingNumber("sessionIdleTimeoutMinutes");
    if (idleTimeoutMinutes > 0) {
      const redis = sharedRedis();
      const idleKey = `session:idle:${token}`;
      const lastSeen = await redis.get(idleKey);

      if (!lastSeen) {
        // Redis key expired or first request -- check Postgres lastActivity
        if (session.lastActivity) {
          const elapsed = Date.now() - session.lastActivity.getTime();
          if (elapsed > idleTimeoutMinutes * 60 * 1000) {
            await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
            if (isPublic) return;
            return reply
              .status(401)
              .send({ error: "Session expired due to inactivity", code: "IDLE_TIMEOUT" });
          }
        }
        // Flush lastActivity to Postgres on cache miss (avoids per-request DB writes)
        await db
          .update(schema.sessions)
          .set({ lastActivity: new Date() })
          .where(eq(schema.sessions.id, token));
      }

      // Refresh Redis key with TTL = idle timeout
      await redis.setex(idleKey, idleTimeoutMinutes * 60, Date.now().toString());
    }

    // Attach user info to request for downstream handlers
    // (always populate when a valid session exists, even on public routes)
    (request as FastifyRequest & { user?: AuthUser }).user = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    // Enforce mustChangePassword by blocking the authenticated API surface
    // until the password is rotated. Public routes stay reachable: they need
    // no session at all, so a 403 on the cookied variant adds no security and
    // breaks the SPA (the /api/v1/health poll used to trip a false
    // "Reconnecting to server" banner on the forced change-password screen).
    // Skipped when SKIP_MUST_CHANGE_PASSWORD=true for CI/dev environments.
    if (user.mustChangePassword && !env.SKIP_MUST_CHANGE_PASSWORD && !isPublic) {
      return reply.status(403).send({
        error: "Password change required",
        code: "MUST_CHANGE_PASSWORD",
      });
    }
  });
}
