import { describe, expect, it } from "vitest";
import { TOOL_SEO } from "../../../apps/landing/src/data/tool-seo.js";

describe("optimize-svg landing SEO copy (#5055)", () => {
  const seo = TOOL_SEO["optimize-svg"];

  it("has its own entry instead of falling back to the catalog description", () => {
    expect(seo).toBeDefined();
    expect(seo.searchTitle.length).toBeGreaterThan(0);
    expect(seo.longDescription.length).toBeGreaterThan(seo.searchTitle.length);
    expect(seo.useCases.length).toBeGreaterThan(2);
    expect(seo.features.length).toBeGreaterThan(2);
    expect(seo.faqs.length).toBeGreaterThan(2);
  });

  it("covers the compress svg search phrase, svgz input and the size cap", () => {
    const copy = [
      seo.searchTitle,
      seo.longDescription,
      ...seo.useCases,
      ...seo.features,
      ...seo.faqs.map((f) => f.a),
    ].join(" ");
    expect(copy).toMatch(/compress svg/i);
    expect(copy).toMatch(/\.svgz/);
    expect(copy).toMatch(/10 MB/);
  });

  it("keeps dashes out of the visible copy", () => {
    const strings = [
      seo.searchTitle,
      seo.longDescription,
      ...seo.useCases,
      ...seo.features,
      ...seo.faqs.flatMap((f) => [f.q, f.a]),
    ];
    for (const s of strings) expect(s).not.toMatch(/\u2014|\u2013| -- /u);
  });
});
