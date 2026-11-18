/**
 * auth_login_failed carries a bounded `reason` on every password failure path,
 * including the ones that used to emit nothing (#4216). The event must never
 * hold a username or the audit string.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { upsertSetting } from "../../../apps/api/src/lib/settings-helpers.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const trackEventSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../apps/api/src/lib/analytics.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, trackEvent: trackEventSpy };
});

let testApp: TestApp;
let adminToken: string;

const uid = () => `lfr_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "loginThrottleMaxFailures"));
  await testApp.cleanup();
});

beforeEach(() => {
  trackEventSpy.mockClear();
});

async function createUser(): Promise<{ username: string; password: string }> {
  const username = uid();
  const password = "ValidPass1";
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password },
  });
  if (res.statusCode !== 201) throw new Error(`createUser failed: ${res.statusCode} ${res.body}`);
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username));
  return { username, password };
}

function login(username: string, password: string) {
  return testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
}

function failedEvents(): unknown[][] {
  return trackEventSpy.mock.calls.filter((c) => c[0] === "auth_login_failed");
}

describe("auth_login_failed reason", () => {
  it("reports bad_credentials for a wrong password", async () => {
    const { username } = await createUser();
    const res = await login(username, "WrongPass1");
    expect(res.statusCode).toBe(401);
    expect(failedEvents()).toEqual([
      ["auth_login_failed", { method: "password", reason: "bad_credentials" }],
    ]);
  });

  it("reports the same bad_credentials for an unknown user", async () => {
    const res = await login(uid(), "WrongPass1");
    expect(res.statusCode).toBe(401);
    expect(failedEvents()).toEqual([
      ["auth_login_failed", { method: "password", reason: "bad_credentials" }],
    ]);
  });

  it("reports disabled when a disabled account's password is right", async () => {
    const { username, password } = await createUser();
    await db
      .update(schema.users)
      .set({ role: "disabled" })
      .where(eq(schema.users.username, username));
    const res = await login(username, password);
    expect(res.statusCode).toBe(403);
    expect(failedEvents()).toEqual([
      ["auth_login_failed", { method: "password", reason: "disabled" }],
    ]);
  });

  it("reports rate_limited on the throttled 429", async () => {
    await upsertSetting("loginThrottleMaxFailures", "2");
    const { username } = await createUser();
    await login(username, "WrongPass1");
    await login(username, "WrongPass1");
    trackEventSpy.mockClear();
    const res = await login(username, "WrongPass1");
    expect(res.statusCode).toBe(429);
    expect(failedEvents()).toEqual([
      ["auth_login_failed", { method: "password", reason: "rate_limited" }],
    ]);
  });

  it("never puts the username in the event", async () => {
    const { username } = await createUser();
    await login(username, "WrongPass1");
    expect(JSON.stringify(trackEventSpy.mock.calls)).not.toContain(username);
  });
});
