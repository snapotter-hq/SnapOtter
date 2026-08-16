/**
 * Failed API-key auth auditing (issue #819): an invalid or expired si_ token
 * must produce an API_KEY_AUTH_FAILED audit row (key prefix + reason, never
 * the raw token), throttled per prefix+IP so scanners cannot flood the table.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { computeKeyPrefix } from "../../../apps/api/src/plugins/auth.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

// Every test uses a fresh random token so the Redis throttle key from one
// test (or a previous local run) can never suppress another test's write.
const freshToken = () => `si_invalid_${randomUUID().replaceAll("-", "")}`;

async function requestWithToken(token: string) {
  return testApp.app.inject({
    method: "GET",
    url: "/api/v1/settings",
    headers: { authorization: `Bearer ${token}` },
  });
}

async function failureRowsForPrefix(prefix: string) {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, "API_KEY_AUTH_FAILED"));
  return rows.filter((r) => (r.details as Record<string, unknown> | null)?.keyPrefix === prefix);
}

async function countFailureRows(): Promise<number> {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, "API_KEY_AUTH_FAILED"));
  return rows.length;
}

describe("Failed API-key auth auditing", () => {
  it("writes one API_KEY_AUTH_FAILED row with key prefix and reason unknown for an invalid si_ token", async () => {
    const token = freshToken();
    const prefix = computeKeyPrefix(token);

    const res = await requestWithToken(token);
    expect(res.statusCode).toBe(401);

    const rows = await failureRowsForPrefix(prefix);
    expect(rows).toHaveLength(1);
    const details = rows[0].details as Record<string, unknown>;
    expect(details.keyPrefix).toBe(prefix);
    expect(details.reason).toBe("unknown");
    expect(rows[0].targetType).toBe("api_key");
    expect(rows[0].ipAddress).toBeTruthy();
    // The raw token must never reach the audit log.
    expect(JSON.stringify(rows[0])).not.toContain(token);
  });

  it("throttles repeat failures from the same prefix and IP to a single row", async () => {
    const token = freshToken();
    const prefix = computeKeyPrefix(token);

    const first = await requestWithToken(token);
    expect(first.statusCode).toBe(401);
    const second = await requestWithToken(token);
    expect(second.statusCode).toBe(401);

    const rows = await failureRowsForPrefix(prefix);
    expect(rows).toHaveLength(1);
  });

  it("writes reason expired for a real key past its expiry", async () => {
    const createRes = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "audit-expired-key" },
    });
    expect(createRes.statusCode).toBe(201);
    const { id: keyId, key: rawKey } = JSON.parse(createRes.body);

    await db
      .update(schema.apiKeys)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.apiKeys.id, keyId));

    const res = await requestWithToken(rawKey);
    expect(res.statusCode).toBe(401);

    const rows = await failureRowsForPrefix(computeKeyPrefix(rawKey));
    expect(rows).toHaveLength(1);
    expect((rows[0].details as Record<string, unknown>).reason).toBe("expired");
  });

  it("writes no audit row for a non-si_ garbage token", async () => {
    const before = await countFailureRows();

    const res = await requestWithToken(`garbage_${randomUUID()}`);
    expect(res.statusCode).toBe(401);

    expect(await countFailureRows()).toBe(before);
  });
});
