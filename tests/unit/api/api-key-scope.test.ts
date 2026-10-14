import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

const insertValues = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn(() => ({ values: insertValues })));
const auditFn = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    API_KEYS_RATE_LIMIT_PER_MIN: 30,
    SESSION_DURATION_HOURS: 168,
    DEFAULT_PASSWORD: "Adminpass1",
    SKIP_MUST_CHANGE_PASSWORD: true,
    AUTH_ENABLED: true,
    EXTERNAL_URL: "",
  },
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: { insert },
  schema: { apiKeys: {} },
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  auditFromRequest: () => auditFn,
  sanitizeAuditInput: (value: string) => value,
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return { ...actual, reportError };
});

vi.mock("../../../apps/api/src/jobs/connection.js", () => ({
  sharedRedis: () => ({
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  }),
}));

vi.mock("../../../apps/api/src/lib/metrics.js", () => ({
  authAttempts: { inc: vi.fn() },
}));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", () => ({
  getSettingNumber: vi.fn().mockResolvedValue(0),
  getSettingString: vi.fn().mockResolvedValue("optional"),
}));

import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import {
  apiKeyRoutes,
  deriveApiKeyPermissionsForCreate,
} from "../../../apps/api/src/routes/api-keys.js";

describe("deriveApiKeyPermissionsForCreate", () => {
  it("defaults a scoped caller's new key to the caller's effective scope", async () => {
    const scoped = await deriveApiKeyPermissionsForCreate({
      id: "u1",
      username: "admin",
      role: "admin",
      apiKeyPermissions: ["tools:use", "apikeys:own"],
    });

    expect(scoped).toEqual({
      permissions: ["tools:use", "apikeys:own"],
      invalid: [],
    });
  });

  it("rejects requested permissions outside the caller's API key scope", async () => {
    const scoped = await deriveApiKeyPermissionsForCreate(
      {
        id: "u1",
        username: "admin",
        role: "admin",
        apiKeyPermissions: ["tools:use", "apikeys:own"],
      },
      ["tools:use", "users:manage"],
    );

    expect(scoped).toEqual({
      permissions: ["tools:use", "users:manage"],
      invalid: ["users:manage"],
    });
  });

  it("keeps unscoped session-created keys unscoped when no scope is requested", async () => {
    const scoped = await deriveApiKeyPermissionsForCreate({
      id: "u1",
      username: "admin",
      role: "admin",
    });

    expect(scoped).toEqual({ permissions: null, invalid: [] });
  });
});

describe("POST /api/v1/api-keys database failure handling", () => {
  it("surfaces a database insert failure as a 500 and logs it instead of returning 409", async () => {
    const dbErr = new Error("connection terminated unexpectedly");
    insertValues.mockRejectedValueOnce(dbErr);
    auditFn.mockReset();
    reportError.mockReset();

    const app = Fastify({ logger: false });
    const logErrors: unknown[] = [];
    app.addHook("onRequest", async (req) => {
      req.user = { id: "u1", username: "admin", role: "admin" };
      const origError = req.log.error.bind(req.log);
      req.log.error = ((...args: unknown[]) => {
        logErrors.push(args);
        return (origError as (...a: unknown[]) => unknown)(...args);
      }) as typeof req.log.error;
    });
    registerErrorHandler(app);
    await apiKeyRoutes(app);
    await app.ready();

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        payload: { name: "ci" },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal server error" });
      expect(logErrors).toEqual([
        [{ err: dbErr, url: "/api/v1/api-keys", method: "POST" }, "Unhandled request error"],
      ]);
      expect(reportError).toHaveBeenCalledWith(dbErr, {
        source: "http",
        route: "/api/v1/api-keys",
        method: "POST",
        statusCode: 500,
      });
      expect(auditFn).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
