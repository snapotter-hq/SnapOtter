import { randomUUID } from "node:crypto";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { getDispatcherStatus, initDispatcher, isGpuAvailable } from "@snapotter/ai";
import { APP_VERSION } from "@snapotter/shared";
import { eq, sql } from "drizzle-orm";
import Fastify from "fastify";
import { env } from "./config.js";
import { closeDb, db, schema } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { startCancelListener, stopCancelListener } from "./jobs/cancel.js";
import { closeRedis, pingRedis } from "./jobs/connection.js";
import { closeFlowProducer, closeQueueEvents } from "./jobs/enqueue.js";
import { closeQueues, queueCounts } from "./jobs/queues.js";
import { enqueueSystemJob, SYSTEM_JOBS, scheduleSystemJobs } from "./jobs/system-jobs.js";
import { closeWorkers, startWorkers } from "./jobs/worker.js";
import { captureException, initAnalytics, shutdownAnalytics } from "./lib/analytics.js";
import { shouldRunStartupCleanup } from "./lib/cleanup.js";
import { buildCsp } from "./lib/csp.js";
import { ensureAiDirs, recoverInterruptedInstalls } from "./lib/feature-status.js";

import { requirePermission } from "./permissions.js";
import {
  authMiddleware,
  authRoutes,
  ensureAnonymousUser,
  ensureBuiltinRoles,
  ensureDefaultAdmin,
} from "./plugins/auth.js";
import { oidcRoutes } from "./plugins/oidc.js";
import { registerStatic } from "./plugins/static.js";
import { registerUpload } from "./plugins/upload.js";
import { adminOpsRoutes } from "./routes/admin-ops.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { auditLogRoutes } from "./routes/audit-log.js";
import { registerBatchRoutes } from "./routes/batch.js";
import { configRoutes } from "./routes/config.js";
import { docsRoutes } from "./routes/docs.js";
import { registerFeatureRoutes } from "./routes/features.js";
import { registerFetchUrlsRoute } from "./routes/fetch-urls.js";
import { fileRoutes } from "./routes/files.js";
import { registerMemeTemplates } from "./routes/meme-templates.js";
import { registerPipelineRoutes } from "./routes/pipeline.js";
import { registerProgressRoutes } from "./routes/progress.js";
import { rolesRoutes } from "./routes/roles.js";
import { settingsRoutes } from "./routes/settings.js";
import { teamsRoutes } from "./routes/teams.js";
import { registerToolRoutes } from "./routes/tools/index.js";
import { userFileRoutes } from "./routes/user-files.js";

// Run before anything else
try {
  await runMigrations();
} catch (err) {
  const safeUrl = env.DATABASE_URL.replace(/:\/\/[^@]*@/, "://***@");
  console.error(
    `FATAL: Cannot connect to Postgres at ${safeUrl}. Is the database running? (docker compose up, or set DATABASE_URL)`,
  );
  console.error(err);
  process.exit(1);
}
console.log("Database initialized");

// Verify Redis is reachable (required for BullMQ job queues)
try {
  await pingRedis();
} catch (err) {
  const safeUrl = env.REDIS_URL.replace(/:\/\/[^@]*@/, "://***@");
  console.error(
    `FATAL: Cannot connect to Redis at ${safeUrl}. Is Redis running? (docker compose up, or set REDIS_URL)`,
  );
  console.error(err);
  process.exit(1);
}
console.log("Redis connected");

// Auto-import 1.x SQLite database on first boot (before default user creation)
if (env.SQLITE_MIGRATE_PATH) {
  const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM users`);
  if ((rows[0].n as number) === 0) {
    try {
      const { migrateFromSqlite } = await import("./db/migrate-from-sqlite.js");
      const result = await migrateFromSqlite(env.SQLITE_MIGRATE_PATH, { force: false });
      console.log("Imported 1.x SQLite database:", JSON.stringify(result.tables));
    } catch (err) {
      console.error(
        `FATAL: 1.x SQLite import failed from ${env.SQLITE_MIGRATE_PATH}: ${(err as Error).message}. No partial data was written.`,
      );
      process.exit(1);
    }
  } else {
    console.log("SQLITE_MIGRATE_PATH set but target is not empty; skipping import");
  }
}

// Seed built-in roles (admin, editor, user) that legacy SQLite migrations
// inserted via data statements.  The pg baseline is DDL-only, so roles are
// seeded here at boot time.  onConflictDoNothing makes this idempotent.
await ensureBuiltinRoles();

if (env.AUTH_ENABLED) {
  await ensureDefaultAdmin();
} else {
  await ensureAnonymousUser();
}

async function ensureInstanceId() {
  const [existing] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "instance_id"));
  if (!existing) {
    await db.insert(schema.settings).values({ key: "instance_id", value: randomUUID() });
  }
}

await ensureInstanceId();

async function ensureDefaultSettings() {
  const defaults: Record<string, string> = {
    defaultTheme: env.DEFAULT_THEME,
    defaultLocale: env.DEFAULT_LOCALE,
    defaultToolView: env.DEFAULT_TOOL_VIEW,
  };
  for (const [key, value] of Object.entries(defaults)) {
    const [existing] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    if (!existing) {
      await db.insert(schema.settings).values({ key, value });
    }
  }
}

await ensureDefaultSettings();

if (!env.COOKIE_SECRET) {
  const [existing] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "cookie_secret"));
  if (existing) {
    (env as Record<string, unknown>).COOKIE_SECRET = existing.value;
  } else {
    const generated = randomUUID() + randomUUID();
    await db.insert(schema.settings).values({ key: "cookie_secret", value: generated });
    (env as Record<string, unknown>).COOKIE_SECRET = generated;
  }
}

await initAnalytics();

// Enterprise features (license-gated)
let enterpriseLicense: { org: string; plan: string } | null = null;
try {
  const { initEnterprise } = await import("@snapotter/enterprise");
  const result = initEnterprise(env.SNAPOTTER_LICENSE_KEY || undefined);
  if (result.valid && result.license) {
    enterpriseLicense = result.license;
  } else if (env.SNAPOTTER_LICENSE_KEY) {
    console.warn("[WARN] Invalid or expired enterprise license key");
  }
} catch {
  // Enterprise package not available
}

// Start the cooperative cancellation listener (Redis pub/sub)
await startCancelListener();

// Set up AI feature directories and recover from interrupted installs
ensureAiDirs();
recoverInterruptedInstalls();

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: {
      targets: [
        { target: "pino/file", options: { destination: 1 } },
        {
          // Rotate at 10 MB, keep 5 files
          target: "pino-roll",
          options: {
            file: join(env.LOG_DIR, "snapotter"),
            extension: ".log",
            size: "10m",
            limit: { count: 5 },
            mkdir: true,
          },
        },
      ],
    },
    redact: ["req.headers.authorization", "req.headers.cookie"],
  },
  bodyLimit: env.MAX_UPLOAD_SIZE_MB > 0 ? env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 : 1073741824,
  trustProxy: env.TRUST_PROXY,
  routerOptions: { maxParamLength: 500 },
});

// Image processing (especially AI batch) can run for tens of minutes.
// Node.js defaults to a 5-minute requestTimeout which kills long-running
// connections. Set a generous default; per-route overrides disable it entirely.
app.server.requestTimeout = 30 * 60 * 1000;
app.server.headersTimeout = 60 * 1000;

app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
  try {
    const str = typeof body === "string" ? body : (body as Buffer).toString();
    done(null, str.length > 0 ? JSON.parse(str) : {});
  } catch {
    const parseErr = new Error("Malformed JSON in request body") as Error & { statusCode: number };
    parseErr.statusCode = 400;
    done(parseErr, undefined);
  }
});

app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  if (statusCode === 429) {
    request.log.warn({ url: request.url, method: request.method }, "Rate limit exceeded");
  } else if (statusCode >= 500) {
    request.log.error(
      { err: error, url: request.url, method: request.method },
      "Unhandled request error",
    );
    captureException(error, request);
  } else {
    request.log.warn({ err: error, url: request.url, method: request.method }, "Request error");
  }
  reply.status(statusCode).send({
    error: statusCode >= 500 ? "Internal server error" : error.message,
    ...(statusCode < 500 && { details: error.message }),
  });
});

// Plugins
await app.register(cors, {
  origin: env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : process.env.NODE_ENV !== "production",
});

// Security headers -- applied in all environments. HSTS is ignored over plain
// HTTP so it is safe (and desirable) to send it in dev/staging too. CSP catches
// injection issues early when applied during development.
app.addHook("onSend", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "0");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  reply.header("Content-Security-Policy", buildCsp(_request.url.startsWith("/api/docs")));
});

// Always register rate-limit plugin so per-route limits (login brute-force protection) work.
// max=0 means "unlimited" (50k/min) -- @fastify/rate-limit treats literal 0 as "block all".
await app.register(rateLimit, {
  max: env.RATE_LIMIT_PER_MIN > 0 ? env.RATE_LIMIT_PER_MIN : 50_000,
  timeWindow: "1 minute",
  allowList: (request) => !request.url.startsWith("/api/"),
});

// Block TRACE method (returns 401 instead of 405 without this)
app.addHook("onRequest", async (request, reply) => {
  if (request.method === "TRACE") {
    return reply.status(405).send({ error: "Method not allowed" });
  }
});

// Multipart upload support
await registerUpload(app);

// Cookie support (required for OIDC state and session cookies)
await app.register(cookie, {
  secret: env.COOKIE_SECRET,
  hook: "onRequest",
});

// Public config routes (no auth required)
await configRoutes(app);

// Auth middleware (must be registered before routes it protects)
await authMiddleware(app);

// Auth routes
await authRoutes(app);

// OIDC routes
await oidcRoutes(app);

// File upload/download routes
await fileRoutes(app);

// User file library routes (persistent file management with versioning)
await userFileRoutes(app);

// Meme template listing and static serving (before tool routes which have catch-all)
await registerMemeTemplates(app);

// Tool routes (generic factory-based)
await registerToolRoutes(app);

// Batch processing routes (must be after tool routes so the registry is populated)
await registerBatchRoutes(app);

// URL fetch routes (server-side image fetching with SSRF protection)
await registerFetchUrlsRoute(app);

// Pipeline routes (must be after tool routes so the registry is populated)
await registerPipelineRoutes(app);

// Progress SSE routes
await registerProgressRoutes(app);

// API key management routes
await apiKeyRoutes(app);

// Settings routes
await settingsRoutes(app);

// Analytics config and consent routes
await analyticsRoutes(app);

// Feature management routes (AI feature bundle install/uninstall)
await registerFeatureRoutes(app);

// Teams routes
await teamsRoutes(app);

// Audit log routes
await auditLogRoutes(app);

// Roles management routes
await rolesRoutes(app);

// Admin ops routes (runtime log level, Prometheus metrics)
await adminOpsRoutes(app);

// API docs (Scalar)
await docsRoutes(app);

// Public health check (checks core dependencies)
app.get("/api/v1/health", async (_request, reply) => {
  let dbOk = false;
  try {
    await db.select().from(schema.settings).limit(1);
    dbOk = true;
  } catch {
    /* db unreachable */
  }

  const status = dbOk ? "healthy" : "unhealthy";
  const code = dbOk ? 200 : 503;
  return reply.code(code).send({
    status,
    version: APP_VERSION,
  });
});

// Admin health check (full diagnostics)
app.get("/api/v1/admin/health", async (request, reply) => {
  const admin = await requirePermission("system:health")(request, reply);
  if (!admin) return;

  let dbOk = false;
  try {
    await db.select().from(schema.settings).limit(1);
    dbOk = true;
  } catch {
    /* db unreachable */
  }
  let queueStats = { active: 0, pending: 0 };
  try {
    const counts = await queueCounts();
    queueStats = { active: counts.active, pending: counts.waiting };
  } catch {
    /* redis unreachable */
  }
  return {
    status: dbOk ? "healthy" : "degraded",
    version: APP_VERSION,
    uptime: `${process.uptime().toFixed(0)}s`,
    storage: { mode: env.STORAGE_MODE, available: "N/A" },
    database: dbOk ? "ok" : "error",
    queue: queueStats,
    ai: { gpu: isGpuAvailable(), dispatcher: getDispatcherStatus() },
    enterprise: enterpriseLicense
      ? { active: true, org: enterpriseLicense.org, plan: enterpriseLicense.plan }
      : { active: false },
  };
});

// Public config endpoint (for frontend to know if auth is required)
app.get("/api/v1/config/auth", async () => {
  const config: Record<string, unknown> = {
    authEnabled: env.AUTH_ENABLED,
  };
  if (env.OIDC_ENABLED) {
    config.oidcEnabled = true;
    config.oidcProviderName = env.OIDC_PROVIDER_NAME || null;
    config.oidcLoginUrl = "/api/auth/oidc/login";
  }
  return config;
});

// Readiness probe (no auth -- used by load balancers / k8s)
app.get("/api/v1/readyz", async (_request, reply) => {
  let postgres = false;
  let redis = false;
  try {
    await db.select().from(schema.settings).limit(1);
    postgres = true;
  } catch {
    /* db unreachable */
  }
  try {
    redis = await pingRedis();
  } catch {
    /* redis unreachable */
  }
  const ok = postgres && redis;
  return reply.code(ok ? 200 : 503).send({ ok, postgres, redis });
});

// Cancel a job (authenticated)
app.post(
  "/api/v1/jobs/:jobId/cancel",
  async (
    request: import("fastify").FastifyRequest<{ Params: { jobId: string } }>,
    reply: import("fastify").FastifyReply,
  ) => {
    const { requireAuth } = await import("./plugins/auth.js");
    const user = requireAuth(request, reply);
    if (!user) return;

    const { requestCancel } = await import("./jobs/cancel.js");
    const { jobId } = request.params;
    const canceled = await requestCancel(jobId);
    return reply.send({ canceled });
  },
);

// Serve SPA in production
if (process.env.NODE_ENV === "production") {
  await registerStatic(app);
}

// Schedule repeatable system jobs (storage TTL, session purge, retention)
await scheduleSystemJobs();
if (await shouldRunStartupCleanup()) {
  await enqueueSystemJob(SYSTEM_JOBS.storageTtl);
}

// Start BullMQ worker pools (after route registration so the tool registry is full)
startWorkers();

// Start
try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  const dispatcherResult = await initDispatcher();
  const gpuLine = dispatcherResult.ready
    ? dispatcherResult.gpu
      ? "[INFO] GPU detected -- AI tools will use CUDA acceleration"
      : "[WARN] No GPU detected -- AI tools will use CPU (slower)"
    : "[WARN] AI sidecar did not start -- AI tools will use per-request Python (slower)";
  console.log(
    [
      `SnapOtter v${APP_VERSION} running on port ${env.PORT}`,
      gpuLine,
      `[INFO] Rate limit: ${env.RATE_LIMIT_PER_MIN > 0 ? `${env.RATE_LIMIT_PER_MIN}/min` : "disabled"}`,
      `[INFO] Upload limit: ${env.MAX_UPLOAD_SIZE_MB > 0 ? `${env.MAX_UPLOAD_SIZE_MB} MB` : "unlimited"}`,
      `[INFO] Trust proxy: ${env.TRUST_PROXY}`,
      `[INFO] Storage: ${env.STORAGE_MODE}${env.STORAGE_MODE === "s3" ? ` (${env.S3_BUCKET})` : ""}`,
      enterpriseLicense
        ? `[INFO] Enterprise license: ${enterpriseLicense.org} (${enterpriseLicense.plan})`
        : "[INFO] Edition: Community",
    ].join("\n"),
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const SHUTDOWN_TIMEOUT_MS = 30000;
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await app.close();
    console.log("HTTP server closed");
  } catch (err) {
    console.error("Error closing HTTP server:", err);
  }

  try {
    const { shutdownDispatcher, shutdownDocsDispatcher } = await import("@snapotter/ai");
    shutdownDispatcher();
    await shutdownDocsDispatcher();
    console.log("Python dispatchers shut down");
  } catch {
    // AI package may not be available
  }

  try {
    const { shutdownBrowser } = await import("./lib/browser-service.js");
    await shutdownBrowser();
    console.log("Browser service shut down");
  } catch {
    // Browser service may not have been initialized
  }

  try {
    await shutdownAnalytics();
    console.log("Analytics flushed");
  } catch {
    // analytics shutdown is best-effort
  }

  // Close BullMQ resources before database (workers first so no new jobs start)
  try {
    await closeWorkers();
    await closeFlowProducer();
    await closeQueueEvents();
    await closeQueues();
    await stopCancelListener();
    await closeRedis();
    console.log("Redis connections closed");
  } catch (err) {
    console.error("Error closing Redis connections:", err);
  }

  try {
    await closeDb();
    console.log("Database connection closed");
  } catch (err) {
    console.error("Error closing database:", err);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
