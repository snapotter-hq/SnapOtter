/**
 * HTTP control routes for jobs.
 *
 * POST /api/v1/jobs/:jobId/cancel
 *
 * Cancellation is authorized at this boundary. Authentication alone is not
 * enough: a caller may cancel a job only if they own it (jobs.user_id ===
 * their id) or hold `files:all` (admins and editors, the same "act across all
 * users" permission that governs the file library). Without this check any
 * authenticated user could cancel any other user's job by guessing its id.
 *
 * Missing and non-owned jobs both return 404 so a caller can't use the response
 * to learn which job ids exist. This mirrors the ownership handling in the
 * user-files routes.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "../db/index.js";
import { requestCancel } from "../jobs/cancel.js";
import { hasEffectivePermission } from "../permissions.js";
import { requireAuth } from "../plugins/auth.js";

export function registerJobRoutes(app: FastifyInstance): void {
  app.post(
    "/api/v1/jobs/:jobId/cancel",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { jobId } = request.params;

      const [job] = await db
        .select({ userId: schema.jobs.userId })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId));

      if (!job || (job.userId !== user.id && !(await hasEffectivePermission(user, "files:all")))) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const canceled = await requestCancel(jobId);
      return reply.send({ canceled });
    },
  );
}
