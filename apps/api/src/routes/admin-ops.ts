/**
 * Admin operations routes -- runtime log level, Prometheus metrics,
 * and diagnostic support bundle.
 *
 * GET  /api/v1/admin/log-level       -- read current pino log level
 * POST /api/v1/admin/log-level       -- change level at runtime
 * GET  /api/v1/metrics               -- Prometheus scrape endpoint
 * GET  /api/v1/admin/support-bundle  -- download redacted diagnostic zip
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { formatZodErrors } from "../lib/errors.js";
import { metricsText } from "../lib/metrics.js";
import { buildSupportBundle } from "../lib/support-bundle.js";
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
      return reply.status(400).send({
        error: "Invalid log level",
        code: "VALIDATION_ERROR",
        details: formatZodErrors(parsed.error.issues),
      });
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

  // GET /api/v1/admin/support-bundle -- download diagnostic zip
  app.get("/api/v1/admin/support-bundle", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("system:health")(request, reply);
    if (!admin) return;
    const date = new Date().toISOString().slice(0, 10);
    const stream = buildSupportBundle();
    return reply
      .type("application/zip")
      .header("Content-Disposition", `attachment; filename=snapotter-support-${date}.zip`)
      .send(stream);
  });
}
