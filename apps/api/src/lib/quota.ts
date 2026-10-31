import { and, eq, isNotNull, sql } from "drizzle-orm";
import { env } from "../config.js";
import { type db, schema } from "../db/index.js";

/**
 * Checks whether charging `additionalBytes` exceeds the user's or their team's
 * storageUsed counters. A database fault throws rather than reading as "over
 * quota", so the caller answers a reported 500 instead of a 413 nobody looks
 * into (#1473).
 *
 * `lock` is for the transaction that charges the bytes: it locks the user's
 * row, and the team's row when the team has a quota, before reading. A
 * concurrent upload by the same user or a teammate then waits here until this
 * one commits and sees its charge, so two uploads that each fit can't both
 * land over the limit. NO KEY UPDATE is enough for that and, unlike UPDATE,
 * doesn't hold up inserts elsewhere that reference the user.
 */
export async function quotaRefusal(
  conn: Pick<typeof db, "select">,
  userId: string,
  additionalBytes: number,
  lock = false,
): Promise<string | null> {
  const userQuery = conn
    .select({
      storageUsed: schema.users.storageUsed,
      storageQuota: schema.users.storageQuota,
      team: schema.users.team,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const [user] = lock ? await userQuery.for("no key update") : await userQuery;

  if (!user) return null;
  const { storageUsed, storageQuota, team } = user;

  // Per-user quota: user-level override, then env fallback
  const userLimit =
    storageQuota ??
    (env.MAX_STORAGE_PER_USER_MB > 0 ? env.MAX_STORAGE_PER_USER_MB * 1024 * 1024 : 0);
  if (userLimit > 0 && storageUsed + additionalBytes > userLimit) {
    return `Storage quota exceeded. Used ${((storageUsed + additionalBytes) / (1024 * 1024)).toFixed(1)}MB of ${(userLimit / (1024 * 1024)).toFixed(1)}MB`;
  }

  // Per-team quota. Only a team with a quota is locked: every upload on the
  // instance would otherwise queue on the Default team's row.
  if (team) {
    const teamQuery = conn
      .select({ storageQuota: schema.teams.storageQuota })
      .from(schema.teams)
      .where(and(eq(schema.teams.id, team), isNotNull(schema.teams.storageQuota)))
      .limit(1);
    const [teamRow] = lock ? await teamQuery.for("no key update") : await teamQuery;

    if (teamRow?.storageQuota) {
      const [teamUsed] = await conn
        .select({
          total: sql<number>`coalesce(sum(${schema.users.storageUsed}), 0)`,
        })
        .from(schema.users)
        .where(eq(schema.users.team, team));

      const teamTotal = Number(teamUsed.total);
      if (teamTotal + additionalBytes > teamRow.storageQuota) {
        return `Team storage quota exceeded. Team used ${((teamTotal + additionalBytes) / (1024 * 1024)).toFixed(1)}MB of ${(teamRow.storageQuota / (1024 * 1024)).toFixed(1)}MB`;
      }
    }
  }
  return null;
}
