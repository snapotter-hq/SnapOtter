/**
 * Deterministically widens a check-then-insert race (issue #927).
 *
 * Duplicate-name creation paths SELECT for a twin, then INSERT. The race
 * only bites when every contender passes the SELECT before the winner's
 * INSERT commits, a window too narrow to hit reliably with concurrent
 * requests alone. This helper forces it: an EXCLUSIVE table lock lets the
 * pre-check SELECTs through but parks every INSERT in the lock queue.
 * Once `count` inserts are waiting, the lock is released and they all hit
 * the unique index together.
 *
 * The `fire` callback must start the contenders and return a promise for
 * their combined outcome (typically Promise.all of app.inject calls).
 */

import { sql } from "drizzle-orm";
import { db } from "../../apps/api/src/db/index.js";

export async function raceInserts<T>(
  table: string,
  count: number,
  fire: () => Promise<T>,
): Promise<T> {
  let pending: Promise<T> | undefined;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`LOCK TABLE "${table}" IN EXCLUSIVE MODE`));

      pending = fire();
      // The outcome can reject before we await it below (a race loser dying
      // on the constraint); pre-attach a handler so it never counts as an
      // unhandled rejection in the meantime.
      pending.catch(() => {});

      // Wait until every contender is parked on the lock. Sessions from other
      // vitest forks live in other per-fork databases, hence the datname
      // filter. The transaction ending releases the lock.
      const deadline = Date.now() + 10_000;
      for (;;) {
        const res = await db.execute(sql`
          SELECT count(*)::int AS n
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query ILIKE ${`%insert into "${table}"%`}
        `);
        const n = Number((res.rows[0] as { n: number }).n);
        if (n >= count) break;
        if (Date.now() > deadline) {
          throw new Error(`timed out: only ${n}/${count} inserts blocked on "${table}"`);
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    });
  } catch (err) {
    // The rollback above released the lock, so the contenders can now run
    // to completion. Wait for them, both so a failing test doesn't leak
    // writes past its end and because a contender that died before ever
    // reaching its insert is usually the real story, not the timeout.
    if (pending) {
      const [settled] = await Promise.allSettled([pending]);
      if (settled.status === "rejected") {
        throw new Error(`${(err as Error).message}; a contender failed before blocking`, {
          cause: settled.reason,
        });
      }
      const value = settled.value as unknown;
      const summary = Array.isArray(value)
        ? value
            .map((r) =>
              r && typeof r === "object" && "statusCode" in r
                ? String((r as { statusCode: number }).statusCode)
                : "?",
            )
            .join(",")
        : String(value);
      throw new Error(
        `${(err as Error).message}; contenders finished without blocking (outcome: ${summary})`,
        { cause: err },
      );
    }
    throw err;
  }

  return pending as Promise<T>;
}
