import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("SIEM config", () => {
  it("returns 403 for GET without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for PUT without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        webhookUrl: "https://siem.example.com/input",
        authHeader: "Splunk test",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
    });
    expect(res.statusCode).toBe(401);
  });
});
