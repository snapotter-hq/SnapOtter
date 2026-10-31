import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

/**
 * Record a finished inline tool run under its own jobs row. The row is what
 * says who owns `outputs/<jobId>/` (two-phase routes check it before reading a
 * client-supplied jobId) and what lets the storage TTL sweep expire the prefix
 * on S3, which skips rowless prefixes.
 *
 * Call it before writing the objects, so a failed insert leaves nothing
 * behind. The failure is rethrown as a 500 so the route's catch-all doesn't
 * answer it as a bad input with the query text in `details`.
 */
export async function recordCompletedToolJob(args: {
  jobId: string;
  userId: string | null;
  toolId: string;
  outputRefs: string[];
}): Promise<void> {
  try {
    await db.insert(schema.jobs).values({
      id: args.jobId,
      userId: args.userId,
      toolId: args.toolId,
      type: "single",
      status: "completed",
      inputRefs: [],
      outputRefs: args.outputRefs,
      completedAt: new Date(),
    });
  } catch (err) {
    throw Object.assign(new Error("Failed to record the job"), { statusCode: 500, cause: err });
  }
}

/**
 * Delete a jobs row recorded by `recordCompletedToolJob` when a staged upload
 * or URL fetch fails and discards its storage prefix.
 */
export async function deleteRecordedToolJob(jobId: string): Promise<void> {
  await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
}
