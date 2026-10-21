import { randomUUID } from "node:crypto";
import {
  normalizeRoleName,
  type Permission,
  ROLE_NAME_MAX_LENGTH,
  ROLE_NAME_MIN_LENGTH,
  ROLE_NAME_PATTERN,
} from "@snapotter/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { auditFromRequest } from "../lib/audit.js";
import { isUniqueViolation } from "../lib/pg-errors.js";
import {
  canAssignRole,
  canGrantRoleDefinition,
  canManageRoleDefinition,
  hasEffectivePermission,
  requirePermission,
} from "../permissions.js";
import type { AuthUser } from "../plugins/auth.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function resolveTransactionActor(tx: Tx, user: AuthUser): Promise<AuthUser | null> {
  let currentActor = user;
  if (user.id !== "anonymous") {
    const [currentActorRow] = await tx
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    if (!currentActorRow) return null;
    currentActor = { ...user, role: currentActorRow.role };
  }
  if (!(await hasEffectivePermission(currentActor, "security:manage", tx))) {
    return null;
  }
  return currentActor;
}

export const ALL_PERMISSIONS: Permission[] = [
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

export function validatePermissions(permissions: string[]): string[] {
  return permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
}

export const roleNameField = z
  .string()
  .transform(normalizeRoleName)
  .pipe(
    z
      .string()
      .min(ROLE_NAME_MIN_LENGTH, "Role name must be 2-30 characters")
      .max(ROLE_NAME_MAX_LENGTH, "Role name must be 2-30 characters")
      .regex(
        ROLE_NAME_PATTERN,
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

export const createRoleSchema = z.object({
  name: roleNameField,
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).min(1, "At least one permission is required"),
  toolPermissions: toolPermissionsSchema,
});

export const updateRoleSchema = z.object({
  name: roleNameField.optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).min(1, "At least one permission is required").optional(),
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

    const invalid = validatePermissions(permissions);
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
    // The pre-check above can't close the race: two concurrent creates both
    // pass the SELECT before either insert commits (issue #927).
    const inserted = await db
      .insert(schema.roles)
      .values({
        id,
        name,
        description: description?.trim() ?? "",
        permissions,
        toolPermissions: toolPermissions ?? null,
        isBuiltin: false,
        createdBy: user.id,
      })
      .onConflictDoNothing({ target: schema.roles.name });

    if (!inserted.rowCount) {
      return reply.status(409).send({ error: "Role name already exists", code: "CONFLICT" });
    }

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
        const invalid = validatePermissions(body.permissions);
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

      // The pre-check above can't close the race: two concurrent renames onto
      // the same name both pass it before either UPDATE commits (issue #991).
      // The catch wraps the whole transaction rather than the UPDATE itself
      // because a failed statement has already poisoned the transaction, so
      // nothing further can run inside it. Postgres takes the users.role
      // rewrite back on the rollback.
      //
      // The role row is locked and re-read inside the transaction instead of
      // trusted from the select above (issues #1152, #1196). Two renames of
      // one role both read the old name up there; the second one's users.role
      // rewrite then matched nothing, its roles UPDATE still landed, and every
      // assignee was left on a name with no row behind it. Under the lock the
      // second rename waits for the first and rewrites from the name it
      // committed, a role deleted in that window comes back as no row rather
      // than a no-op 200, and the authority checks re-run against the locked
      // definition so permissions widened in that window cannot be bypassed.
      // Lock order is the roles row, then users rows; the delete below takes
      // them in the same order, so one always waits for the other instead of
      // the two deadlocking.
      try {
        const outcome = await db.transaction(async (tx) => {
          const [locked] = await tx
            .select()
            .from(schema.roles)
            .where(eq(schema.roles.id, id))
            .for("update");
          const currentActor = await resolveTransactionActor(tx, user);
          if (!currentActor) return "manage-denied" as const;
          if (!locked) return "vanished" as const;
          if (
            !(await canManageRoleDefinition(
              currentActor,
              locked.name,
              locked.permissions,
              locked.toolPermissions,
              tx,
            ))
          ) {
            return "manage-denied" as const;
          }
          const lockedProspectivePermissions = body.permissions ?? locked.permissions;
          const lockedProspectiveToolPermissions =
            body.toolPermissions !== undefined
              ? (body.toolPermissions ?? null)
              : locked.toolPermissions;
          if (
            !(await canGrantRoleDefinition(
              currentActor,
              lockedProspectivePermissions,
              lockedProspectiveToolPermissions,
              tx,
            ))
          ) {
            return "grant-denied" as const;
          }
          if (body.name) {
            const renamedDisabledRole = `disabled:${body.name}`;
            await tx
              .update(schema.users)
              .set({
                role: sql<string>`CASE
                  WHEN ${schema.users.role} = ${locked.name} THEN ${body.name}
                  ELSE ${renamedDisabledRole}
                END`,
                updatedAt: new Date(),
              })
              .where(
                sql`regexp_replace(${schema.users.role}, '^(disabled:)+', '') = ${locked.name}`,
              );
          }
          await tx.update(schema.roles).set(updates).where(eq(schema.roles.id, id));
          return "updated" as const;
        });
        if (outcome === "vanished") {
          request.log.info({ roleId: id }, "role deleted between its pre-checks and the row lock");
          return reply.status(404).send({ error: "Role not found", code: "NOT_FOUND" });
        }
        if (outcome === "manage-denied") {
          return reply.status(403).send({
            error: "Cannot manage a role beyond your role authority",
            code: "ESCALATION_DENIED",
          });
        }
        if (outcome === "grant-denied") {
          return reply.status(403).send({
            error: "Cannot update a role beyond your role authority",
            code: "ESCALATION_DENIED",
          });
        }
      } catch (err) {
        // Narrowed to the rename: `name` is the only unique column on roles, so
        // a 23505 from a permissions-only update is something else entirely and
        // must not come back wearing this message.
        if (body.name && isUniqueViolation(err)) {
          return reply.status(409).send({ error: "Role name already exists", code: "CONFLICT" });
        }
        throw err;
      }

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

      // Same lock, same order as the rename above (issues #1152, #1196): the
      // role row first, then its users, with the name and authority checked
      // against the locked row. A rename that committed since the select above
      // has already moved the assignees onto its new name, and a permissions
      // change in that window may have raised the role beyond the caller's
      // authority.
      const removed = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(schema.roles)
          .where(eq(schema.roles.id, id))
          .for("update");
        const currentActor = await resolveTransactionActor(tx, user);
        if (!currentActor) return "denied" as const;
        if (!locked) return "vanished" as const;
        if (
          !(await canManageRoleDefinition(
            currentActor,
            locked.name,
            locked.permissions,
            locked.toolPermissions,
            tx,
          ))
        ) {
          return "denied" as const;
        }
        if (!(await canAssignRole(currentActor, "user", tx))) {
          return "reassign-denied" as const;
        }
        await tx
          .update(schema.users)
          .set({
            role: sql<string>`CASE
              WHEN ${schema.users.role} = ${locked.name} THEN 'user'
              ELSE 'disabled:user'
            END`,
            updatedAt: new Date(),
          })
          .where(sql`regexp_replace(${schema.users.role}, '^(disabled:)+', '') = ${locked.name}`);
        await tx.delete(schema.roles).where(eq(schema.roles.id, id));
        return locked;
      });
      if (removed === "vanished") {
        request.log.info({ roleId: id }, "role deleted between its pre-checks and the row lock");
        return reply.status(404).send({ error: "Role not found", code: "NOT_FOUND" });
      }
      if (removed === "denied") {
        return reply.status(403).send({
          error: "Cannot manage a role beyond your role authority",
          code: "ESCALATION_DENIED",
        });
      }
      if (removed === "reassign-denied") {
        return reply.status(403).send({
          error: "Cannot reassign role members beyond your role authority",
          code: "ESCALATION_DENIED",
        });
      }
      await auditFromRequest(request)("ROLE_DELETED", {
        adminId: user.id,
        roleId: id,
        roleName: removed.name,
      });

      return reply.send({ ok: true });
    },
  );

  app.log.info("Roles routes registered");
}
