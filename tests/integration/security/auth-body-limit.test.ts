/**
 * The auth and MFA routes take a few hundred bytes of JSON, so they must not
 * inherit the upload-sized global bodyLimit (#2308).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

// Just past the 16 KiB cap, far under the upload limit.
const oversized = JSON.stringify({ filler: "a".repeat(20 * 1024) });

const jsonRoutes: Array<{ method: "POST" | "PUT" | "DELETE"; url: string }> = [
  { method: "POST", url: "/api/auth/login" },
  { method: "POST", url: "/api/auth/logout" },
  { method: "POST", url: "/api/auth/register" },
  { method: "POST", url: "/api/auth/change-password" },
  { method: "PUT", url: "/api/auth/users/some-user" },
  { method: "DELETE", url: "/api/auth/users/some-user" },
  { method: "POST", url: "/api/auth/users/some-user/reset-password" },
  { method: "POST", url: "/api/auth/users/some-user/mfa/reset" },
  { method: "POST", url: "/api/auth/mfa/enroll" },
  { method: "POST", url: "/api/auth/mfa/verify" },
  { method: "POST", url: "/api/auth/mfa/complete" },
  { method: "POST", url: "/api/auth/mfa/enroll-complete" },
  { method: "POST", url: "/api/auth/mfa/disable" },
];

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("auth route body limit", () => {
  it.each(jsonRoutes)("$method $url answers 413 for a 20 KiB body", async ({ method, url }) => {
    const res = await testApp.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: oversized,
    });
    expect(res.statusCode).toBe(413);
  });

  it("still handles a normal login body", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "wrongpass1" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("leaves the global limit alone for routes outside auth", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: oversized,
    });
    expect(res.statusCode).not.toBe(413);
  });
});
