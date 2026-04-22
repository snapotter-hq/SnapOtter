/**
 * API Key management routes.
 *
 * POST   /api/v1/api-keys      — Generate a new API key
 * GET    /api/v1/api-keys      — List the current user's API keys
 * DELETE /api/v1/api-keys/:id  — Delete an API key
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "../db/index.js";
import { auditLog } from "../lib/audit.js";
import { getPermissions, hasEffectivePermission } from "../permissions.js";
import { computeKeyPrefix, hashPassword, requireAuth } from "../plugins/auth.js";

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/api-keys — Generate a new API key
  app.post("/api/v1/api-keys", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(request, reply);
    if (!user) return;

    const body = request.body as { name?: string; permissions?: string[] } | null;
    const name = body?.name?.trim() || "Default API Key";

    if (name.length > 100) {
      return reply.status(400).send({
        error: "Key name must be 100 characters or fewer",
        code: "VALIDATION_ERROR",
      });
    }

    let scopedPermissions: string[] | null = null;
    if (Array.isArray(body?.permissions) && body.permissions.length > 0) {
      const userPerms = getPermissions(user.role);
      const invalid = body.permissions.filter((p: string) => !userPerms.includes(p as any));
      if (invalid.length > 0) {
        return reply.status(400).send({
          error: `Cannot scope key with permissions you don't have: ${invalid.join(", ")}`,
          code: "VALIDATION_ERROR",
        });
      }
      scopedPermissions = body.permissions;
    }

    // Generate a raw API key: "si_" prefix + 48 random bytes as hex
    const rawKey = `si_${randomBytes(48).toString("hex")}`;
    const keyHash = await hashPassword(rawKey);
    const keyPrefix = computeKeyPrefix(rawKey);
    const id = randomUUID();

    db.insert(schema.apiKeys)
      .values({
        id,
        userId: user.id,
        keyHash,
        keyPrefix,
        name,
        permissions: scopedPermissions ? JSON.stringify(scopedPermissions) : null,
      })
      .run();

    auditLog(request.log, "API_KEY_CREATED", { userId: user.id, keyId: id, keyName: name });

    // Return the raw key ONCE — it cannot be retrieved again
    return reply.status(201).send({
      id,
      key: rawKey,
      name,
      permissions: scopedPermissions,
      createdAt: new Date().toISOString(),
    });
  });

  // GET /api/v1/api-keys — List user's API keys (never returns the key itself)
  app.get("/api/v1/api-keys", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireAuth(request, reply);
    if (!user) return;

    const selectFields = {
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      permissions: schema.apiKeys.permissions,
      createdAt: schema.apiKeys.createdAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
    };
    const keys = hasEffectivePermission(user, "apikeys:all")
      ? db.select(selectFields).from(schema.apiKeys).all()
      : db
          .select(selectFields)
          .from(schema.apiKeys)
          .where(eq(schema.apiKeys.userId, user.id))
          .all();

    return reply.send({
      apiKeys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        permissions: k.permissions ? JSON.parse(k.permissions) : null,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      })),
    });
  });

  // DELETE /api/v1/api-keys/:id — Delete an API key
  app.delete(
    "/api/v1/api-keys/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { id } = request.params;

      // Ensure the key belongs to the requesting user
      const existing = db
        .select()
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, user.id)))
        .get();

      if (!existing) {
        return reply.status(404).send({
          error: "API key not found",
          code: "NOT_FOUND",
        });
      }

      db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id)).run();

      auditLog(request.log, "API_KEY_DELETED", { userId: user.id, keyId: id });

      return reply.send({ ok: true });
    },
  );

  app.log.info("API key routes registered");
}
