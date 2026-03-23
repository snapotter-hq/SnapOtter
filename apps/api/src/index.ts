import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./config.js";
import { APP_VERSION } from "@stirling-image/shared";
import { runMigrations } from "./db/migrate.js";
import { ensureDefaultAdmin, authRoutes, authMiddleware } from "./plugins/auth.js";
import { registerUpload } from "./plugins/upload.js";
import { registerStatic } from "./plugins/static.js";
import { startCleanupCron } from "./lib/cleanup.js";
import { fileRoutes } from "./routes/files.js";
import { registerToolRoutes } from "./routes/tools/index.js";
import { registerBatchRoutes } from "./routes/batch.js";
import { registerPipelineRoutes } from "./routes/pipeline.js";
import { registerProgressRoutes } from "./routes/progress.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { settingsRoutes } from "./routes/settings.js";
import { db, schema } from "./db/index.js";

// Run before anything else
runMigrations();
console.log("Database initialized");

// Create default admin user if no users exist
await ensureDefaultAdmin();

const app = Fastify({
  logger: true,
  bodyLimit: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
});

// Plugins
await app.register(cors, {
  origin: env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : process.env.NODE_ENV === "production" ? false : true,
});

// Security headers
app.addHook("onSend", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "0");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

await app.register(rateLimit, {
  max: env.RATE_LIMIT_PER_MIN,
  timeWindow: "1 minute",
});

// Swagger / OpenAPI documentation (dev only)
if (process.env.NODE_ENV !== "production") {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Stirling Image API",
        description: "API for Stirling Image — self-hosted image processing suite",
        version: APP_VERSION,
      },
      servers: [{ url: `http://localhost:1349` }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/api/docs",
  });
}

// Multipart upload support
await registerUpload(app);

// Auth middleware (must be registered before routes it protects)
await authMiddleware(app);

// Auth routes
await authRoutes(app);

// File upload/download routes
await fileRoutes(app);

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

// Health check
app.get("/api/v1/health", async () => {
  let dbOk = false;
  try {
    db.select().from(schema.settings).limit(1).all();
    dbOk = true;
  } catch { /* db unreachable */ }
  return {
    status: dbOk ? "healthy" : "degraded",
    version: APP_VERSION,
    uptime: process.uptime().toFixed(0) + "s",
    storage: { mode: env.STORAGE_MODE, available: "N/A" },
    database: dbOk ? "ok" : "error",
    queue: { active: 0, pending: 0 },
    ai: {},
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
startCleanupCron();

// Start
try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`Stirling Image API running on port ${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
