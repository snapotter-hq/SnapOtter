import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config.js";
import { APP_VERSION } from "@stirling-image/shared";
import { runMigrations } from "./db/migrate.js";
import { ensureDefaultAdmin, authRoutes, authMiddleware } from "./plugins/auth.js";

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

// Auth middleware (must be registered before routes it protects)
await authMiddleware(app);

// Auth routes
await authRoutes(app);

// Health check
app.get("/api/v1/health", async () => ({
  status: "healthy",
  version: APP_VERSION,
  uptime: process.uptime().toFixed(0) + "s",
  storage: { mode: env.STORAGE_MODE, available: "N/A" },
  queue: { active: 0, pending: 0 },
  ai: {},
}));

// Start
try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`Stirling Image API running on port ${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
