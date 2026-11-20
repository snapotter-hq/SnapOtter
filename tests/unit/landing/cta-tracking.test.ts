import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CTA_EVENT,
  type CtaTarget,
  ctaEventProperties,
  trackCtaClick,
} from "../../../apps/landing/src/lib/cta-tracking.js";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8");

function target(attrs: Record<string, string>): CtaTarget {
  const dataset: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("data-")) {
      const camel = key.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      dataset[camel] = value;
    }
  }
  return { dataset, getAttribute: (name) => attrs[name] ?? null };
}

/** A click target whose closest("[data-cta]") is `match`. */
function clickOn(match: CtaTarget | null) {
  return { closest: (selector: string) => (selector === "[data-cta]" ? match : null) };
}

describe("ctaEventProperties", () => {
  it("reads the CTA, its location, detail and href", () => {
    const el = target({
      "data-cta": "category-card",
      "data-cta-location": "hero",
      "data-cta-detail": "pdf",
      href: "/tools/pdf/",
    });
    expect(ctaEventProperties(el, "en")).toEqual({
      cta: "category-card",
      location: "hero",
      detail: "pdf",
      href: "/tools/pdf/",
      locale: "en",
    });
  });

  it("leaves out what the element doesn't carry", () => {
    const el = target({ "data-cta": "docker-copy", "data-cta-location": "hero" });
    expect(ctaEventProperties(el, "fr")).toEqual({
      cta: "docker-copy",
      location: "hero",
      locale: "fr",
    });
  });
});

describe("trackCtaClick", () => {
  it("sends one named event for a click inside a tagged element", () => {
    const calls: unknown[][] = [];
    const posthog = { capture: (...args: unknown[]) => calls.push(args) };
    const el = target({ "data-cta": "install", "data-cta-location": "nav", href: "https://x" });

    trackCtaClick(clickOn(el), posthog, "de");

    expect(calls).toEqual([
      [CTA_EVENT, { cta: "install", location: "nav", href: "https://x", locale: "de" }],
    ]);
  });

  it("ignores clicks outside any tagged element", () => {
    const calls: unknown[][] = [];
    trackCtaClick(clickOn(null), { capture: (...a: unknown[]) => calls.push(a) }, "en");
    expect(calls).toEqual([]);
  });

  it("does nothing when PostHog isn't loaded (forks and PR previews ship no key)", () => {
    const el = target({ "data-cta": "install", "data-cta-location": "nav" });
    expect(() => trackCtaClick(clickOn(el), undefined, "en")).not.toThrow();
    expect(() => trackCtaClick(clickOn(el), {}, "en")).not.toThrow();
  });

  it("ignores a click whose target can't be walked (a text node, the document)", () => {
    const calls: unknown[][] = [];
    trackCtaClick({}, { capture: (...a: unknown[]) => calls.push(a) }, "en");
    trackCtaClick(null, { capture: (...a: unknown[]) => calls.push(a) }, "en");
    expect(calls).toEqual([]);
  });
});

/**
 * Each CTA the issue (#5010) asks for, pinned as text so a markup refactor that
 * drops a data-cta attribute fails here instead of going dark in PostHog.
 */
describe("landing CTA markup", () => {
  const cases: Array<[file: string, cta: string, location: string]> = [
    ["apps/landing/src/components/HeroQuickstart.astro", "docker-copy", "hero"],
    ["apps/landing/src/components/HeroQuickstart.astro", "live-demo", "hero"],
    ["apps/landing/src/components/Navbar.astro", "install", "nav"],
    ["apps/landing/src/components/Navbar.astro", "install", "nav-mobile"],
    ["apps/landing/src/components/StickyMobileCta.astro", "install", "sticky-mobile"],
    ["apps/landing/src/components/StickyMobileCta.astro", "live-demo", "sticky-mobile"],
    ["apps/landing/src/components/Pricing.astro", "install", "pricing"],
    ["apps/landing/src/components/CategoryCards.astro", "category-card", "hero"],
    ["apps/landing/src/pages/[...locale]/alternatives/[slug].astro", "live-demo", "alternatives"],
  ];

  it.each(cases)("%s tags %s at %s", (file, cta, location) => {
    const source = read(file);
    const tag = new RegExp(`data-cta="${cta}"\\s+data-cta-location="${location}"`);
    expect(source).toMatch(tag);
  });

  it("QuickstartBlock tags its Docker command, not the curl example", () => {
    const source = read("apps/landing/src/components/QuickstartBlock.astro");
    expect(source).toContain('cta: "docker-copy"');
    expect(source).toContain("data-cta={b.cta}");
  });

  it("every page loads the listener through the shared layout", () => {
    const layout = read("apps/landing/src/layouts/Base.astro");
    expect(layout).toMatch(/import \{ installCtaTracking \} from "\.\.\/lib\/cta-tracking"/);
  });
});
