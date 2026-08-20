import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { auditFromRequest } from "../../lib/audit.js";
import { isEnterpriseFeatureEnabled } from "../../lib/enterprise-feature.js";
import { requirePermission } from "../../permissions.js";

const holdSchema = z.object({
  targetType: z.enum(["user", "team"]),
  targetId: z.string().min(1),
  hold: z.boolean(),
});

export async function registerLegalHoldRoutes(app: FastifyInstance): Promise<void> {
  // PUT /api/v1/enterprise/legal-hold -- set or release a hold
  app.put(
    "/api/v1/enterprise/legal-hold",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const user = await requirePermission("compliance:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      const featureEnabled = await isEnterpriseFeatureEnabled("legal_hold");
      if (!featureEnabled) {
        return reply
          .status(403)
          .send({ error: "Legal hold requires an enterprise license with the legal_hold feature" });
      }

      const parsed = holdSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid request body", details: parsed.error.issues });
      }

      const { targetType, targetId, hold } = parsed.data;

      if (targetType === "user") {
        const [existing] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.id, targetId));
        if (!existing) {
          return reply.status(404).send({ error: "User not found" });
        }
        await db
          .update(schema.users)
          .set({ legalHold: hold, updatedAt: new Date() })
          .where(eq(schema.users.id, targetId));
      } else {
        const [existing] = await db
          .select({ id: schema.teams.id })
          .from(schema.teams)
          .where(eq(schema.teams.id, targetId));
        if (!existing) {
          return reply.status(404).send({ error: "Team not found" });
        }
        await db.update(schema.teams).set({ legalHold: hold }).where(eq(schema.teams.id, targetId));
      }

      await auditFromRequest(request)(hold ? "LEGAL_HOLD_APPLIED" : "LEGAL_HOLD_RELEASED", {
        adminId: user.id,
        username: user.username,
        targetType,
        targetId,
      });

      return reply.send({ success: true, targetType, targetId, hold });
    },
  );

  // GET /api/v1/enterprise/legal-hold -- list current holds
  app.get("/api/v1/enterprise/legal-hold", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requirePermission("compliance:manage")(request, reply);
    if (!user) return;

    // Enterprise feature gate
    const featureEnabled = await isEnterpriseFeatureEnabled("legal_hold");
    if (!featureEnabled) {
      return reply
        .status(403)
        .send({ error: "Legal hold requires an enterprise license with the legal_hold feature" });
    }

    const heldUsers = await db
      .select({ id: schema.users.id, username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.legalHold, true));

    const heldTeams = await db
      .select({ id: schema.teams.id, name: schema.teams.name })
      .from(schema.teams)
      .where(eq(schema.teams.legalHold, true));

    return reply.send({ users: heldUsers, teams: heldTeams });
  });

  app.log.info("Enterprise legal hold routes registered");
}
