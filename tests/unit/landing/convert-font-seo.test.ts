import { describe, expect, it } from "vitest";
import { TOOL_SEO } from "../../../apps/landing/src/data/tool-seo.js";

describe("convert-font landing SEO copy (#5054)", () => {
  const seo = TOOL_SEO["convert-font"];

  it("has its own entry instead of falling back to the catalog description", () => {
    expect(seo).toBeDefined();
    expect(seo.searchTitle.length).toBeGreaterThan(0);
    expect(seo.longDescription.length).toBeGreaterThan(seo.searchTitle.length);
    expect(seo.useCases.length).toBeGreaterThan(2);
    expect(seo.features.length).toBeGreaterThan(2);
    expect(seo.faqs.length).toBeGreaterThan(2);
  });

  it("covers WOFF2 for the web, OTF to TTF, and kept embedding permissions", () => {
    const copy = [seo.longDescription, ...seo.features, ...seo.faqs.map((f) => f.a)].join(" ");
    expect(copy).toMatch(/WOFF2/);
    expect(copy).toMatch(/OTF to TTF/);
    expect(copy).toMatch(/fsType/);
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
