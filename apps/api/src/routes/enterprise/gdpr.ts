import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { requestCancel } from "../../jobs/cancel.js";
import { getQueue } from "../../jobs/queues.js";
import { SYSTEM_JOBS } from "../../jobs/system-jobs.js";
import { auditFromRequest } from "../../lib/audit.js";
import { deleteStoredFile, deleteThumbnail } from "../../lib/file-storage.js";
import { deletePrefix } from "../../lib/object-storage.js";
import { canManageTargetRole, requirePermission } from "../../permissions.js";

const purgeBodySchema = z.object({
  confirm: z.literal(true),
});

/**
 * Purge all data for a single user: files, jobs, audit redaction, sessions, keys, prefs, user row.
 * Extracted so it can be reused by the team purge endpoint.
 */
async function purgeUserData(userId: string): Promise<void> {
  // a. Delete user's library files from storage
  const userFileRows = await db
    .select({ storedName: schema.userFiles.storedName })
    .from(schema.userFiles)
    .where(eq(schema.userFiles.userId, userId));

  for (const file of userFileRows) {
    await deleteStoredFile(file.storedName);
    await deleteThumbnail(file.storedName);
  }

  // b. Delete userFiles rows
  await db.delete(schema.userFiles).where(eq(schema.userFiles.userId, userId));

  // c. Delete processing artifacts: workspace objects for each job
  const jobRows = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.userId, userId));

  for (const job of jobRows) {
    try {
      await deletePrefix(`uploads/${job.id}/`);
    } catch {
      // Workspace directory may not exist
    }
    try {
      await deletePrefix(`outputs/${job.id}/`);
    } catch {
      // Workspace directory may not exist
    }
  }

  // d. Cancel any active BullMQ jobs before deleting DB rows
  const activeJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(eq(schema.jobs.userId, userId), inArray(schema.jobs.status, ["queued", "processing"])),
    );

  if (activeJobs.length > 0) {
    for (const job of activeJobs) {
      try {
        await requestCancel(job.id);
      } catch {
        // Best-effort cancellation
      }
    }
    // Wait briefly for cancellation to propagate
    await new Promise((r) => setTimeout(r, 500));
  }

  // e. Delete jobs rows
  await db.delete(schema.jobs).where(eq(schema.jobs.userId, userId));

  // f. Redact audit log entries (preserve structure, remove PII)
  await db
    .update(schema.auditLog)
    .set({ actorUsername: "[redacted]", ipAddress: null, details: {} })
    .where(eq(schema.auditLog.actorId, userId));

  // g. Delete sessions
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));

  // h. Delete apiKeys
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));

  // i. Delete userPreferences
  await db.delete(schema.userPreferences).where(eq(schema.userPreferences.userId, userId));

  // j. Delete user row (also cascades pipelines)
  await db.delete(schema.users).where(eq(schema.users.id, userId));
}

export async function registerGdprRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/enterprise/users/:id/export -- initiate GDPR data export
  app.post(
    "/api/v1/enterprise/users/:id/export",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await requirePermission("compliance:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      let featureEnabled = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        featureEnabled = isFeatureEnabled("gdpr_lifecycle");
      } catch {
        // Enterprise package not available
      }
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "GDPR data export requires an enterprise license with the gdpr_lifecycle feature",
        });
      }

      const targetUserId = request.params.id;

      // Validate the target user exists
      const [targetUser] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId));
      if (!targetUser) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Create a durable job row
      const jobId = randomUUID();
      await db.insert(schema.jobs).values({
        id: jobId,
        userId: targetUserId,
        toolId: "gdpr-export",
        pool: "system",
        type: "system",
        status: "queued",
      });

      // Enqueue the system job
      const q = getQueue("system");
      await q.add(SYSTEM_JOBS.gdprExport, { userId: targetUserId, jobId } as never, { jobId });

      await auditFromRequest(request)("GDPR_EXPORT_INITIATED", {
        adminId: user.id,
        username: user.username,
        targetUserId,
        jobId,
      });

      return reply.status(202).send({ jobId, message: "Export started" });
    },
  );

  // GET /api/v1/enterprise/users/:id/export/:jobId -- check export status
  app.get(
    "/api/v1/enterprise/users/:id/export/:jobId",
    async (
      request: FastifyRequest<{ Params: { id: string; jobId: string } }>,
      reply: FastifyReply,
    ) => {
      const user = await requirePermission("compliance:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      let featureEnabled = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        featureEnabled = isFeatureEnabled("gdpr_lifecycle");
      } catch {
        // Enterprise package not available
      }
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "GDPR data export requires an enterprise license with the gdpr_lifecycle feature",
        });
      }

      const { jobId } = request.params;

      const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));

      if (!job) {
        return reply.status(404).send({ error: "Export job not found" });
      }

      if (job.status === "completed") {
        const outputRef = job.outputRefs?.[0];
        const filename = outputRef?.split("/").pop() ?? "gdpr-export.zip";
        return reply.send({
          status: "completed",
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`,
        });
      }

      if (job.status === "failed") {
        const errorMsg = (job.error as { message?: string } | null)?.message ?? "Export failed";
        return reply.send({ status: "failed", error: errorMsg });
      }

      // queued or processing
      const progress = job.progress as { percent?: number; stage?: string } | null;
      return reply.send({
        status: job.status,
        progress: progress?.percent ?? 0,
      });
    },
  );

  // DELETE /api/v1/enterprise/users/:id/purge -- GDPR right-to-erasure
  app.delete(
    "/api/v1/enterprise/users/:id/purge",
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const user = await requirePermission("compliance:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      let featureEnabled = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        featureEnabled = isFeatureEnabled("gdpr_lifecycle");
      } catch {
        // Enterprise package not available
      }
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "GDPR data purge requires an enterprise license with the gdpr_lifecycle feature",
        });
      }

      // Validate confirmation body
      const parsed = purgeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Purge requires explicit confirmation",
          details: parsed.error.issues,
        });
      }

      const targetUserId = request.params.id;

      // Guard: admin cannot purge themselves
      if (targetUserId === user.id) {
        return reply.status(400).send({ error: "Cannot purge your own account" });
      }

      // Check target user exists
      const [targetUser] = await db
        .select({
          id: schema.users.id,
          role: schema.users.role,
          team: schema.users.team,
          legalHold: schema.users.legalHold,
        })
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId));
      if (!targetUser) {
        return reply.status(404).send({ error: "User not found" });
      }

      if (!(await canManageTargetRole(user, targetUser.role))) {
        return reply.status(403).send({
          error: "Cannot manage a user beyond your role authority",
          code: "ESCALATION_DENIED",
        });
      }

      // Check legal hold on user
      if (targetUser.legalHold) {
        return reply.status(409).send({ error: "User or team is under legal hold" });
      }

      // Check legal hold on user's team
      const [teamRow] = await db
        .select({ legalHold: schema.teams.legalHold })
        .from(schema.teams)
        .where(eq(schema.teams.id, targetUser.team));
      if (teamRow?.legalHold) {
        return reply.status(409).send({ error: "User or team is under legal hold" });
      }

      // Execute purge
      await purgeUserData(targetUserId);

      // Emit audit event (admin as actor, target = purged userId)
      await auditFromRequest(request)("GDPR_USER_PURGED", {
        adminId: user.id,
        username: user.username,
        targetUserId,
      });

      return reply.send({ success: true, purgedUserId: targetUserId });
    },
  );

  // DELETE /api/v1/enterprise/teams/:id/purge -- GDPR team-level erasure
  app.delete(
    "/api/v1/enterprise/teams/:id/purge",
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const user = await requirePermission("compliance:manage")(request, reply);
      if (!user) return;

      // Enterprise feature gate
      let featureEnabled = false;
      try {
        const { isFeatureEnabled } = await import("@snapotter/enterprise");
        featureEnabled = isFeatureEnabled("gdpr_lifecycle");
      } catch {
        // Enterprise package not available
      }
      if (!featureEnabled) {
        return reply.status(403).send({
          error: "GDPR data purge requires an enterprise license with the gdpr_lifecycle feature",
        });
      }

      // Validate confirmation body
      const parsed = purgeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Purge requires explicit confirmation",
          details: parsed.error.issues,
        });
      }

      const targetTeamId = request.params.id;

      // Check team exists
      const [team] = await db
        .select({ id: schema.teams.id, legalHold: schema.teams.legalHold })
        .from(schema.teams)
        .where(eq(schema.teams.id, targetTeamId));
      if (!team) {
        return reply.status(404).send({ error: "Team not found" });
      }

      // Check team's legalHold
      if (team.legalHold) {
        return reply.status(409).send({ error: "Team is under legal hold" });
      }

      // Get all users in the team
      const teamUsers = await db
        .select({
          id: schema.users.id,
          role: schema.users.role,
          legalHold: schema.users.legalHold,
        })
        .from(schema.users)
        .where(eq(schema.users.team, targetTeamId));

      if (teamUsers.some((member) => member.id === user.id)) {
        return reply.status(400).send({ error: "Cannot purge a team containing your own account" });
      }

      for (const member of teamUsers) {
        if (!(await canManageTargetRole(user, member.role))) {
          return reply.status(403).send({
            error: "Cannot manage a user beyond your role authority",
            code: "ESCALATION_DENIED",
          });
        }
      }

      // Check none of the users have individual legalHold
      const heldUser = teamUsers.find((u) => u.legalHold);
      if (heldUser) {
        return reply.status(409).send({ error: "A team member is under individual legal hold" });
      }

      // Purge each team member
      for (const member of teamUsers) {
        await purgeUserData(member.id);
      }

      // Delete the team itself
      await db.delete(schema.teams).where(eq(schema.teams.id, targetTeamId));

      // Emit audit event
      await auditFromRequest(request)("GDPR_TEAM_PURGED", {
        adminId: user.id,
        username: user.username,
        targetTeamId,
        purgedUsers: teamUsers.length,
      });

      return reply.send({
        success: true,
        purgedTeamId: targetTeamId,
        purgedUsers: teamUsers.length,
      });
    },
  );

  app.log.info("Enterprise GDPR routes registered");
}
