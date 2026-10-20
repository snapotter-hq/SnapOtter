import type { BlockList } from "node:net";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  buildBlockList,
  EXEMPT_PATHS,
  isExemptPath,
  isIpAllowed,
  isValidCidr,
} from "../../../apps/api/src/plugins/ip-allowlist.js";

/** Helper that asserts buildBlockList returned a non-null value. */
function mustBuild(cidrs: string[]): BlockList {
  const bl = buildBlockList(cidrs);
  if (!bl) throw new Error("Expected non-null BlockList");
  return bl;
}

describe("IP allowlist", () => {
  // ── buildBlockList ───────────────────────────────────────────────
  describe("buildBlockList", () => {
    it("returns null for an empty array", () => {
      expect(buildBlockList([])).toBeNull();
    });

    it("builds a list from IPv4 CIDRs", () => {
      const bl = buildBlockList(["10.0.0.0/8", "192.168.1.0/24"]);
      expect(bl).not.toBeNull();
    });

    it("builds a list from bare IPv4 addresses", () => {
      const bl = buildBlockList(["1.2.3.4"]);
      expect(bl).not.toBeNull();
    });

    it("builds a list from IPv6 CIDRs", () => {
      const bl = buildBlockList(["2001:db8::/32"]);
      expect(bl).not.toBeNull();
    });

    it("skips invalid entries without throwing", () => {
      const bl = buildBlockList(["not-a-cidr", "10.0.0.0/8"]);
      expect(bl).not.toBeNull();
    });
  });

  // ── isIpAllowed ──────────────────────────────────────────────────
  describe("isIpAllowed", () => {
    it("allows an IP inside a CIDR range", () => {
      const bl = mustBuild(["10.0.0.0/8"]);
      expect(isIpAllowed("10.1.2.3", bl)).toBe(true);
    });

    it("denies an IP outside all ranges", () => {
      const bl = mustBuild(["10.0.0.0/8"]);
      expect(isIpAllowed("192.168.1.1", bl)).toBe(false);
    });

    it("allows an exact single-address match", () => {
      const bl = mustBuild(["1.2.3.4"]);
      expect(isIpAllowed("1.2.3.4", bl)).toBe(true);
      expect(isIpAllowed("1.2.3.5", bl)).toBe(false);
    });

    it("allows an IPv6 address inside a subnet", () => {
      const bl = mustBuild(["2001:db8::/32"]);
      expect(isIpAllowed("2001:db8::1", bl)).toBe(true);
      expect(isIpAllowed("2001:db9::1", bl)).toBe(false);
    });

    it("handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)", () => {
      const bl = mustBuild(["10.0.0.0/8"]);
      expect(isIpAllowed("::ffff:10.1.2.3", bl)).toBe(true);
      expect(isIpAllowed("::ffff:192.168.1.1", bl)).toBe(false);
    });

    it("handles multiple CIDR ranges", () => {
      const bl = mustBuild(["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]);
      expect(isIpAllowed("10.0.0.1", bl)).toBe(true);
      expect(isIpAllowed("172.20.1.1", bl)).toBe(true);
      expect(isIpAllowed("192.168.99.1", bl)).toBe(true);
      expect(isIpAllowed("8.8.8.8", bl)).toBe(false);
    });

    it("allows /32 single-host CIDR", () => {
      const bl = mustBuild(["1.2.3.4/32"]);
      expect(isIpAllowed("1.2.3.4", bl)).toBe(true);
      expect(isIpAllowed("1.2.3.5", bl)).toBe(false);
    });

    it("allows /0 to match everything", () => {
      const bl = mustBuild(["0.0.0.0/0"]);
      expect(isIpAllowed("1.2.3.4", bl)).toBe(true);
      expect(isIpAllowed("255.255.255.255", bl)).toBe(true);
    });

    it("allows 127.0.0.1 when loopback is listed", () => {
      const bl = mustBuild(["127.0.0.0/8"]);
      expect(isIpAllowed("127.0.0.1", bl)).toBe(true);
    });
  });

  // ── isValidCidr ──────────────────────────────────────────────────
  describe("isValidCidr", () => {
    it("accepts valid IPv4 CIDR", () => {
      expect(isValidCidr("10.0.0.0/8")).toBe(true);
      expect(isValidCidr("192.168.1.0/24")).toBe(true);
      expect(isValidCidr("0.0.0.0/0")).toBe(true);
    });

    it("accepts valid bare IPv4 address", () => {
      expect(isValidCidr("1.2.3.4")).toBe(true);
    });

    it("accepts valid IPv6 CIDR", () => {
      expect(isValidCidr("2001:db8::/32")).toBe(true);
      expect(isValidCidr("::1/128")).toBe(true);
    });

    it("accepts valid bare IPv6 address", () => {
      expect(isValidCidr("::1")).toBe(true);
    });

    it("rejects invalid strings", () => {
      expect(isValidCidr("not-an-ip")).toBe(false);
      expect(isValidCidr("")).toBe(false);
    });

    it("rejects IPv4 prefix > 32", () => {
      expect(isValidCidr("10.0.0.0/33")).toBe(false);
    });

    it("rejects IPv6 prefix > 128", () => {
      expect(isValidCidr("::1/129")).toBe(false);
    });

    it("rejects negative prefix", () => {
      expect(isValidCidr("10.0.0.0/-1")).toBe(false);
    });
  });

  // ── isExemptPath ─────────────────────────────────────────────────
  describe("isExemptPath", () => {
    it("exempts health endpoint", () => {
      expect(isExemptPath("/api/v1/health")).toBe(true);
    });

    it("exempts readyz endpoint", () => {
      expect(isExemptPath("/api/v1/readyz")).toBe(true);
    });

    it("exempts metrics endpoint", () => {
      expect(isExemptPath("/api/v1/metrics")).toBe(true);
    });

    it("exempts SCIM paths", () => {
      expect(isExemptPath("/api/v1/scim/Users")).toBe(true);
      expect(isExemptPath("/api/v1/scim/Groups")).toBe(true);
    });

    it("exempts SAML callback", () => {
      expect(isExemptPath("/api/auth/saml/callback")).toBe(true);
    });

    it("exempts OIDC callback", () => {
      expect(isExemptPath("/api/auth/oidc/callback")).toBe(true);
    });

    it("does NOT exempt regular API paths", () => {
      expect(isExemptPath("/api/v1/tools/image/crop")).toBe(false);
      expect(isExemptPath("/api/v1/settings")).toBe(false);
      expect(isExemptPath("/api/auth/login")).toBe(false);
    });

    it("does NOT exempt the root path", () => {
      expect(isExemptPath("/")).toBe(false);
    });
  });

  // ── EXEMPT_PATHS constant ────────────────────────────────────────
  describe("EXEMPT_PATHS", () => {
    it("includes all expected infrastructure paths", () => {
      expect(EXEMPT_PATHS).toContain("/api/v1/health");
      expect(EXEMPT_PATHS).toContain("/api/v1/readyz");
      expect(EXEMPT_PATHS).toContain("/api/v1/metrics");
    });

    it("includes IdP callback paths", () => {
      expect(EXEMPT_PATHS).toContain("/api/auth/saml/callback");
      expect(EXEMPT_PATHS).toContain("/api/auth/oidc/callback");
      expect(EXEMPT_PATHS).toContain("/api/v1/scim/");
    });
  });

  describe("registerIpAllowlist onRequest hook", () => {
    it("replies 403 with code IP_NOT_ALLOWED when the caller IP is outside the allowlist (#2052)", async () => {
      vi.resetModules();
      vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
        isEnterpriseFeatureEnabled: async () => true,
      }));
      vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
        getSettingStrict: async () => JSON.stringify(["10.0.0.0/8"]),
        getSettingString: async () => JSON.stringify(["10.0.0.0/8"]),
      }));
      vi.doMock("../../../apps/api/src/jobs/connection.js", () => ({
        sharedRedis: () => ({
          set: async () => "OK",
          duplicate: () => ({
            subscribe: async () => 1,
            on: () => {},
            unsubscribe: async () => {},
            quit: async () => {},
          }),
        }),
      }));

      const { registerIpAllowlist: registerIsolated } = await import(
        "../../../apps/api/src/plugins/ip-allowlist.js"
      );
      const app = Fastify();
      try {
        await registerIsolated(app);
        app.post("/api/auth/login", async () => ({ ok: true }));

        const blocked = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(blocked.statusCode).toBe(403);
        expect(blocked.json()).toEqual({
          error: "IP address not allowed",
          code: "IP_NOT_ALLOWED",
        });

        const allowed = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "10.1.2.3",
        });
        expect(allowed.statusCode).toBe(200);
      } finally {
        await app.close();
        vi.doUnmock("../../../apps/api/src/lib/enterprise-feature.js");
        vi.doUnmock("../../../apps/api/src/lib/settings-helpers.js");
        vi.doUnmock("../../../apps/api/src/jobs/connection.js");
      }
    });

    it("preserves the active allowlist and Redis cache when a pub/sub refresh hits a DB error or corrupt JSON (#2541)", async () => {
      vi.resetModules();
      const getSettingStrictMock = vi
        .fn<() => Promise<string | undefined>>()
        .mockResolvedValueOnce(JSON.stringify(["10.0.0.0/8"]));
      const redisSetMock = vi.fn(async () => "OK");
      let messageHandler: (() => void) | undefined;

      vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
        isEnterpriseFeatureEnabled: async () => true,
      }));
      vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
        getSettingStrict: getSettingStrictMock,
        getSettingString: async (_key: string, defaultValue = "") => {
          try {
            return (await getSettingStrictMock()) ?? defaultValue;
          } catch {
            return defaultValue;
          }
        },
      }));
      vi.doMock("../../../apps/api/src/jobs/connection.js", () => ({
        sharedRedis: () => ({
          get: async () => null,
          set: redisSetMock,
          duplicate: () => ({
            subscribe: async () => 1,
            on: (event: string, cb: () => void) => {
              if (event === "message") messageHandler = cb;
            },
            unsubscribe: async () => {},
            quit: async () => {},
          }),
        }),
      }));

      const { registerIpAllowlist: registerIsolated } = await import(
        "../../../apps/api/src/plugins/ip-allowlist.js"
      );
      const app = Fastify();
      const logErrorSpy = vi.spyOn(app.log, "error");
      try {
        await registerIsolated(app);
        app.post("/api/auth/login", async () => ({ ok: true }));

        expect(redisSetMock).toHaveBeenCalledTimes(1);
        expect(redisSetMock).toHaveBeenLastCalledWith(
          "ip:allowlist",
          JSON.stringify(["10.0.0.0/8"]),
        );

        // 1. Transient DB failure on pub/sub refresh
        getSettingStrictMock.mockRejectedValueOnce(new Error("db connection lost"));
        expect(messageHandler).toBeDefined();
        messageHandler?.();
        await vi.waitFor(() => expect(logErrorSpy).toHaveBeenCalledTimes(1));

        expect(redisSetMock).toHaveBeenCalledTimes(1);
        const blockedAfterDbErr = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(blockedAfterDbErr.statusCode).toBe(403);

        // 2. Malformed JSON on pub/sub refresh
        getSettingStrictMock.mockResolvedValueOnce("{corrupt-json");
        messageHandler?.();
        await vi.waitFor(() => expect(logErrorSpy).toHaveBeenCalledTimes(2));

        expect(redisSetMock).toHaveBeenCalledTimes(1);
        const blockedAfterBadJson = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(blockedAfterBadJson.statusCode).toBe(403);

        // 3. Non-array JSON on pub/sub refresh
        getSettingStrictMock.mockResolvedValueOnce("{}");
        messageHandler?.();
        await vi.waitFor(() => expect(logErrorSpy).toHaveBeenCalledTimes(3));

        expect(redisSetMock).toHaveBeenCalledTimes(1);
        const blockedAfterNonArray = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(blockedAfterNonArray.statusCode).toBe(403);

        // 4. Array with non-string element on pub/sub refresh
        getSettingStrictMock.mockResolvedValueOnce("[123]");
        messageHandler?.();
        await vi.waitFor(() => expect(logErrorSpy).toHaveBeenCalledTimes(4));

        expect(redisSetMock).toHaveBeenCalledTimes(1);
        const blockedAfterNonString = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(blockedAfterNonString.statusCode).toBe(403);

        // 5. Array with invalid CIDR string on pub/sub refresh
        getSettingStrictMock.mockResolvedValueOnce(JSON.stringify(["not-a-cidr"]));
        messageHandler?.();
        await vi.waitFor(() => expect(logErrorSpy).toHaveBeenCalledTimes(5));

        expect(redisSetMock).toHaveBeenCalledTimes(1);
        const blockedAfterInvalidCidr = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(blockedAfterInvalidCidr.statusCode).toBe(403);

        // Allowed IP still passes (was not locked out by invalid CIDR entry)
        const allowed = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "10.1.2.3",
        });
        expect(allowed.statusCode).toBe(200);

        // 6. Genuinely cleared setting ("[]" or undefined) disarms the allowlist
        getSettingStrictMock.mockResolvedValueOnce("[]");
        messageHandler?.();
        await vi.waitFor(() => expect(redisSetMock).toHaveBeenCalledTimes(2));

        expect(redisSetMock).toHaveBeenLastCalledWith("ip:allowlist", "[]");
        const allowedAfterEmptyArray = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(allowedAfterEmptyArray.statusCode).toBe(200);

        // Re-arm and then clear via undefined
        getSettingStrictMock.mockResolvedValueOnce(JSON.stringify(["10.0.0.0/8"]));
        messageHandler?.();
        await vi.waitFor(() => expect(redisSetMock).toHaveBeenCalledTimes(3));

        getSettingStrictMock.mockResolvedValueOnce(undefined);
        messageHandler?.();
        await vi.waitFor(() => expect(redisSetMock).toHaveBeenCalledTimes(4));

        expect(redisSetMock).toHaveBeenLastCalledWith("ip:allowlist", "[]");
        const allowedAfterClear = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(allowedAfterClear.statusCode).toBe(200);
      } finally {
        await app.close();
        vi.doUnmock("../../../apps/api/src/lib/enterprise-feature.js");
        vi.doUnmock("../../../apps/api/src/lib/settings-helpers.js");
        vi.doUnmock("../../../apps/api/src/jobs/connection.js");
      }
    });

    it("falls back to the Redis-cached allowlist when the startup DB read fails (#2541)", async () => {
      vi.resetModules();
      const redisSetMock = vi.fn(async () => "OK");
      const redisGetMock = vi.fn(async () => JSON.stringify(["10.0.0.0/8"]));

      vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
        isEnterpriseFeatureEnabled: async () => true,
      }));
      vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
        getSettingStrict: async () => {
          throw new Error("db unreachable at boot");
        },
        getSettingString: async (_key: string, defaultValue = "") => defaultValue,
      }));
      vi.doMock("../../../apps/api/src/jobs/connection.js", () => ({
        sharedRedis: () => ({
          get: redisGetMock,
          set: redisSetMock,
          duplicate: () => ({
            subscribe: async () => 1,
            on: () => {},
            unsubscribe: async () => {},
            quit: async () => {},
          }),
        }),
      }));

      const { registerIpAllowlist: registerIsolated } = await import(
        "../../../apps/api/src/plugins/ip-allowlist.js"
      );
      const app = Fastify();
      try {
        await registerIsolated(app);
        app.post("/api/auth/login", async () => ({ ok: true }));

        expect(redisGetMock).toHaveBeenCalledWith("ip:allowlist");
        expect(redisSetMock).not.toHaveBeenCalled();

        const blocked = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "203.0.113.5",
        });
        expect(blocked.statusCode).toBe(403);

        const allowed = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "10.1.2.3",
        });
        expect(allowed.statusCode).toBe(200);
      } finally {
        await app.close();
        vi.doUnmock("../../../apps/api/src/lib/enterprise-feature.js");
        vi.doUnmock("../../../apps/api/src/lib/settings-helpers.js");
        vi.doUnmock("../../../apps/api/src/jobs/connection.js");
      }
    });

    it("fails closed when both the startup DB read and Redis cache are unavailable, then recovers on refresh (#2541)", async () => {
      vi.resetModules();
      const getSettingStrictMock = vi
        .fn<() => Promise<string | undefined>>()
        .mockRejectedValueOnce(new Error("db unreachable at boot"));
      const redisSetMock = vi.fn(async () => "OK");
      const redisGetMock = vi.fn(async () => null);
      let messageHandler: (() => void) | undefined;

      vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
        isEnterpriseFeatureEnabled: async () => true,
      }));
      vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
        getSettingStrict: getSettingStrictMock,
        getSettingString: async (_key: string, defaultValue = "") => {
          try {
            return (await getSettingStrictMock()) ?? defaultValue;
          } catch {
            return defaultValue;
          }
        },
      }));
      vi.doMock("../../../apps/api/src/jobs/connection.js", () => ({
        sharedRedis: () => ({
          get: redisGetMock,
          set: redisSetMock,
          duplicate: () => ({
            subscribe: async () => 1,
            on: (event: string, cb: () => void) => {
              if (event === "message") messageHandler = cb;
            },
            unsubscribe: async () => {},
            quit: async () => {},
          }),
        }),
      }));

      const { registerIpAllowlist: registerIsolated } = await import(
        "../../../apps/api/src/plugins/ip-allowlist.js"
      );
      const app = Fastify();
      try {
        await registerIsolated(app);
        app.get("/api/v1/health", async () => ({ status: "ok" }));
        app.post("/api/auth/login", async () => ({ ok: true }));

        expect(redisSetMock).not.toHaveBeenCalled();

        // Exempt health probe still passes
        const health = await app.inject({
          method: "GET",
          url: "/api/v1/health",
          remoteAddress: "203.0.113.5",
        });
        expect(health.statusCode).toBe(200);

        // Non-exempt route fails closed with 403 IP_NOT_ALLOWED
        const blocked = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "10.1.2.3",
        });
        expect(blocked.statusCode).toBe(403);
        expect(blocked.json()).toEqual({
          error: "IP address not allowed",
          code: "IP_NOT_ALLOWED",
        });

        // Recover when a valid refresh arrives (even if redis.set fails once)
        redisSetMock.mockRejectedValueOnce(new Error("redis write error"));
        getSettingStrictMock.mockResolvedValueOnce(JSON.stringify(["10.0.0.0/8"]));
        messageHandler?.();
        await vi.waitFor(() =>
          expect(redisSetMock).toHaveBeenCalledWith("ip:allowlist", JSON.stringify(["10.0.0.0/8"])),
        );

        const allowedAfterRecovery = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: "10.1.2.3",
        });
        expect(allowedAfterRecovery.statusCode).toBe(200);
      } finally {
        await app.close();
        vi.doUnmock("../../../apps/api/src/lib/enterprise-feature.js");
        vi.doUnmock("../../../apps/api/src/lib/settings-helpers.js");
        vi.doUnmock("../../../apps/api/src/jobs/connection.js");
      }
    });

    it("fails closed when the startup DB read fails and Redis throws or holds an empty array (#2541)", async () => {
      for (const redisBehavior of ["throw", "empty-array"] as const) {
        vi.resetModules();
        vi.doMock("../../../apps/api/src/lib/enterprise-feature.js", () => ({
          isEnterpriseFeatureEnabled: async () => true,
        }));
        vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
          getSettingStrict: async () => {
            throw new Error("db unreachable at boot");
          },
          getSettingString: async (_key: string, defaultValue = "") => defaultValue,
        }));
        vi.doMock("../../../apps/api/src/jobs/connection.js", () => ({
          sharedRedis: () => ({
            get: async () => {
              if (redisBehavior === "throw") throw new Error("redis unreachable");
              return "[]";
            },
            set: async () => "OK",
            duplicate: () => ({
              subscribe: async () => {
                if (redisBehavior === "throw") throw new Error("redis subscribe failed");
                return 1;
              },
              on: () => {},
              unsubscribe: async () => {},
              quit: async () => {},
            }),
          }),
        }));

        const { registerIpAllowlist: registerIsolated } = await import(
          "../../../apps/api/src/plugins/ip-allowlist.js"
        );
        const app = Fastify();
        try {
          await registerIsolated(app);
          app.post("/api/auth/login", async () => ({ ok: true }));

          const blocked = await app.inject({
            method: "POST",
            url: "/api/auth/login",
            remoteAddress: "10.1.2.3",
          });
          expect(blocked.statusCode).toBe(403);
        } finally {
          await app.close();
          vi.doUnmock("../../../apps/api/src/lib/enterprise-feature.js");
          vi.doUnmock("../../../apps/api/src/lib/settings-helpers.js");
          vi.doUnmock("../../../apps/api/src/jobs/connection.js");
        }
      }
    });
  });
});
