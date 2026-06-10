/**
 * Test server helper -- builds a real Fastify app with an isolated Postgres
 * database for integration tests.
 *
 * Environment variables (DATABASE_URL, WORKSPACE_PATH) are set per-fork in
 * tests/setup/per-fork-env.ts BEFORE this module is loaded, ensuring
 * apps/api/src/config.ts picks them up.
 *
 * Each call to `buildTestApp()` returns a fresh, fully-wired server instance
 * that can be exercised with `app.inject()` (no port binding required).
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// 1. Ensure the workspace directory exists. The Postgres database is already
//    created by per-fork-env.ts (cloned from the migrated template).
// ---------------------------------------------------------------------------
mkdirSync(process.env.WORKSPACE_PATH!, { recursive: true });

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { APP_VERSION } from "@snapotter/shared";
import { eq } from "drizzle-orm";
// ---------------------------------------------------------------------------
// 2. Import app modules. config.ts already captured our env vars.
// ---------------------------------------------------------------------------
import Fastify from "fastify";
import { env } from "../../apps/api/src/config.js";
import { db, schema } from "../../apps/api/src/db/index.js";
import { runMigrations } from "../../apps/api/src/db/migrate.js";
import { requirePermission } from "../../apps/api/src/permissions.js";
import {
  authMiddleware,
  authRoutes,
  ensureBuiltinRoles,
  ensureDefaultAdmin,
} from "../../apps/api/src/plugins/auth.js";
import { oidcRoutes } from "../../apps/api/src/plugins/oidc.js";
import { registerUpload } from "../../apps/api/src/plugins/upload.js";
import { analyticsRoutes } from "../../apps/api/src/routes/analytics.js";
import { apiKeyRoutes } from "../../apps/api/src/routes/api-keys.js";
import { auditLogRoutes } from "../../apps/api/src/routes/audit-log.js";
import { registerBatchRoutes } from "../../apps/api/src/routes/batch.js";
import { docsRoutes } from "../../apps/api/src/routes/docs.js";
import { registerFetchUrlsRoute } from "../../apps/api/src/routes/fetch-urls.js";
import { fileRoutes } from "../../apps/api/src/routes/files.js";
import { registerMemeTemplates } from "../../apps/api/src/routes/meme-templates.js";
import { registerPipelineRoutes } from "../../apps/api/src/routes/pipeline.js";
import { registerProgressRoutes } from "../../apps/api/src/routes/progress.js";
import { rolesRoutes } from "../../apps/api/src/routes/roles.js";
import { settingsRoutes } from "../../apps/api/src/routes/settings.js";
import { teamsRoutes } from "../../apps/api/src/routes/teams.js";
import { registerToolRoutes } from "../../apps/api/src/routes/tools/index.js";
import { userFileRoutes } from "../../apps/api/src/routes/user-files.js";

// Run migrations (idempotent -- template already has the schema, but this
// ensures the __drizzle_migrations journal is consistent in each fork).
await runMigrations();

// ---------------------------------------------------------------------------
// 3. Public API
// ---------------------------------------------------------------------------
export interface TestApp {
  app: ReturnType<typeof Fastify>;
  cleanup: () => Promise<void>;
}

export async function buildTestApp(): Promise<TestApp> {
  // Seed built-in roles and default admin user (both idempotent)
  await ensureBuiltinRoles();
  await ensureDefaultAdmin();

  // Clear the mustChangePassword flag so tests can use the admin freely
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, "admin"));

  const app = Fastify({
    logger: false, // quiet during tests
    bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  });

  // Plugins
  await app.register(cors, { origin: true });

  // Multipart upload support
  await registerUpload(app);

  // Cookie support
  await app.register(cookie, { secret: "test-cookie-secret", hook: "onRequest" });

  // Auth middleware (must be registered before routes)
  await authMiddleware(app);

  // Auth routes
  await authRoutes(app);

  // OIDC routes
  await oidcRoutes(app);

  // File upload/download routes
  await fileRoutes(app);

  // User file library routes (persistent file management with versioning)
  await userFileRoutes(app);

  // Meme template routes
  await registerMemeTemplates(app);

  // Tool routes
  await registerToolRoutes(app);

  // Batch processing routes
  await registerBatchRoutes(app);

  // URL fetch routes
  await registerFetchUrlsRoute(app);

  // Pipeline routes
  await registerPipelineRoutes(app);

  // Progress SSE routes
  await registerProgressRoutes(app);

  // API key management routes
  await apiKeyRoutes(app);

  // Settings routes
  await settingsRoutes(app);

  // Teams routes
  await teamsRoutes(app);

  // Audit log routes
  await auditLogRoutes(app);

  // Roles management routes
  await rolesRoutes(app);

  // Analytics routes
  await analyticsRoutes(app);

  // API docs (Scalar)
  await docsRoutes(app);

  // Public health check (minimal - no internal details)
  app.get("/api/v1/health", async () => ({
    status: "healthy",
    version: APP_VERSION,
  }));

  // Admin health check (full diagnostics)
  app.get("/api/v1/admin/health", async (request, reply) => {
    const admin = requirePermission("system:health")(request, reply);
    if (!admin) return;

    let dbOk = false;
    try {
      await db.select().from(schema.settings).limit(1);
      dbOk = true;
    } catch {
      /* db unreachable */
    }
    return {
      status: dbOk ? "healthy" : "degraded",
      version: APP_VERSION,
      uptime: `${process.uptime().toFixed(0)}s`,
      storage: { mode: env.STORAGE_MODE, available: "N/A" },
      database: dbOk ? "ok" : "error",
      queue: { active: 0, pending: 0 },
      ai: {},
    };
  });

  // Public config endpoint
  app.get("/api/v1/config/auth", async () => {
    const config: Record<string, unknown> = { authEnabled: env.AUTH_ENABLED };
    if (env.OIDC_ENABLED) {
      config.oidcEnabled = true;
      config.oidcProviderName = env.OIDC_PROVIDER_NAME || null;
      config.oidcLoginUrl = "/api/auth/oidc/login";
    }
    return config;
  });

  // Ensure Fastify is ready (all plugins loaded)
  await app.ready();

  const cleanup = async () => {
    await app.close();
    // The pg pool is a module-level singleton shared across the fork.
    // Do NOT call closeDb() here; let the fork process exit naturally.
    // Closing prematurely would break tests that run DB queries after
    // the app is closed (e.g. verifying DB state in assertions).
  };

  return { app, cleanup };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Log in as the default admin and return the session token. */
export async function loginAsAdmin(app: ReturnType<typeof Fastify>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "admin",
      password: "Adminpass1",
    },
  });
  const body = JSON.parse(res.body);
  if (!body.token) {
    throw new Error(`Login failed: ${res.body}`);
  }
  return body.token as string;
}

/**
 * Build a multipart/form-data payload for use with `app.inject()`.
 *
 * Fastify's `inject()` doesn't natively support FormData, so we construct
 * the raw multipart body with proper boundaries manually.
 */
export function createMultipartPayload(
  fields: Array<{
    name: string;
    filename?: string;
    contentType?: string;
    content: Buffer | string;
  }>,
): { body: Buffer; contentType: string } {
  const boundary = `----TestBoundary${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const parts: Buffer[] = [];

  for (const field of fields) {
    let header = `--${boundary}\r\n`;
    if (field.filename) {
      header += `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n`;
      header += `Content-Type: ${field.contentType || "application/octet-stream"}\r\n`;
    } else {
      header += `Content-Disposition: form-data; name="${field.name}"\r\n`;
    }
    header += "\r\n";
    parts.push(Buffer.from(header));
    parts.push(Buffer.isBuffer(field.content) ? field.content : Buffer.from(field.content));
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
