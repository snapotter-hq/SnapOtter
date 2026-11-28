/**
 * The boot-time instance_started is dropped while an admin has analytics off.
 * Turning it back on is the first moment the instance can be counted again, so
 * both settings write paths send the census there, once (#5382).
 */
import { ANALYTICS_EVENTS } from "@snapotter/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const gate = {
  // The cached gate before the write, and what a refresh after the write reads.
  enabled: true,
  afterRefresh: true,
  events: [] as string[],
  analyticsEnabled: vi.fn(),
  refreshAnalyticsGate: vi.fn(),
  publishAnalyticsGateInvalidation: vi.fn(),
};
const trackInstanceStarted = vi.fn();

function mockCommon(): void {
  vi.resetModules();
  gate.enabled = true;
  gate.afterRefresh = true;
  gate.events = [];
  gate.analyticsEnabled.mockReset().mockImplementation(() => {
    gate.events.push("enabled-read");
    return gate.enabled;
  });
  gate.refreshAnalyticsGate.mockReset().mockImplementation(async () => {
    gate.enabled = gate.afterRefresh;
  });
  gate.publishAnalyticsGateInvalidation.mockReset().mockResolvedValue(undefined);
  trackInstanceStarted.mockReset().mockResolvedValue(undefined);

  vi.doMock("drizzle-orm", () => ({
    and: (...args: unknown[]) => ({ op: "and", args }),
    eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: "sql",
      strings: [...strings],
      values,
    }),
  }));
  vi.doMock("../../../apps/api/src/config.js", () => ({
    env: {
      DATA_ENCRYPTION_KEY: "",
      DATA_ENCRYPTION_KEY_PREVIOUS: "",
      OIDC_ENABLED: false,
      SAML_ENABLED: false,
    },
  }));
  vi.doMock("../../../apps/api/src/lib/analytics-gate.js", () => ({
    analyticsEnabled: gate.analyticsEnabled,
    refreshAnalyticsGate: gate.refreshAnalyticsGate,
    publishAnalyticsGateInvalidation: gate.publishAnalyticsGateInvalidation,
  }));
  vi.doMock("../../../apps/api/src/lib/instance-started.js", () => ({
    trackInstanceStarted,
  }));
  vi.doMock("../../../apps/api/src/lib/audit.js", () => ({
    auditFromRequest: () => async () => {},
  }));

  const txHandle = {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    }),
    delete: () => ({ where: () => Promise.resolve() }),
  };
  vi.doMock("../../../apps/api/src/db/index.js", () => ({
    db: {
      select: () => ({
        from: () => Object.assign(Promise.resolve([]), { where: () => Promise.resolve([]) }),
      }),
      transaction: async (cb: (tx: typeof txHandle) => Promise<unknown>) => {
        gate.events.push("tx.begin");
        return cb(txHandle);
      },
    },
    schema: {
      settings: { key: "settings.key", value: "settings.value" },
      roles: { id: "roles.id", name: "roles.name", isBuiltin: "roles.isBuiltin" },
      teams: { id: "teams.id", name: "teams.name" },
    },
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PUT /api/v1/settings sends instance_started when analytics goes back on (#5382)", () => {
  async function buildApp() {
    mockCommon();
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
      getEffectivePermissions: async () => ["settings:read", "settings:write"],
      isFullEffectiveAdmin: async () => true,
    }));
    const { settingsRoutes } = await import("../../../apps/api/src/routes/settings.js");
    const app = Fastify();
    await settingsRoutes(app);
    await app.ready();
    return app;
  }

  function put(app: Awaited<ReturnType<typeof buildApp>>, payload: Record<string, string>) {
    return app.inject({ method: "PUT", url: "/api/v1/settings", payload });
  }

  it("sends it once, reading the gate before the write", async () => {
    const app = await buildApp();
    try {
      gate.enabled = false;
      const res = await put(app, { analyticsEnabled: "true" });
      expect(res.statusCode).toBe(200);
      expect(trackInstanceStarted).toHaveBeenCalledTimes(1);
      expect(gate.events.indexOf("enabled-read")).toBeLessThan(gate.events.indexOf("tx.begin"));
      expect(gate.refreshAnalyticsGate.mock.invocationCallOrder[0]).toBeLessThan(
        trackInstanceStarted.mock.invocationCallOrder[0],
      );
    } finally {
      await app.close();
    }
  });

  it("does not send it when analytics was already on", async () => {
    const app = await buildApp();
    try {
      gate.enabled = true;
      const res = await put(app, { analyticsEnabled: "true" });
      expect(res.statusCode).toBe(200);
      expect(trackInstanceStarted).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("does not send it when the save leaves analytics off", async () => {
    const app = await buildApp();
    try {
      gate.enabled = false;
      gate.afterRefresh = false;
      const res = await put(app, { analyticsEnabled: "false" });
      expect(res.statusCode).toBe(200);
      expect(trackInstanceStarted).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("does not consult the gate for a save that doesn't touch analyticsEnabled", async () => {
    const app = await buildApp();
    try {
      gate.enabled = false;
      const res = await put(app, { defaultTheme: "dark" });
      expect(res.statusCode).toBe(200);
      expect(gate.analyticsEnabled).not.toHaveBeenCalled();
      expect(trackInstanceStarted).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("still sends it when the cross-replica invalidation fails", async () => {
    const app = await buildApp();
    try {
      gate.enabled = false;
      gate.publishAnalyticsGateInvalidation.mockRejectedValueOnce(new Error("redis down"));
      const res = await put(app, { analyticsEnabled: "true" });
      expect(res.statusCode).toBe(200);
      expect(trackInstanceStarted).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});

describe("POST /api/v1/enterprise/config/import sends instance_started when analytics goes back on (#5382)", () => {
  async function buildApp() {
    mockCommon();
    vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
      isEnterpriseFeatureEnabled: async () => true,
    }));
    vi.doMock("../../../apps/api/src/permissions.js", () => ({
      requireFullAdmin: async () => ({ id: "admin-1", username: "admin", role: "admin" }),
    }));
    const { registerConfigRoutes } = await import(
      "../../../apps/api/src/routes/enterprise/config.js"
    );
    const app = Fastify();
    await registerConfigRoutes(app);
    await app.ready();
    return app;
  }

  function importSettings(
    app: Awaited<ReturnType<typeof buildApp>>,
    settings: Record<string, string>,
    dryRun = false,
  ) {
    return app.inject({
      method: "POST",
      url: "/api/v1/enterprise/config/import",
      payload: { dryRun, config: { configSchemaVersion: 1, settings } },
    });
  }

  it("sends it once, reading the gate before the write", async () => {
    const app = await buildApp();
    try {
      gate.enabled = false;
      const res = await importSettings(app, { analyticsEnabled: "true" });
      expect(res.statusCode).toBe(200);
      expect(trackInstanceStarted).toHaveBeenCalledTimes(1);
      expect(gate.events.indexOf("enabled-read")).toBeLessThan(gate.events.indexOf("tx.begin"));
    } finally {
      await app.close();
    }
  });

  it("does not send it on a dry run, when already on, or on an unrelated import", async () => {
    const app = await buildApp();
    try {
      gate.enabled = false;
      expect((await importSettings(app, { analyticsEnabled: "true" }, true)).statusCode).toBe(200);
      expect((await importSettings(app, { defaultTheme: "dark" })).statusCode).toBe(200);
      gate.enabled = true;
      expect((await importSettings(app, { analyticsEnabled: "true" })).statusCode).toBe(200);
      expect(trackInstanceStarted).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

describe("trackInstanceStarted", () => {
  it("sends the census with system properties and skips the volume sample", async () => {
    vi.resetModules();
    vi.doUnmock("../../../apps/api/src/lib/instance-started.js");
    const trackEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../../apps/api/src/lib/analytics.js", () => ({ trackEvent }));
    vi.doMock("../../../apps/api/src/lib/system-info.js", () => ({
      gatherSystemProperties: () => ({ cpu_count: 4 }),
    }));
    const mod = await import("../../../apps/api/src/lib/instance-started.js");
    await mod.trackInstanceStarted();
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.INSTANCE_STARTED,
      { cpu_count: 4 },
      undefined,
      { ignoreSampleRate: true },
    );
  });
});
