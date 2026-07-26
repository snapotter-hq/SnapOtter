import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "../../../apps/api/src/lib/trust-proxy.js";

/**
 * Contract tests for the TRUST_PROXY parser.
 *
 * `parseTrustProxy` turns the raw env string into the value Fastify's
 * `trustProxy` option accepts. It used to be a private function inside
 * apps/api/src/index.ts, which meant the only way to exercise it was to boot
 * the whole server. It is extracted so the security suite can pin its
 * behaviour directly.
 *
 * See finding SEC-20260726-002.
 */

describe("parseTrustProxy", () => {
  it("maps the boolean literals to booleans", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("maps a numeric string to a hop count", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("3")).toBe(3);
  });

  it("passes a CIDR or named-range list through untouched", () => {
    expect(parseTrustProxy("loopback,linklocal,uniquelocal")).toBe(
      "loopback,linklocal,uniquelocal",
    );
    expect(parseTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
    expect(parseTrustProxy("127.0.0.1,192.168.1.0/24")).toBe("127.0.0.1,192.168.1.0/24");
  });

  it("turns a blank value into zero hops, which trusts nothing", () => {
    // Number("") and Number("   ") are both 0, so a blank TRUST_PROXY falls
    // into the hop-count branch. Zod's .default() only fires on undefined, not
    // on an empty string, so `TRUST_PROXY=` in a Compose file lands here.
    // Pinned rather than "fixed": 0 hops means proxy-addr trusts no peer and
    // request.ip stays the socket address, so the blank case already fails
    // closed. Changing it would be a behaviour change dressed up as tidying.
    expect(parseTrustProxy("")).toBe(0);
    expect(parseTrustProxy("   ")).toBe(0);
  });
});
