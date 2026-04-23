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

const teamNameSchema = z.object({
  name: z
    .string({ required_error: "Team name is required" })
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, "Team name is required")
        .max(50, "Team name must be 50 characters or fewer"),
    ),
});

export async function teamsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/teams — List all teams with member count (admin only)
  app.get("/api/v1/teams", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requirePermission("teams:manage")(request, reply);
    if (!user) return;

    const teams = db
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        memberCount: sql<number>`(SELECT COUNT(*) FROM users WHERE users.team = ${schema.teams.id})`,
        createdAt: schema.teams.createdAt,
      })
      .from(schema.teams)
      .all();

    return reply.send({
      teams: teams.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  });

  // POST /api/v1/teams — Create team (admin only)
  app.post("/api/v1/teams", async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = requirePermission("teams:manage")(request, reply);
    if (!admin) return;

    const parsed = teamNameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join("; "),
        code: "VALIDATION_ERROR",
      });
    }
    const trimmedName = parsed.data.name;

    // Check for duplicate name (case-insensitive)
    const existing = db
      .select()
      .from(schema.teams)
      .where(sql`LOWER(${schema.teams.name}) = LOWER(${trimmedName})`)
      .get();

    if (existing) {
      return reply.status(409).send({ error: "Team name already exists", code: "CONFLICT" });
    }

    const id = randomUUID();

    db.insert(schema.teams).values({ id, name: trimmedName }).run();

    return reply.status(201).send({ id, name: trimmedName });
  });

  // PUT /api/v1/teams/:id — Rename team (admin only)
  app.put(
    "/api/v1/teams/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = requirePermission("teams:manage")(request, reply);
      if (!admin) return;

      const { id } = request.params;

      const team = db.select().from(schema.teams).where(eq(schema.teams.id, id)).get();
      if (!team) {
        return reply.status(404).send({ error: "Team not found", code: "NOT_FOUND" });
      }

      const parsed = teamNameSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join("; "),
          code: "VALIDATION_ERROR",
        });
      }
      const trimmedName = parsed.data.name;

      // Check for duplicate name (case-insensitive), excluding current team
      const duplicate = db
        .select()
        .from(schema.teams)
        .where(
          sql`LOWER(${schema.teams.name}) = LOWER(${trimmedName}) AND ${schema.teams.id} != ${id}`,
        )
        .get();

      if (duplicate) {
        return reply.status(409).send({ error: "Team name already exists", code: "CONFLICT" });
      }

      db.update(schema.teams).set({ name: trimmedName }).where(eq(schema.teams.id, id)).run();

      return reply.send({ ok: true });
    },
  );

  // DELETE /api/v1/teams/:id — Delete team (admin only)
  app.delete(
    "/api/v1/teams/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const admin = requirePermission("teams:manage")(request, reply);
      if (!admin) return;

      const { id } = request.params;

      const team = db.select().from(schema.teams).where(eq(schema.teams.id, id)).get();
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
      const memberCount = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.users)
        .where(eq(schema.users.team, id))
        .get();

      if (memberCount && memberCount.count > 0) {
        return reply.status(400).send({
          error: "Cannot delete a team that has members",
          code: "VALIDATION_ERROR",
        });
      }

      db.delete(schema.teams).where(eq(schema.teams.id, id)).run();

      return reply.send({ ok: true });
    },
  );

  app.log.info("Teams routes registered");
}
