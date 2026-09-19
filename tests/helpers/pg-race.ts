/**
 * Deterministically widens a check-then-write race (issues #927, #968).
 *
 * Duplicate-name paths SELECT for a twin, then INSERT or UPDATE. The race
 * only bites when every contender passes the SELECT before the winner's
 * write commits, a window too narrow to hit reliably with concurrent
 * requests alone. This helper forces it: an EXCLUSIVE table lock lets the
 * pre-check SELECTs through but parks every INSERT/UPDATE in the lock
 * queue. Once `count` writes are waiting, the lock is released and they
 * all hit the unique index together.
 *
 * The `fire` callback must start the contenders and return a promise for
 * their combined outcome (typically Promise.all of app.inject calls).
 */

import { sql } from "drizzle-orm";
import { db } from "../../apps/api/src/db/index.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function raceInserts<T>(
  table: string,
  count: number,
  fire: () => Promise<T>,
): Promise<T> {
  return raceWrites(table, count, fire, `insert into "${table}"`);
}

export async function raceUpdates<T>(
  table: string,
  count: number,
  fire: () => Promise<T>,
): Promise<T> {
  return raceWrites(table, count, fire, `update "${table}"`);
}

/**
 * The same widening for contenders that reach `table` through a row lock
 * (issue #1152). `SELECT ... FOR UPDATE` takes ROW SHARE, which the EXCLUSIVE
 * lock refuses just like a write, so a transaction that opens by locking a
 * row parks at that read. Every session waiting on a lock counts, whatever
 * statement it is parked on, so a contender queued behind another
 * contender's row lock counts too; the statement filter above would miss it.
 *
 * The flip side is that an unrelated lock wait in this fork's database also
 * counts and would release the table early. Nothing on today's request paths
 * does that (audit inserts are awaited inside the handler, the session touch
 * writes only sessions.last_activity), but a future per-request INSERT with
 * a users foreign key would take KEY SHARE on the caller's row and park under
 * a lock on users. A caller of this helper that turns flaky is worth checking
 * for that before anything else.
 *
 * `beforeRelease` runs on the locking transaction once every contender is
 * parked, for a write that has to land between a contender's pre-checks and
 * its transaction (deleting the row it is about to lock, say). Anything run
 * from another session would queue behind the same lock.
 */
export async function raceRowLocks<T>(
  table: string,
  count: number,
  fire: () => Promise<T>,
  beforeRelease?: (tx: Tx) => Promise<unknown>,
): Promise<T> {
  return raceWrites(table, count, fire, undefined, beforeRelease);
}

/**
 * Resolves once `count` sessions in this fork's database are waiting on a
 * lock, or throws after 25s naming how many made it. `statement` narrows the
 * count to sessions whose query contains it. Sessions from other vitest
 * forks live in other per-fork databases, hence the datname filter.
 * Contenders spend real time in scrypt auth before their write and a
 * saturated box stretches that a lot, so the old 10s deadline flaked; 25s
 * stays under vitest's 30s testTimeout so this diagnostic fires before the
 * generic "test timed out" kill.
 *
 * Exported so a `fire` callback can stage its contenders (start one, wait for
 * it to park, start the next) when the race only means something in one
 * order.
 */
export async function waitForLockWaiters(count: number, statement?: string): Promise<void> {
  const statementFilter = statement ? sql`AND query ILIKE ${`%${statement}%`}` : sql.empty();
  const deadline = Date.now() + 25_000;
  for (;;) {
    const res = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        ${statementFilter}
    `);
    const n = Number((res.rows[0] as { n: number }).n);
    if (n >= count) return;
    if (Date.now() > deadline) {
      const where = statement ? ` on ${statement}` : "";
      throw new Error(`timed out: only ${n}/${count} contenders blocked${where}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function raceWrites<T>(
  table: string,
  count: number,
  fire: () => Promise<T>,
  statement: string | undefined,
  beforeRelease?: (tx: Tx) => Promise<unknown>,
): Promise<T> {
  let pending: Promise<T> | undefined;
  let hookFailed = false;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`LOCK TABLE "${table}" IN EXCLUSIVE MODE`));

      pending = fire();
      // The outcome can reject before we await it below (a race loser dying
      // on the constraint); pre-attach a handler so it never counts as an
      // unhandled rejection in the meantime.
      pending.catch(() => {});

      // Wait until every contender is parked on the lock. The transaction
      // ending releases it.
      await waitForLockWaiters(count, statement);

      if (beforeRelease) {
        try {
          await beforeRelease(tx);
        } catch (err) {
          hookFailed = true;
          throw err;
        }
      }
    });
  } catch (err) {
    // The rollback above released the lock, so the contenders can now run
    // to completion. Wait for them, both so a failing test doesn't leak
    // writes past its end and because a contender that died before ever
    // reaching its write is usually the real story, not the timeout.
    if (pending) {
      const [settled] = await Promise.allSettled([pending]);
      if (hookFailed) {
        // The contenders did park; the hook is what failed. Keep the
        // "without blocking" diagnosis below from pointing the wrong way.
        throw new Error("beforeRelease hook failed after every contender had parked", {
          cause: err,
        });
      }
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
