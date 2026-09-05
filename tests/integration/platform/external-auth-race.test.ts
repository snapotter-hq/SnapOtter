/**
 * Concurrent auto-create races in the external auth resolver.
 *
 * Issue #927: two logins can pass the resolver's username scan before either
 * inserts. The loser's insert hits the users.username unique constraint; it
 * must recover (re-run the scan and pick a fresh username) instead of failing
 * the login with an unhandled 23505.
 *
 * Issue #969: one identity racing itself (two tabs finishing first login at
 * once) where the loser stalls between the identity lookup and the username
 * scan. Its scan then sees the winner's username and picks a suffixed one, so
 * the insert conflicts with nothing unless (auth_provider, external_id) is
 * unique. holdNextQuery pins that interleaving against a real database.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, pool, schema } from "../../../apps/api/src/db/index.js";
import type { ExternalAuthParams } from "../../../apps/api/src/lib/external-auth-resolver.js";
import { resolveExternalUser } from "../../../apps/api/src/lib/external-auth-resolver.js";
import { raceInserts } from "../../helpers/pg-race.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;

const RACE_USERNAMES = [
  "race_shared",
  "race_shared_2",
  "race_stall",
  "race_stall_2",
  "race_link_old",
  "race_link_new",
  "race_link",
];

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.delete(schema.users).where(inArray(schema.users.username, RACE_USERNAMES));
  await testApp.cleanup();
}, 10_000);

function baseParams(overrides: Partial<ExternalAuthParams>): ExternalAuthParams {
  return {
    provider: "oidc",
    externalId: "race-ext",
    username: "race_user",
    autoCreate: true,
    autoLink: false,
    defaultRole: "user",
    logger: testApp.app.log,
    ip: "127.0.0.1",
    requestId: "race-test",
    ...overrides,
  };
}

type PoolQuery = (...args: unknown[]) => Promise<unknown>;

/**
 * Park the next pool query whose SQL matches `pattern` until release() is
 * called. Every other query goes straight through, as does everything inside
 * a transaction (those run on a checked-out client, not the pool). This is
 * the stall a login can hit between two of its own queries, a GC pause or a
 * slow replica, placed exactly where it matters.
 */
function holdNextQuery(pattern: RegExp): { held: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markHeld: () => void = () => {};
  const held = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no pool query matched ${pattern} within 5s`)),
      5_000,
    );
    markHeld = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  const passThrough = (pool.query as PoolQuery).bind(pool);
  const spy = vi.spyOn(pool, "query").mockImplementation(((...args: unknown[]) => {
    const first = args[0];
    const text = typeof first === "string" ? first : ((first as { text?: string })?.text ?? "");
    if (!pattern.test(text)) return passThrough(...args);
    spy.mockRestore();
    markHeld();
    return gate.then(() => passThrough(...args));
  }) as never);
  return { held, release };
}

/**
 * Start `loser`, wait until it is parked on `pattern`, run `winner` to
 * completion, then let the loser continue. A loser that settles before it is
 * held (it died, or never issued the query) fails with its own error rather
 * than the hold's timeout.
 */
async function raceStalled<T>(
  pattern: RegExp,
  loser: () => Promise<T>,
  winner: () => Promise<T>,
): Promise<{ loser: T; winner: T }> {
  const hold = holdNextQuery(pattern);
  const loserRun = loser();
  const settledEarly = loserRun.then(() => {
    throw new Error("loser finished before its query was held");
  });
  settledEarly.catch(() => {});
  try {
    await Promise.race([hold.held, settledEarly]);
    const winnerResult = await winner();
    hold.release();
    return { winner: winnerResult, loser: await loserRun };
  } finally {
    // Also covers a winner that threw: the loser must not stay parked.
    hold.release();
  }
}

describe("external auth auto-create races", () => {
  it("two identities racing for the same username get distinct suffixed usernames", async () => {
    // Different identities, same derived username. Both pass the
    // unique-username scan while raceInserts holds their inserts; the
    // loser must re-run the scan and create its own account.
    const [a, b] = await raceInserts("users", 2, () =>
      Promise.all([
        resolveExternalUser(baseParams({ externalId: "race-distinct-1", username: "race_shared" })),
        resolveExternalUser(baseParams({ externalId: "race-distinct-2", username: "race_shared" })),
      ]),
    );

    expect(a.user, JSON.stringify(a)).not.toBeNull();
    expect(b.user, JSON.stringify(b)).not.toBeNull();
    expect(a.action).toBe("created");
    expect(b.action).toBe("created");
    const usernames = [a.user?.username, b.user?.username].sort();
    expect(usernames).toEqual(["race_shared", "race_shared_2"]);

    const rows = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.username, ["race_shared", "race_shared_2"]));
    expect(rows).toHaveLength(2);
  });

  it("a login that stalls after the identity lookup joins the account its twin just created", async () => {
    // Issue #969. The loser passed the externalId lookup (no row yet), then
    // stalled while the winner created and committed. Its username scan now
    // sees the winner's name and picks a suffixed one, so nothing but the
    // (auth_provider, external_id) index can refuse the insert. Without that
    // index this minted a second account for the same identity.
    const params = baseParams({ externalId: "race-stall-ext", username: "race_stall" });

    const { winner, loser } = await raceStalled(
      /"users"\."username" = \$1/,
      () => resolveExternalUser(params),
      () => resolveExternalUser(params),
    );

    expect(winner.action, JSON.stringify(winner)).toBe("created");
    const rows = await db
      .select()
      .from(schema.users)
      .where(
        and(eq(schema.users.externalId, "race-stall-ext"), eq(schema.users.authProvider, "oidc")),
      );
    expect(rows.map((r) => r.username)).toEqual(["race_stall"]);
    expect(loser.action).toBe("matched");
    expect(loser.user?.id).toBe(winner.user?.id);
  });

  it("two logins auto-linking one identity onto twin emails land on the same account", async () => {
    // Issue #969, link flavor. Nothing makes email unique, so two local
    // accounts can share one. Two first logins of the same identity both
    // miss the externalId lookup; the winner links one twin and commits. If
    // the loser then picked the other twin, its link UPDATE would trip the
    // identity index and the login would die on a raw 23505. The pick has
    // to be deterministic (oldest row) so both land on the same account.
    const email = "race-link@example.com";
    await db.insert(schema.users).values([
      {
        id: "race-link-old",
        username: "race_link_old",
        email,
        passwordHash: null,
        mustChangePassword: false,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "race-link-new",
        username: "race_link_new",
        email,
        passwordHash: null,
        mustChangePassword: false,
        createdAt: new Date("2026-02-01T00:00:00Z"),
        updatedAt: new Date("2026-02-01T00:00:00Z"),
      },
    ]);
    const params = baseParams({
      externalId: "race-link-ext",
      username: "race_link",
      email,
      emailVerified: true,
      autoLink: true,
    });

    const { winner, loser } = await raceStalled(
      /"users"\."email" = \$1/,
      () => resolveExternalUser(params),
      () => resolveExternalUser(params),
    );

    expect(winner.action, JSON.stringify(winner)).toBe("linked");
    expect(winner.user?.id).toBe("race-link-old");
    expect(loser.user?.id, JSON.stringify(loser)).toBe("race-link-old");
    const linked = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(eq(schema.users.externalId, "race-link-ext"), eq(schema.users.authProvider, "oidc")),
      );
    expect(linked.map((r) => r.id)).toEqual(["race-link-old"]);
  });

  it("users carries exactly the unique constraints the auto-create guard assumes", async () => {
    // The resolver's insert and the SCIM Users POST use an unqualified
    // onConflictDoNothing and read every refused insert as "someone else
    // holds this username or this identity". That is only honest while the
    // unique surface is the primary key (a fresh UUID), the username, and
    // the (auth_provider, external_id) identity index. If this fails, a new
    // unique constraint joined the table: give both guards an explicit story
    // for it before widening this list.
    const res = await db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexdef ILIKE '%UNIQUE%' ORDER BY indexname`,
    );
    const names = res.rows.map((r) => (r as { indexname: string }).indexname);
    expect(names).toEqual([
      "users_auth_provider_external_id_unique",
      "users_pkey",
      "users_username_unique",
    ]);
  });
});
