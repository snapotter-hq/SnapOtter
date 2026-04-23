import { randomUUID } from "node:crypto";
import type { Permission } from "@ashim/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { auditLog } from "../lib/audit.js";
import { requirePermission } from "../permissions.js";

const ALL_PERMISSIONS: Permission[] = [
  "tools:use",
  "files:own",
  "files:all",
  "apikeys:own",
  "apikeys:all",
  "pipelines:own",
  "pipelines:all",
  "settings:read",
  "settings:write",
  "users:manage",
  "teams:manage",
  "branding:manage",
  "features:manage",
  "system:health",
  "audit:read",
];

const roleNameField = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(2, "Role name must be 2-30 characters")
      .max(30, "Role name must be 2-30 characters")
      .regex(
        /^[a-z0-9_-]+$/,
        "Role name can only contain lowercase letters, numbers, hyphens, and underscores",
      ),
  );

const createRoleSchema = z.object({
  name: roleNameField,
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).min(1, "At least one permission is required"),
});

const updateRoleSchema = z.object({
  name: roleNameField.optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).optional(),
});

export async function rolesRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/roles — List all roles (requires audit:read to view)
  app.get("/api/v1/roles", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requirePermission("audit:read")(request, reply);
    if (!user) return;

    const roles = db.select().from(schema.roles).all();
    const userCounts = db
      .select({
        role: schema.users.role,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.users)
      .groupBy(schema.users.role)
      .all();
    const countMap = new Map(userCounts.map((r) => [r.role, r.count]));

    return reply.send({
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: JSON.parse(r.permissions),
        isBuiltin: r.isBuiltin,
        userCount: countMap.get(r.name) ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  });

  // POST /api/v1/roles — Create custom role
  app.post("/api/v1/roles", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requirePermission("users:manage")(request, reply);
    if (!user) return;

    const parsed = createRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join("; "),
        code: "VALIDATION_ERROR",
      });
    }
    const { name, description, permissions } = parsed.data;

    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
    if (invalid.length > 0) {
      return reply
        .status(400)
        .send({ error: `Invalid permissions: ${invalid.join(", ")}`, code: "VALIDATION_ERROR" });
    }

    const existing = db.select().from(schema.roles).where(eq(schema.roles.name, name)).get();
    if (existing) {
      return reply.status(409).send({ error: "Role name already exists", code: "CONFLICT" });
    }

    const id = randomUUID();
    db.insert(schema.roles)
      .values({
        id,
        name,
        description: description?.trim() ?? "",
        permissions: JSON.stringify(permissions),
        isBuiltin: false,
        createdBy: user.id,
      })
      .run();

    auditLog(request.log, "ROLE_CREATED", { adminId: user.id, roleId: id, roleName: name });

    return reply.status(201).send({
      id,
      name,
      description: description?.trim() ?? "",
      permissions,
      isBuiltin: false,
    });
  });

  // PUT /api/v1/roles/:id — Update custom role
  app.put(
    "/api/v1/roles/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requirePermission("users:manage")(request, reply);
      if (!user) return;

      const { id } = request.params;
      const role = db.select().from(schema.roles).where(eq(schema.roles.id, id)).get();
      if (!role) {
        return reply.status(404).send({ error: "Role not found", code: "NOT_FOUND" });
      }
      if (role.isBuiltin) {
        return reply
          .status(400)
          .send({ error: "Cannot modify built-in roles", code: "VALIDATION_ERROR" });
      }

      const parsed = updateRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
          code: "VALIDATION_ERROR",
        });
      }
      const body = parsed.data;
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (body.name) {
        const dup = db.select().from(schema.roles).where(eq(schema.roles.name, body.name)).get();
        if (dup && dup.id !== id) {
          return reply.status(409).send({ error: "Role name already exists", code: "CONFLICT" });
        }
        // Update users on old role name to new name
        db.update(schema.users)
          .set({ role: body.name })
          .where(eq(schema.users.role, role.name))
          .run();
        updates.name = body.name;
      }
      if (body.description !== undefined) {
        updates.description = body.description.trim();
      }
      if (body.permissions) {
        const invalid = body.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
        if (invalid.length > 0) {
          return reply.status(400).send({
            error: `Invalid permissions: ${invalid.join(", ")}`,
            code: "VALIDATION_ERROR",
          });
        }
        updates.permissions = JSON.stringify(body.permissions);
      }

      db.update(schema.roles).set(updates).where(eq(schema.roles.id, id)).run();
      auditLog(request.log, "ROLE_UPDATED", { adminId: user.id, roleId: id });

      return reply.send({ ok: true });
    },
  );

  // DELETE /api/v1/roles/:id — Delete custom role
  app.delete(
    "/api/v1/roles/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requirePermission("users:manage")(request, reply);
      if (!user) return;

      const { id } = request.params;
      const role = db.select().from(schema.roles).where(eq(schema.roles.id, id)).get();
      if (!role) {
        return reply.status(404).send({ error: "Role not found", code: "NOT_FOUND" });
      }
      if (role.isBuiltin) {
        return reply
          .status(400)
          .send({ error: "Cannot delete built-in roles", code: "VALIDATION_ERROR" });
      }

      db.update(schema.users)
        .set({ role: "user", updatedAt: new Date() })
        .where(eq(schema.users.role, role.name))
        .run();

      db.delete(schema.roles).where(eq(schema.roles.id, id)).run();
      auditLog(request.log, "ROLE_DELETED", {
        adminId: user.id,
        roleId: id,
        roleName: role.name,
      });

      return reply.send({ ok: true });
    },
  );

  app.log.info("Roles routes registered");
}
