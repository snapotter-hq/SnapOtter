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
      mockEnterpriseFeatures(["admin_alerts", "webhooks", "siem_forwarding"]);
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

    it("PUT /api/v1/enterprise/webhooks/:index preserves encrypted authHeader when masked *** is echoed back (#2531)", async () => {
      const { env } = await import("../../../apps/api/src/config.js");
      const { decryptSetting } = await import("../../../apps/api/src/lib/encryption.js");
      const prevKey = env.DATA_ENCRYPTION_KEY;
      env.DATA_ENCRYPTION_KEY = "a".repeat(64);

      try {
        const createRes = await testApp.app.inject({
          method: "POST",
          url: "/api/v1/enterprise/webhooks",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            name: "Ops Alerts",
            url: "https://example.com/alerts",
            authHeader: "Bearer real-webhook-token",
            type: "alerts",
          },
        });
        expect(createRes.statusCode).toBe(201);

        const [beforeRow] = await db
          .select({ value: schema.settings.value })
          .from(schema.settings)
          .where(eq(schema.settings.key, "webhook_destinations"));
        const storedBefore = JSON.parse(beforeRow.value) as Array<{ authHeader: string }>;
        expect(storedBefore[0].authHeader.startsWith("$ENC$")).toBe(true);
        expect(await decryptSetting(storedBefore[0].authHeader)).toBe("Bearer real-webhook-token");

        const getRes = await testApp.app.inject({
          method: "GET",
          url: "/api/v1/enterprise/webhooks",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(getRes.statusCode).toBe(200);
        const [maskedDest] = JSON.parse(getRes.body).destinations;
        expect(maskedDest.authHeader).toBe("***");

        const putRes = await testApp.app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/webhooks/0",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            ...maskedDest,
            url: "https://example.com/alerts-v2",
            enabled: false,
          },
        });
        expect(putRes.statusCode).toBe(200);

        const [afterRow] = await db
          .select({ value: schema.settings.value })
          .from(schema.settings)
          .where(eq(schema.settings.key, "webhook_destinations"));
        const storedAfter = JSON.parse(afterRow.value) as Array<{
          url: string;
          enabled: boolean;
          authHeader: string;
        }>;
        expect(storedAfter[0].url).toBe("https://example.com/alerts-v2");
        expect(storedAfter[0].enabled).toBe(false);
        expect(storedAfter[0].authHeader).toBe(storedBefore[0].authHeader);
        expect(await decryptSetting(storedAfter[0].authHeader)).toBe("Bearer real-webhook-token");

        // Replacing authHeader with a new non-masked secret encrypts the new secret
        const rotateRes = await testApp.app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/webhooks/0",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            ...maskedDest,
            url: "https://example.com/alerts-v2",
            authHeader: "Bearer rotated-webhook-token",
          },
        });
        expect(rotateRes.statusCode).toBe(200);

        const [rotatedRow] = await db
          .select({ value: schema.settings.value })
          .from(schema.settings)
          .where(eq(schema.settings.key, "webhook_destinations"));
        const storedRotated = JSON.parse(rotatedRow.value) as Array<{ authHeader: string }>;
        expect(await decryptSetting(storedRotated[0].authHeader)).toBe(
          "Bearer rotated-webhook-token",
        );

        // Sending empty string clears authHeader
        const clearRes = await testApp.app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/webhooks/0",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            ...maskedDest,
            url: "https://example.com/alerts-v2",
            authHeader: "",
          },
        });
        expect(clearRes.statusCode).toBe(200);

        const [clearedRow] = await db
          .select({ value: schema.settings.value })
          .from(schema.settings)
          .where(eq(schema.settings.key, "webhook_destinations"));
        const storedCleared = JSON.parse(clearedRow.value) as Array<{ authHeader: string }>;
        expect(storedCleared[0].authHeader).toBe("");

        // Echoing *** when stored authHeader is empty keeps it empty instead of storing literal ***
        const maskOnEmptyRes = await testApp.app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/webhooks/0",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            ...maskedDest,
            url: "https://example.com/alerts-v3",
            authHeader: "***",
          },
        });
        expect(maskOnEmptyRes.statusCode).toBe(200);

        const [afterEmptyMaskRow] = await db
          .select({ value: schema.settings.value })
          .from(schema.settings)
          .where(eq(schema.settings.key, "webhook_destinations"));
        const storedAfterEmptyMask = JSON.parse(afterEmptyMaskRow.value) as Array<{
          url: string;
          authHeader: string;
        }>;
        expect(storedAfterEmptyMask[0].url).toBe("https://example.com/alerts-v3");
        expect(storedAfterEmptyMask[0].authHeader).toBe("");

        // Multi-destination index isolation: updating index 1 with *** preserves index 1's own secret and leaves index 0 untouched
        await db.delete(schema.settings).where(eq(schema.settings.key, "webhook_destinations"));
        await testApp.app.inject({
          method: "POST",
          url: "/api/v1/enterprise/webhooks",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            name: "Hook Zero",
            url: "https://example.com/hook-0",
            authHeader: "Bearer token-zero",
            type: "alerts",
          },
        });
        await testApp.app.inject({
          method: "POST",
          url: "/api/v1/enterprise/webhooks",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            name: "Hook One",
            url: "https://example.com/hook-1",
            authHeader: "Bearer token-one",
            type: "siem",
          },
        });

        const [twoBeforeRow] = await db
          .select({ value: schema.settings.value })
          .from(schema.settings)
          .where(eq(schema.settings.key, "webhook_destinations"));
        const twoBefore = JSON.parse(twoBeforeRow.value) as Array<{ authHeader: string }>;

        const putIndex1Res = await testApp.app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/webhooks/1",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            name: "Hook One Updated",
            url: "https://example.com/hook-1-v2",
            authHeader: "***",
            type: "siem",
          },
        });
        expect(putIndex1Res.statusCode).toBe(200);

        const [twoAfterRow] = await db
          .select({ value: schema.settings.value })
          .from(schema.settings)
          .where(eq(schema.settings.key, "webhook_destinations"));
        const twoAfter = JSON.parse(twoAfterRow.value) as Array<{ authHeader: string }>;
        expect(twoAfter[0].authHeader).toBe(twoBefore[0].authHeader);
        expect(twoAfter[1].authHeader).toBe(twoBefore[1].authHeader);
        expect(await decryptSetting(twoAfter[0].authHeader)).toBe("Bearer token-zero");
        expect(await decryptSetting(twoAfter[1].authHeader)).toBe("Bearer token-one");
      } finally {
        env.DATA_ENCRYPTION_KEY = prevKey;
        await db.delete(schema.settings).where(eq(schema.settings.key, "webhook_destinations"));
      }
    });

    it("PUT /api/v1/enterprise/siem/config preserves encrypted authHeader when masked *** is echoed back (#2531)", async () => {
      const { env } = await import("../../../apps/api/src/config.js");
      const { decryptSetting } = await import("../../../apps/api/src/lib/encryption.js");
      const { readSiemConfig } = await import("../../../apps/api/src/routes/enterprise/siem.js");
      const prevKey = env.DATA_ENCRYPTION_KEY;
      env.DATA_ENCRYPTION_KEY = "a".repeat(64);

      try {
        const saveRes = await testApp.app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/siem/config",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            webhookUrl: "https://example.com/siem",
            authHeader: "Bearer real-siem-token",
            flushIntervalSeconds: 30,
            enabled: true,
          },
        });
        expect(saveRes.statusCode).toBe(200);

        const beforeConfig = await readSiemConfig();
        expect(beforeConfig?.authHeader.startsWith("$ENC$")).toBe(true);
        expect(await decryptSetting(beforeConfig?.authHeader ?? "")).toBe("Bearer real-siem-token");

        const getRes = await testApp.app.inject({
          method: "GET",
          url: "/api/v1/enterprise/siem/config",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(getRes.statusCode).toBe(200);
        const maskedConfig = JSON.parse(getRes.body);
        expect(maskedConfig.authHeader).toBe("***");

        const updateRes = await testApp.app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/siem/config",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            ...maskedConfig,
            webhookUrl: "https://example.com/siem-v2",
            flushIntervalSeconds: 60,
          },
        });
        expect(updateRes.statusCode).toBe(200);

        const afterConfig = await readSiemConfig();
        expect(afterConfig?.webhookUrl).toBe("https://example.com/siem-v2");
        expect(afterConfig?.flushIntervalSeconds).toBe(60);
        expect(afterConfig?.authHeader).toBe(beforeConfig?.authHeader);
        expect(await decryptSetting(afterConfig?.authHeader ?? "")).toBe("Bearer real-siem-token");
      } finally {
        env.DATA_ENCRYPTION_KEY = prevKey;
        await db.delete(schema.settings).where(eq(schema.settings.key, "siem_config"));
      }
    });

    it("logs a warning and falls back to [] when webhook_destinations row is corrupt or non-array JSON (#2554)", async () => {
      const { logger } = await import("../../../apps/api/src/lib/logger.js");
      const warnSpy = vi.spyOn(logger, "warn");

      try {
        await db
          .insert(schema.settings)
          .values({ key: "webhook_destinations", value: "{corrupt" })
          .onConflictDoUpdate({
            target: schema.settings.key,
            set: { value: "{corrupt", updatedAt: new Date() },
          });

        const getRes = await testApp.app.inject({
          method: "GET",
          url: "/api/v1/enterprise/webhooks",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(getRes.statusCode).toBe(200);
        expect(JSON.parse(getRes.body)).toEqual({ destinations: [] });
        expect(warnSpy).toHaveBeenCalledWith(
          expect.objectContaining({ err: expect.any(SyntaxError), key: "webhook_destinations" }),
          "webhooks: failed to parse stored webhook_destinations JSON",
        );

        warnSpy.mockClear();
        const postRes = await testApp.app.inject({
          method: "POST",
          url: "/api/v1/enterprise/webhooks",
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            name: "Recovered Hook",
            url: "https://example.com/recovered",
            type: "alerts",
          },
        });
        expect(postRes.statusCode).toBe(201);
        expect(JSON.parse(postRes.body)).toEqual({ ok: true, index: 0 });
        expect(warnSpy).toHaveBeenCalledWith(
          expect.objectContaining({ err: expect.any(SyntaxError), key: "webhook_destinations" }),
          "webhooks: failed to parse stored webhook_destinations JSON",
        );

        const afterPostGetRes = await testApp.app.inject({
          method: "GET",
          url: "/api/v1/enterprise/webhooks",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(afterPostGetRes.statusCode).toBe(200);
        expect(JSON.parse(afterPostGetRes.body)).toEqual({
          destinations: [
            expect.objectContaining({
              name: "Recovered Hook",
              url: "https://example.com/recovered",
              type: "alerts",
            }),
          ],
        });

        for (const nonArray of ["{}", "null", "42", "[null]", "[42]", "[[]]"]) {
          warnSpy.mockClear();
          await db
            .update(schema.settings)
            .set({ value: nonArray, updatedAt: new Date() })
            .where(eq(schema.settings.key, "webhook_destinations"));

          const nonArrRes = await testApp.app.inject({
            method: "GET",
            url: "/api/v1/enterprise/webhooks",
            headers: { authorization: `Bearer ${adminToken}` },
          });
          expect(nonArrRes.statusCode).toBe(200);
          expect(JSON.parse(nonArrRes.body)).toEqual({ destinations: [] });
          expect(warnSpy).toHaveBeenCalledWith(
            { key: "webhook_destinations" },
            "webhooks: stored webhook_destinations is not a JSON array",
          );
        }
      } finally {
        warnSpy.mockRestore();
        await db.delete(schema.settings).where(eq(schema.settings.key, "webhook_destinations"));
      }
    });
  });
});
