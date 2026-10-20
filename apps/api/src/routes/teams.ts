/**
 * Team management routes (CRUD).
 *
 * GET    /api/v1/teams      — List all teams with member count
 * POST   /api/v1/teams      — Create team (admin only)
 * PUT    /api/v1/teams/:id  — Update team (admin only)
 * DELETE /api/v1/teams/:id  — Delete team (admin only)
 */

import { randomUUID } from "node:crypto";
import { TEAM_NAME_MAX_LENGTH } from "@snapotter/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { isUniqueViolation } from "../lib/pg-errors.js";
import { requirePermission } from "../permissions.js";

const teamNameField = z
  .string({ required_error: "Team name is required" })
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .min(1, "Team name is required")
      .max(TEAM_NAME_MAX_LENGTH, "Team name must be 50 characters or fewer"),
  );

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const createTeamSchema = z
  .object({
    name: teamNameField,
    storageQuota: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    retentionHours: z.number().int().positive().max(POSTGRES_INTEGER_MAX).nullable().optional(),
  })
  .strict();

const updateTeamSchema = z
  .object({
    name: teamNameField.optional(),
    storageQuota: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    retentionHours: z.number().int().positive().max(POSTGRES_INTEGER_MAX).nullable().optional(),
  })
  // Strict because Zod strips unknown keys before any refine runs: without it a
  // body misspelling storagequota alongside a valid name would parse, rename the
  // team, drop the quota and still answer 200 (#2005).
  .strict()
  .refine(
    (s) => s.name !== undefined || s.storageQuota !== undefined || s.retentionHours !== undefined,
    {
      message: "At least one of name, storageQuota, or retentionHours is required",
    },
  );

export async function teamsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/teams — List all teams with member count (admin only)
  app.get("/api/v1/teams", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requirePermission("teams:manage")(request, reply);
    if (!user) return;

    const teams = await db
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        storageQuota: schema.teams.storageQuota,
        retentionHours: schema.teams.retentionHours,
        memberCount: sql<number>`(SELECT COUNT(*)::int FROM users WHERE users.team = ${schema.teams.id})`,
        createdAt: schema.teams.createdAt,
      })
      .from(schema.teams);

    return reply.send({
      teams: teams.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  });

  // POST /api/v1/teams — Create team (admin only)
  app.post("/api/v1/teams", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requirePermission("teams:manage")(request, reply);
    if (!admin) return;

    const parsed = createTeamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join("; "),
        code: "VALIDATION_ERROR",
      });
    }
    const { name: trimmedName, storageQuota, retentionHours } = parsed.data;

    // Check for duplicate name (case-insensitive)
    const [existing] = await db
      .select()
      .from(schema.teams)
      .where(sql`LOWER(${schema.teams.name}) = LOWER(${trimmedName})`);

    if (existing) {
      return reply.status(409).send({ error: "Team name already exists", code: "CONFLICT" });
    }

    const id = randomUUID();

    // The pre-check above can't close the race: two concurrent creates both
    // pass the SELECT before either insert commits (issue #927). Unqualified
    // on purpose so it covers both the exact-case unique constraint and the
    // lower(name) index that catches mixed-case twins (issue #970); the only
    // other constraint here is the primary key on a fresh UUID.
    const inserted = await db
      .insert(schema.teams)
      .values({
        id,
        name: trimmedName,
        storageQuota: storageQuota ?? null,
        retentionHours: retentionHours ?? null,
      })
      .onConflictDoNothing();

    if (!inserted.rowCount) {
      return reply.status(409).send({ error: "Team name already exists", code: "CONFLICT" });
    }

    return reply.status(201).send({
      id,
      name: trimmedName,
      storageQuota: storageQuota ?? null,
      retentionHours: retentionHours ?? null,
    });
  });

  // PUT /api/v1/teams/:id — Update team (admin only)
  app.put(
    "/api/v1/teams/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = await requirePermission("teams:manage")(request, reply);
      if (!admin) return;

      const { id } = request.params;

      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));
      if (!team) {
        return reply.status(404).send({ error: "Team not found", code: "NOT_FOUND" });
      }

      const parsed = updateTeamSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
          code: "VALIDATION_ERROR",
        });
      }
      const { name: trimmedName, storageQuota, retentionHours } = parsed.data;

      // Check for duplicate name (case-insensitive), excluding current team
      if (trimmedName !== undefined) {
        const [duplicate] = await db
          .select()
          .from(schema.teams)
          .where(
            sql`LOWER(${schema.teams.name}) = LOWER(${trimmedName}) AND ${schema.teams.id} != ${id}`,
          );

        if (duplicate) {
          return reply.status(409).send({ error: "Team name already exists", code: "CONFLICT" });
        }
      }

      const updateFields: Partial<typeof schema.teams.$inferInsert> = {};
      if (trimmedName !== undefined) updateFields.name = trimmedName;
      if (storageQuota !== undefined) updateFields.storageQuota = storageQuota;
      if (retentionHours !== undefined) updateFields.retentionHours = retentionHours;

      // Unreachable through this route now that the schema refines on at least
      // one field. Kept as the backstop for a field added to updateTeamSchema
      // without a line here, which would emit an empty SET clause and 500.
      if (Object.keys(updateFields).length > 0) {
        // The pre-check above can't close the race: two concurrent renames
        // onto the same name both pass it before either UPDATE commits
        // (issue #968), so the loser's 23505 maps to the pre-check's 409.
        try {
          const updated = await db
            .update(schema.teams)
            .set(updateFields)
            .where(eq(schema.teams.id, id));
          if (!updated.rowCount) {
            return reply.status(404).send({ error: "Team not found", code: "NOT_FOUND" });
          }
        } catch (err) {
          if (isUniqueViolation(err)) {
            return reply.status(409).send({ error: "Team name already exists", code: "CONFLICT" });
          }
          throw err;
        }
      }

      return reply.send({ ok: true });
    },
  );

  // DELETE /api/v1/teams/:id — Delete team (admin only)
  app.delete(
    "/api/v1/teams/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = await requirePermission("teams:manage")(request, reply);
      if (!admin) return;

      const { id } = request.params;

      // Lock the team row before checking its name and member count (#2662).
      // POST /api/auth/register and PUT /api/auth/users/:id take FOR SHARE on
      // schema.teams before writing schema.users (#2646), so taking FOR UPDATE
      // here serializes team deletion against member assignment and renames in
      // teams -> users order.
      const outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(schema.teams)
          .where(eq(schema.teams.id, id))
          .for("update");
        if (!locked) {
          return "not-found" as const;
        }

        // Cannot delete the Default team
        if (locked.name === "Default") {
          return "default-team" as const;
        }

        // Cannot delete a team that has members
        const [memberCount] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(schema.users)
          .where(eq(schema.users.team, id));

        if (memberCount && memberCount.count > 0) {
          return "has-members" as const;
        }

        await tx.delete(schema.teams).where(eq(schema.teams.id, id));
        return "deleted" as const;
      });

      if (outcome === "not-found") {
        return reply.status(404).send({ error: "Team not found", code: "NOT_FOUND" });
      }
      if (outcome === "default-team") {
        return reply.status(400).send({
          error: "Cannot delete the Default team",
          code: "VALIDATION_ERROR",
        });
      }
      if (outcome === "has-members") {
        return reply.status(400).send({
          error: "Cannot delete a team that has members",
          code: "VALIDATION_ERROR",
        });
      }

      return reply.send({ ok: true });
    },
  );

  app.log.info("Teams routes registered");
}
