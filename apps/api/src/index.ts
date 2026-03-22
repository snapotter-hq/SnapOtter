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
await app.register(cors, { origin: true });
await app.register(rateLimit, {
  max: env.RATE_LIMIT_PER_MIN,
  timeWindow: "1 minute",
});

// Swagger / OpenAPI documentation
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

// Health check
app.get("/api/v1/health", async () => ({
  status: "healthy",
  version: APP_VERSION,
  uptime: process.uptime().toFixed(0) + "s",
  storage: { mode: env.STORAGE_MODE, available: "N/A" },
  queue: { active: 0, pending: 0 },
  ai: {},
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
