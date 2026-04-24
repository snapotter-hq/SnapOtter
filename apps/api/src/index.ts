import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { isGpuAvailable } from "@snapotter/ai";
import { APP_VERSION } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { env } from "./config.js";
import { db, schema } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { captureException, initAnalytics, shutdownAnalytics } from "./lib/analytics.js";
import { startCleanupCron } from "./lib/cleanup.js";
import { ensureAiDirs, recoverInterruptedInstalls } from "./lib/feature-status.js";
import { shutdownWorkerPool } from "./lib/worker-pool.js";
import { requirePermission } from "./permissions.js";
import { authMiddleware, authRoutes, ensureDefaultAdmin } from "./plugins/auth.js";
import { registerStatic } from "./plugins/static.js";
import { registerUpload } from "./plugins/upload.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { auditLogRoutes } from "./routes/audit-log.js";
import { registerBatchRoutes } from "./routes/batch.js";
import { brandingRoutes } from "./routes/branding.js";
import { docsRoutes } from "./routes/docs.js";
import { registerFeatureRoutes } from "./routes/features.js";
import { fileRoutes } from "./routes/files.js";
import { registerPipelineRoutes } from "./routes/pipeline.js";
import { recoverStaleJobs, registerProgressRoutes } from "./routes/progress.js";
import { rolesRoutes } from "./routes/roles.js";
import { settingsRoutes } from "./routes/settings.js";
import { teamsRoutes } from "./routes/teams.js";
import { registerToolRoutes } from "./routes/tools/index.js";
import { userFileRoutes } from "./routes/user-files.js";

// Run before anything else
runMigrations();
console.log("Database initialized");

// Create default admin user if no users exist and auth is enabled
if (env.AUTH_ENABLED) {
  await ensureDefaultAdmin();
}

function ensureInstanceId() {
  const existing = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "instance_id"))
    .get();
  if (!existing) {
    db.insert(schema.settings).values({ key: "instance_id", value: randomUUID() }).run();
  }
}

ensureInstanceId();
await initAnalytics();

// Mark any jobs left in processing/queued from a previous unclean shutdown
recoverStaleJobs();

// Set up AI feature directories and recover from interrupted installs
ensureAiDirs();
recoverInterruptedInstalls();

const app = Fastify({
  logger: { level: env.LOG_LEVEL },
  bodyLimit: env.MAX_UPLOAD_SIZE_MB > 0 ? env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 : 1073741824,
  trustProxy: env.TRUST_PROXY,
  routerOptions: { maxParamLength: 500 },
});

app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  request.log.error(
    { err: error, url: request.url, method: request.method },
    "Unhandled request error",
  );
  captureException(error);
  const isProduction = process.env.NODE_ENV === "production";
  reply.status(statusCode).send({
    error: statusCode >= 500 ? "Internal server error" : error.message,
    ...(statusCode < 500 && { details: error.message }),
    ...(!isProduction && statusCode >= 500 && { details: error.stack ?? error.message }),
  });
});

// Plugins
await app.register(cors, {
  origin: env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : process.env.NODE_ENV !== "production",
});

// Security headers
app.addHook("onSend", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "0");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    const csp = _request.url.startsWith("/api/docs")
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://tile.openstreetmap.org; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    reply.header("Content-Security-Policy", csp);
  }
});

// Always register rate-limit plugin so per-route limits (login brute-force protection) work.
// When RATE_LIMIT_PER_MIN=0, the global limit is set high enough to be effectively unlimited
// while still enabling per-route overrides like the login endpoint.
await app.register(rateLimit, {
  max: env.RATE_LIMIT_PER_MIN > 0 ? env.RATE_LIMIT_PER_MIN : 50000,
  timeWindow: "1 minute",
  allowList: (request) => !request.url.startsWith("/api/"),
});

// Multipart upload support
await registerUpload(app);

// Auth middleware (must be registered before routes it protects)
await authMiddleware(app);

// Auth routes
await authRoutes(app);

// File upload/download routes
await fileRoutes(app);

// User file library routes (persistent file management with versioning)
await userFileRoutes(app);

// Tool routes (generic factory-based)
await registerToolRoutes(app);

// Batch processing routes (must be after tool routes so the registry is populated)
await registerBatchRoutes(app);

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

// Branding routes (logo upload/serve/delete)
await brandingRoutes(app);

// Teams routes
await teamsRoutes(app);

// Audit log routes
await auditLogRoutes(app);

// Roles management routes
await rolesRoutes(app);

// API docs (Scalar)
await docsRoutes(app);

// Public health check (checks core dependencies)
app.get("/api/v1/health", async (_request, reply) => {
  let dbOk = false;
  try {
    db.select().from(schema.settings).limit(1).get();
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
  const admin = requirePermission("system:health")(request, reply);
  if (!admin) return;

  let dbOk = false;
  try {
    db.select().from(schema.settings).limit(1).all();
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
    ai: { gpu: isGpuAvailable() },
  };
});

// Public config endpoint (for frontend to know if auth is required)
app.get("/api/v1/config/auth", async () => ({
  authEnabled: env.AUTH_ENABLED,
}));

// Serve SPA in production
if (process.env.NODE_ENV === "production") {
  await registerStatic(app);
}

// Start workspace cleanup cron
const cleanupCron = startCleanupCron();

// Start
try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  const gpu = isGpuAvailable();
  console.log(
    [
      `SnapOtter v${APP_VERSION} running on port ${env.PORT}`,
      gpu
        ? "[INFO] GPU detected — AI tools will use CUDA acceleration"
        : "[WARN] No GPU detected — AI tools will use CPU (slower)",
      `[INFO] Rate limit: ${env.RATE_LIMIT_PER_MIN > 0 ? `${env.RATE_LIMIT_PER_MIN}/min` : "disabled"}`,
      `[INFO] Upload limit: ${env.MAX_UPLOAD_SIZE_MB > 0 ? `${env.MAX_UPLOAD_SIZE_MB} MB` : "unlimited"}`,
      `[INFO] Trust proxy: ${env.TRUST_PROXY}`,
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

  cleanupCron.stop();

  try {
    await app.close();
    console.log("HTTP server closed");
  } catch (err) {
    console.error("Error closing HTTP server:", err);
  }

  try {
    await shutdownWorkerPool();
    console.log("Worker pool shut down");
  } catch (err) {
    console.error("Error shutting down worker pool:", err);
  }

  try {
    const { shutdownDispatcher } = await import("@snapotter/ai");
    shutdownDispatcher();
    console.log("Python dispatcher shut down");
  } catch {
    // AI package may not be available
  }

  try {
    await shutdownAnalytics();
    console.log("Analytics flushed");
  } catch {
    // analytics shutdown is best-effort
  }

  try {
    const { sqlite: sqliteConn } = await import("./db/index.js");
    sqliteConn.close();
    console.log("Database connection closed");
  } catch (err) {
    console.error("Error closing database:", err);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
