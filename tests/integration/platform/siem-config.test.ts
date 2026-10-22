import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

describe("SIEM config without enterprise license", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  });

  it("GET returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("GET returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
    });
    expect(res.statusCode).toBe(401);
  });

  it("PUT returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/input",
        enabled: true,
        flushIntervalSeconds: 30,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("PUT returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      payload: {
        webhookUrl: "https://example.com/siem/input",
        enabled: true,
        flushIntervalSeconds: 30,
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("SIEM config with enterprise license", () => {
  let enterpriseApp: TestApp;
  let entAdminToken: string;
  let userToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["siem_forwarding"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");

    enterpriseApp = await buildTestApp();
    entAdminToken = await loginAsAdmin(enterpriseApp.app);

    await enterpriseApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        username: "siemregularuser",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "siemregularuser"));

    const loginRes = await enterpriseApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "siemregularuser", password: "TestPass1" },
    });
    userToken = JSON.parse(loginRes.body).token;
  }, 30_000);

  afterAll(async () => {
    await enterpriseApp.cleanup();
    vi.resetModules();
  });

  it("closes the unlicensed job spine before starting the licensed app (#2805)", async () => {
    const { closeQueues, getQueue } = await import("../../../apps/api/src/jobs/queues.js");
    const queue = getQueue("system");
    try {
      await vi.waitFor(async () => expect(await queue.getWorkersCount()).toBe(1), {
        timeout: 1_000,
        interval: 25,
      });
    } finally {
      await closeQueues();
    }
  });

  it("GET returns 200 with default config when none is saved", async () => {
    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.webhookUrl).toBe("");
    expect(body.enabled).toBe(false);
    expect(body.flushIntervalSeconds).toBe(30);
  });

  it("GET returns 403 for non-admin users", async () => {
    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT saves config with valid data", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/input",
        authHeader: "Splunk secret-token",
        flushIntervalSeconds: 60,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it("PUT rejects invalid webhookUrl", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "not-a-url",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Invalid");
  });

  it("PUT rejects loopback, private IP, and non-HTTP(S) webhookUrl (#2555)", async () => {
    const { readSiemConfig } = await import("../../../apps/api/src/routes/enterprise/siem.js");
    const before = await readSiemConfig();

    for (const [webhookUrl, expectedDetail] of [
      ["http://127.0.0.1:8080/siem", "private or reserved IP"],
      ["http://10.0.0.1/siem", "private or reserved IP"],
      ["http://[::1]:8080/siem", "private or reserved IP"],
      ["ftp://example.com/siem", "Only HTTP and HTTPS URLs are supported"],
    ] as const) {
      const res = await enterpriseApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/siem/config",
        headers: { authorization: `Bearer ${entAdminToken}` },
        payload: {
          webhookUrl,
          flushIntervalSeconds: 30,
          enabled: true,
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("SIEM webhook URL must resolve to a public HTTP(S) destination");
      expect(body.details).toContain(expectedDetail);
    }

    expect(await readSiemConfig()).toEqual(before);
  });

  it("PUT rejects flushIntervalSeconds below 10", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/input",
        flushIntervalSeconds: 5,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Invalid");
  });

  it("PUT rejects flushIntervalSeconds above 3600", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/input",
        flushIntervalSeconds: 7200,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Invalid");
  });

  it("PUT returns 403 for non-admin users", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/input",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET returns saved values after PUT", async () => {
    await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/corp/events",
        authHeader: "Bearer my-secret-key",
        flushIntervalSeconds: 120,
        enabled: true,
      },
    });

    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.webhookUrl).toBe("https://example.com/siem/corp/events");
    expect(body.flushIntervalSeconds).toBe(120);
    expect(body.enabled).toBe(true);
  });

  it("GET masks authHeader as *** instead of returning the actual value", async () => {
    await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/input",
        authHeader: "Splunk super-secret-value",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });

    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.authHeader).toBe("***");
    expect(body.authHeader).not.toContain("super-secret-value");
  });

  it("PUT preserves stored authHeader when masked *** is echoed back (#2531)", async () => {
    const { readSiemConfig } = await import("../../../apps/api/src/routes/enterprise/siem.js");

    await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/input",
        authHeader: "Splunk super-secret-value",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });

    const getRes = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    const masked = JSON.parse(getRes.body);
    expect(masked.authHeader).toBe("***");

    const updateRes = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        ...masked,
        webhookUrl: "https://example.com/siem/updated-input",
        flushIntervalSeconds: 90,
      },
    });
    expect(updateRes.statusCode).toBe(200);

    const saved = await readSiemConfig();
    expect(saved?.webhookUrl).toBe("https://example.com/siem/updated-input");
    expect(saved?.flushIntervalSeconds).toBe(90);
    expect(saved?.authHeader).toBe("Splunk super-secret-value");

    // Sending an empty authHeader clears the stored secret
    const clearRes = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        ...masked,
        webhookUrl: "https://example.com/siem/updated-input",
        authHeader: "",
      },
    });
    expect(clearRes.statusCode).toBe(200);
    expect((await readSiemConfig())?.authHeader).toBe("");
  });

  it("PUT does not store literal *** when no prior siem_config row exists or row is corrupt (#2531)", async () => {
    const { readSiemConfig } = await import("../../../apps/api/src/routes/enterprise/siem.js");
    await db.delete(schema.settings).where(eq(schema.settings.key, "siem_config"));

    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/fresh",
        authHeader: "***",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(200);

    const saved = await readSiemConfig();
    expect(saved?.authHeader).toBe("");

    // Corrupt existing JSON row also falls back to empty string instead of storing ***
    await db
      .update(schema.settings)
      .set({ value: "{corrupt-json" })
      .where(eq(schema.settings.key, "siem_config"));

    const corruptRes = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/recovered",
        authHeader: "***",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });
    expect(corruptRes.statusCode).toBe(200);
    expect((await readSiemConfig())?.authHeader).toBe("");

    // Non-string authHeader or array JSON in stored row also falls back to empty string
    await db
      .update(schema.settings)
      .set({
        value: JSON.stringify({ webhookUrl: "https://example.com/siem/x", authHeader: 123 }),
      })
      .where(eq(schema.settings.key, "siem_config"));

    const nonStringRes = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/siem/config",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        webhookUrl: "https://example.com/siem/non-string",
        authHeader: "***",
        flushIntervalSeconds: 30,
        enabled: true,
      },
    });
    expect(nonStringRes.statusCode).toBe(200);
    expect((await readSiemConfig())?.authHeader).toBe("");
  });

  it("GET logs a warning and returns default disabled config when siem_config row is corrupt or non-object JSON (#2554)", async () => {
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const warnSpy = vi.spyOn(logger, "warn");

    try {
      await db
        .insert(schema.settings)
        .values({ key: "siem_config", value: "{corrupt" })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: "{corrupt", updatedAt: new Date() },
        });

      const corruptRes = await enterpriseApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/siem/config",
        headers: { authorization: `Bearer ${entAdminToken}` },
      });
      expect(corruptRes.statusCode).toBe(200);
      expect(JSON.parse(corruptRes.body)).toEqual({
        webhookUrl: "",
        authHeader: "",
        flushIntervalSeconds: 30,
        enabled: false,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(SyntaxError), key: "siem_config" }),
        "siem: failed to parse stored siem_config JSON",
      );

      for (const nonObject of ["null", "[]", "42"]) {
        warnSpy.mockClear();
        await db
          .update(schema.settings)
          .set({ value: nonObject, updatedAt: new Date() })
          .where(eq(schema.settings.key, "siem_config"));

        const nonObjRes = await enterpriseApp.app.inject({
          method: "GET",
          url: "/api/v1/enterprise/siem/config",
          headers: { authorization: `Bearer ${entAdminToken}` },
        });
        expect(nonObjRes.statusCode).toBe(200);
        expect(JSON.parse(nonObjRes.body)).toEqual({
          webhookUrl: "",
          authHeader: "",
          flushIntervalSeconds: 30,
          enabled: false,
        });
        expect(warnSpy).toHaveBeenCalledWith(
          { key: "siem_config" },
          "siem: stored siem_config is not a JSON object",
        );
      }
    } finally {
      warnSpy.mockRestore();
      await db.delete(schema.settings).where(eq(schema.settings.key, "siem_config"));
    }
  });
});
