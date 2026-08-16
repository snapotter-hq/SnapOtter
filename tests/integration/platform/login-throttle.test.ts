/**
 * Integration tests for the per-username failed-login throttle (issue #820).
 *
 * The test server never registers @fastify/rate-limit, so the per-IP login
 * limit cannot interfere here; every 429 asserted below comes from the
 * per-username throttle. Default thresholds (10 failures / 15 min) are pinned
 * in the first block; the second block lowers the threshold through the
 * DB-backed setting override to keep the remaining scenarios fast.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { upsertSetting } from "../../../apps/api/src/lib/settings-helpers.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

const uid = () => `throttle_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "loginThrottleMaxFailures"));
  await testApp.cleanup();
}, 10_000);

async function createUser(): Promise<{ username: string; password: string }> {
  const username = uid();
  const password = "ValidPass1";
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createUser failed: ${res.statusCode} ${res.body}`);
  }
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username));
  return { username, password };
}

function attemptLogin(username: string, password: string) {
  return testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
}

/** Run `count` wrong-password attempts and assert each is a plain 401. */
async function failTimes(username: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const res = await attemptLogin(username, "WrongPass1");
    expect(res.statusCode).toBe(401);
  }
}

async function throttledAuditRowsFor(username: string) {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, "LOGIN_THROTTLED"));
  return rows.filter((row) => (row.details as { username?: string } | null)?.username === username);
}

describe("default thresholds", () => {
  let realUserThrottle: { statusCode: number; body: Record<string, unknown> };

  it("returns 429 with Retry-After on the 11th bad attempt for a real user", async () => {
    const { username } = await createUser();

    await failTimes(username, 10);

    const res = await attemptLogin(username, "WrongPass1");
    expect(res.statusCode).toBe(429);
    const retryAfter = Number(res.headers["retry-after"]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(900);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("LOGIN_THROTTLED");
    realUserThrottle = { statusCode: res.statusCode, body };
  });

  it("throttles a nonexistent username identically to a real one", async () => {
    const username = `ghost_${uid()}`;

    await failTimes(username, 10);

    const res = await attemptLogin(username, "WrongPass1");
    expect(res.statusCode).toBe(realUserThrottle.statusCode);
    expect(res.headers["retry-after"]).toBeDefined();

    // Full-body comparison against the real-user throttle response. retryAfter
    // is clock-derived so it may differ by a second across the two runs;
    // assert it is close, then normalize for the deep equality check.
    const body = JSON.parse(res.body);
    const realRetry = Number(realUserThrottle.body.retryAfter);
    expect(Math.abs(Number(body.retryAfter) - realRetry)).toBeLessThanOrEqual(2);
    expect({ ...body, retryAfter: null }).toEqual({ ...realUserThrottle.body, retryAfter: null });
  });
});

describe("lowered threshold via the DB setting override", () => {
  beforeAll(async () => {
    await upsertSetting("loginThrottleMaxFailures", "3");
  });

  afterAll(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "loginThrottleMaxFailures"));
  });

  it("a successful login clears the username's window", async () => {
    const { username, password } = await createUser();

    await failTimes(username, 2);

    const success = await attemptLogin(username, password);
    expect(success.statusCode).toBe(200);

    // Had the window survived the successful login, the second attempt here
    // would already be rejected. A fresh run of 3 failures proves the reset,
    // and the 4th proves the throttle is still armed afterwards.
    await failTimes(username, 3);
    const throttled = await attemptLogin(username, password);
    expect(throttled.statusCode).toBe(429);
  });

  it("writes the LOGIN_THROTTLED audit row exactly once per episode", async () => {
    const username = `ghost_${uid()}`;

    await failTimes(username, 3);
    expect(await throttledAuditRowsFor(username)).toHaveLength(1);

    // Subsequent rejected attempts must not add more rows.
    for (let i = 0; i < 2; i++) {
      const res = await attemptLogin(username, "WrongPass1");
      expect(res.statusCode).toBe(429);
    }
    expect(await throttledAuditRowsFor(username)).toHaveLength(1);
  });

  it("counts case variants of a username against one window", async () => {
    const base = `case_${uid()}`;

    await failTimes(base.toUpperCase(), 3);

    const res = await attemptLogin(base.toLowerCase(), "WrongPass1");
    expect(res.statusCode).toBe(429);
  });
});
