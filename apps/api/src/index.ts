import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { isGpuAvailable } from "@stirling-image/ai";
import { APP_VERSION } from "@stirling-image/shared";
import Fastify from "fastify";
import { env } from "./config.js";
import { db, schema } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { startCleanupCron } from "./lib/cleanup.js";
import { shutdownWorkerPool } from "./lib/worker-pool.js";
import { authMiddleware, authRoutes, ensureDefaultAdmin, requireAdmin } from "./plugins/auth.js";
import { registerStatic } from "./plugins/static.js";
import { registerUpload } from "./plugins/upload.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { registerBatchRoutes } from "./routes/batch.js";
import { brandingRoutes } from "./routes/branding.js";
import { docsRoutes } from "./routes/docs.js";
import { fileRoutes } from "./routes/files.js";
import { registerPipelineRoutes } from "./routes/pipeline.js";
import { recoverStaleJobs, registerProgressRoutes } from "./routes/progress.js";
import { settingsRoutes } from "./routes/settings.js";
import { teamsRoutes } from "./routes/teams.js";
import { registerToolRoutes } from "./routes/tools/index.js";
import { userFileRoutes } from "./routes/user-files.js";

// Run before anything else
runMigrations();
console.log("Database initialized");

// Create default admin user if no users exist
await ensureDefaultAdmin();

// Mark any jobs left in processing/queued from a previous unclean shutdown
recoverStaleJobs();

const app = Fastify({
  logger: true,
  bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
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
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    reply.header("Content-Security-Policy", csp);
  }
});

await app.register(rateLimit, {
  max: env.RATE_LIMIT_PER_MIN,
  timeWindow: "1 minute",
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

// Branding routes (logo upload/serve/delete)
await brandingRoutes(app);

// Teams routes
await teamsRoutes(app);

// API docs (Scalar)
await docsRoutes(app);

// Public health check (minimal - no internal details)
app.get("/api/v1/health", async () => ({
  status: "healthy",
  version: APP_VERSION,
}));

// Admin health check (full diagnostics)
app.get("/api/v1/admin/health", async (request, reply) => {
  const admin = requireAdmin(request, reply);
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
  console.log(`Stirling Image API running on port ${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down gracefully...`);

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
    const { shutdownDispatcher } = await import("@stirling-image/ai");
    shutdownDispatcher();
    console.log("Python dispatcher shut down");
  } catch {
    // AI package may not be available
  }

  try {
    const { sqlite: sqliteConn } = await import("./db/index.js");
    sqliteConn.close();
    console.log("Database connection closed");
  } catch (err) {
    console.error("Error closing database:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
