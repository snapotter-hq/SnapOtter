import { randomUUID } from "node:crypto";
import type { Permission } from "@snapotter/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { auditFromRequest } from "../lib/audit.js";
import {
  canAssignRole,
  canGrantRoleDefinition,
  canManageRoleDefinition,
  requirePermission,
} from "../permissions.js";

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
  "features:manage",
  "system:health",
  "audit:read",
  "compliance:manage",
  "webhooks:manage",
  "security:manage",
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

const toolPermissionsSchema = z
  .object({
    mode: z.enum(["category", "tool"]),
    allowed: z.array(z.string()),
  })
  .nullable()
  .optional();

const createRoleSchema = z.object({
  name: roleNameField,
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).min(1, "At least one permission is required"),
  toolPermissions: toolPermissionsSchema,
});

const updateRoleSchema = z.object({
  name: roleNameField.optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).optional(),
  toolPermissions: toolPermissionsSchema,
});

export async function rolesRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/roles — List all roles (requires audit:read to view)
  app.get("/api/v1/roles", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requirePermission("audit:read")(request, reply);
    if (!user) return;

    const roles = await db.select().from(schema.roles);
    const userCounts = await db
      .select({
        role: schema.users.role,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(schema.users)
      .groupBy(schema.users.role);
    const countMap = new Map(userCounts.map((r) => [r.role, r.count]));

    return reply.send({
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        toolPermissions: r.toolPermissions ?? null,
        isBuiltin: r.isBuiltin,
        userCount: countMap.get(r.name) ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  });

  // POST /api/v1/roles — Create custom role
  app.post("/api/v1/roles", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requirePermission("security:manage")(request, reply);
    if (!user) return;

    const parsed = createRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join("; "),
        code: "VALIDATION_ERROR",
      });
    }
    const { name, description, permissions, toolPermissions } = parsed.data;

    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
    if (invalid.length > 0) {
      return reply
        .status(400)
        .send({ error: `Invalid permissions: ${invalid.join(", ")}`, code: "VALIDATION_ERROR" });
    }
    if (!(await canGrantRoleDefinition(user, permissions, toolPermissions ?? null))) {
      return reply.status(403).send({
        error: "Cannot create a role beyond your role authority",
        code: "ESCALATION_DENIED",
      });
    }

    const [existing] = await db.select().from(schema.roles).where(eq(schema.roles.name, name));
    if (existing) {
      return reply.status(409).send({ error: "Role name already exists", code: "CONFLICT" });
    }

    const id = randomUUID();
    await db.insert(schema.roles).values({
      id,
      name,
      description: description?.trim() ?? "",
      permissions,
      toolPermissions: toolPermissions ?? null,
      isBuiltin: false,
      createdBy: user.id,
    });

    await auditFromRequest(request)("ROLE_CREATED", {
      adminId: user.id,
      roleId: id,
      roleName: name,
    });

    return reply.status(201).send({
      id,
      name,
      description: description?.trim() ?? "",
      permissions,
      toolPermissions: toolPermissions ?? null,
      isBuiltin: false,
    });
  });

  // PUT /api/v1/roles/:id — Update custom role
  app.put(
    "/api/v1/roles/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await requirePermission("security:manage")(request, reply);
      if (!user) return;

      const { id } = request.params;
      const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, id));
      if (!role) {
        return reply.status(404).send({ error: "Role not found", code: "NOT_FOUND" });
      }
      if (role.isBuiltin) {
        return reply
          .status(400)
          .send({ error: "Cannot modify built-in roles", code: "VALIDATION_ERROR" });
      }
      if (
        !(await canManageRoleDefinition(user, role.name, role.permissions, role.toolPermissions))
      ) {
        return reply.status(403).send({
          error: "Cannot manage a role beyond your role authority",
          code: "ESCALATION_DENIED",
        });
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
        const [dup] = await db.select().from(schema.roles).where(eq(schema.roles.name, body.name));
        if (dup && dup.id !== id) {
          return reply.status(409).send({ error: "Role name already exists", code: "CONFLICT" });
        }
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
        updates.permissions = body.permissions;
      }

      const prospectivePermissions = body.permissions ?? role.permissions;
      const prospectiveToolPermissions =
        body.toolPermissions !== undefined ? (body.toolPermissions ?? null) : role.toolPermissions;
      if (
        !(await canGrantRoleDefinition(user, prospectivePermissions, prospectiveToolPermissions))
      ) {
        return reply.status(403).send({
          error: "Cannot update a role beyond your role authority",
          code: "ESCALATION_DENIED",
        });
      }

      if (body.toolPermissions !== undefined) {
        updates.toolPermissions = body.toolPermissions ?? null;
      }

      await db.transaction(async (tx) => {
        if (body.name) {
          const renamedDisabledRole = `disabled:${body.name}`;
          await tx
            .update(schema.users)
            .set({
              role: sql<string>`CASE
                WHEN ${schema.users.role} = ${role.name} THEN ${body.name}
                ELSE ${renamedDisabledRole}
              END`,
              updatedAt: new Date(),
            })
            .where(sql`regexp_replace(${schema.users.role}, '^(disabled:)+', '') = ${role.name}`);
        }
        await tx.update(schema.roles).set(updates).where(eq(schema.roles.id, id));
      });
      await auditFromRequest(request)("ROLE_UPDATED", { adminId: user.id, roleId: id });

      return reply.send({ ok: true });
    },
  );

  // DELETE /api/v1/roles/:id — Delete custom role
  app.delete(
    "/api/v1/roles/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await requirePermission("security:manage")(request, reply);
      if (!user) return;

      const { id } = request.params;
      const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, id));
      if (!role) {
        return reply.status(404).send({ error: "Role not found", code: "NOT_FOUND" });
      }
      if (role.isBuiltin) {
        return reply
          .status(400)
          .send({ error: "Cannot delete built-in roles", code: "VALIDATION_ERROR" });
      }
      if (
        !(await canManageRoleDefinition(user, role.name, role.permissions, role.toolPermissions))
      ) {
        return reply.status(403).send({
          error: "Cannot manage a role beyond your role authority",
          code: "ESCALATION_DENIED",
        });
      }

      // Deletion always has the side effect of assigning the built-in user
      // fallback. Authorize that transition up front, even when the role is
      // currently empty, so concurrent membership changes cannot bypass it.
      if (!(await canAssignRole(user, "user"))) {
        return reply.status(403).send({
          error: "Cannot reassign role members beyond your role authority",
          code: "ESCALATION_DENIED",
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({
            role: sql<string>`CASE
              WHEN ${schema.users.role} = ${role.name} THEN 'user'
              ELSE 'disabled:user'
            END`,
            updatedAt: new Date(),
          })
          .where(sql`regexp_replace(${schema.users.role}, '^(disabled:)+', '') = ${role.name}`);
        await tx.delete(schema.roles).where(eq(schema.roles.id, id));
      });
      await auditFromRequest(request)("ROLE_DELETED", {
        adminId: user.id,
        roleId: id,
        roleName: role.name,
      });

      return reply.send({ ok: true });
    },
  );

  app.log.info("Roles routes registered");
}
