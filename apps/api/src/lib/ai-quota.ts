/**
 * Per-user concurrent AI-job cap.
 *
 * The AI BullMQ pool runs at concurrency 1, so a single user who enqueues many
 * single-file AI jobs (each a heavy Python model load) monopolizes the worker
 * and starves everyone else. This bounds a user's in-flight AI jobs. Batch and
 * pipeline AI use other job kinds and are deliberately not counted here: they
 * are already bounded by MAX_BATCH_SIZE and the pipeline step count, and capping
 * them would break legitimate multi-file AI runs.
 */
import { and, count, eq, inArray } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";

/** Pure threshold check exported for unit testing. cap <= 0 disables the limit. */
export function isOverAiJobCap(inFlight: number, cap: number): boolean {
  return cap > 0 && inFlight >= cap;
}

/** Count a user's queued + processing single-file AI jobs (job kind "ai-tool"). */
export async function countInFlightAiJobs(userId: string): Promise<number> {
  const rows = await db
    .select({ c: count() })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.type, "ai-tool"),
        inArray(schema.jobs.status, ["queued", "processing"]),
      ),
    );
  return rows[0]?.c ?? 0;
}

/**
 * Throw a 429-tagged error when the user already has MAX_AI_JOBS_PER_USER
 * single-file AI jobs in flight. No-op when the cap is disabled (<= 0) or the
 * request is unauthenticated (no user to key on).
 */
export async function assertAiJobQuota(userId: string | null | undefined): Promise<void> {
  const cap = env.MAX_AI_JOBS_PER_USER;
  if (cap <= 0 || !userId) return;
  const inFlight = await countInFlightAiJobs(userId);
  if (isOverAiJobCap(inFlight, cap)) {
    const error = new Error(
      "Too many concurrent AI jobs. Please wait for existing jobs to finish.",
    );
    (error as Error & { statusCode: number }).statusCode = 429;
    throw error;
  }
}
