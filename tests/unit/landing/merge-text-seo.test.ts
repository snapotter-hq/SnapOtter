import { describe, expect, it } from "vitest";
import { TOOL_SEO } from "../../../apps/landing/src/data/tool-seo.js";

describe("merge-text landing SEO copy (#5048)", () => {
  const seo = TOOL_SEO["merge-text"];

  it("has its own entry instead of falling back to the catalog description", () => {
    expect(seo).toBeDefined();
    expect(seo.searchTitle.length).toBeGreaterThan(0);
    expect(seo.longDescription.length).toBeGreaterThan(seo.searchTitle.length);
    expect(seo.useCases.length).toBeGreaterThan(2);
    expect(seo.features.length).toBeGreaterThan(2);
    expect(seo.faqs.length).toBeGreaterThan(2);
  });

  it("points CSV table merges at merge-csvs and says .eml is unsupported", () => {
    const copy = [seo.longDescription, ...seo.faqs.map((f) => f.a)].join(" ");
    expect(copy).toMatch(/Merge CSVs/);
    expect(copy).toMatch(/\.eml/);
  });

  it("keeps dashes out of the visible copy", () => {
    const strings = [
      seo.searchTitle,
      seo.longDescription,
      ...seo.useCases,
      ...seo.features,
      ...seo.faqs.flatMap((f) => [f.q, f.a]),
    ];
    for (const s of strings) expect(s).not.toMatch(/—|–| -- /);
  });
});
