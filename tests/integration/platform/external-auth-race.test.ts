/**
 * Concurrent auto-create race in the external auth resolver (issue #927).
 *
 * Two logins can pass the resolver's username scan before either inserts.
 * The loser's insert hits the users.username unique constraint; it must
 * recover (re-run the scan and pick a fresh username) instead of failing
 * the login with an unhandled 23505.
 *
 * The same-identity flavor (one login racing itself in two tabs) can't be
 * pinned deterministically against a real database, so its recovery branch
 * is covered by scripted unit tests in
 * tests/unit/api/external-auth-resolver-mutation.test.ts.
 */

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import type { ExternalAuthParams } from "../../../apps/api/src/lib/external-auth-resolver.js";
import { resolveExternalUser } from "../../../apps/api/src/lib/external-auth-resolver.js";
import { raceInserts } from "../../helpers/pg-race.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  await db
    .delete(schema.users)
    .where(inArray(schema.users.username, ["race_shared", "race_shared_2"]));
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
});
