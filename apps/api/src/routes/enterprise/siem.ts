import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { db, schema } from "../../db/index.js";
import { auditFromRequest } from "../../lib/audit.js";
import { encrypt, isEncrypted } from "../../lib/encryption.js";
import { isEnterpriseFeatureEnabled } from "../../lib/enterprise-feature.js";
import { logger } from "../../lib/logger.js";
import { validateFetchUrl } from "../../lib/ssrf.js";
import { requirePermission } from "../../permissions.js";

const configSchema = z.object({
  webhookUrl: z.string().url(),
  authHeader: z.string().default(""),
  flushIntervalSeconds: z.number().min(10).max(3600).default(30),
  enabled: z.boolean(),
});

export type SiemConfig = z.infer<typeof configSchema>;

const SETTINGS_KEY = "siem_config";

function parseSiemConfig(raw: string): SiemConfig | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      logger.warn({ key: SETTINGS_KEY }, "siem: stored siem_config is not a JSON object");
      return null;
    }
    return parsed as SiemConfig;
  } catch (err) {
    logger.warn({ err, key: SETTINGS_KEY }, "siem: failed to parse stored siem_config JSON");
    return null;
  }
}

async function validateSiemWebhookUrl(url: string, reply: FastifyReply): Promise<boolean> {
  try {
    await validateFetchUrl(url);
    return true;
  } catch (err) {
    reply.status(400).send({
      error: "SIEM webhook URL must resolve to a public HTTP(S) destination",
      details: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function registerSiemRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/enterprise/siem/config
  app.get(
    "/api/v1/enterprise/siem/config",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("webhooks:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      const featureEnabled = await isEnterpriseFeatureEnabled("siem_forwarding");
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "SIEM forwarding requires an enterprise license with the siem_forwarding feature",
        });
      }

      const [row] = await db
        .select({ value: schema.settings.value })
        .from(schema.settings)
        .where(eq(schema.settings.key, SETTINGS_KEY));

      const config = row ? parseSiemConfig(row.value) : null;
      if (!config) {
        return reply.send({
          webhookUrl: "",
          authHeader: "",
          flushIntervalSeconds: 30,
          enabled: false,
        });
      }

      return reply.send({
        ...config,
        authHeader: typeof config.authHeader === "string" && config.authHeader ? "***" : "",
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
      const featureEnabled = await isEnterpriseFeatureEnabled("siem_forwarding");
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
      if (!(await validateSiemWebhookUrl(config.webhookUrl, reply))) return;

      const [existing] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, SETTINGS_KEY));

      // GET masks a non-empty authHeader as "***"; preserve the stored secret
      // when a client echoes the mask back on update (#2531).
      if (config.authHeader === "***") {
        const existingConfig = existing ? parseSiemConfig(existing.value) : null;
        config.authHeader =
          typeof existingConfig?.authHeader === "string" ? existingConfig.authHeader : "";
      }
      if (config.authHeader && env.DATA_ENCRYPTION_KEY && !isEncrypted(config.authHeader)) {
        // Encrypt the auth header before storage if encryption key is set
        config.authHeader = await encrypt(config.authHeader, env.DATA_ENCRYPTION_KEY);
      }

      const value = JSON.stringify(config);
      const now = new Date();

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

  return parseSiemConfig(row.value);
}
