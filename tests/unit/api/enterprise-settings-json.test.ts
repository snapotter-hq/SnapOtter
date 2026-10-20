import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const isEnterpriseFeatureEnabledMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const auditFnMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const validateFetchUrlMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
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
});
