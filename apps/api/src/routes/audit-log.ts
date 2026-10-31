import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "../db/index.js";
import { requirePermission } from "../permissions.js";

export function parsePagination(query: { page?: string; limit?: string }): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "50", 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function parseFilters(query: { action?: string; ip?: string; from?: string; to?: string }) {
  const conditions = [];

  if (query.action) {
    conditions.push(eq(schema.auditLog.action, query.action));
  }
  if (query.ip) {
    conditions.push(eq(schema.auditLog.ipAddress, query.ip));
  }
  if (query.from) {
    const fromDate = new Date(query.from);
    if (!Number.isNaN(fromDate.getTime())) {
      conditions.push(gte(schema.auditLog.createdAt, fromDate));
    }
  }
  if (query.to) {
    const toDate = new Date(query.to);
    if (!Number.isNaN(toDate.getTime())) {
      conditions.push(lte(schema.auditLog.createdAt, toDate));
    }
  }

  return conditions;
}

export function serializeEntry(e: typeof schema.auditLog.$inferSelect) {
  return {
    id: e.id,
    actorId: e.actorId,
    actorUsername: e.actorUsername,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    details: e.details ?? null,
    ipAddress: e.ipAddress,
    requestId: e.requestId ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/audit-log",
    async (
      request: FastifyRequest<{
        Querystring: {
          page?: string;
          limit?: string;
          action?: string;
          ip?: string;
          from?: string;
          to?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const user = await requirePermission("audit:read")(request, reply);
      if (!user) return;

      const { page, limit, offset } = parsePagination(request.query);
      const conditions = parseFilters(request.query);
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const entries = await db
        .select()
        .from(schema.auditLog)
        .where(where)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.auditLog)
        .where(where);

      return reply.send({
        entries: entries.map(serializeEntry),
        total: countResult?.count ?? 0,
        page,
        limit,
      });
    },
  );

  app.log.info("Audit log routes registered");
}
