import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { MAX_REDIRECTS, safeFetch, validateFetchUrl } from "../../../apps/api/src/lib/ssrf.js";

describe("validateFetchUrl", () => {
  it("allows valid public HTTP URL", async () => {
    const result = await validateFetchUrl("https://images.unsplash.com/photo.jpg");
    expect(result).toHaveProperty("resolvedIp");
    expect(typeof result.resolvedIp).toBe("string");
  });

  it("allows valid public HTTP URL without TLS", async () => {
    const result = await validateFetchUrl("http://example.com/image.png");
    expect(result).toHaveProperty("resolvedIp");
  });

  it("rejects non-HTTP schemes", async () => {
    await expect(validateFetchUrl("ftp://example.com/image.jpg")).rejects.toThrow(
      "Only HTTP and HTTPS",
    );
    await expect(validateFetchUrl("file:///etc/passwd")).rejects.toThrow("Only HTTP and HTTPS");
    await expect(validateFetchUrl("data:image/png;base64,abc")).rejects.toThrow(
      "Only HTTP and HTTPS",
    );
  });

  it("rejects localhost and loopback", async () => {
    await expect(validateFetchUrl("http://127.0.0.1/image.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://localhost/image.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://[::1]/image.jpg")).rejects.toThrow("private");
  });

  it("rejects private network ranges", async () => {
    await expect(validateFetchUrl("http://10.0.0.1/image.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://172.16.0.1/image.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://192.168.1.1/image.jpg")).rejects.toThrow("private");
  });

  it("rejects link-local addresses", async () => {
    await expect(validateFetchUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      "private",
    );
  });

  it("rejects CG-NAT range (100.64.0.0/10)", async () => {
    await expect(validateFetchUrl("http://100.64.0.1/image.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://100.127.255.255/image.jpg")).rejects.toThrow("private");
  });

  it("rejects IETF protocol assignments (192.0.0.0/24)", async () => {
    await expect(validateFetchUrl("http://192.0.0.1/image.jpg")).rejects.toThrow("private");
  });

  it("rejects benchmarking range (198.18.0.0/15)", async () => {
    await expect(validateFetchUrl("http://198.18.0.1/image.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://198.19.255.255/image.jpg")).rejects.toThrow("private");
  });

  it("rejects reserved/class E range (240.0.0.0/4)", async () => {
    await expect(validateFetchUrl("http://240.0.0.1/image.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://255.255.255.255/image.jpg")).rejects.toThrow("private");
  });

  it("rejects hex IPv4-mapped IPv6 loopback (::ffff:7f00:1)", async () => {
    await expect(validateFetchUrl("http://[::ffff:7f00:1]/")).rejects.toThrow("private");
  });

  it("rejects hex IPv4-mapped IPv6 metadata (::ffff:a9fe:a9fe)", async () => {
    await expect(validateFetchUrl("http://[::ffff:a9fe:a9fe]/")).rejects.toThrow("private");
  });

  it("rejects hex IPv4-mapped IPv6 RFC1918 10.x (::ffff:a00:5)", async () => {
    await expect(validateFetchUrl("http://[::ffff:a00:5]/")).rejects.toThrow("private");
  });

  it("rejects hex IPv4-mapped IPv6 RFC1918 192.168.x (::ffff:c0a8:1)", async () => {
    await expect(validateFetchUrl("http://[::ffff:c0a8:1]/")).rejects.toThrow("private");
  });

  it("rejects hex IPv4-mapped IPv6 RFC1918 172.16.x (::ffff:ac10:1)", async () => {
    await expect(validateFetchUrl("http://[::ffff:ac10:1]/")).rejects.toThrow("private");
  });

  it("rejects dotted IPv4-mapped IPv6 that URL parser canonicalizes to hex", async () => {
    await expect(validateFetchUrl("http://[::ffff:127.0.0.1]/")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://[::ffff:169.254.169.254]/")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://[::ffff:10.0.0.5]/")).rejects.toThrow("private");
  });

  it("rejects IPv6 unspecified address", async () => {
    await expect(validateFetchUrl("http://[::]/image.jpg")).rejects.toThrow("private");
  });

  it("rejects IPv6 documentation range (2001:db8::/32)", async () => {
    await expect(validateFetchUrl("http://[2001:db8::1]/image.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://[2001:DB8::1]/image.jpg")).rejects.toThrow("private");
  });

  // IPv4-compatible IPv6 (::a.b.c.d, the deprecated ::/96 embedding) is a
  // distinct form from IPv4-mapped (::ffff:a.b.c.d). The URL parser keeps it
  // in the hex form (::7f00:1), which textual ::ffff: matching never sees.
  it("rejects IPv4-compatible IPv6 loopback (::127.0.0.1 canonicalizes to ::7f00:1)", async () => {
    await expect(validateFetchUrl("http://[::127.0.0.1]/")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://[::7f00:1]/")).rejects.toThrow("private");
  });

  it("rejects IPv4-compatible IPv6 metadata (::169.254.169.254 -> ::a9fe:a9fe)", async () => {
    await expect(validateFetchUrl("http://[::169.254.169.254]/")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://[::a9fe:a9fe]/")).rejects.toThrow("private");
  });

  it("rejects deprecated site-local addresses (fec0::/10)", async () => {
    await expect(validateFetchUrl("http://[fec0::1]/")).rejects.toThrow("private");
  });

  // Link-local is fe80::/10 (fe80 through febf), not just literals starting
  // with "fe80:". Addresses like fea9:: and febf:: are equally link-local.
  it("rejects link-local across the full fe80::/10 range", async () => {
    await expect(validateFetchUrl("http://[fe80::1]/")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://[fea9::1]/")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://[febf::1]/")).rejects.toThrow("private");
  });

  it("allows public IPv6 literals without over-blocking", async () => {
    const direct = await validateFetchUrl("http://[2606:4700::1]/");
    expect(direct.resolvedIp).toBe("2606:4700::1");
    // 8.8.8.8 expressed as an IPv4-mapped IPv6 literal must stay allowed.
    const mapped = await validateFetchUrl("http://[::ffff:808:808]/");
    expect(mapped.resolvedIp).toBeTruthy();
  });

  it("allows a public IP address directly in URL and returns resolved IP", async () => {
    // Exercises the early-return path in resolveAndCheck when hostname is a
    // non-private IP literal (covers the `return` after the isIP check).
    const result = await validateFetchUrl("http://8.8.8.8/image.jpg");
    expect(result).toEqual({ resolvedIp: "8.8.8.8" });
  });

  it("rejects invalid URLs", async () => {
    await expect(validateFetchUrl("not-a-url")).rejects.toThrow();
    await expect(validateFetchUrl("")).rejects.toThrow();
  });
});

/**
 * Tests that require DNS mocking to exercise resolveAndCheck paths that only
 * trigger when the hostname is a non-IP string and lookup returns results.
 */
describe("validateFetchUrl with DNS mocking", () => {
  const originalLookup = vi.hoisted(() => {
    return { fn: null as null | ((...args: unknown[]) => unknown) };
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  vi.mock("node:dns/promises", async (importOriginal) => {
    const orig = (await importOriginal()) as Record<string, unknown>;
    originalLookup.fn = orig.lookup as (...args: unknown[]) => unknown;
    return {
      ...orig,
      lookup: vi.fn((...args: unknown[]) => originalLookup.fn?.(...args)),
    };
  });

  it("rejects hostname that resolves to IPv4-mapped IPv6 with private IPv4", async () => {
    // Covers isPrivateIPv6 lines 28-31 (::ffff: mapped address path)
    const dns = await import("node:dns/promises");
    vi.mocked(dns.lookup).mockResolvedValueOnce([
      { address: "::ffff:127.0.0.1", family: 6 },
    ] as never);
    await expect(validateFetchUrl("http://mapped-v6.example.com/image.jpg")).rejects.toThrow(
      "private",
    );
  });

  it("rejects hostname resolving to IPv4-mapped IPv6 with 10.x private", async () => {
    const dns = await import("node:dns/promises");
    vi.mocked(dns.lookup).mockResolvedValueOnce([
      { address: "::ffff:10.0.0.1", family: 6 },
    ] as never);
    await expect(validateFetchUrl("http://mapped-ten.example.com/image.jpg")).rejects.toThrow(
      "private",
    );
  });

  it("handles DNS lookup returning a single result object", async () => {
    // Covers the Array.isArray fallback branch (wrapping non-array in [])
    const dns = await import("node:dns/promises");
    vi.mocked(dns.lookup).mockResolvedValueOnce({
      address: "203.0.113.1",
      family: 4,
    } as never);
    const result = await validateFetchUrl("http://single-result.example.com/image.jpg");
    expect(result).toEqual({ resolvedIp: "203.0.113.1" });
  });

  it("rejects when DNS returns multiple addresses with one private", async () => {
    const dns = await import("node:dns/promises");
    vi.mocked(dns.lookup).mockResolvedValueOnce([
      { address: "203.0.113.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ] as never);
    await expect(validateFetchUrl("http://dual-addr.example.com/image.jpg")).rejects.toThrow(
      "private",
    );
  });
});

describe("safeFetch", () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  function mockResponse(status: number, headers?: Record<string, string>): Response {
    return {
      status,
      headers: new Headers(headers),
      body: { cancel: vi.fn() },
    } as unknown as Response;
  }

  // HTTP URLs use global fetch (pinned via IP replacement); HTTPS uses node:https
  // with a pinned agent. These tests exercise the HTTP path via the mocked fetch.
  it("returns response for a direct (non-redirect) fetch", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200));
    const res = await safeFetch("http://93.184.216.34/image.jpg");
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect chain within MAX_REDIRECTS", async () => {
    // 3 redirects then a 200
    mockFetch
      .mockResolvedValueOnce(mockResponse(302, { location: "http://93.184.216.34/hop1" }))
      .mockResolvedValueOnce(mockResponse(301, { location: "http://93.184.216.34/hop2" }))
      .mockResolvedValueOnce(mockResponse(307, { location: "http://93.184.216.34/final" }))
      .mockResolvedValueOnce(mockResponse(200));

    const res = await safeFetch("http://93.184.216.34/start");
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("throws when redirect chain exceeds MAX_REDIRECTS", async () => {
    // Return redirects for every call (MAX_REDIRECTS + 1 iterations, all redirects)
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      mockFetch.mockResolvedValueOnce(
        mockResponse(302, { location: `http://93.184.216.34/hop${i + 1}` }),
      );
    }

    await expect(safeFetch("http://93.184.216.34/start")).rejects.toThrow("Too many redirects");
  });

  it("rejects a redirect to a private IP", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(302, { location: "http://127.0.0.1/evil" }));

    await expect(safeFetch("http://93.184.216.34/image.jpg")).rejects.toThrow("private");
  });

  it("throws when redirect has no Location header", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(302));

    await expect(safeFetch("http://93.184.216.34/image.jpg")).rejects.toThrow(
      "Redirect without Location header",
    );
  });
});
