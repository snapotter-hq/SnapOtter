/**
 * Unit tests for SSRF protection and CSP header generation.
 *
 * Tests validate that:
 * - Private/reserved IPv4 and IPv6 ranges are blocked
 * - New IPv6 ranges (6to4, NAT64) are blocked
 * - Public IPs are allowed
 * - CSP directives are present and correctly configured
 */
import { describe, expect, it } from "vitest";
import { buildCsp } from "../../../apps/api/src/lib/csp.js";
import { validateFetchUrl } from "../../../apps/api/src/lib/ssrf.js";

describe("SSRF: blocks private IPv4 addresses", () => {
  it("blocks 127.0.0.1 (loopback)", async () => {
    await expect(validateFetchUrl("http://127.0.0.1/img.jpg")).rejects.toThrow("private");
  });

  it("blocks 10.x.x.x (class A private)", async () => {
    await expect(validateFetchUrl("http://10.0.0.1/img.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://10.255.255.255/img.jpg")).rejects.toThrow("private");
  });

  it("blocks 172.16.x.x - 172.31.x.x (class B private)", async () => {
    await expect(validateFetchUrl("http://172.16.0.1/img.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://172.31.255.255/img.jpg")).rejects.toThrow("private");
  });

  it("blocks 192.168.x.x (class C private)", async () => {
    await expect(validateFetchUrl("http://192.168.0.1/img.jpg")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://192.168.255.255/img.jpg")).rejects.toThrow("private");
  });

  it("blocks 169.254.x.x (link-local / cloud metadata)", async () => {
    await expect(validateFetchUrl("http://169.254.169.254/latest/")).rejects.toThrow("private");
    await expect(validateFetchUrl("http://169.254.0.1/img.jpg")).rejects.toThrow("private");
  });
});

describe("SSRF: blocks IPv6 loopback", () => {
  it("blocks ::1 (IPv6 loopback)", async () => {
    await expect(validateFetchUrl("http://[::1]/img.jpg")).rejects.toThrow("private");
  });

  it("blocks :: (IPv6 unspecified)", async () => {
    await expect(validateFetchUrl("http://[::]/img.jpg")).rejects.toThrow("private");
  });
});

describe("SSRF: blocks 6to4 addresses (2002::)", () => {
  it("blocks 2002::1", async () => {
    await expect(validateFetchUrl("http://[2002::1]/img.jpg")).rejects.toThrow("private");
  });

  it("blocks 2002:c0a8::1 (encapsulated 192.168.x.x)", async () => {
    await expect(validateFetchUrl("http://[2002:c0a8::1]/img.jpg")).rejects.toThrow("private");
  });
});

describe("SSRF: blocks NAT64 addresses (64:ff9b::)", () => {
  it("blocks 64:ff9b::1", async () => {
    await expect(validateFetchUrl("http://[64:ff9b::1]/img.jpg")).rejects.toThrow("private");
  });

  it("blocks 64:ff9b::c0a8:0101 (NAT64 mapping of 192.168.1.1)", async () => {
    await expect(validateFetchUrl("http://[64:ff9b::c0a8:0101]/img.jpg")).rejects.toThrow(
      "private",
    );
  });
});

describe("SSRF: allows public IPs", () => {
  it("allows 8.8.8.8 (Google DNS)", async () => {
    const result = await validateFetchUrl("http://8.8.8.8/img.jpg");
    expect(result).toEqual({ resolvedIp: "8.8.8.8" });
  });

  it("allows 1.1.1.1 (Cloudflare DNS)", async () => {
    const result = await validateFetchUrl("http://1.1.1.1/img.jpg");
    expect(result).toEqual({ resolvedIp: "1.1.1.1" });
  });

  it("allows 93.184.216.34 (example.com)", async () => {
    const result = await validateFetchUrl("http://93.184.216.34/img.jpg");
    expect(result).toEqual({ resolvedIp: "93.184.216.34" });
  });
});

describe("CSP: expected directives present", () => {
  it("includes default-src, script-src, style-src, and object-src in non-docs CSP", () => {
    const csp = buildCsp(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src");
    expect(csp).toContain("style-src");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("includes img-src with blob: and data: in non-docs CSP", () => {
    const csp = buildCsp(false);
    expect(csp).toContain("img-src 'self' blob: data:");
  });

  it("includes connect-src with analytics origins", () => {
    const csp = buildCsp(false);
    expect(csp).toContain("connect-src");
    expect(csp).toContain("posthog.com");
    expect(csp).toContain("sentry.io");
  });
});

describe("CSP: script-src does NOT include unsafe-inline for non-docs", () => {
  it("non-docs CSP script-src omits unsafe-inline", () => {
    const csp = buildCsp(false);
    // Extract the script-src directive
    const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
    expect(scriptSrcMatch).not.toBeNull();
    const scriptSrc = scriptSrcMatch?.[1];
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("docs CSP script-src includes unsafe-inline (required by Scalar)", () => {
    const csp = buildCsp(true);
    const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
    expect(scriptSrcMatch).not.toBeNull();
    const scriptSrc = scriptSrcMatch?.[1];
    expect(scriptSrc).toContain("unsafe-inline");
  });
});
