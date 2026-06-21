import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

describe("webhook management", () => {
  describe("without enterprise license", () => {
    let testApp: TestApp;
    let adminToken: string;

    beforeAll(async () => {
      testApp = await buildTestApp();
      adminToken = await loginAsAdmin(testApp.app);
    }, 30_000);

    afterAll(async () => {
      await testApp.cleanup();
    }, 10_000);

    it("GET /api/v1/enterprise/webhooks returns 403 without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST /api/v1/enterprise/webhooks returns 403 without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Test", url: "https://example.com/hook" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("PUT /api/v1/enterprise/webhooks/:index returns 403 without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/webhooks/0",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Test", url: "https://example.com/hook" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DELETE /api/v1/enterprise/webhooks/:index returns 403 without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/webhooks/0",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /api/v1/enterprise/webhooks returns 401 without authentication", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/webhooks",
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST /api/v1/enterprise/webhooks returns 401 without authentication", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks",
        payload: { name: "Test", url: "https://example.com/hook" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("PUT /api/v1/enterprise/webhooks/:index returns 401 without authentication", async () => {
      const res = await testApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/webhooks/0",
        payload: { name: "Test", url: "https://example.com/hook" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("DELETE /api/v1/enterprise/webhooks/:index returns 401 without authentication", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/webhooks/0",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("with enterprise license", () => {
    let testApp: TestApp;
    let adminToken: string;

    beforeAll(async () => {
      vi.resetModules();
      const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
      mockEnterpriseFeatures(["admin_alerts", "webhooks"]);
      const testServer = await import("../test-server.js");
      testApp = await testServer.buildTestApp();
      adminToken = await testServer.loginAsAdmin(testApp.app);
    }, 30_000);

    afterAll(async () => {
      await testApp.cleanup();
    }, 10_000);

    it("POST validates name is required", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { url: "https://example.com/hook" },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Invalid webhook destination");
    });

    it("POST validates url must be a valid URL", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Test", url: "not-a-url" },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Invalid webhook destination");
    });

    it("POST returns 403 for non-admin users without webhooks:manage", async () => {
      await testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: "webhookuser", password: "TestPass1", role: "user" },
      });
      await db
        .update(schema.users)
        .set({ mustChangePassword: false })
        .where(eq(schema.users.username, "webhookuser"));

      const loginRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "webhookuser", password: "TestPass1" },
      });
      const userToken = JSON.parse(loginRes.body).token;

      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { name: "Test", url: "https://example.com/hook" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET returns empty array initially", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.destinations).toEqual([]);
    });

    it("POST creates a webhook destination with valid data", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Test Webhook",
          url: "https://example.com/webhook",
          authHeader: "Bearer secret-token",
          type: "alerts",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.index).toBe(0);
    });

    it("GET returns created webhooks after POST", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.destinations).toHaveLength(1);
      expect(body.destinations[0].name).toBe("Test Webhook");
      expect(body.destinations[0].url).toBe("https://example.com/webhook");
    });

    it("GET masks authHeader in response", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.destinations[0].authHeader).toBe("***");
    });

    it("PUT updates an existing webhook by index", async () => {
      const res = await testApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/webhooks/0",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Updated Webhook",
          url: "https://example.com/updated",
          type: "siem",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);

      const getRes = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const getBody = JSON.parse(getRes.body);
      expect(getBody.destinations[0].name).toBe("Updated Webhook");
      expect(getBody.destinations[0].url).toBe("https://example.com/updated");
      expect(getBody.destinations[0].type).toBe("siem");
    });

    it("PUT returns 404 for out-of-bounds index", async () => {
      const res = await testApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/webhooks/99",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Test", url: "https://example.com/hook" },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Webhook destination not found");
    });

    it("DELETE returns 404 for out-of-bounds index", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/webhooks/99",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Webhook destination not found");
    });

    it("POST test returns 404 for out-of-bounds index", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks/99/test",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Webhook destination not found");
    });

    it("DELETE deletes a webhook by index", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/webhooks/0",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
    });

    it("GET reflects removal after delete", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/webhooks",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.destinations).toEqual([]);
    });
  });
});
