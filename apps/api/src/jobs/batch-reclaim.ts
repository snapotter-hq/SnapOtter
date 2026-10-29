import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { deletePrefix } from "../lib/object-storage.js";

const DELETE_CONCURRENCY = 8;

/**
 * True when the user, or the team they belong to, is under legal hold. Any
 * lookup failure answers true: a deletion that cannot prove the hold is clear
 * does not run, and the TTL sweep still reclaims the space later.
 */
async function isUnderLegalHold(userId: string): Promise<boolean> {
  try {
    const [user] = await db
      .select({ legalHold: schema.users.legalHold, team: schema.users.team })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!user) return false;
    if (user.legalHold) return true;
    if (!user.team) return false;
    const [team] = await db
      .select({ legalHold: schema.teams.legalHold })
      .from(schema.teams)
      .where(eq(schema.teams.id, user.team));
    return team?.legalHold === true;
  } catch (err) {
    logger.warn({ err, userId }, "legal hold lookup failed; keeping batch storage");
    return true;
  }
}

/**
 * Directory names a batch's children occupy under uploads/ and outputs/:
 * `<parent>-f<i>` for every flow child, `<parent>-f<i>-s<j>` for each step of
 * a pipeline batch, and any other child-owned directory the given keys name.
 */
export function batchChildDirs(
  parentId: string,
  flowChildCount: number,
  stepCount: number | undefined,
  keys: Iterable<string | undefined>,
): string[] {
  const dirs = new Set<string>();
  for (let i = 0; i < flowChildCount; i++) {
    dirs.add(`${parentId}-f${i}`);
    for (let j = 0; j < (stepCount ?? 0); j++) dirs.add(`${parentId}-f${i}-s${j}`);
  }
  const owned = new RegExp(`^${parentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-f\\d+(?:-s\\d+)?$`);
  for (const key of keys) {
    const dir = key?.split("/")[1];
    if (dir && owned.test(dir)) dirs.add(dir);
  }
  return [...dirs];
}

/**
 * Free a batch's per-child inputs and outputs once the batch is terminal. The
 * ZIP is the artifact the download route serves, and nothing links a child
 * job, so after finalize these directories only hold the workspace cap hostage
 * until the TTL sweep (#1241). Best effort: a failed delete is logged and the
 * sweep still takes the directory at its TTL. Skipped under legal hold.
 */
export async function reclaimBatchChildStorage(args: {
  parentId: string;
  userId: string | null;
  dirs: string[];
}): Promise<void> {
  if (args.dirs.length === 0) return;
  if (args.userId && (await isUnderLegalHold(args.userId))) return;
  const prefixes = args.dirs.flatMap((dir) => [`uploads/${dir}`, `outputs/${dir}`]);
  let next = 0;
  // A bounded pool: on S3 every delete is a list plus a delete request, so a
  // large pipeline batch is thousands of round trips (#4184).
  const lane = async () => {
    while (next < prefixes.length) {
      const prefix = prefixes[next++] as string;
      try {
        await deletePrefix(prefix);
      } catch (err) {
        logger.warn(
          { err, jobId: args.parentId, prefix },
          "batch child storage cleanup failed; the storage sweep will take it at its TTL",
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, prefixes.length) }, lane));
}
