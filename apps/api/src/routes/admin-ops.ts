/**
 * Admin operations routes -- runtime log level and Prometheus metrics.
 *
 * GET  /api/v1/admin/log-level  -- read current pino log level
 * POST /api/v1/admin/log-level  -- change level at runtime
 * GET  /api/v1/metrics          -- Prometheus scrape endpoint
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { metricsText } from "../lib/metrics.js";
import { requirePermission } from "../permissions.js";

const logLevelSchema = z.object({
  level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
});

export async function adminOpsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/admin/log-level
  app.get("/api/v1/admin/log-level", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("settings:write")(request, reply);
    if (!admin) return;
    return { level: app.log.level };
  });

  // POST /api/v1/admin/log-level
  app.post("/api/v1/admin/log-level", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("settings:write")(request, reply);
    if (!admin) return;
    const parsed = logLevelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid log level", details: parsed.error.issues });
    }
    app.log.level = parsed.data.level;
    return { level: app.log.level };
  });

  // GET /api/v1/metrics -- Prometheus scrape endpoint
  app.get("/api/v1/metrics", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("system:health")(request, reply);
    if (!admin) return;
    const text = await metricsText();
    return reply.type("text/plain; version=0.0.4").send(text);
  });
}
