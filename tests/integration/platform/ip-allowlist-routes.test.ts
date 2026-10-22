import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

describe("IP allowlist without enterprise license", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it("GET returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("PUT returns 403 without enterprise license", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cidrs: ["10.0.0.0/8"] },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("enterprise");
  });

  it("GET returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
    });
    expect(res.statusCode).toBe(401);
  });

  it("PUT returns 401 without authentication", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      payload: { cidrs: ["10.0.0.0/8"] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("IP allowlist with enterprise license", () => {
  let enterpriseApp: TestApp;
  let entAdminToken: string;
  let userToken: string;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["ip_allowlist"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");

    enterpriseApp = await buildTestApp();
    entAdminToken = await loginAsAdmin(enterpriseApp.app);

    await enterpriseApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: {
        username: "ipallowlistuser",
        password: "TestPass1",
        role: "user",
      },
    });
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.username, "ipallowlistuser"));

    const loginRes = await enterpriseApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "ipallowlistuser", password: "TestPass1" },
    });
    userToken = JSON.parse(loginRes.body).token;
  });

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

  it("GET returns 200 with empty cidrs initially", async () => {
    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cidrs).toEqual([]);
  });

  it("GET returns 403 for non-admin users", async () => {
    const res = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT returns 403 for non-admin users", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { cidrs: ["10.0.0.0/8"] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT accepts empty cidrs array (clears allowlist)", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: [] },
    });
    expect(res.statusCode).toBe(200);
  });

  it("PUT rejects invalid CIDR values", async () => {
    for (const invalid of [
      "not-a-cidr",
      "10.0.0.0/",
      "10.0.0.0/ ",
      "10.0.0.0/24/extra",
      "10.0.0.0/+8",
      "10.0.0.0/08",
      "10.0.0.0/0x10",
    ]) {
      const res = await enterpriseApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/ip-allowlist",
        headers: { authorization: `Bearer ${entAdminToken}` },
        payload: { cidrs: [invalid] },
      });
      expect(res.statusCode, invalid).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code, invalid).toBe("INVALID_CIDR");
    }
  });

  it("PUT rejects entries longer than 45 characters", async () => {
    const longEntry = "a".repeat(46);
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: [longEntry] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT rejects more than 1000 entries", async () => {
    const cidrs = Array.from(
      { length: 1001 },
      (_, i) => `10.0.${Math.floor(i / 256)}.${i % 256}/32`,
    );
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET returns saved CIDRs after PUT", async () => {
    const cidrs = ["10.0.0.0/8", "172.16.0.0/12", "127.0.0.0/8"];
    const putRes = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs },
    });
    expect(putRes.statusCode).toBe(200);

    const getRes = await enterpriseApp.app.inject({
      method: "GET",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    expect(body.cidrs).toEqual(cidrs);
  });

  it("PUT returns SELF_LOCKOUT when CIDRs would block the admin IP", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: ["192.168.0.0/16"] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("SELF_LOCKOUT");
  });

  it("PUT allows CIDRs that include the admin IP", async () => {
    const res = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: ["127.0.0.0/8"] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it("blocks requests from a disallowed IP with 403 IP_NOT_ALLOWED (#2052)", async () => {
    const putRes = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: ["127.0.0.0/8"] },
    });
    expect(putRes.statusCode).toBe(200);

    try {
      await vi.waitFor(async () => {
        const blocked = await enterpriseApp.app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
          payload: { username: "ipallowlistuser", password: "TestPass1" },
        });
        expect(blocked.statusCode).toBe(403);
        expect(JSON.parse(blocked.body)).toEqual({
          error: "IP address not allowed",
          code: "IP_NOT_ALLOWED",
        });
      });
    } finally {
      await enterpriseApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/ip-allowlist",
        headers: { authorization: `Bearer ${entAdminToken}` },
        payload: { cidrs: [] },
      });
    }
  });

  it("keeps an active allowlist armed and preserves Redis ip:allowlist when refresh encounters corrupt JSON or a DB error (#2541)", async () => {
    const { db: activeDb, schema: activeSchema } = await import(
      "../../../apps/api/src/db/index.js"
    );
    const { sharedRedis } = await import("../../../apps/api/src/jobs/connection.js");
    const { publishAllowlistRefresh } = await import(
      "../../../apps/api/src/plugins/ip-allowlist.js"
    );
    const redis = sharedRedis();

    const putRes = await enterpriseApp.app.inject({
      method: "PUT",
      url: "/api/v1/enterprise/ip-allowlist",
      headers: { authorization: `Bearer ${entAdminToken}` },
      payload: { cidrs: ["127.0.0.0/8"] },
    });
    expect(putRes.statusCode).toBe(200);

    try {
      await vi.waitFor(async () => {
        expect(await redis.get("ip:allowlist")).toBe(JSON.stringify(["127.0.0.0/8"]));
        const blocked = await enterpriseApp.app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
          payload: { username: "ipallowlistuser", password: "TestPass1" },
        });
        expect(blocked.statusCode).toBe(403);
      });

      const logErrorSpy = vi.spyOn(enterpriseApp.app.log, "error");
      try {
        // 1. Fault the DB read during a pub/sub refresh while the DB row is still valid
        const selectSpy = vi.spyOn(activeDb, "select").mockImplementationOnce(() => {
          throw new Error("simulated database failure");
        });
        try {
          await publishAllowlistRefresh();
          await vi.waitFor(() => {
            expect(selectSpy).toHaveBeenCalled();
            expect(logErrorSpy).toHaveBeenCalledTimes(1);
          });
        } finally {
          selectSpy.mockRestore();
        }

        expect(await redis.get("ip:allowlist")).toBe(JSON.stringify(["127.0.0.0/8"]));
        const blockedAfterDbFault = await enterpriseApp.app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
          payload: { username: "ipallowlistuser", password: "TestPass1" },
        });
        expect(blockedAfterDbFault.statusCode).toBe(403);

        // 2. Corrupt the stored JSON row and publish a refresh event
        await activeDb
          .update(activeSchema.settings)
          .set({ value: "{corrupt-json" })
          .where(eq(activeSchema.settings.key, "ipAllowlist"));
        await publishAllowlistRefresh();
        await vi.waitFor(() => {
          expect(logErrorSpy).toHaveBeenCalledTimes(2);
        });

        expect(await redis.get("ip:allowlist")).toBe(JSON.stringify(["127.0.0.0/8"]));
        const blockedAfterCorrupt = await enterpriseApp.app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
          payload: { username: "ipallowlistuser", password: "TestPass1" },
        });
        expect(blockedAfterCorrupt.statusCode).toBe(403);
      } finally {
        logErrorSpy.mockRestore();
      }
    } finally {
      await enterpriseApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/ip-allowlist",
        headers: { authorization: `Bearer ${entAdminToken}` },
        payload: { cidrs: [] },
      });
    }
  });

  it("GET logs a warning and returns empty cidrs when ipAllowlist row is corrupt or non-array JSON (#3038)", async () => {
    const { db: activeDb, schema: activeSchema } = await import(
      "../../../apps/api/src/db/index.js"
    );
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const warnSpy = vi.spyOn(logger, "warn");

    try {
      await activeDb
        .insert(activeSchema.settings)
        .values({ key: "ipAllowlist", value: "{corrupt" })
        .onConflictDoUpdate({
          target: activeSchema.settings.key,
          set: { value: "{corrupt", updatedAt: new Date() },
        });

      const corruptRes = await enterpriseApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/ip-allowlist",
        headers: { authorization: `Bearer ${entAdminToken}` },
      });
      expect(corruptRes.statusCode).toBe(200);
      expect(JSON.parse(corruptRes.body)).toEqual({ cidrs: [] });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(SyntaxError), key: "ipAllowlist" }),
        "ip-allowlist: failed to parse stored ipAllowlist JSON",
      );

      for (const nonArray of ["{}", "null", "42", "[null]", "[42]", '["not-a-cidr"]']) {
        warnSpy.mockClear();
        await activeDb
          .update(activeSchema.settings)
          .set({ value: nonArray, updatedAt: new Date() })
          .where(eq(activeSchema.settings.key, "ipAllowlist"));

        const nonArrRes = await enterpriseApp.app.inject({
          method: "GET",
          url: "/api/v1/enterprise/ip-allowlist",
          headers: { authorization: `Bearer ${entAdminToken}` },
        });
        expect(nonArrRes.statusCode, nonArray).toBe(200);
        expect(JSON.parse(nonArrRes.body), nonArray).toEqual({ cidrs: [] });
        expect(warnSpy, nonArray).toHaveBeenCalledWith(
          { key: "ipAllowlist" },
          "ip-allowlist: stored ipAllowlist is not a JSON array of valid CIDR strings",
        );
      }
    } finally {
      warnSpy.mockRestore();
      await enterpriseApp.app.inject({
        method: "PUT",
        url: "/api/v1/enterprise/ip-allowlist",
        headers: { authorization: `Bearer ${entAdminToken}` },
        payload: { cidrs: [] },
      });
    }
  });
});
