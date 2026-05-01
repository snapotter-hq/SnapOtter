/**
 * Application settings routes (key-value store).
 *
 * GET  /api/v1/settings      — Get all settings as a key-value object
 * PUT  /api/v1/settings      — Save settings (admin only)
 * GET  /api/v1/settings/:key — Get a specific setting
 */

import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { requirePermission } from "../permissions.js";
import { requireAuth } from "../plugins/auth.js";

const settingsBodySchema = z.record(z.string().min(1), z.unknown());

const HTML_TAG_PATTERN = /<[a-z/!?][^>]*>/i;

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/settings — Get all settings as a key-value object
  app.get("/api/v1/settings", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(request, reply);
    if (!user) return;

    const rows = db.select().from(schema.settings).all();

    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return reply.send({ settings });
  });

  // PUT /api/v1/settings — Save settings (admin only)
  app.put("/api/v1/settings", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = requirePermission("settings:write")(request, reply);
    if (!admin) return;

    const parsed = settingsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Request body must be a JSON object with key-value pairs",
        code: "VALIDATION_ERROR",
      });
    }
    const body = parsed.data;

    // Pass 1: validate all entries before writing any
    const entries: Array<{ key: string; strValue: string }> = [];

    for (const [key, value] of Object.entries(body)) {
      if (typeof key !== "string" || key.length === 0) continue;

      const strValue = typeof value === "string" ? value : JSON.stringify(value);

      if (HTML_TAG_PATTERN.test(key) || HTML_TAG_PATTERN.test(strValue)) {
        return reply.status(400).send({
          error: "Settings keys and values must not contain HTML tags",
          code: "VALIDATION_ERROR",
        });
      }

      entries.push({ key, strValue });
    }

    // Pass 2: write all entries now that all have passed validation
    const now = new Date();

    for (const { key, strValue } of entries) {
      // Upsert: insert or update on conflict
      const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();

      if (existing) {
        db.update(schema.settings)
          .set({ value: strValue, updatedAt: now })
          .where(eq(schema.settings.key, key))
          .run();
      } else {
        db.insert(schema.settings).values({ key, value: strValue }).run();
      }
    }

    return reply.send({ ok: true, updatedCount: entries.length });
  });

  // GET /api/v1/settings/:key — Get a specific setting
  app.get(
    "/api/v1/settings/:key",
    async (request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { key } = request.params;

      const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();

      if (!row) {
        return reply.status(404).send({
          error: `Setting "${key}" not found`,
          code: "NOT_FOUND",
        });
      }

      return reply.send({
        key: row.key,
        value: row.value,
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  );

  app.log.info("Settings routes registered");
}
