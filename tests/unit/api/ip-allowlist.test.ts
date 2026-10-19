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
  });
});
