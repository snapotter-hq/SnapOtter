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
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { auditFromRequest } from "../lib/audit.js";
import { decrypt, encrypt, isEncrypted } from "../lib/encryption.js";
import { requirePermission } from "../permissions.js";
import { requireAuth } from "../plugins/auth.js";

const settingsBodySchema = z.record(z.string().min(1), z.unknown());

const HTML_TAG_PATTERN = /<[a-z/!?][^>]*>/i;

const SENSITIVE_KEYS = new Set([
  "cookie_secret",
  "instance_id",
  "oidc_client_secret",
  "saml_idp_certificate",
  "siem_webhook_auth",
]);

const REDACTED_KEYS = new Set(["cookie_secret", "oidc_client_secret", "siem_webhook_auth"]);

const READONLY_KEYS = new Set(["cookie_secret", "instance_id"]);

async function encryptIfSensitive(key: string, value: string): Promise<string> {
  if (!env.DATA_ENCRYPTION_KEY || !SENSITIVE_KEYS.has(key)) return value;
  return encrypt(value, env.DATA_ENCRYPTION_KEY);
}

async function decryptIfNeeded(value: string): Promise<string> {
  if (!isEncrypted(value)) return value;
  if (!env.DATA_ENCRYPTION_KEY) return value;
  return (
    (await decrypt(
      value,
      env.DATA_ENCRYPTION_KEY,
      env.DATA_ENCRYPTION_KEY_PREVIOUS || undefined,
    )) ?? value
  );
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/settings — Get all settings as a key-value object
  app.get(
    "/api/v1/settings",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const isAdmin = user.role === "admin";
      const rows = await db.select().from(schema.settings);

      const settings: Record<string, string> = {};
      for (const row of rows) {
        if (!isAdmin && SENSITIVE_KEYS.has(row.key)) continue;
        if (REDACTED_KEYS.has(row.key)) {
          settings[row.key] = "********";
          continue;
        }
        settings[row.key] = await decryptIfNeeded(row.value);
      }

      return reply.send({ settings });
    },
  );

  // PUT /api/v1/settings — Save settings (admin only)
  app.put("/api/v1/settings", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("settings:write")(request, reply);
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

      if (READONLY_KEYS.has(key)) {
        return reply.status(400).send({
          error: `Setting "${key}" cannot be modified via the API`,
          code: "READONLY_SETTING",
        });
      }

      entries.push({ key, strValue });
    }

    // Pass 2: write all entries now that all have passed validation
    const now = new Date();

    for (const { key, strValue } of entries) {
      const storedValue = await encryptIfSensitive(key, strValue);

      // Upsert: insert or update on conflict
      const [existing] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, key));

      if (existing) {
        await db
          .update(schema.settings)
          .set({ value: storedValue, updatedAt: now })
          .where(eq(schema.settings.key, key));
      } else {
        await db.insert(schema.settings).values({ key, value: storedValue });
      }
    }

    if (entries.length > 0) {
      await auditFromRequest(request)("SETTINGS_UPDATED", {
        adminId: admin.id,
        username: admin.username,
        keys: entries.map((e) => e.key),
      });
    }

    if (entries.some((e) => e.key === "analyticsEnabled")) {
      // The setting is already persisted. A Redis hiccup here must not turn a
      // successful save into a 500; the TTL refresh converges replicas anyway.
      try {
        const { refreshAnalyticsGate, publishAnalyticsGateInvalidation } = await import(
          "../lib/analytics-gate.js"
        );
        await refreshAnalyticsGate(); // this replica, immediately
        await publishAnalyticsGateInvalidation(); // all other replicas
      } catch (err) {
        request.log.warn({ err }, "analytics gate invalidation failed (save still applied)");
      }
    }

    return reply.send({ ok: true, updatedCount: entries.length });
  });

  // GET /api/v1/settings/:key — Get a specific setting
  app.get(
    "/api/v1/settings/:key",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { key } = request.params;

      if (SENSITIVE_KEYS.has(key) && user.role !== "admin") {
        return reply.status(403).send({ error: "Forbidden", code: "FORBIDDEN" });
      }

      const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));

      if (!row) {
        return reply.status(404).send({
          error: `Setting "${key}" not found`,
          code: "NOT_FOUND",
        });
      }

      return reply.send({
        key: row.key,
        value: REDACTED_KEYS.has(row.key) ? "********" : await decryptIfNeeded(row.value),
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  );

  app.log.info("Settings routes registered");
}
