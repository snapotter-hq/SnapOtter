import { describe, expect, it } from "vitest";
import { TOOL_SEO } from "../../../apps/landing/src/data/tool-seo.js";

describe("aspect-ratio-calculator landing SEO copy (#5031)", () => {
  const seo = TOOL_SEO["aspect-ratio-calculator"];

  it("has its own entry instead of falling back to the catalog description", () => {
    expect(seo).toBeDefined();
    expect(seo.searchTitle.length).toBeGreaterThan(0);
    expect(seo.longDescription.length).toBeGreaterThan(seo.searchTitle.length);
    expect(seo.useCases.length).toBeGreaterThan(2);
    expect(seo.features.length).toBeGreaterThan(2);
    expect(seo.faqs.length).toBeGreaterThan(2);
  });

  it("says it never resizes a file and points at the tools that do", () => {
    const copy = seo.faqs.map((f) => f.a).join(" ");
    expect(copy).toMatch(/Resize Image/);
    expect(copy).toMatch(/never touches a file/);
  });

  it("keeps dashes out of the visible copy", () => {
    const strings = [
      seo.searchTitle,
      seo.longDescription,
      ...seo.useCases,
      ...seo.features,
      ...seo.faqs.flatMap((f) => [f.q, f.a]),
    ];
    for (const s of strings) expect(s).not.toMatch(/\u2014|\u2013| -- /);
  });
});
