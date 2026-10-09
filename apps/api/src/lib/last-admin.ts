// apps/api/src/lib/last-admin.ts

import { eq, sql } from "drizzle-orm";
import { type db, schema } from "../db/index.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The write would leave the instance with no admin. */
export class LastAdminError extends Error {
  constructor() {
    super("The last admin can't be removed");
    this.name = "LastAdminError";
  }
}

/**
 * Call inside the transaction of any write that can take `userId` out of the
 * admin role (a demotion, a deletion, a SCIM deactivation), before the write.
 * Throws LastAdminError when that user is the only admin left.
 *
 * Every such write takes the same transaction-scoped lock first, so two of
 * them run one after the other: each used to count two admins, write, and
 * leave none (#2231). The target's role is read again under the lock, since a
 * request that waited may find it already changed.
 */
export async function assertNotLastAdmin(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('snapotter:last-admin'))`);
  const [target] = await tx
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (target?.role !== "admin") return;
  const [admins] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"));
  if ((admins?.count ?? 0) <= 1) throw new LastAdminError();
}
