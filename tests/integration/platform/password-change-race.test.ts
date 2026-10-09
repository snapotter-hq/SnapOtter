/**
 * Two change-password requests that both proved the same current password must
 * not both win (#2127). Each one verifies the old password, hashes, and then
 * writes; without anything tying the write to the hash it verified, the second
 * write silently replaced the first and both callers were told their password
 * changed. raceRowLocks parks both contenders at their first lock on `users`
 * so both have finished verifying before either writes.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { verifyPassword } from "../../../apps/api/src/plugins/auth.js";
import { raceRowLocks } from "../../helpers/pg-race.js";
import { buildTestApp, createUserAndLogin, type TestApp } from "../test-server.js";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function changePassword(token: string, newPassword: string) {
  return testApp.app.inject({
    method: "POST",
    url: "/api/auth/change-password",
    headers: { authorization: `Bearer ${token}` },
    payload: { currentPassword: "Userpass1", newPassword },
  });
}

async function storedHash(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ hash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row?.hash ?? null;
}

describe("concurrent password changes (#2127)", () => {
  it("lets exactly one of two concurrent changes win and tells the other", async () => {
    const { token, userId } = await createUserAndLogin(
      testApp.app,
      `pw_race_${Date.now().toString(36)}`,
    );

    const [first, second] = await raceRowLocks("users", 2, () =>
      Promise.all([changePassword(token, "FirstNew1"), changePassword(token, "SecondNew2")]),
    );

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = first.statusCode === 409 ? first : second;
    expect(JSON.parse(loser.body).code).toBe("PASSWORD_CHANGED");

    // The stored password is the winner's, and the loser's never landed.
    const winnerPassword = first.statusCode === 200 ? "FirstNew1" : "SecondNew2";
    const loserPassword = first.statusCode === 200 ? "SecondNew2" : "FirstNew1";
    const hash = await storedHash(userId);
    expect(hash).not.toBeNull();
    expect(await verifyPassword(winnerPassword, hash as string)).toBe(true);
    expect(await verifyPassword(loserPassword, hash as string)).toBe(false);
  });

  it("revokes every session when the change comes through an API key", async () => {
    const { token, userId } = await createUserAndLogin(
      testApp.app,
      `pw_key_${Date.now().toString(36)}`,
    );
    const keyRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "race-test" },
    });
    expect(keyRes.statusCode).toBe(201);
    const apiKey = JSON.parse(keyRes.body).key as string;

    const res = await changePassword(apiKey, "KeyChanged1");

    expect(res.statusCode, res.body).toBe(200);
    // An API key is not a session, so no session is the caller's to keep.
    const sessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(sessions).toHaveLength(0);
  });
});
