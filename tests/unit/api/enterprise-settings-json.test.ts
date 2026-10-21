import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const isEnterpriseFeatureEnabledMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const auditFnMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const validateFetchUrlMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const deliverWebhookMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: { DATA_ENCRYPTION_KEY: "" },
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  },
  schema: {
    settings: {
      key: "settings.key",
      value: "settings.value",
    },
  },
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditFromRequest: () => auditFnMock,
}));

vi.mock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
  isEnterpriseFeatureEnabled: isEnterpriseFeatureEnabledMock,
}));

vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: loggerMock,
}));

vi.mock("../../../apps/api/src/lib/ssrf.js", () => ({
  validateFetchUrl: validateFetchUrlMock,
}));

vi.mock("../../../apps/api/src/lib/webhook-delivery.js", () => ({
  deliverWebhook: deliverWebhookMock,
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requirePermission: () => requirePermissionMock,
}));

function mockSelectRow(value?: string) {
  const rows = value === undefined ? [] : [{ key: "k", value }];
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(rows)),
  };
  selectMock.mockReturnValue(chain);
}

describe("enterprise settings JSON resilience (#2554)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/enterprise/siem/config", () => {
    it("logs a warning and returns default disabled config when stored siem_config is malformed JSON", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
      mockSelectRow("{corrupt");

      const { registerSiemRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/siem.js"
      );
      const app = Fastify();
      await registerSiemRoutes(app);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/enterprise/siem/config",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        webhookUrl: "",
        authHeader: "",
        flushIntervalSeconds: 30,
        enabled: false,
      });
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: expect.any(SyntaxError), key: "siem_config" },
        "siem: failed to parse stored siem_config JSON",
      );

      await app.close();
    });

    it("logs a warning and returns default disabled config when stored siem_config is non-object JSON", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });

      const { registerSiemRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/siem.js"
      );
      const app = Fastify();
      await registerSiemRoutes(app);

      for (const raw of ["null", "[]", "123", '"str"']) {
        loggerMock.warn.mockClear();
        mockSelectRow(raw);

        const res = await app.inject({
          method: "GET",
          url: "/api/v1/enterprise/siem/config",
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
          webhookUrl: "",
          authHeader: "",
          flushIntervalSeconds: 30,
          enabled: false,
        });
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledWith(
          { key: "siem_config" },
          "siem: stored siem_config is not a JSON object",
        );
      }

      await app.close();
    });

    it("logs a warning from readSiemConfig() and PUT authHeader mask preservation when stored siem_config is corrupt or non-object JSON", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
      updateMock.mockReturnValue({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      });

      const { readSiemConfig, registerSiemRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/siem.js"
      );
      const app = Fastify();
      await registerSiemRoutes(app);

      mockSelectRow("{corrupt");
      expect(await readSiemConfig()).toBeNull();
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: expect.any(SyntaxError), key: "siem_config" },
        "siem: failed to parse stored siem_config JSON",
      );

      loggerMock.warn.mockClear();
      mockSelectRow("[]");
      expect(await readSiemConfig()).toBeNull();
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { key: "siem_config" },
        "siem: stored siem_config is not a JSON object",
      );

      loggerMock.warn.mockClear();
      mockSelectRow("{corrupt");
      const putRes = await app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/siem/config",
        payload: {
          webhookUrl: "https://siem.example.com/events",
          authHeader: "***",
          flushIntervalSeconds: 30,
          enabled: true,
        },
      });
      expect(putRes.statusCode).toBe(200);
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: expect.any(SyntaxError), key: "siem_config" },
        "siem: failed to parse stored siem_config JSON",
      );

      await app.close();
    });

    it("returns empty authHeader instead of *** when stored siem_config has a non-string authHeader (#3237)", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });

      const { registerSiemRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/siem.js"
      );
      const app = Fastify();
      await registerSiemRoutes(app);

      try {
        for (const badAuthHeader of [123, true, {}, ["Bearer token"], null, "", undefined]) {
          mockSelectRow(
            JSON.stringify({
              webhookUrl: "https://siem.example.com/events",
              authHeader: badAuthHeader,
              flushIntervalSeconds: 30,
              enabled: true,
            }),
          );

          const res = await app.inject({
            method: "GET",
            url: "/api/v1/enterprise/siem/config",
          });

          expect(res.statusCode).toBe(200);
          expect(res.json()).toEqual({
            webhookUrl: "https://siem.example.com/events",
            authHeader: "",
            flushIntervalSeconds: 30,
            enabled: true,
          });
        }

        mockSelectRow(
          JSON.stringify({
            webhookUrl: "https://siem.example.com/events",
            authHeader: "Bearer secret",
            flushIntervalSeconds: 30,
            enabled: true,
          }),
        );
        const maskedRes = await app.inject({
          method: "GET",
          url: "/api/v1/enterprise/siem/config",
        });
        expect(maskedRes.statusCode).toBe(200);
        expect(maskedRes.json()).toEqual({
          webhookUrl: "https://siem.example.com/events",
          authHeader: "***",
          flushIntervalSeconds: 30,
          enabled: true,
        });
      } finally {
        await app.close();
      }
    });
  });

  describe("PUT /api/v1/enterprise/siem/config", () => {
    it("validates webhookUrl with validateFetchUrl on PUT and returns 400 when rejected (#2555)", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });

      const { registerSiemRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/siem.js"
      );
      const app = Fastify();
      await registerSiemRoutes(app);

      validateFetchUrlMock.mockRejectedValueOnce(
        new Error("URL resolves to a private or reserved IP address"),
      );

      const loopbackRes = await app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/siem/config",
        payload: {
          webhookUrl: "http://127.0.0.1:8080/siem",
          flushIntervalSeconds: 30,
          enabled: true,
        },
      });
      expect(loopbackRes.statusCode).toBe(400);
      expect(loopbackRes.json()).toEqual({
        error: "SIEM webhook URL must resolve to a public HTTP(S) destination",
        details: "URL resolves to a private or reserved IP address",
      });
      expect(validateFetchUrlMock).toHaveBeenCalledWith("http://127.0.0.1:8080/siem");
      expect(selectMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect(auditFnMock).not.toHaveBeenCalled();

      validateFetchUrlMock.mockRejectedValueOnce("Only HTTP and HTTPS URLs are supported");

      const schemeRes = await app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/siem/config",
        payload: {
          webhookUrl: "ftp://example.com/siem",
          flushIntervalSeconds: 30,
          enabled: true,
        },
      });
      expect(schemeRes.statusCode).toBe(400);
      expect(schemeRes.json()).toEqual({
        error: "SIEM webhook URL must resolve to a public HTTP(S) destination",
        details: "Only HTTP and HTTPS URLs are supported",
      });
      expect(validateFetchUrlMock).toHaveBeenCalledWith("ftp://example.com/siem");

      await app.close();
    });
  });

  describe("webhook_destinations readDestinations()", () => {
    it("logs a warning and returns [] on GET, POST, PUT, DELETE, and test ping when stored webhook_destinations is malformed JSON", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
      mockSelectRow("{corrupt");
      const updates: Array<Record<string, unknown>> = [];
      updateMock.mockReturnValue({
        set: (arg: Record<string, unknown>) => {
          updates.push(arg);
          return {
            where: () => Promise.resolve(),
          };
        },
      });

      const { registerWebhookRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/webhooks.js"
      );
      const app = Fastify();
      await registerWebhookRoutes(app);

      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/enterprise/webhooks",
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json()).toEqual({ destinations: [] });
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: expect.any(SyntaxError), key: "webhook_destinations" },
        "webhooks: failed to parse stored webhook_destinations JSON",
      );

      loggerMock.warn.mockClear();
      const postRes = await app.inject({
        method: "POST",
        url: "/api/v1/enterprise/webhooks",
        payload: {
          name: "New Hook",
          url: "https://example.com/hook",
        },
      });
      expect(postRes.statusCode).toBe(201);
      expect(postRes.json()).toEqual({ ok: true, index: 0 });
      expect(updates).toHaveLength(1);
      expect(JSON.parse(updates[0].value as string)).toEqual([
        expect.objectContaining({
          name: "New Hook",
          url: "https://example.com/hook",
        }),
      ]);
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: expect.any(SyntaxError), key: "webhook_destinations" },
        "webhooks: failed to parse stored webhook_destinations JSON",
      );

      for (const req of [
        {
          method: "PUT" as const,
          url: "/api/v1/enterprise/webhooks/0",
          payload: { name: "Updated", url: "https://example.com/hook" },
        },
        {
          method: "DELETE" as const,
          url: "/api/v1/enterprise/webhooks/0",
        },
        {
          method: "POST" as const,
          url: "/api/v1/enterprise/webhooks/0/test",
        },
      ]) {
        loggerMock.warn.mockClear();
        const res = await app.inject(req);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: "Webhook destination not found" });
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledWith(
          { err: expect.any(SyntaxError), key: "webhook_destinations" },
          "webhooks: failed to parse stored webhook_destinations JSON",
        );
      }

      await app.close();
    });

    it("logs a warning and returns [] when stored webhook_destinations is non-array JSON", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
      const updates: Array<Record<string, unknown>> = [];
      updateMock.mockReturnValue({
        set: (arg: Record<string, unknown>) => {
          updates.push(arg);
          return {
            where: () => Promise.resolve(),
          };
        },
      });

      const { registerWebhookRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/webhooks.js"
      );
      const app = Fastify();
      await registerWebhookRoutes(app);

      for (const raw of [
        "{}",
        "null",
        "123",
        '"str"',
        "[null]",
        "[42]",
        '["str"]',
        "[true]",
        "[[]]",
        JSON.stringify([
          { name: "Hook", url: "https://example.com/hook", enabled: true, type: "alerts" },
          null,
        ]),
      ]) {
        loggerMock.warn.mockClear();
        updates.length = 0;
        mockSelectRow(raw);

        const getRes = await app.inject({
          method: "GET",
          url: "/api/v1/enterprise/webhooks",
        });
        expect(getRes.statusCode).toBe(200);
        expect(getRes.json()).toEqual({ destinations: [] });
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledWith(
          { key: "webhook_destinations" },
          "webhooks: stored webhook_destinations is not a JSON array",
        );

        loggerMock.warn.mockClear();
        const postRes = await app.inject({
          method: "POST",
          url: "/api/v1/enterprise/webhooks",
          payload: {
            name: "New Hook",
            url: "https://example.com/hook",
          },
        });
        expect(postRes.statusCode).toBe(201);
        expect(postRes.json()).toEqual({ ok: true, index: 0 });
        expect(updates).toHaveLength(1);
        expect(JSON.parse(updates[0].value as string)).toEqual([
          expect.objectContaining({
            name: "New Hook",
            url: "https://example.com/hook",
          }),
        ]);
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledWith(
          { key: "webhook_destinations" },
          "webhooks: stored webhook_destinations is not a JSON array",
        );

        for (const req of [
          {
            method: "PUT" as const,
            url: "/api/v1/enterprise/webhooks/0",
            payload: { name: "Updated", url: "https://example.com/hook", authHeader: "***" },
          },
          {
            method: "DELETE" as const,
            url: "/api/v1/enterprise/webhooks/0",
          },
          {
            method: "POST" as const,
            url: "/api/v1/enterprise/webhooks/0/test",
          },
        ]) {
          loggerMock.warn.mockClear();
          const res = await app.inject(req);
          expect(res.statusCode).toBe(404);
          expect(res.json()).toEqual({ error: "Webhook destination not found" });
          expect(loggerMock.warn).toHaveBeenCalledTimes(1);
          expect(loggerMock.warn).toHaveBeenCalledWith(
            { key: "webhook_destinations" },
            "webhooks: stored webhook_destinations is not a JSON array",
          );
        }
      }

      await app.close();
    });
  });

  describe("POST and PUT /api/v1/enterprise/webhooks (#3076)", () => {
    it("validates url with validateFetchUrl on POST and returns 400 when rejected (#3076)", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });

      const { registerWebhookRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/webhooks.js"
      );
      const app = Fastify();
      await registerWebhookRoutes(app);

      try {
        validateFetchUrlMock.mockRejectedValueOnce(
          new Error("URL resolves to a private or reserved IP address"),
        );

        const postLoopbackRes = await app.inject({
          method: "POST",
          url: "/api/v1/enterprise/webhooks",
          payload: {
            name: "Loopback Hook",
            url: "http://127.0.0.1:8080/hook",
          },
        });
        expect(postLoopbackRes.statusCode).toBe(400);
        expect(postLoopbackRes.json()).toEqual({
          error: "Webhook URL must resolve to a public HTTP(S) destination",
          details: "URL resolves to a private or reserved IP address",
        });
        expect(validateFetchUrlMock).toHaveBeenCalledWith("http://127.0.0.1:8080/hook");
        expect(selectMock).not.toHaveBeenCalled();
        expect(insertMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
        expect(auditFnMock).not.toHaveBeenCalled();

        validateFetchUrlMock.mockRejectedValueOnce("Only HTTP and HTTPS URLs are supported");

        const postSchemeRes = await app.inject({
          method: "POST",
          url: "/api/v1/enterprise/webhooks",
          payload: {
            name: "FTP Hook",
            url: "ftp://example.com/hook",
          },
        });
        expect(postSchemeRes.statusCode).toBe(400);
        expect(postSchemeRes.json()).toEqual({
          error: "Webhook URL must resolve to a public HTTP(S) destination",
          details: "Only HTTP and HTTPS URLs are supported",
        });
        expect(validateFetchUrlMock).toHaveBeenCalledWith("ftp://example.com/hook");
        expect(selectMock).not.toHaveBeenCalled();
        expect(insertMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
        expect(auditFnMock).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it("validates url with validateFetchUrl on PUT and returns 400 when rejected (#3076)", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
      mockSelectRow(
        JSON.stringify([
          {
            name: "Existing Hook",
            url: "https://example.com/hook",
            authHeader: "",
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
        ]),
      );

      const { registerWebhookRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/webhooks.js"
      );
      const app = Fastify();
      await registerWebhookRoutes(app);

      try {
        validateFetchUrlMock.mockRejectedValueOnce(
          new Error("URL resolves to a private or reserved IP address"),
        );

        const putLoopbackRes = await app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/webhooks/0",
          payload: {
            name: "Loopback Hook",
            url: "http://127.0.0.1:8080/hook",
          },
        });
        expect(putLoopbackRes.statusCode).toBe(400);
        expect(putLoopbackRes.json()).toEqual({
          error: "Webhook URL must resolve to a public HTTP(S) destination",
          details: "URL resolves to a private or reserved IP address",
        });
        expect(validateFetchUrlMock).toHaveBeenCalledWith("http://127.0.0.1:8080/hook");
        expect(selectMock).toHaveBeenCalledTimes(1);
        expect(insertMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
        expect(auditFnMock).not.toHaveBeenCalled();

        validateFetchUrlMock.mockRejectedValueOnce("Only HTTP and HTTPS URLs are supported");

        const putSchemeRes = await app.inject({
          method: "PUT",
          url: "/api/v1/enterprise/webhooks/0",
          payload: {
            name: "FTP Hook",
            url: "ftp://example.com/hook",
          },
        });
        expect(putSchemeRes.statusCode).toBe(400);
        expect(putSchemeRes.json()).toEqual({
          error: "Webhook URL must resolve to a public HTTP(S) destination",
          details: "Only HTTP and HTTPS URLs are supported",
        });
        expect(validateFetchUrlMock).toHaveBeenCalledWith("ftp://example.com/hook");
        expect(selectMock).toHaveBeenCalledTimes(2);
        expect(insertMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
        expect(auditFnMock).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  describe("POST /api/v1/enterprise/webhooks/:index/test (#3064)", () => {
    it("treats a non-string stored authHeader as empty instead of throwing 500 TypeError", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
      mockSelectRow(
        JSON.stringify([
          {
            name: "Corrupt Auth Hook",
            url: "https://example.com/hook",
            authHeader: 123,
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
        ]),
      );
      deliverWebhookMock.mockResolvedValueOnce({
        success: true,
        statusCode: 200,
        attempts: 1,
      });

      const { registerWebhookRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/webhooks.js"
      );
      const app = Fastify();
      await registerWebhookRoutes(app);

      try {
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/enterprise/webhooks/0/test",
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
          ok: true,
          statusCode: 200,
          error: undefined,
        });
        expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
        expect(deliverWebhookMock).toHaveBeenCalledWith(
          "https://example.com/hook",
          "",
          [
            expect.objectContaining({
              condition: "test_ping",
              message: "This is a test webhook from SnapOtter",
            }),
          ],
          { maxRetries: 0 },
        );
      } finally {
        await app.close();
      }
    });
  });

  describe("GET /api/v1/enterprise/webhooks (#3237)", () => {
    it("returns empty authHeader on GET /api/v1/enterprise/webhooks when stored authHeader is not a string (#3237)", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
      mockSelectRow(
        JSON.stringify([
          {
            name: "Number Auth Hook",
            url: "https://example.com/hook-number",
            authHeader: 123,
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
          {
            name: "Boolean Auth Hook",
            url: "https://example.com/hook-bool",
            authHeader: true,
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "siem",
          },
          {
            name: "Object Auth Hook",
            url: "https://example.com/hook-obj",
            authHeader: { token: "secret" },
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
          {
            name: "Array Auth Hook",
            url: "https://example.com/hook-arr",
            authHeader: ["Bearer token"],
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
          {
            name: "Null Auth Hook",
            url: "https://example.com/hook-null",
            authHeader: null,
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
          {
            name: "Omitted Auth Hook",
            url: "https://example.com/hook-omitted",
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
          {
            name: "Empty String Auth Hook",
            url: "https://example.com/hook-empty",
            authHeader: "",
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
          {
            name: "Valid Auth Hook",
            url: "https://example.com/hook-valid",
            authHeader: "Bearer token",
            eventFilter: [],
            batchIntervalSeconds: 30,
            enabled: true,
            type: "alerts",
          },
        ]),
      );

      const { registerWebhookRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/webhooks.js"
      );
      const app = Fastify();
      await registerWebhookRoutes(app);

      try {
        const res = await app.inject({
          method: "GET",
          url: "/api/v1/enterprise/webhooks",
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
          destinations: [
            {
              name: "Number Auth Hook",
              url: "https://example.com/hook-number",
              authHeader: "",
              eventFilter: [],
              batchIntervalSeconds: 30,
              enabled: true,
              type: "alerts",
            },
            {
              name: "Boolean Auth Hook",
              url: "https://example.com/hook-bool",
              authHeader: "",
              eventFilter: [],
              batchIntervalSeconds: 30,
              enabled: true,
              type: "siem",
            },
            {
              name: "Object Auth Hook",
              url: "https://example.com/hook-obj",
              authHeader: "",
              eventFilter: [],
              batchIntervalSeconds: 30,
              enabled: true,
              type: "alerts",
            },
            {
              name: "Array Auth Hook",
              url: "https://example.com/hook-arr",
              authHeader: "",
              eventFilter: [],
              batchIntervalSeconds: 30,
              enabled: true,
              type: "alerts",
            },
            {
              name: "Null Auth Hook",
              url: "https://example.com/hook-null",
              authHeader: "",
              eventFilter: [],
              batchIntervalSeconds: 30,
              enabled: true,
              type: "alerts",
            },
            {
              name: "Omitted Auth Hook",
              url: "https://example.com/hook-omitted",
              authHeader: "",
              eventFilter: [],
              batchIntervalSeconds: 30,
              enabled: true,
              type: "alerts",
            },
            {
              name: "Empty String Auth Hook",
              url: "https://example.com/hook-empty",
              authHeader: "",
              eventFilter: [],
              batchIntervalSeconds: 30,
              enabled: true,
              type: "alerts",
            },
            {
              name: "Valid Auth Hook",
              url: "https://example.com/hook-valid",
              authHeader: "***",
              eventFilter: [],
              batchIntervalSeconds: 30,
              enabled: true,
              type: "alerts",
            },
          ],
        });
      } finally {
        await app.close();
      }
    });
  });

  describe("GET /api/v1/enterprise/ip-allowlist (#3038)", () => {
    it("logs a warning and returns empty cidrs when stored ipAllowlist is malformed JSON", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });
      mockSelectRow("{corrupt");

      const { registerIpAllowlistRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/ip-allowlist.js"
      );
      const app = Fastify();
      await registerIpAllowlistRoutes(app);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/enterprise/ip-allowlist",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ cidrs: [] });
      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: expect.any(SyntaxError), key: "ipAllowlist" },
        "ip-allowlist: failed to parse stored ipAllowlist JSON",
      );

      await app.close();
    });

    it("logs a warning and returns empty cidrs when stored ipAllowlist is non-array JSON or contains invalid CIDR entries", async () => {
      isEnterpriseFeatureEnabledMock.mockResolvedValue(true);
      requirePermissionMock.mockResolvedValue({ id: "admin-1", username: "admin" });

      const { registerIpAllowlistRoutes } = await import(
        "../../../apps/api/src/routes/enterprise/ip-allowlist.js"
      );
      const app = Fastify();
      await registerIpAllowlistRoutes(app);

      for (const raw of [
        "{}",
        "null",
        "123",
        '"str"',
        "[null]",
        "[42]",
        "[true]",
        "[{}]",
        '["not-a-cidr"]',
        '["10.0.0.0/8","not-a-cidr"]',
      ]) {
        loggerMock.warn.mockClear();
        mockSelectRow(raw);

        const res = await app.inject({
          method: "GET",
          url: "/api/v1/enterprise/ip-allowlist",
        });

        expect(res.statusCode, raw).toBe(200);
        expect(res.json(), raw).toEqual({ cidrs: [] });
        expect(loggerMock.warn, raw).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn, raw).toHaveBeenCalledWith(
          { key: "ipAllowlist" },
          "ip-allowlist: stored ipAllowlist is not a JSON array of valid CIDR strings",
        );
      }

      loggerMock.warn.mockClear();
      mockSelectRow("");
      const emptyRes = await app.inject({
        method: "GET",
        url: "/api/v1/enterprise/ip-allowlist",
      });
      expect(emptyRes.statusCode).toBe(200);
      expect(emptyRes.json()).toEqual({ cidrs: [] });
      expect(loggerMock.warn).not.toHaveBeenCalled();

      mockSelectRow(undefined);
      const missingRes = await app.inject({
        method: "GET",
        url: "/api/v1/enterprise/ip-allowlist",
      });
      expect(missingRes.statusCode).toBe(200);
      expect(missingRes.json()).toEqual({ cidrs: [] });
      expect(loggerMock.warn).not.toHaveBeenCalled();

      mockSelectRow(JSON.stringify(["10.0.0.0/8", "2001:db8::/32"]));
      const validRes = await app.inject({
        method: "GET",
        url: "/api/v1/enterprise/ip-allowlist",
      });
      expect(validRes.statusCode).toBe(200);
      expect(validRes.json()).toEqual({ cidrs: ["10.0.0.0/8", "2001:db8::/32"] });
      expect(loggerMock.warn).not.toHaveBeenCalled();

      await app.close();
    });
  });
});
