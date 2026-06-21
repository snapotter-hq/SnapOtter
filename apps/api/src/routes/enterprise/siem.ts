import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { db, schema } from "../../db/index.js";
import { auditFromRequest } from "../../lib/audit.js";
import { encrypt } from "../../lib/encryption.js";
import { requirePermission } from "../../permissions.js";

const configSchema = z.object({
  webhookUrl: z.string().url(),
  authHeader: z.string().default(""),
  flushIntervalSeconds: z.number().min(10).max(3600).default(30),
  enabled: z.boolean(),
});

export type SiemConfig = z.infer<typeof configSchema>;

const SETTINGS_KEY = "siem_config";

export async function registerSiemRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/enterprise/siem/config
  app.get(
    "/api/v1/enterprise/siem/config",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("webhooks:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      let featureEnabled = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        featureEnabled = isFeatureEnabled("siem_forwarding");
      } catch {
        // Enterprise package not available
      }
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "SIEM forwarding requires an enterprise license with the siem_forwarding feature",
        });
      }

      const [row] = await db
        .select({ value: schema.settings.value })
        .from(schema.settings)
        .where(eq(schema.settings.key, SETTINGS_KEY));

      if (!row) {
        return reply.send({
          webhookUrl: "",
          authHeader: "",
          flushIntervalSeconds: 30,
          enabled: false,
        });
      }

      const config = JSON.parse(row.value) as SiemConfig;
      return reply.send({
        ...config,
        authHeader: config.authHeader ? "***" : "",
      });
    },
  );

  // PUT /api/v1/enterprise/siem/config
  app.put(
    "/api/v1/enterprise/siem/config",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const user = await requirePermission("webhooks:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      let featureEnabled = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        featureEnabled = isFeatureEnabled("siem_forwarding");
      } catch {
        // Enterprise package not available
      }
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "SIEM forwarding requires an enterprise license with the siem_forwarding feature",
        });
      }

      const parsed = configSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid SIEM config", details: parsed.error.issues });
      }

      const config = { ...parsed.data };

      // Encrypt the auth header before storage if encryption key is set
      if (config.authHeader && env.DATA_ENCRYPTION_KEY) {
        config.authHeader = await encrypt(config.authHeader, env.DATA_ENCRYPTION_KEY);
      }

      const value = JSON.stringify(config);
      const now = new Date();

      const [existing] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, SETTINGS_KEY));

      if (existing) {
        await db
          .update(schema.settings)
          .set({ value, updatedAt: now })
          .where(eq(schema.settings.key, SETTINGS_KEY));
      } else {
        await db.insert(schema.settings).values({ key: SETTINGS_KEY, value });
      }

      await auditFromRequest(request)("SETTINGS_UPDATED", {
        adminId: user.id,
        username: user.username,
        keys: [SETTINGS_KEY],
      });

      return reply.send({ ok: true });
    },
  );

  app.log.info("Enterprise SIEM routes registered");
}

/**
 * Read the raw SIEM config from the settings table.
 * Returns null if not configured.
 */
export async function readSiemConfig(): Promise<SiemConfig | null> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, SETTINGS_KEY));

  if (!row) return null;

  try {
    return JSON.parse(row.value) as SiemConfig;
  } catch {
    return null;
  }
}
