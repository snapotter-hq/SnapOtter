import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// reportError and deliverWebhook are spied on so the suite can assert that an
// undecryptable credential is reported as an operational fault and never sent
// unauthenticated or with raw $ENC$ ciphertext (#2031).
const reportErrorSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, reportError: reportErrorSpy };
});

const deliverWebhookSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ success: true, statusCode: 200, attempts: 1 }),
);
vi.mock("../../../apps/api/src/lib/webhook-delivery.js", () => ({
  deliverWebhook: deliverWebhookSpy,
}));

vi.resetModules();
const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
mockEnterpriseFeatures(["admin_alerts", "webhooks", "siem_forwarding"]);

const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
const { env } = await import("../../../apps/api/src/config.js");
const { db, schema } = await import("../../../apps/api/src/db/index.js");
const { encrypt } = await import("../../../apps/api/src/lib/encryption.js");
const { classifyError } = await import("../../../apps/api/src/lib/error-report.js");
const { logger } = await import("../../../apps/api/src/lib/logger.js");
const { upsertSetting } = await import("../../../apps/api/src/lib/settings-helpers.js");
const { evaluateAlerts } = await import("../../../apps/api/src/jobs/alert-evaluator.js");
const { runSiemForward } = await import("../../../apps/api/src/jobs/siem-forward.js");

import type { TestApp } from "../test-server.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const AUTH_HEADER = "Bearer secret-webhook-token";

let testApp: TestApp;
let adminToken: string;
const originalKey = env.DATA_ENCRYPTION_KEY;
const originalPreviousKey = env.DATA_ENCRYPTION_KEY_PREVIOUS;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

let appLogError: ReturnType<typeof vi.spyOn>;
let pinoLogError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  reportErrorSpy.mockClear();
  deliverWebhookSpy.mockClear();
  deliverWebhookSpy.mockResolvedValue({ success: true, statusCode: 200, attempts: 1 });
  appLogError = vi.spyOn(testApp.app.log, "error");
  pinoLogError = vi.spyOn(logger, "error").mockImplementation(() => {});
  env.DATA_ENCRYPTION_KEY = KEY_B;
  env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
});

afterEach(async () => {
  appLogError.mockRestore();
  pinoLogError.mockRestore();
  env.DATA_ENCRYPTION_KEY = originalKey;
  env.DATA_ENCRYPTION_KEY_PREVIOUS = originalPreviousKey;
  await db.delete(schema.settings).where(eq(schema.settings.key, "webhook_destinations"));
  await db.delete(schema.settings).where(eq(schema.settings.key, "siem_config"));
  await db.delete(schema.settings).where(eq(schema.settings.key, "siem_consecutive_failures"));
  await db.delete(schema.settings).where(eq(schema.settings.key, "siem_last_forwarded_at"));
  await db.delete(schema.settings).where(eq(schema.settings.key, "backup_last_completed"));
  await db.delete(schema.settings).where(eq(schema.settings.key, "defaultTheme"));
});

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function seedWebhookDestination(authHeader: string): Promise<void> {
  await upsertSetting(
    "webhook_destinations",
    JSON.stringify([
      {
        name: "Ops Alerts",
        url: "https://example.com/alerts",
        authHeader,
        eventFilter: [],
        batchIntervalSeconds: 30,
        enabled: true,
        type: "alerts",
      },
    ]),
  );
}

async function seedSiemConfig(authHeader: string): Promise<void> {
  await upsertSetting(
    "siem_config",
    JSON.stringify({
      webhookUrl: "https://example.com/siem",
      authHeader,
      flushIntervalSeconds: 30,
      enabled: true,
    }),
  );
  // Ensure at least one audit_log row exists for runSiemForward to pick up
  await db.insert(schema.auditLog).values({
    id: randomUUID(),
    action: "LOGIN_FAILED",
    actorId: null,
    actorUsername: "admin",
  });
}

describe("Encrypted-setting decrypt callers (#2031)", () => {
  describe("POST /api/v1/enterprise/webhooks/:index/test", () => {
    it("returns 500 DECRYPTION_FAILED, logs, reports, and skips delivery on a wrong key", async () => {
      await seedWebhookDestination(await encrypt(AUTH_HEADER, KEY_A));

      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks/0/test",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
      expect(deliverWebhookSpy).not.toHaveBeenCalled();
      expect(appLogError).toHaveBeenCalledTimes(1);
      expect(appLogError).toHaveBeenCalledWith(
        { index: 0, name: "Ops Alerts", type: "alerts" },
        expect.stringContaining("DATA_ENCRYPTION_KEY"),
      );
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      const [err, ctx] = reportErrorSpy.mock.calls[0];
      expect(classifyError(err, "http")).toBe("operational");
      expect(err).toMatchObject({ code: "WEBHOOK_DECRYPTION_FAILED" });
      expect(ctx).toMatchObject({
        source: "http",
        route: "/api/v1/enterprise/webhooks/:index/test",
        method: "POST",
        statusCode: 500,
        subsystem: "webhooks",
      });
    });

    it("returns 500 DECRYPTION_FAILED instead of sending raw $ENC$ ciphertext when the key is removed", async () => {
      env.DATA_ENCRYPTION_KEY = "";
      await seedWebhookDestination(await encrypt(AUTH_HEADER, KEY_A));

      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks/0/test",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).code).toBe("DECRYPTION_FAILED");
      expect(deliverWebhookSpy).not.toHaveBeenCalled();
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("falls back to DATA_ENCRYPTION_KEY_PREVIOUS during key rotation", async () => {
      env.DATA_ENCRYPTION_KEY = KEY_B;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
      await seedWebhookDestination(await encrypt(AUTH_HEADER, KEY_A));

      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks/0/test",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ ok: true, statusCode: 200 });
      expect(deliverWebhookSpy).toHaveBeenCalledTimes(1);
      expect(deliverWebhookSpy.mock.calls[0][1]).toBe(AUTH_HEADER);
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(appLogError).not.toHaveBeenCalled();
    });

    it("delivers a plaintext authHeader when no key is configured", async () => {
      env.DATA_ENCRYPTION_KEY = "";
      await seedWebhookDestination(AUTH_HEADER);

      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks/0/test",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(deliverWebhookSpy).toHaveBeenCalledTimes(1);
      expect(deliverWebhookSpy.mock.calls[0][1]).toBe(AUTH_HEADER);
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(appLogError).not.toHaveBeenCalled();
    });
  });

  describe("runSiemForward", () => {
    it("logs, reports an operational error, and skips delivery without tripping the circuit breaker on a wrong key", async () => {
      await seedSiemConfig(await encrypt(AUTH_HEADER, KEY_A));

      await expect(runSiemForward()).resolves.toBeUndefined();

      expect(deliverWebhookSpy).not.toHaveBeenCalled();
      expect(pinoLogError).toHaveBeenCalledWith(expect.stringContaining("DATA_ENCRYPTION_KEY"));
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      const [err, ctx] = reportErrorSpy.mock.calls[0];
      expect(classifyError(err, "worker")).toBe("operational");
      expect(err).toMatchObject({ code: "SIEM_DECRYPTION_FAILED" });
      expect(ctx).toMatchObject({
        source: "worker",
        pool: "system",
        subsystem: "siem-forward",
      });

      const [failures] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, "siem_consecutive_failures"));
      expect(failures).toBeUndefined();
    });

    it("skips delivery instead of sending raw $ENC$ ciphertext when the key is removed", async () => {
      env.DATA_ENCRYPTION_KEY = "";
      await seedSiemConfig(await encrypt(AUTH_HEADER, KEY_A));

      await expect(runSiemForward()).resolves.toBeUndefined();

      expect(deliverWebhookSpy).not.toHaveBeenCalled();
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("decrypts via DATA_ENCRYPTION_KEY_PREVIOUS during key rotation", async () => {
      env.DATA_ENCRYPTION_KEY = KEY_B;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
      await seedSiemConfig(await encrypt(AUTH_HEADER, KEY_A));

      const result = await runSiemForward();

      expect(result?.forwarded).toBeGreaterThan(0);
      expect(deliverWebhookSpy).toHaveBeenCalledTimes(1);
      expect(deliverWebhookSpy.mock.calls[0][1]).toBe(AUTH_HEADER);
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(pinoLogError).not.toHaveBeenCalled();
    });

    it("delivers a plaintext authHeader when no key is configured", async () => {
      env.DATA_ENCRYPTION_KEY = "";
      await seedSiemConfig(AUTH_HEADER);

      const result = await runSiemForward();

      expect(result?.forwarded).toBeGreaterThan(0);
      expect(deliverWebhookSpy).toHaveBeenCalledTimes(1);
      expect(deliverWebhookSpy.mock.calls[0][1]).toBe(AUTH_HEADER);
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(pinoLogError).not.toHaveBeenCalled();
    });
  });

  describe("evaluateAlerts", () => {
    it("logs, reports an operational error, and skips delivery on a wrong key", async () => {
      await seedWebhookDestination(await encrypt(AUTH_HEADER, KEY_A));

      await evaluateAlerts();

      expect(deliverWebhookSpy).not.toHaveBeenCalled();
      expect(pinoLogError).toHaveBeenCalledWith(
        { name: "Ops Alerts" },
        expect.stringContaining("DATA_ENCRYPTION_KEY"),
      );
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      const [err, ctx] = reportErrorSpy.mock.calls[0];
      expect(classifyError(err, "worker")).toBe("operational");
      expect(err).toMatchObject({ code: "ALERT_DECRYPTION_FAILED" });
      expect(ctx).toMatchObject({
        source: "worker",
        pool: "system",
        subsystem: "alert-evaluator",
      });
    });

    it("skips delivery instead of sending raw $ENC$ ciphertext when the key is removed", async () => {
      env.DATA_ENCRYPTION_KEY = "";
      await seedWebhookDestination(await encrypt(AUTH_HEADER, KEY_A));

      await evaluateAlerts();

      expect(deliverWebhookSpy).not.toHaveBeenCalled();
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("decrypts via DATA_ENCRYPTION_KEY_PREVIOUS during key rotation", async () => {
      env.DATA_ENCRYPTION_KEY = KEY_B;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
      await seedWebhookDestination(await encrypt(AUTH_HEADER, KEY_A));

      await evaluateAlerts();

      expect(deliverWebhookSpy).toHaveBeenCalledTimes(1);
      expect(deliverWebhookSpy.mock.calls[0][1]).toBe(AUTH_HEADER);
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(pinoLogError).not.toHaveBeenCalled();
    });

    it("delivers a plaintext authHeader when no key is configured", async () => {
      env.DATA_ENCRYPTION_KEY = "";
      await seedWebhookDestination(AUTH_HEADER);

      await evaluateAlerts();

      expect(deliverWebhookSpy).toHaveBeenCalledTimes(1);
      expect(deliverWebhookSpy.mock.calls[0][1]).toBe(AUTH_HEADER);
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(pinoLogError).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/settings and GET /api/v1/settings/:key (#2534)", () => {
    it("omits an undecryptable $ENC$ row from GET /api/v1/settings, logs, and reports an operational error", async () => {
      await upsertSetting("defaultTheme", await encrypt("dark", KEY_A));

      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).settings.defaultTheme).toBeUndefined();
      expect(res.body).not.toContain("$ENC$");
      expect(appLogError).toHaveBeenCalledTimes(1);
      expect(appLogError).toHaveBeenCalledWith(
        { key: "defaultTheme" },
        expect.stringContaining("DATA_ENCRYPTION_KEY"),
      );
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      const [err, ctx] = reportErrorSpy.mock.calls[0];
      expect(classifyError(err, "http")).toBe("operational");
      expect(err).toMatchObject({ code: "SETTING_DECRYPTION_FAILED", statusCode: 500 });
      expect(ctx).toMatchObject({
        source: "http",
        route: "/api/v1/settings",
        method: "GET",
        statusCode: 500,
        subsystem: "settings",
      });
    });

    it("returns 500 DECRYPTION_FAILED on GET /api/v1/settings/:key instead of raw $ENC$ ciphertext", async () => {
      await upsertSetting("defaultTheme", await encrypt("dark", KEY_A));

      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/settings/defaultTheme",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({
        error: "Failed to decrypt setting",
        code: "DECRYPTION_FAILED",
      });
      expect(res.body).not.toContain("$ENC$");
      expect(appLogError).toHaveBeenCalledTimes(1);
      expect(appLogError).toHaveBeenCalledWith(
        { key: "defaultTheme" },
        expect.stringContaining("DATA_ENCRYPTION_KEY"),
      );
      expect(reportErrorSpy).toHaveBeenCalledTimes(1);
      const [err, ctx] = reportErrorSpy.mock.calls[0];
      expect(classifyError(err, "http")).toBe("operational");
      expect(err).toMatchObject({ code: "SETTING_DECRYPTION_FAILED", statusCode: 500 });
      expect(ctx).toMatchObject({
        source: "http",
        route: "/api/v1/settings/:key",
        method: "GET",
        statusCode: 500,
        subsystem: "settings",
      });
    });

    it("decrypts an $ENC$ row via DATA_ENCRYPTION_KEY_PREVIOUS during key rotation", async () => {
      env.DATA_ENCRYPTION_KEY = KEY_B;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
      await upsertSetting("defaultTheme", await encrypt("dark", KEY_A));

      const listRes = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/settings",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      expect(JSON.parse(listRes.body).settings.defaultTheme).toBe("dark");

      const keyRes = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/settings/defaultTheme",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(keyRes.statusCode).toBe(200);
      expect(JSON.parse(keyRes.body).value).toBe("dark");
      expect(reportErrorSpy).not.toHaveBeenCalled();
      expect(appLogError).not.toHaveBeenCalled();
    });
  });
});
