import { describe, expect, it } from "vitest";
import { ALTERNATIVES } from "../../../apps/landing/src/data/alternatives.js";

const addedCompetitors = [
  "tinywow",
  "adobe-acrobat-online",
  "freeconvert",
  "convertio",
  "online-convert",
];

describe("landing alternatives data", () => {
  it("includes the expanded hosted-tool competitors", () => {
    const slugs = ALTERNATIVES.map((alternative) => alternative.slug);

    expect(slugs).toEqual(expect.arrayContaining(addedCompetitors));
  });

  it("keeps every comparison reviewable with dates and sources", () => {
    for (const alternative of ALTERNATIVES) {
      expect(alternative.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(alternative.sources.length).toBeGreaterThanOrEqual(1);
      expect(alternative.sources.every((source) => source.url.startsWith("https://"))).toBe(true);
    }
  });

  it("frames TinyWow as a broad hosted toolbox, not a narrow single-tool product", () => {
    const tinywow = ALTERNATIVES.find((alternative) => alternative.slug === "tinywow");

    expect(tinywow?.category).toBe("Hosted online toolbox");
    expect(tinywow?.intro).toContain("broad hosted toolbox");
    expect(tinywow?.rows.some((row) => row.competitor.includes("PDF, image, video"))).toBe(true);
  });

  it("avoids brittle absolute negatives for hosted competitors", () => {
    const hostedAlternatives = ALTERNATIVES.filter(
      (alternative) => !alternative.competitorOpenSource,
    );

    for (const alternative of hostedAlternatives) {
      const competitorCells = alternative.rows.map((row) => row.competitor);

      expect(competitorCells).not.toContain("No");
      expect(competitorCells).not.toContain("PDF only");
      expect(competitorCells).not.toContain("Conversion only");
      expect(competitorCells).not.toContain("Image compression only");
      expect(competitorCells).not.toContain("API on paid plans");
      expect(competitorCells).not.toContain("Capped by plan");
    }
  });

  describe("open-source peer pages (#5029)", () => {
    const peers: Record<string, string> = {
      bentopdf: "github.com/alam00000/bentopdf",
      vert: "github.com/VERT-sh/VERT",
      "it-tools": "github.com/CorentinTh/it-tools",
      squoosh: "github.com/GoogleChromeLabs/squoosh",
      gotenberg: "github.com/gotenberg/gotenberg",
    };
    const bySlug = new Map(ALTERNATIVES.map((a) => [a.slug, a]));
    const textOf = (a: (typeof ALTERNATIVES)[number]) =>
      [
        a.pageTitle,
        a.h1,
        a.metaDescription,
        a.intro,
        a.breadth,
        ...a.rows.flatMap((r) => [r.feature, r.snapotter, r.competitor]),
        ...a.faqs.flatMap((f) => [f.q, f.a]),
      ].join("\n");

    it("has a dated, sourced page for each peer, citing the peer's own repository", () => {
      for (const [slug, repo] of Object.entries(peers)) {
        const alt = bySlug.get(slug);
        expect(alt, slug).toBeDefined();
        expect(alt?.competitorOpenSource, slug).toBe(true);
        expect(alt?.lastReviewed, slug).toMatch(/^2026-11-\d{2}$/);
        expect(
          alt?.sources.some((s) => s.url.includes(repo)),
          slug,
        ).toBe(true);
      }
    });

    it("admits SnapOtter's gaps on every peer page", () => {
      for (const slug of Object.keys(peers)) {
        const text = textOf(bySlug.get(slug) as (typeof ALTERNATIVES)[number]);
        expect(text, slug).toMatch(/several GB/);
        expect(text, slug).toMatch(/PostHog/);
        expect(text, slug).toMatch(/server you host/);
        expect(
          bySlug.get(slug)?.rows.some((r) => !r.snapotterWins),
          slug,
        ).toBe(true);
      }
    });

    it("never claims no tracking, fully local, or an exact tool count", () => {
      for (const alt of ALTERNATIVES.filter((a) => a.slug in peers || a.slug === "stirling-pdf")) {
        const text = textOf(alt);
        expect(text, alt.slug).not.toMatch(/no tracking|fully local|100% (private|local)/i);
        const counts = [...text.matchAll(/(\d+)\+? tools/g)].map((m) => m[0]);
        for (const count of counts.filter((c) => c.startsWith("2"))) {
          expect(count, alt.slug).toBe("200+ tools");
        }
      }
    });
  });

  it("tells Stirling-PDF readers about its built-in MCP server", () => {
    const stirling = ALTERNATIVES.find((a) => a.slug === "stirling-pdf");
    expect(stirling?.rows.some((r) => r.competitor.includes("/mcp"))).toBe(true);
    expect(stirling?.sources.some((s) => s.url === "https://docs.stirlingpdf.com/MCP/")).toBe(true);
    expect(stirling?.lastReviewed).toMatch(/^2026-11-\d{2}$/);
  });
});
