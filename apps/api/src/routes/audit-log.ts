import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "../db/index.js";
import { requirePermission } from "../permissions.js";

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/audit-log",
    async (
      request: FastifyRequest<{
        Querystring: {
          page?: string;
          limit?: string;
          action?: string;
          from?: string;
          to?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const user = requirePermission("audit:read")(request, reply);
      if (!user) return;

      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "50", 10) || 50));
      const offset = (page - 1) * limit;

      const conditions = [];

      if (request.query.action) {
        conditions.push(eq(schema.auditLog.action, request.query.action));
      }
      if (request.query.from) {
        const fromDate = new Date(request.query.from);
        if (!Number.isNaN(fromDate.getTime())) {
          conditions.push(gte(schema.auditLog.createdAt, fromDate));
        }
      }
      if (request.query.to) {
        const toDate = new Date(request.query.to);
        if (!Number.isNaN(toDate.getTime())) {
          conditions.push(lte(schema.auditLog.createdAt, toDate));
        }
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const entries = db
        .select()
        .from(schema.auditLog)
        .where(where)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(limit)
        .offset(offset)
        .all();

      const countResult = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.auditLog)
        .where(where)
        .get();

      return reply.send({
        entries: entries.map((e) => ({
          id: e.id,
          actorId: e.actorId,
          actorUsername: e.actorUsername,
          action: e.action,
          targetType: e.targetType,
          targetId: e.targetId,
          details: e.details ? JSON.parse(e.details) : null,
          ipAddress: e.ipAddress,
          createdAt: e.createdAt.toISOString(),
        })),
        total: countResult?.count ?? 0,
        page,
        limit,
      });
    },
  );

  app.log.info("Audit log routes registered");
}
