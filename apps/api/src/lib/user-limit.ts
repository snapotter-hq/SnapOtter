import { sql } from "drizzle-orm";
import { env } from "../config.js";
import { type db, schema } from "../db/index.js";

// Every path that enforces MAX_USERS (register route, external-auth
// auto-create, SCIM user provisioning) must serialize on this one lock or two
// concurrent creates can each pass the count and overshoot the cap by one
// (issues #928, #966). Lock ids are scoped per database, so parallel test
// forks with their own DB clones never contend.
const USER_LIMIT_LOCK_KEY = 7_421_003;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Inside `tx`, take the user-limit advisory lock and report whether the
 * MAX_USERS cap is already met. The caller must insert the new user on the
 * same `tx` so the count stays authoritative until commit; the xact lock is
 * released automatically on commit or rollback. Always false when MAX_USERS
 * is 0 (unlimited); no lock is taken in that case.
 */
export async function userLimitReached(tx: Tx): Promise<boolean> {
  if (env.MAX_USERS <= 0) return false;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${USER_LIMIT_LOCK_KEY})`);
  const [row] = await tx.select({ count: sql<number>`COUNT(*)::int` }).from(schema.users);
  // COUNT(*) always yields one row; if that ever stops being true, fail
  // closed instead of admitting everyone with a phantom count of 0.
  if (!row) throw new Error("user count query returned no rows");
  return row.count >= env.MAX_USERS;
}
