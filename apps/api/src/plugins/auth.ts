import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { auditLog } from "../lib/audit.js";

const scryptAsync = promisify(scrypt);

// ── Types ─────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

const MAX_USERS = 50;

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
 * Compute a fast lookup prefix for an API key.
 * Uses SHA-256 (not scrypt) so lookups are O(1) instead of O(n).
 */
export function computeKeyPrefix(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex").slice(0, 16);
}

const PASSWORD_RULES =
  "Password must be at least 8 characters with uppercase, lowercase, and a number";

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return PASSWORD_RULES;
  if (!/[A-Z]/.test(password)) return PASSWORD_RULES;
  if (!/[a-z]/.test(password)) return PASSWORD_RULES;
  if (!/[0-9]/.test(password)) return PASSWORD_RULES;
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

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function createSessionToken(): string {
  return randomUUID();
}

// ── Default admin creation ─────────────────────────────────────────

export async function ensureDefaultAdmin(): Promise<void> {
  const existingUsers = db.select().from(schema.users).all();
  if (existingUsers.length > 0) return;

  const id = randomUUID();
  const passwordHash = await hashPassword(env.DEFAULT_PASSWORD);

  const mustChange = !env.SKIP_MUST_CHANGE_PASSWORD;
  const result = db
    .insert(schema.users)
    .values({
      id,
      username: env.DEFAULT_USERNAME,
      passwordHash,
      role: "admin",
      mustChangePassword: mustChange,
    })
    .onConflictDoNothing()
    .run();

  if (result.changes > 0) {
    console.log(
      mustChange
        ? `Default admin user '${env.DEFAULT_USERNAME}' created — password change required on first login`
        : `Default admin user '${env.DEFAULT_USERNAME}' created (password change skipped via env)`,
    );
  }
}

// ── Login attempt limit ──────────────────────────────────────────

const DEFAULT_LOGIN_ATTEMPT_LIMIT = 10;

function getLoginAttemptLimit(): number {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "loginAttemptLimit"))
    .get();
  if (row) {
    const parsed = parseInt(row.value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_LOGIN_ATTEMPT_LIMIT;
}

// ── Auth routes ────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: getLoginAttemptLimit, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { username?: string; password?: string } | null;

      if (!body?.username || !body?.password) {
        return reply.status(400).send({ error: "Username and password are required" });
      }

      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, body.username))
        .get();

      if (!user) {
        auditLog(request.log, "LOGIN_FAILED", { username: body.username, reason: "unknown_user" });
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        auditLog(request.log, "LOGIN_FAILED", { username: body.username, reason: "bad_password" });
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Create session
      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      db.insert(schema.sessions)
        .values({
          id: token,
          userId: user.id,
          expiresAt,
        })
        .run();

      auditLog(request.log, "LOGIN_SUCCESS", { userId: user.id, username: user.username });

      return reply.send({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        },
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(request);
    const user = getAuthUser(request);
    if (token) {
      db.delete(schema.sessions).where(eq(schema.sessions.id, token)).run();
    }
    auditLog(request.log, "LOGOUT", { userId: user?.id });
    return reply.send({ ok: true });
  });

  // GET /api/auth/session
  app.get("/api/auth/session", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(request);
    if (!token) {
      return reply.status(401).send({ error: "No session token provided" });
    }

    const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, token)).get();

    if (!session || session.expiresAt < new Date()) {
      // Clean up expired session if it exists
      if (session) {
        db.delete(schema.sessions).where(eq(schema.sessions.id, token)).run();
      }
      return reply.status(401).send({ error: "Session expired or invalid" });
    }

    const user = db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();

    if (!user) {
      return reply.status(401).send({ error: "User not found" });
    }

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      expiresAt: session.expiresAt.toISOString(),
    });
  });

  // POST /api/auth/change-password
  app.post("/api/auth/change-password", async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const body = request.body as {
      currentPassword?: string;
      newPassword?: string;
    } | null;

    if (!body?.currentPassword || !body?.newPassword) {
      return reply.status(400).send({
        error: "Current password and new password are required",
        code: "VALIDATION_ERROR",
      });
    }

    const pwError = validatePasswordStrength(body.newPassword);
    if (pwError) {
      return reply.status(400).send({
        error: pwError,
        code: "VALIDATION_ERROR",
      });
    }

    const user = db.select().from(schema.users).where(eq(schema.users.id, authUser.id)).get();

    if (!user) {
      return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
    }

    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      return reply
        .status(401)
        .send({ error: "Current password is incorrect", code: "INVALID_PASSWORD" });
    }

    const newHash = await hashPassword(body.newPassword);

    db.update(schema.users)
      .set({ passwordHash: newHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(schema.users.id, authUser.id))
      .run();

    // Invalidate all other sessions for this user
    const currentToken = extractToken(request);
    const allSessions = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, authUser.id))
      .all();
    for (const s of allSessions) {
      if (s.id !== currentToken) {
        db.delete(schema.sessions).where(eq(schema.sessions.id, s.id)).run();
      }
    }

    // Revoke all API keys — if credentials were compromised, keys must be rotated too
    db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, authUser.id)).run();

    auditLog(request.log, "PASSWORD_CHANGED", { userId: authUser.id, username: authUser.username });

    return reply.send({ ok: true });
  });

  // GET /api/auth/users (admin only)
  app.get("/api/auth/users", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = requireAdmin(request, reply);
    if (!admin) return;

    const users = db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
        team: schema.users.team,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .all();

    return reply.send({
      users: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
      maxUsers: MAX_USERS,
    });
  });

  // POST /api/auth/register (admin only)
  app.post("/api/auth/register", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = requireAdmin(request, reply);
    if (!admin) return;

    const body = request.body as {
      username?: string;
      password?: string;
      role?: string;
    } | null;

    if (!body?.username || !body?.password) {
      return reply.status(400).send({
        error: "Username and password are required",
        code: "VALIDATION_ERROR",
      });
    }

    const usernameError = validateUsername(body.username);
    if (usernameError) {
      return reply.status(400).send({
        error: usernameError,
        code: "VALIDATION_ERROR",
      });
    }

    const registerPwError = validatePasswordStrength(body.password);
    if (registerPwError) {
      return reply.status(400).send({
        error: registerPwError,
        code: "VALIDATION_ERROR",
      });
    }

    const role = body.role === "admin" ? "admin" : "user";

    // Resolve team — frontend sends team name (e.g. "Default"), not ID
    const requestedTeam = (body as { team?: string }).team;
    let team: string;

    if (requestedTeam) {
      // Look up by name first, then fall back to ID
      const teamByName = db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, requestedTeam))
        .get();
      const teamById = teamByName
        ? null
        : db.select().from(schema.teams).where(eq(schema.teams.id, requestedTeam)).get();
      const found = teamByName || teamById;
      if (!found)
        return reply.status(400).send({ error: "Team not found", code: "VALIDATION_ERROR" });
      team = found.id;
    } else {
      const defaultTeam = db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, "Default"))
        .get();
      team = defaultTeam?.id || "default-team-00000000";
    }

    // Check for duplicate username first (so 409 takes priority over limit)
    const existing = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, body.username))
      .get();

    if (existing) {
      return reply.status(409).send({
        error: "Username already exists",
        code: "CONFLICT",
      });
    }

    // Check user limit
    const userCount = db.select().from(schema.users).all().length;
    if (userCount >= MAX_USERS) {
      return reply.status(403).send({
        error: `User limit reached (${MAX_USERS} max)`,
        code: "USER_LIMIT_REACHED",
      });
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(body.password);

    db.insert(schema.users)
      .values({
        id,
        username: body.username,
        passwordHash,
        role,
        team,
        mustChangePassword: true,
      })
      .run();

    auditLog(request.log, "USER_CREATED", {
      adminId: admin.id,
      newUserId: id,
      newUsername: body.username,
      role,
    });

    return reply.status(201).send({
      id,
      username: body.username,
      role,
      team,
    });
  });

  // PUT /api/auth/users/:id (admin only — update role/team)
  app.put(
    "/api/auth/users/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = requireAdmin(request, reply);
      if (!admin) return;

      const { id } = request.params;
      const body = request.body as { role?: string; team?: string } | null;

      const user = db.select().from(schema.users).where(eq(schema.users.id, id)).get();

      if (!user) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      const updates: { role?: "admin" | "user"; team?: string; updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (body?.role === "admin" || body?.role === "user") {
        // Prevent removing your own admin role
        if (id === admin.id && body.role !== "admin") {
          return reply.status(400).send({
            error: "Cannot remove your own admin role",
            code: "SELF_DEMOTE",
          });
        }
        updates.role = body.role;
      }

      if (typeof body?.team === "string" && body.team.trim()) {
        const teamExists = db
          .select()
          .from(schema.teams)
          .where(eq(schema.teams.id, body.team.trim()))
          .get();
        if (!teamExists) {
          return reply.status(400).send({ error: "Team not found", code: "VALIDATION_ERROR" });
        }
        updates.team = body.team.trim();
      }

      db.update(schema.users).set(updates).where(eq(schema.users.id, id)).run();

      auditLog(request.log, "USER_UPDATED", {
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
      const admin = requireAdmin(request, reply);
      if (!admin) return;

      const { id } = request.params;
      const body = request.body as { newPassword?: string } | null;

      if (!body?.newPassword) {
        return reply.status(400).send({
          error: "New password is required",
          code: "VALIDATION_ERROR",
        });
      }

      const pwError = validatePasswordStrength(body.newPassword);
      if (pwError) {
        return reply.status(400).send({
          error: pwError,
          code: "VALIDATION_ERROR",
        });
      }

      const user = db.select().from(schema.users).where(eq(schema.users.id, id)).get();

      if (!user) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      const newHash = await hashPassword(body.newPassword);

      db.update(schema.users)
        .set({ passwordHash: newHash, mustChangePassword: true, updatedAt: new Date() })
        .where(eq(schema.users.id, id))
        .run();

      // Invalidate all sessions for this user
      db.delete(schema.sessions).where(eq(schema.sessions.userId, id)).run();

      // Revoke all API keys
      db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, id)).run();

      auditLog(request.log, "PASSWORD_RESET", {
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
      const admin = requireAdmin(request, reply);
      if (!admin) return;

      const { id } = request.params;

      if (id === admin.id) {
        return reply.status(400).send({
          error: "Cannot delete your own account",
          code: "SELF_DELETE",
        });
      }

      const user = db.select().from(schema.users).where(eq(schema.users.id, id)).get();

      if (!user) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      // Delete associated sessions
      db.delete(schema.sessions).where(eq(schema.sessions.userId, id)).run();

      // Delete the user (cascades to api_keys via FK)
      db.delete(schema.users).where(eq(schema.users.id, id)).run();

      auditLog(request.log, "USER_DELETED", {
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
  // Check Authorization header: "Bearer <token>"
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

// ── Auth middleware ────────────────────────────────────────────────

const PUBLIC_PATHS = [
  "/api/v1/health",
  "/api/v1/config/",
  "/api/auth/",
  "/api/v1/download/",
  "/api/v1/jobs/",
  "/api/v1/settings/logo",
  "/api/docs",
  "/api/v1/openapi.yaml",
];

function isPublicRoute(url: string): boolean {
  // Non-API routes are public (SPA static files — auth is handled client-side)
  if (!url.startsWith("/api/")) return true;
  // Download URLs use unguessable UUIDs as capability tokens — no auth needed
  return PUBLIC_PATHS.some((path) => url.startsWith(path));
}

export async function authMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    // When auth is disabled, attach the first admin user so requireAuth/requireAdmin pass
    if (!env.AUTH_ENABLED) {
      const adminUser = db.select().from(schema.users).where(eq(schema.users.role, "admin")).get();
      if (adminUser) {
        (request as FastifyRequest & { user?: AuthUser }).user = {
          id: adminUser.id,
          username: adminUser.username,
          role: "admin",
        };
      }
      return;
    }

    const isPublic = isPublicRoute(request.url);

    const token = extractToken(request);
    if (!token) {
      // Public routes don't require a token
      if (isPublic) return;
      return reply.status(401).send({ error: "Authentication required" });
    }

    const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, token)).get();

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        db.delete(schema.sessions).where(eq(schema.sessions.id, token)).run();
      }

      // Try API key authentication if token has si_ prefix
      if (token.startsWith("si_")) {
        const prefix = computeKeyPrefix(token);
        // Lookup by prefix (O(1) instead of scanning all keys)
        const candidates = db
          .select()
          .from(schema.apiKeys)
          .where(eq(schema.apiKeys.keyPrefix, prefix))
          .all();
        // Fall back to full scan for legacy keys without a prefix
        const keysToCheck =
          candidates.length > 0
            ? candidates
            : db
                .select()
                .from(schema.apiKeys)
                .all()
                .filter((k) => !k.keyPrefix);
        for (const key of keysToCheck) {
          const matches = await verifyPassword(token, key.keyHash);
          if (matches) {
            // Backfill prefix for legacy keys
            if (!key.keyPrefix) {
              db.update(schema.apiKeys)
                .set({ keyPrefix: prefix, lastUsedAt: new Date() })
                .where(eq(schema.apiKeys.id, key.id))
                .run();
            } else {
              db.update(schema.apiKeys)
                .set({ lastUsedAt: new Date() })
                .where(eq(schema.apiKeys.id, key.id))
                .run();
            }
            // Load the user
            const apiUser = db
              .select()
              .from(schema.users)
              .where(eq(schema.users.id, key.userId))
              .get();
            if (apiUser) {
              (request as FastifyRequest & { user?: AuthUser }).user = {
                id: apiUser.id,
                username: apiUser.username,
                role: apiUser.role as "admin" | "user",
              };
              return;
            }
          }
        }
      }

      // Public routes can proceed without a valid session
      if (isPublic) return;
      return reply.status(401).send({ error: "Session expired or invalid" });
    }

    const user = db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();

    if (!user) {
      if (isPublic) return;
      return reply.status(401).send({ error: "User not found" });
    }

    // Attach user info to request for downstream handlers
    // (always populate when a valid session exists, even on public routes)
    (request as FastifyRequest & { user?: AuthUser }).user = {
      id: user.id,
      username: user.username,
      role: user.role as "admin" | "user",
    };

    // Enforce mustChangePassword — block non-auth API calls
    // (skipped when SKIP_MUST_CHANGE_PASSWORD=true for CI/dev environments)
    if (user.mustChangePassword && !env.SKIP_MUST_CHANGE_PASSWORD) {
      const allowed = [
        "/api/auth/change-password",
        "/api/auth/logout",
        "/api/auth/session",
        "/api/v1/config/",
      ];
      if (!allowed.some((p) => request.url.startsWith(p)) && request.url.startsWith("/api/")) {
        return reply.status(403).send({
          error: "Password change required",
          code: "MUST_CHANGE_PASSWORD",
        });
      }
    }
  });
}
