/**
 * Test server helper — builds a real Fastify app with an isolated temp
 * SQLite database for integration tests.
 *
 * Environment variables are injected via vitest.config.ts `test.env` BEFORE
 * this module is loaded, ensuring apps/api/src/config.ts picks them up.
 *
 * Each call to `buildTestApp()` returns a fresh, fully-wired server instance
 * that can be exercised with `app.inject()` (no port binding required).
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// 1. Ensure directories exist for the DB and workspace paths that vitest.config
//    injected into process.env.
// ---------------------------------------------------------------------------
mkdirSync(dirname(process.env.DB_PATH!), { recursive: true });
mkdirSync(process.env.WORKSPACE_PATH!, { recursive: true });

import cors from "@fastify/cors";
import { APP_VERSION } from "@stirling-image/shared";
import { eq } from "drizzle-orm";
// ---------------------------------------------------------------------------
// 2. Import app modules. config.ts already captured our env vars.
// ---------------------------------------------------------------------------
import Fastify from "fastify";
import { env } from "../../apps/api/src/config.js";
import { db, schema } from "../../apps/api/src/db/index.js";
import { runMigrations } from "../../apps/api/src/db/migrate.js";
import { authMiddleware, authRoutes, ensureDefaultAdmin } from "../../apps/api/src/plugins/auth.js";
import { registerUpload } from "../../apps/api/src/plugins/upload.js";
import { apiKeyRoutes } from "../../apps/api/src/routes/api-keys.js";
import { registerBatchRoutes } from "../../apps/api/src/routes/batch.js";
import { brandingRoutes } from "../../apps/api/src/routes/branding.js";
import { docsRoutes } from "../../apps/api/src/routes/docs.js";
import { fileRoutes } from "../../apps/api/src/routes/files.js";
import { registerPipelineRoutes } from "../../apps/api/src/routes/pipeline.js";
import { registerProgressRoutes } from "../../apps/api/src/routes/progress.js";
import { settingsRoutes } from "../../apps/api/src/routes/settings.js";
import { teamsRoutes } from "../../apps/api/src/routes/teams.js";
import { registerToolRoutes } from "../../apps/api/src/routes/tools/index.js";

// Run migrations to create all tables in the temp DB
runMigrations();

// ---------------------------------------------------------------------------
// 3. Public API
// ---------------------------------------------------------------------------
export interface TestApp {
  app: ReturnType<typeof Fastify>;
  cleanup: () => Promise<void>;
}

export async function buildTestApp(): Promise<TestApp> {
  // Seed the default admin user (idempotent — skips if users already exist)
  await ensureDefaultAdmin();

  // Clear the mustChangePassword flag so tests can use the admin freely
  db.update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, "admin"))
    .run();

  const app = Fastify({
    logger: false, // quiet during tests
    bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  });

  // Plugins
  await app.register(cors, { origin: true });

  // Multipart upload support
  await registerUpload(app);

  // Auth middleware (must be registered before routes)
  await authMiddleware(app);

  // Auth routes
  await authRoutes(app);

  // File upload/download routes
  await fileRoutes(app);

  // Tool routes
  await registerToolRoutes(app);

  // Batch processing routes
  await registerBatchRoutes(app);

  // Pipeline routes
  await registerPipelineRoutes(app);

  // Progress SSE routes
  await registerProgressRoutes(app);

  // API key management routes
  await apiKeyRoutes(app);

  // Settings routes
  await settingsRoutes(app);

  // Branding routes
  await brandingRoutes(app);

  // Teams routes
  await teamsRoutes(app);

  // API docs (Scalar)
  await docsRoutes(app);

  // Health check
  app.get("/api/v1/health", async () => ({
    status: "healthy",
    version: APP_VERSION,
    uptime: process.uptime().toFixed(0) + "s",
    storage: { mode: env.STORAGE_MODE, available: "N/A" },
    queue: { active: 0, pending: 0 },
    ai: {},
  }));

  // Public config endpoint
  app.get("/api/v1/config/auth", async () => ({
    authEnabled: env.AUTH_ENABLED,
  }));

  // Ensure Fastify is ready (all plugins loaded)
  await app.ready();

  const cleanup = async () => {
    await app.close();
    try {
      rmSync(dirname(process.env.DB_PATH!), { recursive: true, force: true });
    } catch {
      // ignore
    }
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
  const boundary = "----TestBoundary" + randomUUID().replace(/-/g, "").slice(0, 16);
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
