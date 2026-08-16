/**
 * Forced-enrollment escape hatch on an UNLICENSED instance
 * (snapotter-hq/SnapOtter#811).
 *
 * MFA enrollment is enterprise-gated, so an unlicensed instance cannot walk a
 * user through enrollment at login. The only way a required policy exists here
 * is if it was stored before v2.2.0 added the license gate on saving it. In
 * that case login must keep the hard `403 MFA_ENROLLMENT_REQUIRED`; the offline
 * recovery CLI is the escape.
 *
 * This file deliberately mocks enterprise as absent (`mockNoEnterprise()`) and
 * lives apart from the licensed suite because the enterprise mock is per-file
 * all-or-nothing. The required policy is written straight to the DB, since the
 * PUT /settings gate would (correctly) reject saving it on an unlicensed
 * instance, which is exactly why this legacy pre-gate state has to be seeded
 * directly.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.resetModules();
const { mockNoEnterprise } = await import("../../helpers/enterprise-mock.js");
mockNoEnterprise();

const { buildTestApp, createUserAndLogin } = await import("../test-server.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");

import type { TestApp } from "../test-server.js";

let testApp: TestApp;

async function setMfaPolicy(value: "optional" | "admins_only" | "required"): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key: "mfaPolicy", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterEach(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "mfaPolicy"));
});

afterAll(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "mfaPolicy"));
  await testApp.cleanup();
}, 10_000);

describe("POST /api/auth/login forced enrollment (unlicensed)", () => {
  it("still returns 403 MFA_ENROLLMENT_REQUIRED for an unenrolled user under a required policy", async () => {
    const username = `mfa_unlicensed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const password = "Userpass1";
    await createUserAndLogin(testApp.app, username, "user", password);
    // Seed the pre-gate required policy directly (the PUT gate would reject it).
    await setMfaPolicy("required");

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("MFA_ENROLLMENT_REQUIRED");
    expect(body.token).toBeUndefined();
    expect(body.requiresMfaEnrollment).toBeUndefined();
  });

  it("enroll-complete is a dead end here: an unknown token returns 401 MFA_EXPIRED (no enrollment was ever begun)", async () => {
    // Even though the route exists, no forced enrollment is started on an
    // unlicensed instance, so there is never a live enroll token to complete.
    const { randomUUID } = await import("node:crypto");
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/mfa/enroll-complete",
      payload: { enrollmentToken: randomUUID(), code: "123456" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("MFA_EXPIRED");
  });
});
