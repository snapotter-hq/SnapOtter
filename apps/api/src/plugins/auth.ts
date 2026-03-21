import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { env } from "../config.js";

const scryptAsync = promisify(scrypt);

// ── Password hashing ──────────────────────────────────────────────

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(
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

const PUBLIC_PATHS = ["/api/v1/health", "/api/auth/"];

function isPublicRoute(url: string): boolean {
  return PUBLIC_PATHS.some((path) => url.startsWith(path));
}

export async function authMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip if auth is disabled
      if (!env.AUTH_ENABLED) return;

      // Skip public routes
      if (isPublicRoute(request.url)) return;

      const token = extractToken(request);
      if (!token) {
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

      // Attach user info to request for downstream handlers
      (request as FastifyRequest & { user?: unknown }).user = {
        id: user.id,
        username: user.username,
        role: user.role,
      };
    },
  );
}
