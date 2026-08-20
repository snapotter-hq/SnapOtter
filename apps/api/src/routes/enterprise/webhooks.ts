/**
 * Unified webhook destination management (enterprise).
 *
 * CRUD for webhook destinations stored as a JSON array in the settings table
 * under the key "webhook_destinations". Each destination can be type "siem"
 * (forward audit events) or "alerts" (receive admin alert conditions).
 *
 * Gated behind the `webhooks:manage` permission + `admin_alerts` enterprise feature.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { db, schema } from "../../db/index.js";
import { auditFromRequest } from "../../lib/audit.js";
import { encrypt } from "../../lib/encryption.js";
import { isEnterpriseFeatureEnabled } from "../../lib/enterprise-feature.js";
import { validateFetchUrl } from "../../lib/ssrf.js";
import { deliverWebhook } from "../../lib/webhook-delivery.js";
import { requirePermission } from "../../permissions.js";

const SETTINGS_KEY = "webhook_destinations";

const webhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  authHeader: z.string().default(""),
  eventFilter: z.array(z.string()).default([]),
  batchIntervalSeconds: z.number().min(10).max(3600).default(30),
  enabled: z.boolean().default(true),
  type: z.enum(["siem", "alerts"]).default("alerts"),
});

export type WebhookDestination = z.infer<typeof webhookSchema>;

async function readDestinations(): Promise<WebhookDestination[]> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, SETTINGS_KEY));

  if (!row) return [];

  try {
    return JSON.parse(row.value) as WebhookDestination[];
  } catch {
    return [];
  }
}

async function writeDestinations(destinations: WebhookDestination[]): Promise<void> {
  const value = JSON.stringify(destinations);
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
}

async function checkFeatureGate(reply: FastifyReply): Promise<boolean> {
  const featureEnabled = await isEnterpriseFeatureEnabled("admin_alerts");
  if (!featureEnabled) {
    reply.status(403).send({
      error: "Webhook management requires a license with the admin_alerts feature",
    });
    return false;
  }
  return true;
}

async function validateWebhookDestinationUrl(url: string, reply: FastifyReply): Promise<boolean> {
  try {
    await validateFetchUrl(url);
    return true;
  } catch (err) {
    reply.status(400).send({
      error: "Webhook URL must resolve to a public HTTP(S) destination",
      details: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/enterprise/webhooks -- list all destinations
  app.get("/api/v1/enterprise/webhooks", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requirePermission("webhooks:manage")(request, reply);
    if (!user) return;
    if (!(await checkFeatureGate(reply))) return;

    const destinations = await readDestinations();

    // Mask auth headers in response
    const masked = destinations.map((d) => ({
      ...d,
      authHeader: d.authHeader ? "***" : "",
    }));

    return reply.send({ destinations: masked });
  });

  // POST /api/v1/enterprise/webhooks -- create a destination
  app.post(
    "/api/v1/enterprise/webhooks",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const user = await requirePermission("webhooks:manage")(request, reply);
      if (!user) return;
      if (!(await checkFeatureGate(reply))) return;

      const parsed = webhookSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid webhook destination", details: parsed.error.issues });
      }

      const dest = { ...parsed.data };
      if (!(await validateWebhookDestinationUrl(dest.url, reply))) return;

      // Encrypt the auth header before storage
      if (dest.authHeader && env.DATA_ENCRYPTION_KEY) {
        dest.authHeader = await encrypt(dest.authHeader, env.DATA_ENCRYPTION_KEY);
      }

      const destinations = await readDestinations();
      destinations.push(dest);
      await writeDestinations(destinations);

      await auditFromRequest(request)("SETTINGS_UPDATED", {
        adminId: user.id,
        username: user.username,
        keys: [SETTINGS_KEY],
        action: "webhook_created",
        name: dest.name,
      });

      return reply.status(201).send({ ok: true, index: destinations.length - 1 });
    },
  );

  // PUT /api/v1/enterprise/webhooks/:index -- update a destination by index
  app.put(
    "/api/v1/enterprise/webhooks/:index",
    async (
      request: FastifyRequest<{ Params: { index: string }; Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const user = await requirePermission("webhooks:manage")(request, reply);
      if (!user) return;
      if (!(await checkFeatureGate(reply))) return;

      const index = parseInt(request.params.index, 10);
      if (Number.isNaN(index) || index < 0) {
        return reply.status(400).send({ error: "Invalid index" });
      }

      const parsed = webhookSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid webhook destination", details: parsed.error.issues });
      }

      const destinations = await readDestinations();
      if (index >= destinations.length) {
        return reply.status(404).send({ error: "Webhook destination not found" });
      }

      const dest = { ...parsed.data };
      if (!(await validateWebhookDestinationUrl(dest.url, reply))) return;

      // Encrypt the auth header before storage
      if (dest.authHeader && env.DATA_ENCRYPTION_KEY) {
        dest.authHeader = await encrypt(dest.authHeader, env.DATA_ENCRYPTION_KEY);
      }

      destinations[index] = dest;
      await writeDestinations(destinations);

      await auditFromRequest(request)("SETTINGS_UPDATED", {
        adminId: user.id,
        username: user.username,
        keys: [SETTINGS_KEY],
        action: "webhook_updated",
        name: dest.name,
      });

      return reply.send({ ok: true });
    },
  );

  // DELETE /api/v1/enterprise/webhooks/:index -- remove a destination
  app.delete(
    "/api/v1/enterprise/webhooks/:index",
    async (request: FastifyRequest<{ Params: { index: string } }>, reply: FastifyReply) => {
      const user = await requirePermission("webhooks:manage")(request, reply);
      if (!user) return;
      if (!(await checkFeatureGate(reply))) return;

      const index = parseInt(request.params.index, 10);
      if (Number.isNaN(index) || index < 0) {
        return reply.status(400).send({ error: "Invalid index" });
      }

      const destinations = await readDestinations();
      if (index >= destinations.length) {
        return reply.status(404).send({ error: "Webhook destination not found" });
      }

      const removed = destinations.splice(index, 1)[0];
      await writeDestinations(destinations);

      await auditFromRequest(request)("SETTINGS_UPDATED", {
        adminId: user.id,
        username: user.username,
        keys: [SETTINGS_KEY],
        action: "webhook_deleted",
        name: removed.name,
      });

      return reply.send({ ok: true });
    },
  );

  // POST /api/v1/enterprise/webhooks/:index/test -- send a test ping
  app.post(
    "/api/v1/enterprise/webhooks/:index/test",
    async (request: FastifyRequest<{ Params: { index: string } }>, reply: FastifyReply) => {
      const user = await requirePermission("webhooks:manage")(request, reply);
      if (!user) return;
      if (!(await checkFeatureGate(reply))) return;

      const index = parseInt(request.params.index, 10);
      if (Number.isNaN(index) || index < 0) {
        return reply.status(400).send({ error: "Invalid index" });
      }

      const destinations = await readDestinations();
      if (index >= destinations.length) {
        return reply.status(404).send({ error: "Webhook destination not found" });
      }

      const dest = destinations[index];

      // Decrypt auth header if needed
      let authHeader = dest.authHeader;
      if (authHeader) {
        try {
          const { isEncrypted, decrypt } = await import("../../lib/encryption.js");
          if (isEncrypted(authHeader) && env.DATA_ENCRYPTION_KEY) {
            const decrypted = await decrypt(authHeader, env.DATA_ENCRYPTION_KEY);
            authHeader = decrypted ?? "";
          }
        } catch {
          // Use raw value if decryption fails
        }
      }

      const testEvent = [
        {
          condition: "test_ping",
          message: "This is a test webhook from SnapOtter",
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await deliverWebhook(dest.url, authHeader, testEvent, { maxRetries: 0 });

      return reply.send({
        ok: result.success,
        statusCode: result.statusCode,
        error: result.error,
      });
    },
  );

  app.log.info("Enterprise webhook routes registered");
}
