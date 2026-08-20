import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { isEnterpriseFeatureEnabled } from "../../lib/enterprise-feature.js";
import { requirePermission } from "../../permissions.js";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("json"),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  action: z.string().optional(),
  actorId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
});

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function registerAuditExport(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/enterprise/audit/export",
    async (
      request: FastifyRequest<{
        Querystring: {
          format?: string;
          from?: string;
          to?: string;
          action?: string;
          actorId?: string;
          targetType?: string;
          targetId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const user = await requirePermission("audit:read")(request, reply);
      if (!user) return;

      // Check enterprise feature gate
      const featureEnabled = await isEnterpriseFeatureEnabled("audit_export");
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "Audit export requires an enterprise license with the audit_export feature",
        });
      }

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid query parameters", details: parsed.error.issues });
      }
      const { format, from, to, action, actorId, targetType, targetId } = parsed.data;

      // Build filter conditions
      const conditions = [];
      if (from) {
        conditions.push(gte(schema.auditLog.createdAt, new Date(from)));
      }
      if (to) {
        conditions.push(lte(schema.auditLog.createdAt, new Date(to)));
      }
      if (action) {
        conditions.push(eq(schema.auditLog.action, action));
      }
      if (actorId) {
        conditions.push(eq(schema.auditLog.actorId, actorId));
      }
      if (targetType) {
        conditions.push(eq(schema.auditLog.targetType, targetType));
      }
      if (targetId) {
        conditions.push(eq(schema.auditLog.targetId, targetId));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const EXPORT_LIMIT = 100_000;
      const entries = await db
        .select()
        .from(schema.auditLog)
        .where(where)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(EXPORT_LIMIT);

      if (entries.length === EXPORT_LIMIT) {
        reply.header("X-Truncated", "true");
      }

      const rows = entries.map((e) => ({
        id: e.id,
        actorId: e.actorId ?? "",
        actorUsername: e.actorUsername,
        action: e.action,
        targetType: e.targetType ?? "",
        targetId: e.targetId ?? "",
        details: e.details ? JSON.stringify(e.details) : "",
        ipAddress: e.ipAddress ?? "",
        requestId: e.requestId ?? "",
        createdAt: e.createdAt.toISOString(),
      }));

      if (format === "csv") {
        const headers = [
          "id",
          "actorId",
          "actorUsername",
          "action",
          "targetType",
          "targetId",
          "details",
          "ipAddress",
          "requestId",
          "createdAt",
        ];
        const csvLines = [headers.join(",")];
        for (const row of rows) {
          csvLines.push(
            headers.map((h) => escapeCsvField(String(row[h as keyof typeof row]))).join(","),
          );
        }
        return reply
          .header("Content-Type", "text/csv")
          .header("Content-Disposition", 'attachment; filename="audit-export.csv"')
          .send(csvLines.join("\n"));
      }

      // JSON format
      return reply
        .header("Content-Type", "application/json")
        .header("Content-Disposition", 'attachment; filename="audit-export.json"')
        .send(JSON.stringify(rows));
    },
  );

  app.log.info("Enterprise audit export route registered");
}
