import { describe, expect, it } from "vitest";
import { buildCsp, getSecurityHeaders } from "../../../apps/api/src/lib/csp.js";

// Mutation-focused coverage for csp.ts. The sibling csp.test.ts asserts
// per-directive membership; these tests pin the EXACT header strings and the
// getSecurityHeaders map so string-literal, array-order, and array-removal
// mutants inside buildCsp (L20 connect-src) and getSecurityHeaders (L33-L40)
// have no equivalent survivors.

const CONNECT_SRC =
  "'self' blob: data: https://us.i.posthog.com https://us-assets.i.posthog.com https://*.ingest.us.sentry.io";

const APP_CSP =
  "default-src 'self'; " +
  "script-src 'self' https://us-assets.i.posthog.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' blob: data:; " +
  "media-src 'self' blob:; " +
  `connect-src ${CONNECT_SRC}; ` +
  "font-src 'self' data:; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";

const DOCS_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' blob: data:; " +
  "media-src 'self' blob:; " +
  `connect-src ${CONNECT_SRC}; ` +
  "font-src 'self' data:; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";

describe("buildCsp exact header strings", () => {
  it("returns the exact app policy for isDocs=false", () => {
    expect(buildCsp(false)).toBe(APP_CSP);
  });

  it("returns the exact docs policy for isDocs=true", () => {
    expect(buildCsp(true)).toBe(DOCS_CSP);
  });

  // Pins the L20 connect-src list: exact string kills any reorder, drop, or
  // literal mutation of the POSTHOG/SENTRY origins or the blob:/data: entries.
  it("builds the identical connect-src directive in both modes", () => {
    expect(buildCsp(false)).toContain(`connect-src ${CONNECT_SRC};`);
    expect(buildCsp(true)).toContain(`connect-src ${CONNECT_SRC};`);
  });

  // Pins the L22-L24 script-src ternary: the two branches must differ by exactly
  // the 'unsafe-inline' token, so flipping the isDocs condition changes output.
  it("docs script-src differs from app script-src by only 'unsafe-inline'", () => {
    expect(buildCsp(true)).toContain(
      "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com;",
    );
    expect(buildCsp(false)).toContain("script-src 'self' https://us-assets.i.posthog.com;");
    expect(buildCsp(false)).not.toBe(buildCsp(true));
  });

  // The L26 isDocs branch adds frame-ancestors only on the app policy.
  it("emits frame-ancestors 'none' for the app policy but omits it for docs", () => {
    expect(buildCsp(false)).toContain("frame-ancestors 'none';");
    expect(buildCsp(true)).not.toContain("frame-ancestors");
  });
});

describe("getSecurityHeaders exact map", () => {
  it("returns every header with its exact value", () => {
    expect(getSecurityHeaders()).toEqual({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "0",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": APP_CSP,
    });
  });

  // Pins the buildCsp(false) argument on L41: the header must carry the app
  // policy (with frame-ancestors), never the docs policy.
  it("wires the Content-Security-Policy header to the app buildCsp(false) output", () => {
    const headers = getSecurityHeaders();
    expect(headers["Content-Security-Policy"]).toBe(buildCsp(false));
    expect(headers["Content-Security-Policy"]).not.toBe(buildCsp(true));
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("exposes exactly the seven expected header keys", () => {
    expect(Object.keys(getSecurityHeaders()).sort()).toEqual(
      [
        "Content-Security-Policy",
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "X-XSS-Protection",
      ].sort(),
    );
  });
});
