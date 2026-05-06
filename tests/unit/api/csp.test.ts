import { describe, expect, it } from "vitest";
import { buildCsp } from "../../../apps/api/src/lib/csp.js";

function parseDirective(csp: string, directive: string): string[] {
  const match = csp.match(new RegExp(`${directive}\\s+([^;]+)`));
  return match ? match[1].trim().split(/\s+/) : [];
}

describe("buildCsp", () => {
  describe("connect-src allows analytics domains", () => {
    it.each([true, false])("includes PostHog ingest (isDocs=%s)", (isDocs) => {
      const sources = parseDirective(buildCsp(isDocs), "connect-src");
      expect(sources).toContain("https://us.i.posthog.com");
    });

    it.each([true, false])("includes PostHog assets (isDocs=%s)", (isDocs) => {
      const sources = parseDirective(buildCsp(isDocs), "connect-src");
      expect(sources).toContain("https://us-assets.i.posthog.com");
    });

    it.each([true, false])("includes Sentry ingest (isDocs=%s)", (isDocs) => {
      const sources = parseDirective(buildCsp(isDocs), "connect-src");
      expect(sources).toContain("https://*.ingest.us.sentry.io");
    });

    it.each([true, false])("keeps self (isDocs=%s)", (isDocs) => {
      expect(parseDirective(buildCsp(isDocs), "connect-src")).toContain("'self'");
    });
  });

  describe("script-src allows PostHog config loader", () => {
    it.each([true, false])("includes PostHog assets origin (isDocs=%s)", (isDocs) => {
      const sources = parseDirective(buildCsp(isDocs), "script-src");
      expect(sources).toContain("https://us-assets.i.posthog.com");
    });

    it("docs pages allow unsafe-inline for Scalar", () => {
      expect(parseDirective(buildCsp(true), "script-src")).toContain("'unsafe-inline'");
    });

    it("app pages do not allow unsafe-inline", () => {
      expect(parseDirective(buildCsp(false), "script-src")).not.toContain("'unsafe-inline'");
    });
  });

  describe("font-src allows Scalar docs fonts", () => {
    it("docs pages include Scalar fonts origin", () => {
      const sources = parseDirective(buildCsp(true), "font-src");
      expect(sources).toContain("https://fonts.scalar.com");
    });

    it("app pages do not include Scalar fonts origin", () => {
      const sources = parseDirective(buildCsp(false), "font-src");
      expect(sources).not.toContain("https://fonts.scalar.com");
    });
  });

  it("includes frame-ancestors none for app pages but not docs", () => {
    expect(buildCsp(false)).toContain("frame-ancestors 'none'");
    expect(buildCsp(true)).not.toContain("frame-ancestors");
  });

  it("allows OpenStreetMap tiles in img-src for app pages", () => {
    const sources = parseDirective(buildCsp(false), "img-src");
    expect(sources).toContain("https://tile.openstreetmap.org");
  });

  it.each([
    true,
    false,
  ])("connect-src allows data: URIs for client-side blob operations (isDocs=%s)", (isDocs) => {
    const sources = parseDirective(buildCsp(isDocs), "connect-src");
    expect(sources).toContain("data:");
  });
});
