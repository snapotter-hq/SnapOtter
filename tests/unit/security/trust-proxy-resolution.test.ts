import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { DEFAULT_TRUST_PROXY, parseTrustProxy } from "../../../apps/api/src/lib/trust-proxy.js";

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

/**
 * Behavioural tests: does a forged X-Forwarded-For actually move request.ip?
 *
 * The parser tests above only prove the string is passed through. What matters
 * for SEC-20260726-002 is what Fastify then does with it, so these boot a real
 * Fastify instance configured exactly the way apps/api/src/index.ts configures
 * the server and ask it what request.ip resolved to.
 *
 * `remoteAddress` is the socket peer, i.e. who is actually connecting. The
 * X-Forwarded-For value is what that peer claims the client was.
 */

/** Resolve request.ip for a given trustProxy setting, peer, and forged header. */
async function resolveIp(
  trustProxy: boolean | number | string,
  remoteAddress: string,
  forwardedFor?: string,
): Promise<string> {
  const app = Fastify({ trustProxy });
  app.get("/whoami", async (request) => ({ ip: request.ip }));
  try {
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      remoteAddress,
      headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    });
    return JSON.parse(res.body).ip as string;
  } finally {
    await app.close();
  }
}

const PUBLIC_PEER = "203.0.113.9"; // TEST-NET-3, i.e. not a private range
const FORGED = "198.51.100.77"; // TEST-NET-2, what an attacker would claim

describe("request.ip resolution under the shipped TRUST_PROXY default", () => {
  it("ignores a forged X-Forwarded-For from an untrusted public peer", async () => {
    // The whole point of the finding: a directly exposed instance must not let
    // a client pick its own rate-limit bucket.
    const ip = await resolveIp(parseTrustProxy(DEFAULT_TRUST_PROXY), PUBLIC_PEER, FORGED);
    expect(ip).toBe(PUBLIC_PEER);
    expect(ip).not.toBe(FORGED);
  });

  it("still believes a reverse proxy on a private network", async () => {
    // A proxy on a Docker network or a LAN holds an RFC1918 address. Preserving
    // this case is why the default is a trust list rather than `false`.
    const ip = await resolveIp(parseTrustProxy(DEFAULT_TRUST_PROXY), "172.18.0.1", FORGED);
    expect(ip).toBe(FORGED);
  });

  it("still believes a reverse proxy on loopback", async () => {
    const ip = await resolveIp(parseTrustProxy(DEFAULT_TRUST_PROXY), "127.0.0.1", FORGED);
    expect(ip).toBe(FORGED);
  });

  it("falls back to the peer address when a trusted proxy sends no header", async () => {
    const ip = await resolveIp(parseTrustProxy(DEFAULT_TRUST_PROXY), "10.1.2.3");
    expect(ip).toBe("10.1.2.3");
  });

  it("takes the rightmost untrusted hop when a chain is forged behind a real proxy", async () => {
    // A trusted proxy appends the peer it saw. An attacker prepends whatever it
    // likes. proxy-addr walks right to left and stops at the first untrusted
    // entry, so the attacker's prefix is discarded rather than believed.
    const ip = await resolveIp(
      parseTrustProxy(DEFAULT_TRUST_PROXY),
      "172.18.0.1",
      `${FORGED}, ${PUBLIC_PEER}`,
    );
    expect(ip).toBe(PUBLIC_PEER);
    expect(ip).not.toBe(FORGED);
  });
});

describe("the old default is what made request.ip client-controlled", () => {
  it("TRUST_PROXY=true believes a forged header from any peer", async () => {
    // Pins the mechanism the fix removes. If this ever stops being true the
    // finding's reproduction no longer describes reality and the tests above
    // would be proving nothing.
    const ip = await resolveIp(parseTrustProxy("true"), PUBLIC_PEER, FORGED);
    expect(ip).toBe(FORGED);
  });

  it("TRUST_PROXY=false ignores every proxy, private ones included", async () => {
    // The rejected alternative: closes the hole, but collapses a proxied
    // deployment into one rate-limit bucket keyed on the proxy.
    const ip = await resolveIp(parseTrustProxy("false"), "172.18.0.1", FORGED);
    expect(ip).toBe("172.18.0.1");
  });
});
