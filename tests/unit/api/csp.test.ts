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

  describe("font-src is self-hosted only", () => {
    it.each([true, false])("does not include the Scalar fonts origin (isDocs=%s)", (isDocs) => {
      const sources = parseDirective(buildCsp(isDocs), "font-src");
      expect(sources).not.toContain("https://fonts.scalar.com");
    });

    it.each([true, false])("keeps self and data: (isDocs=%s)", (isDocs) => {
      const sources = parseDirective(buildCsp(isDocs), "font-src");
      expect(sources).toContain("'self'");
      expect(sources).toContain("data:");
    });
  });

  it("includes frame-ancestors none for app pages but not docs", () => {
    expect(buildCsp(false)).toContain("frame-ancestors 'none'");
    expect(buildCsp(true)).not.toContain("frame-ancestors");
  });

  it.each([true, false])("does not allow OpenStreetMap tiles in img-src (isDocs=%s)", (isDocs) => {
    const sources = parseDirective(buildCsp(isDocs), "img-src");
    expect(sources).not.toContain("https://tile.openstreetmap.org");
  });

  it.each([
    true,
    false,
  ])("connect-src allows data: URIs for client-side blob operations (isDocs=%s)", (isDocs) => {
    const sources = parseDirective(buildCsp(isDocs), "connect-src");
    expect(sources).toContain("data:");
  });
});
