/**
 * Client-facing aliases for batch runs.
 *
 * A batch's parent id names its storage: the ZIP lands under
 * outputs/<parentId>/ and the children under outputs/<parentId>-f<n>/, and
 * GET /api/v1/download/:jobId/:filename serves those without auth because the
 * id is the capability. So the parent id is always server-generated. A
 * client-supplied clientJobId only gets an alias row pointing at it, which the
 * progress stream and the cancel route follow; both check ownership, so the
 * alias carries no download capability.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { isUniqueViolation } from "../lib/pg-errors.js";

export const BATCH_ALIAS_TYPE = "batch-alias";

/** The batch parent id an alias row points at, or null for any other row. */
export function batchAliasTarget(row: { type: string; settings: unknown }): string | null {
  if (row.type !== BATCH_ALIAS_TYPE) return null;
  const settings = row.settings as { batchJobId?: unknown } | null;
  return typeof settings?.batchJobId === "string" ? settings.batchJobId : null;
}

export type BatchAliasClaim = "claimed" | "attach" | "conflict";

/**
 * Point `clientJobId` at the batch parent `batchJobId`. "attach" means the
 * same owner already started a batch of this tool under that id (a browser
 * resending its POST, #2015), so the caller answers 202 instead of running it
 * twice. "conflict" means the id belongs to something else.
 */
export async function claimBatchAlias(args: {
  clientJobId: string;
  batchJobId: string;
  userId: string;
  toolId: string;
}): Promise<BatchAliasClaim> {
  try {
    await db.insert(schema.jobs).values({
      id: args.clientJobId,
      userId: args.userId,
      pool: "system",
      type: BATCH_ALIAS_TYPE,
      // A pointer, never a live job: terminal from the start so concurrency
      // limits, reconciliation and the in-flight gates never count it.
      status: "completed",
      completedAt: new Date(),
      inputRefs: [],
      settings: { batchJobId: args.batchJobId, batchToolId: args.toolId },
    });
    return "claimed";
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  const [existing] = await db
    .select({
      userId: schema.jobs.userId,
      toolId: schema.jobs.toolId,
      type: schema.jobs.type,
      settings: schema.jobs.settings,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, args.clientJobId))
    .limit(1);
  if (!existing || existing.userId !== args.userId) return "conflict";
  const settings = existing.settings as { batchToolId?: unknown } | null;
  if (existing.type === BATCH_ALIAS_TYPE && settings?.batchToolId === args.toolId) return "attach";
  // A batch started before parent ids were server-generated still runs under
  // the client id itself.
  if (existing.type === "batch" && existing.toolId === args.toolId) return "attach";
  return "conflict";
}
