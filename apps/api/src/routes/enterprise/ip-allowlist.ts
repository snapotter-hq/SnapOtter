/**
 * Admin API for managing the enterprise IP allowlist.
 *
 * GET  /api/v1/enterprise/ip-allowlist  -- current list
 * PUT  /api/v1/enterprise/ip-allowlist  -- update (with self-lockout prevention)
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { auditFromRequest } from "../../lib/audit.js";
import { isEnterpriseFeatureEnabled } from "../../lib/enterprise-feature.js";
import { requirePermission } from "../../permissions.js";
import { isValidCidr, publishAllowlistRefresh } from "../../plugins/ip-allowlist.js";

const SETTINGS_KEY = "ipAllowlist";

const updateSchema = z.object({
  cidrs: z.array(z.string().min(1).max(45)).max(1000),
});

export async function registerIpAllowlistRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/enterprise/ip-allowlist
  app.get(
    "/api/v1/enterprise/ip-allowlist",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requirePermission("security:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      const featureEnabled = await isEnterpriseFeatureEnabled("ip_allowlist");
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "IP allowlisting requires an enterprise license with the ip_allowlist feature",
        });
      }

      const [row] = await db
        .select({ value: schema.settings.value })
        .from(schema.settings)
        .where(eq(schema.settings.key, SETTINGS_KEY));

      const cidrs = row ? (JSON.parse(row.value) as string[]) : [];
      return reply.send({ cidrs });
    },
  );

  // PUT /api/v1/enterprise/ip-allowlist
  app.put(
    "/api/v1/enterprise/ip-allowlist",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const user = await requirePermission("security:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      const featureEnabled = await isEnterpriseFeatureEnabled("ip_allowlist");
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "IP allowlisting requires an enterprise license with the ip_allowlist feature",
        });
      }

      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const { cidrs } = parsed.data;

      // Validate each CIDR entry
      const invalid = cidrs.filter((c) => !isValidCidr(c));
      if (invalid.length > 0) {
        return reply.status(400).send({
          error: `Invalid CIDR entries: ${invalid.join(", ")}`,
          code: "INVALID_CIDR",
        });
      }

      // Self-lockout prevention: if the new list is non-empty, ensure the
      // admin's current IP would still be allowed.
      if (cidrs.length > 0) {
        const { buildBlockList, isIpAllowed } = await import("../../plugins/ip-allowlist.js");
        const bl = buildBlockList(cidrs);
        if (bl && !isIpAllowed(request.ip, bl)) {
          return reply.status(400).send({
            error: `Your current IP (${request.ip}) would be blocked by this allowlist. Add it before saving.`,
            code: "SELF_LOCKOUT",
          });
        }
      }

      // Persist
      const value = JSON.stringify(cidrs);
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

      // Notify all instances to reload
      await publishAllowlistRefresh();

      await auditFromRequest(request)("IP_ALLOWLIST_UPDATED", {
        adminId: user.id,
        username: user.username,
        count: cidrs.length,
      });

      return reply.send({ ok: true, count: cidrs.length });
    },
  );
}
