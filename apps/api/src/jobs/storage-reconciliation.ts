/**
 * Weekly storage reconciliation job.
 *
 * Recomputes each user's storageUsed counter from the actual sum of
 * their userFiles rows and corrects any drift caused by race conditions,
 * crashes, or bugs. Scheduled for 3 AM Sunday via system-jobs.
 */
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export async function storageReconciliationJob(): Promise<void> {
  // Sum actual file sizes per user
  const actual = await db
    .select({
      userId: schema.userFiles.userId,
      totalSize: sql<number>`coalesce(sum(${schema.userFiles.size}), 0)`,
    })
    .from(schema.userFiles)
    .groupBy(schema.userFiles.userId);

  let updated = 0;
  for (const row of actual) {
    if (!row.userId) continue;
    const totalSize = Number(row.totalSize);
    const result = await db
      .update(schema.users)
      .set({ storageUsed: totalSize })
      .where(
        and(eq(schema.users.id, row.userId), sql`${schema.users.storageUsed} != ${totalSize}`),
      );
    if (result.rowCount) updated++;
  }

  // Zero out users who have no files but a nonzero storageUsed counter
  const usersWithFiles = actual.filter((r) => r.userId != null).map((r) => r.userId as string);
  let zeroChanged = 0;
  if (usersWithFiles.length > 0) {
    const zeroResult = await db
      .update(schema.users)
      .set({ storageUsed: 0 })
      .where(
        and(sql`${schema.users.storageUsed} != 0`, notInArray(schema.users.id, usersWithFiles)),
      );
    zeroChanged = zeroResult.rowCount ?? 0;
  } else {
    // No users have files: zero everyone
    const zeroResult = await db
      .update(schema.users)
      .set({ storageUsed: 0 })
      .where(sql`${schema.users.storageUsed} != 0`);
    zeroChanged = zeroResult.rowCount ?? 0;
  }
  updated += zeroChanged;
  const checked = usersWithFiles.length + zeroChanged;

  console.log(`Storage reconciliation complete: ${checked} users checked, ${updated} corrected`);
}
