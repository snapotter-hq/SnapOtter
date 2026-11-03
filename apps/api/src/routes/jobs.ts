/**
 * HTTP control routes for jobs.
 *
 * GET /api/v1/jobs/:jobId          status, progress, result, and error
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
import { stripInternalPaths } from "../lib/errors.js";
import { hasEffectivePermission } from "../permissions.js";
import { requireAuth } from "../plugins/auth.js";
import { canReadJob } from "./progress.js";

export function registerJobRoutes(app: FastifyInstance): void {
  // Poll alternative to the SSE stream. `status` is the stored job status:
  // queued, processing, completed, failed, or canceled. A canceled job can
  // carry a partial result (for example a ZIP of finished files), so `result`
  // is read from the row whatever the status.
  app.get(
    "/api/v1/jobs/:jobId",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { jobId } = request.params;

      const [job] = await db
        .select({
          userId: schema.jobs.userId,
          settings: schema.jobs.settings,
          status: schema.jobs.status,
          progress: schema.jobs.progress,
          error: schema.jobs.error,
          createdAt: schema.jobs.createdAt,
        })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId));

      if (!job || !(await canReadJob(job, user))) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const progress = job.progress ?? { percent: 0 };
      const message = job.error && typeof job.error.message === "string" ? job.error.message : null;
      return reply.send({
        jobId,
        status: job.status,
        createdAt: job.createdAt,
        progress: {
          percent: progress.percent ?? 0,
          ...(progress.stage && { stage: progress.stage }),
        },
        ...(progress.result && { result: progress.result }),
        ...(message !== null && {
          error: {
            message: stripInternalPaths(message),
            ...(job.error?.code && { code: job.error.code }),
          },
        }),
        progressUrl: `/api/v1/jobs/${jobId}/progress`,
      });
    },
  );

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
