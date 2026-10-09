/**
 * A login for a username that doesn't exist has to cost what a wrong password for a real
 * user costs, or response time tells a caller which usernames exist. The hash an unknown
 * user is checked against used to be built on the first such login, so that one request
 * ran an extra scrypt computation (#2254). It is a constant now, so there is nothing to
 * build.
 *
 * This lives in its own file, with no earlier unknown-user login, so the first
 * measurement is the first unknown-user login this process sees.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const scrypts = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    scrypt: ((...args: unknown[]) => {
      scrypts.calls++;
      return (actual.scrypt as (...a: unknown[]) => unknown)(...args);
    }) as typeof actual.scrypt,
  };
});

import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;

const uid = () => `dummy_${Date.now()}_${randomBytes(3).toString("hex")}`;

beforeAll(async () => {
  testApp = await buildTestApp();
  // Keep the per-username failed-login throttle out of the way of the wrong-password logins.
  await db
    .insert(schema.settings)
    .values({ key: "loginThrottleMaxFailures", value: "100000" })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: "100000" } });
}, 30_000);

afterAll(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "loginThrottleMaxFailures"));
  await testApp.cleanup();
}, 10_000);

async function wrongLogin(username: string): Promise<number> {
  const before = scrypts.calls;
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: "Not-the-password-1" },
  });
  expect(res.statusCode).toBe(401);
  return scrypts.calls - before;
}

describe("the first unknown-user login after boot", () => {
  it("runs one scrypt computation, like every later one and like a real user's wrong password", async () => {
    // First thing this process does with an unknown username.
    const first = await wrongLogin(uid());
    const second = await wrongLogin(uid());
    const realUser = await wrongLogin("admin");

    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(realUser).toBe(1);
  });
});
