import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { env } from "../config.js";

const scryptAsync = promisify(scrypt);

// ── Types ─────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

// ── Password hashing ──────────────────────────────────────────────

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuf = Buffer.from(hash, "hex");
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
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

  db.insert(schema.users)
    .values({
      id,
      username: env.DEFAULT_USERNAME,
      passwordHash,
      role: "admin",
      mustChangePassword: true,
    })
    .run();

  console.log(`Default admin user '${env.DEFAULT_USERNAME}' created`);
}

// ── Auth routes ────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  app.post("/api/auth/login", async (request: FastifyRequest, reply: FastifyReply) => {
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
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
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
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(request);
    if (token) {
      db.delete(schema.sessions).where(eq(schema.sessions.id, token)).run();
    }
    return reply.send({ ok: true });
  });

  // GET /api/auth/session
  app.get("/api/auth/session", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(request);
    if (!token) {
      return reply.status(401).send({ error: "No session token provided" });
    }

    const session = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, token))
      .get();

    if (!session || session.expiresAt < new Date()) {
      // Clean up expired session if it exists
      if (session) {
        db.delete(schema.sessions).where(eq(schema.sessions.id, token)).run();
      }
      return reply.status(401).send({ error: "Session expired or invalid" });
    }

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .get();

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

    if (body.newPassword.length < 8) {
      return reply.status(400).send({
        error: "New password must be at least 8 characters",
        code: "VALIDATION_ERROR",
      });
    }

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, authUser.id))
      .get();

    if (!user) {
      return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
    }

    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Current password is incorrect", code: "INVALID_PASSWORD" });
    }

    const newHash = await hashPassword(body.newPassword);

    db.update(schema.users)
      .set({ passwordHash: newHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(schema.users.id, authUser.id))
      .run();

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
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .all();

    return reply.send({
      users: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
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

    if (body.password.length < 8) {
      return reply.status(400).send({
        error: "Password must be at least 8 characters",
        code: "VALIDATION_ERROR",
      });
    }

    const role = body.role === "admin" ? "admin" : "user";

    // Check for duplicate username
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

    const id = randomUUID();
    const passwordHash = await hashPassword(body.password);

    db.insert(schema.users)
      .values({
        id,
        username: body.username,
        passwordHash,
        role,
        mustChangePassword: true,
      })
      .run();

    return reply.status(201).send({
      id,
      username: body.username,
      role,
    });
  });

  // DELETE /api/auth/users/:id (admin only, can't delete self)
  app.delete(
    "/api/auth/users/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const admin = requireAdmin(request, reply);
      if (!admin) return;

      const { id } = request.params;

      if (id === admin.id) {
        return reply.status(400).send({
          error: "Cannot delete your own account",
          code: "SELF_DELETE",
        });
      }

      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .get();

      if (!user) {
        return reply.status(404).send({ error: "User not found", code: "NOT_FOUND" });
      }

      // Delete associated sessions
      db.delete(schema.sessions)
        .where(eq(schema.sessions.userId, id))
        .run();

      // Delete the user (cascades to api_keys via FK)
      db.delete(schema.users)
        .where(eq(schema.users.id, id))
        .run();

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

const PUBLIC_PATHS = ["/api/v1/health", "/api/v1/config/", "/api/auth/", "/api/docs", "/api/v1/download/"];

function isPublicRoute(url: string): boolean {
  // Non-API routes are public (SPA static files — auth is handled client-side)
  if (!url.startsWith("/api/")) return true;
  // Download URLs use unguessable UUIDs as capability tokens — no auth needed
  return PUBLIC_PATHS.some((path) => url.startsWith(path));
}

export async function authMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // When auth is disabled, attach the first admin user so requireAuth/requireAdmin pass
      if (!env.AUTH_ENABLED) {
        const adminUser = db
          .select()
          .from(schema.users)
          .where(eq(schema.users.role, "admin"))
          .get();
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

      const session = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, token))
        .get();

      if (!session || session.expiresAt < new Date()) {
        if (session) {
          db.delete(schema.sessions)
            .where(eq(schema.sessions.id, token))
            .run();
        }
        // Public routes can proceed without a valid session
        if (isPublic) return;
        return reply.status(401).send({ error: "Session expired or invalid" });
      }

      const user = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .get();

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
    },
  );
}
