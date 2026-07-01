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
});
