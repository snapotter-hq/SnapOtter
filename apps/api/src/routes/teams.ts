/**
 * Team management routes (CRUD).
 *
 * GET    /api/v1/teams      — List all teams with member count
 * POST   /api/v1/teams      — Create team (admin only)
 * PUT    /api/v1/teams/:id  — Rename team (admin only)
 * DELETE /api/v1/teams/:id  — Delete team (admin only)
 */

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { requirePermission } from "../permissions.js";

const teamBodySchema = z.object({
  name: z
    .string({ required_error: "Team name is required" })
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, "Team name is required")
        .max(50, "Team name must be 50 characters or fewer"),
    ),
  storageQuota: z.number().int().positive().nullable().optional(),
  retentionHours: z.number().int().positive().nullable().optional(),
});

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

    const parsed = teamBodySchema.safeParse(request.body);
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
    // pass the SELECT before either insert commits (issue #927). This guard
    // only covers exact-case twins; the unique constraint is case-sensitive.
    const inserted = await db
      .insert(schema.teams)
      .values({
        id,
        name: trimmedName,
        storageQuota: storageQuota ?? null,
        retentionHours: retentionHours ?? null,
      })
      .onConflictDoNothing({ target: schema.teams.name });

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

  // PUT /api/v1/teams/:id — Rename team (admin only)
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

      const parsed = teamBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
          code: "VALIDATION_ERROR",
        });
      }
      const { name: trimmedName, storageQuota, retentionHours } = parsed.data;

      // Check for duplicate name (case-insensitive), excluding current team
      const [duplicate] = await db
        .select()
        .from(schema.teams)
        .where(
          sql`LOWER(${schema.teams.name}) = LOWER(${trimmedName}) AND ${schema.teams.id} != ${id}`,
        );

      if (duplicate) {
        return reply.status(409).send({ error: "Team name already exists", code: "CONFLICT" });
      }

      const updateFields: Partial<typeof schema.teams.$inferInsert> = { name: trimmedName };
      if (storageQuota !== undefined) updateFields.storageQuota = storageQuota;
      if (retentionHours !== undefined) updateFields.retentionHours = retentionHours;

      await db.update(schema.teams).set(updateFields).where(eq(schema.teams.id, id));

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

      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));
      if (!team) {
        return reply.status(404).send({ error: "Team not found", code: "NOT_FOUND" });
      }

      // Cannot delete the Default team
      if (team.name === "Default") {
        return reply.status(400).send({
          error: "Cannot delete the Default team",
          code: "VALIDATION_ERROR",
        });
      }

      // Cannot delete a team that has members
      const [memberCount] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.users)
        .where(eq(schema.users.team, id));

      if (memberCount && memberCount.count > 0) {
        return reply.status(400).send({
          error: "Cannot delete a team that has members",
          code: "VALIDATION_ERROR",
        });
      }

      await db.delete(schema.teams).where(eq(schema.teams.id, id));

      return reply.send({ ok: true });
    },
  );

  app.log.info("Teams routes registered");
}
