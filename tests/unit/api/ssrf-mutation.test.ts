/**
 * Mutation-killing coverage for the SSRF module. These tests target the
 * survivors Stryker leaves after the behavioural specs (ssrf.test.ts,
 * ssrf-https.test.ts, ssrf-response.test.ts): the IPv4/IPv6 range-boundary
 * comparisons in the private-IP classifier, the scheme/protocol branches, the
 * IP-pinning agent construction, and the HTTP/HTTPS request plumbing.
 *
 * The technique throughout: for every reserved CIDR boundary, assert the IP one
 * step inside is BLOCKED and the IP one step outside is ALLOWED, so a flipped
 * `<=`/`>=`/`===`/`&&` comparator changes an observable boolean. Where a value
 * is threaded through the request path, capture it and assert the exact value a
 * mutation would perturb.
 */
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import https from "node:https";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { isPrivateIp, safeFetch } from "../../../apps/api/src/lib/ssrf.js";

// ---------------------------------------------------------------------------
// isPrivateIp: IPv4 range boundaries (kills the octet-comparison mutants on
// lines 11-20). Each pair pins the exact edge: `inside` must be private,
// `outside` (one address beyond the boundary) must be public. A boundary
// operator flipped from `>=` to `>` (or `<=` to `<`, or a constant nudged by
// one) reclassifies exactly one of the two, so at least one assertion fails.
// ---------------------------------------------------------------------------
describe("isPrivateIp IPv4 boundaries", () => {
  const blocked: Array<[string, string]> = [
    // 10.0.0.0/8 (line 11): a === 10
    ["10.0.0.0", "lowest of 10/8"],
    ["10.255.255.255", "highest of 10/8"],
    // 172.16.0.0/12 (line 12): a === 172 && b in [16,31]
    ["172.16.0.0", "low edge of 172.16/12"],
    ["172.31.255.255", "high edge of 172.16/12"],
    ["172.16.5.9", "mid 172.16/12"],
    ["172.31.0.1", "b === 31 upper bound"],
    // 192.168.0.0/16 (line 13): a === 192 && b === 168
    ["192.168.0.0", "low of 192.168/16"],
    ["192.168.255.255", "high of 192.168/16"],
    // 127.0.0.0/8 (line 14): a === 127
    ["127.0.0.0", "low of 127/8"],
    ["127.255.255.255", "high of 127/8"],
    // 169.254.0.0/16 (line 15): a === 169 && b === 254
    ["169.254.0.0", "low of 169.254/16"],
    ["169.254.255.255", "high of 169.254/16"],
    // 0.0.0.0/8 (line 16): a === 0
    ["0.0.0.0", "this-network 0/8"],
    ["0.255.255.255", "high of 0/8"],
    // 100.64.0.0/10 (line 17): a === 100 && b in [64,127]
    ["100.64.0.0", "low edge of CG-NAT"],
    ["100.127.255.255", "high edge of CG-NAT"],
    ["100.64.0.1", "b === 64 lower bound"],
    ["100.127.0.0", "b === 127 upper bound"],
    // 192.0.0.0/24 (line 18): a === 192 && b === 0 && parts[2] === 0
    ["192.0.0.0", "low of 192.0.0/24"],
    ["192.0.0.255", "high of 192.0.0/24"],
    // 198.18.0.0/15 (line 19): a === 198 && (b === 18 || b === 19)
    ["198.18.0.0", "low of benchmarking /15"],
    ["198.18.255.255", "b === 18 span"],
    ["198.19.0.0", "b === 19 low"],
    ["198.19.255.255", "high of benchmarking /15"],
    // 240.0.0.0/4 (line 20): a >= 240
    ["240.0.0.0", "low of class E"],
    ["255.255.255.255", "broadcast / top of class E"],
  ];

  it.each(blocked)("blocks %s (%s)", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  const allowed: Array<[string, string]> = [
    // Just below / above each boundary -> must be PUBLIC. These are the
    // "outside" halves that a shifted comparator would wrongly capture.
    ["9.255.255.255", "one below 10/8"],
    ["11.0.0.0", "one above 10/8"],
    ["172.15.255.255", "one below 172.16/12 (kills b >= 16 -> b >= 15)"],
    ["172.32.0.0", "one above 172.16/12 (kills b <= 31 -> b <= 32)"],
    ["192.167.255.255", "one below 192.168/16"],
    ["192.169.0.0", "one above 192.168/16"],
    ["126.255.255.255", "one below 127/8"],
    ["128.0.0.0", "one above 127/8"],
    ["169.253.255.255", "one below 169.254/16"],
    ["169.255.0.0", "one above 169.254/16 (kills b === 254 -> b === 255)"],
    ["1.0.0.0", "one above 0/8"],
    ["100.63.255.255", "one below CG-NAT (kills b >= 64 -> b >= 63)"],
    ["100.128.0.0", "one above CG-NAT (kills b <= 127 -> b <= 128)"],
    ["192.0.1.0", "one above 192.0.0/24 (kills parts[2] === 0 -> !== 0)"],
    ["192.1.0.0", "adjacent /8 to 192.0.0/24 (kills b === 0 relaxation)"],
    ["198.17.255.255", "one below benchmarking /15"],
    ["198.20.0.0", "one above benchmarking /15 (kills b === 19 boundary)"],
    ["239.255.255.255", "one below class E (kills a >= 240 -> a >= 239)"],
    // Well-known public resolvers as positive controls.
    ["8.8.8.8", "public DNS"],
    ["93.184.216.34", "example.com"],
    ["1.1.1.1", "public DNS"],
  ];

  it.each(allowed)("allows %s (%s)", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  // The 198.18/15 rule (line 19) uses an OR of two exact octets. Prove each arm
  // is load-bearing: 198.17 and 198.20 are the immediate non-matches, and
  // nothing between 18 and 19 is skipped.
  it("treats 198.18/15 as exactly b===18 or b===19", () => {
    expect(isPrivateIp("198.17.0.0")).toBe(false);
    expect(isPrivateIp("198.18.0.0")).toBe(true);
    expect(isPrivateIp("198.19.0.0")).toBe(true);
    expect(isPrivateIp("198.20.0.0")).toBe(false);
  });

  // 192.0.0/24 (line 18) needs all three octet conditions. Break each one:
  // wrong first octet, wrong second, wrong third -> public.
  it("requires all three octets for 192.0.0/24", () => {
    expect(isPrivateIp("192.0.0.7")).toBe(true); // inside
    expect(isPrivateIp("191.0.0.7")).toBe(false); // a !== 192
    expect(isPrivateIp("192.1.0.7")).toBe(false); // b !== 0
    expect(isPrivateIp("192.0.1.7")).toBe(false); // parts[2] !== 0
  });
});

// ---------------------------------------------------------------------------
// isPrivateIp: IPv6 classifier. Covers the IPv4-mapped / IPv4-compatible
// embedding (lines 62-67, esp. the 0xff byte checks on line 63) and each
// blocked CIDR (lines 29-41 / 69). A mapped private v4 must stay blocked; a
// mapped public v4 must be allowed (proves the embedded classifier actually
// runs rather than a blanket block).
// ---------------------------------------------------------------------------
describe("isPrivateIp IPv6 classifier", () => {
  it("blocks IPv4-mapped IPv6 wrapping a private v4 (line 63 isMapped)", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true); // loopback
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true); // RFC1918
    expect(isPrivateIp("::ffff:169.254.169.254")).toBe(true); // metadata
    expect(isPrivateIp("::ffff:a9fe:a9fe")).toBe(true); // same, hex form
  });

  it("allows IPv4-mapped IPv6 wrapping a public v4 (proves embedded check runs)", () => {
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateIp("::ffff:9.255.255.255")).toBe(false); // just below 10/8
    expect(isPrivateIp("::ffff:11.0.0.0")).toBe(false); // just above 10/8
  });

  it("blocks IPv4-compatible IPv6 wrapping a private v4 (line 64 isCompatible)", () => {
    expect(isPrivateIp("::127.0.0.1")).toBe(true);
    expect(isPrivateIp("::169.254.169.254")).toBe(true);
    // ::0.0.0.1 embeds 0.0.0.1, which is inside 0.0.0.0/8.
    expect(isPrivateIp("::0.0.0.1")).toBe(true);
  });

  const blockedCidrs: Array<[string, string]> = [
    ["::1", "loopback ::1/128"],
    ["::", "unspecified ::/128"],
    ["fe80::1", "link-local fe80::/10 low"],
    ["febf::1", "link-local fe80::/10 high"],
    ["fc00::1", "unique-local fc00::/7 low"],
    ["fdff::1", "unique-local fc00::/7 high"],
    ["fec0::1", "site-local fec0::/10"],
    ["2001:db8::1", "documentation 2001:db8::/32"],
    ["2001::1", "Teredo 2001::/32"],
    ["2002::1", "6to4 2002::/16"],
    ["64:ff9b::1", "NAT64 64:ff9b::/96"],
    ["100::1", "discard 100::/64"],
    ["100::ffff", "discard 100::/64 (distinct from CG-NAT 100.64/10)"],
    ["ff02::1", "multicast ff00::/8"],
  ];
  it.each(blockedCidrs)("blocks %s (%s)", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  const publicV6: Array<[string, string]> = [
    ["2606:4700::1", "Cloudflare public"],
    ["2001:4860:4860::8888", "Google public DNS"],
    ["2620:fe::fe", "Quad9 public DNS"],
    // fe00::1 sits one prefix below link-local fe80::/10 and outside fc00::/7,
    // so it is genuinely public: proves the CIDR match doesn't over-block.
    ["fe00::1", "just below link-local, outside unique-local"],
  ];
  it.each(publicV6)("allows %s (%s)", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  // Unparseable input fails closed (line 52 -> return true). A mutation that
  // flips that default to `return false` would let garbage through.
  it("fails closed on unparseable addresses", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
    expect(isPrivateIp("gg::zz")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// safeFetch HTTP path: exercises the `parsed.protocol === "http:"` branch
// (line 237) and the IPv6 bracket rewrite (line 240) through the global fetch
// stub. DNS is mocked so a bare hostname resolves to a chosen public IP and we
// can assert the request URL carries the pinned IP, not the hostname.
// ---------------------------------------------------------------------------
const dnsOriginal = vi.hoisted(() => ({ fn: null as null | ((...args: unknown[]) => unknown) }));
vi.mock("node:dns/promises", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  dnsOriginal.fn = orig.lookup as (...args: unknown[]) => unknown;
  return { ...orig, lookup: vi.fn((...args: unknown[]) => dnsOriginal.fn?.(...args)) };
});

describe("safeFetch HTTP IP pinning (lines 237, 240)", () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function okResponse(): Response {
    return {
      status: 200,
      headers: new Headers(),
      body: null,
    } as unknown as Response;
  }

  it("replaces the hostname with the resolved IPv4 for HTTP requests", async () => {
    const dns = await import("node:dns/promises");
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never);
    mockFetch.mockResolvedValueOnce(okResponse());

    await safeFetch("http://public-host.example/photo.jpg");

    // Line 237 true-branch: the fetched URL swaps in the IP; the hostname is
    // gone. If the branch were skipped, this URL would still say the hostname.
    const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(calledUrl).toBe("http://93.184.216.34/photo.jpg");
    expect(calledUrl).not.toContain("public-host.example");
  });

  it("wraps a resolved IPv6 address in brackets for HTTP requests (line 240)", async () => {
    const dns = await import("node:dns/promises");
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: "2606:4700::1", family: 6 }] as never);
    mockFetch.mockResolvedValueOnce(okResponse());

    await safeFetch("http://v6-host.example/img.png");

    // The ternary must bracket IPv6 (kills the `[${ip}]` -> `${ip}` mutant: an
    // unbracketed IPv6 assignment to URL.hostname is rejected and the hostname
    // would stay "v6-host.example").
    const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(calledUrl).toBe("http://[2606:4700::1]/img.png");
    expect(calledUrl).not.toContain("v6-host.example");
  });

  it("sends the SSRF User-Agent and original Host header on the HTTP path", async () => {
    const dns = await import("node:dns/promises");
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never);
    mockFetch.mockResolvedValueOnce(okResponse());

    await safeFetch("http://public-host.example/x");

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("SnapOtter/2.0 (file-fetch)");
    // Host header keeps the original hostname even though the URL uses the IP.
    expect(headers.Host).toBe("public-host.example");
    expect(init.redirect).toBe("manual");
    expect(init.method).toBe("GET");
  });
});

// ---------------------------------------------------------------------------
// safeFetch HTTPS path + createPinnedAgent. node:https.request is mocked so no
// socket opens; we keep the real https.Agent so createPinnedAgent builds a
// genuine agent. Targets: the `protocol === "https:"` agent branch (line 163),
// the AbortSignal normalization branch (line 171), the statusMessage `?? ""`
// fallback (line 306), and the toFetchResponse-throws catch (line 310).
// ---------------------------------------------------------------------------
interface CapturedHttps {
  url: unknown;
  options: {
    agent?: unknown;
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  };
}
const capturedHttps: CapturedHttps[] = [];
type HttpsScript = (msg: EventEmitter & Partial<IncomingMessage>) => void;
let httpsScripts: HttpsScript[] = [];

const mockHttpsRequest: Mock = vi.hoisted(() =>
  vi.fn((url: unknown, options: CapturedHttps["options"], callback: (msg: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & {
      write: Mock;
      end: Mock;
      destroy: Mock;
    };
    req.write = vi.fn(() => true);
    req.end = vi.fn(() => req);
    req.destroy = vi.fn((err?: Error) => {
      if (err) setImmediate(() => req.emit("error", err));
      return req;
    });
    capturedHttps.push({ url, options });
    const script = httpsScripts.shift();
    setImmediate(() => {
      const msg = new EventEmitter() as EventEmitter & Partial<IncomingMessage>;
      msg.statusCode = 200;
      msg.statusMessage = "OK";
      msg.headers = {};
      callback(msg);
      script?.(msg);
    });
    return req;
  }),
);

vi.mock("node:https", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  const actualDefault = (actual.default ?? {}) as Record<string, unknown>;
  return {
    ...actual,
    default: { ...actualDefault, request: mockHttpsRequest },
    request: mockHttpsRequest,
  };
});

const PUBLIC_HTTPS = "https://93.184.216.34/image.jpg";

describe("safeFetch HTTPS agent + plumbing (lines 163, 171, 306, 310)", () => {
  beforeEach(() => {
    capturedHttps.length = 0;
    httpsScripts = [];
    mockHttpsRequest.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds an https.Agent (not a plain http.Agent) for HTTPS (line 163)", async () => {
    httpsScripts = [
      (msg) => {
        msg.emit("end");
      },
    ];

    await safeFetch(PUBLIC_HTTPS);

    // The https: branch must construct an https.Agent. A mutation returning the
    // http.Agent fallback fails this instanceof (https.Agent extends http.Agent,
    // so the check is specific to the subclass).
    expect(capturedHttps[0].options.agent).toBeInstanceOf(https.Agent);
  });

  it("threads a positional AbortSignal through to the request (line 171)", async () => {
    httpsScripts = [
      (msg) => {
        msg.emit("end");
      },
    ];
    const controller = new AbortController();

    await safeFetch(PUBLIC_HTTPS, controller.signal);

    // normalizeSafeFetchOptions must detect the AbortSignal and wrap it as
    // { signal }. If that branch is skipped, options.signal is undefined here.
    expect(capturedHttps[0].options.signal).toBe(controller.signal);
  });

  it("does not treat a plain options object as a signal", async () => {
    httpsScripts = [
      (msg) => {
        msg.emit("end");
      },
    ];

    // A SafeFetchOptions object lacks `aborted`/`addEventListener`, so line 171
    // must fall through to `return options` and NOT set signal from the object.
    await safeFetch(PUBLIC_HTTPS, { method: "POST", body: "x" });

    expect(capturedHttps[0].options.method).toBe("POST");
    expect(capturedHttps[0].options.signal).toBeUndefined();
  });

  it("falls back to an empty statusText when statusMessage is absent (line 306)", async () => {
    httpsScripts = [
      (msg) => {
        // Server sends a 200 with no reason phrase at all.
        msg.statusCode = 200;
        msg.statusMessage = undefined;
        msg.headers = {};
        msg.emit("end");
      },
    ];

    const res = await safeFetch(PUBLIC_HTTPS);

    // `statusMessage ?? ""` must yield "". A mutation of the "" literal to any
    // non-empty string would surface here as a non-empty statusText.
    expect(res.status).toBe(200);
    expect(res.statusText).toBe("");
  });

  it("rejects when toFetchResponse throws while building the Response (line 310)", async () => {
    httpsScripts = [
      (msg) => {
        // A reason phrase containing a newline is an invalid HTTP statusText;
        // the Response constructor inside toFetchResponse throws TypeError,
        // which the try/catch must translate into a promise rejection.
        msg.statusCode = 200;
        msg.statusMessage = "bad\nreason";
        msg.headers = {};
        msg.emit("end");
      },
    ];

    // The catch on line 310 (reject(err)) is the only way this surfaces; without
    // it the rejection never happens and the await would hang / resolve wrongly.
    await expect(safeFetch(PUBLIC_HTTPS)).rejects.toThrow(/statusText/i);
  });

  it("preserves a normal statusText on the HTTPS path", async () => {
    httpsScripts = [
      (msg) => {
        msg.statusCode = 201;
        msg.statusMessage = "Created";
        msg.headers = {};
        msg.emit("end");
      },
    ];

    const res = await safeFetch(PUBLIC_HTTPS);

    expect(res.status).toBe(201);
    expect(res.statusText).toBe("Created");
  });
});
