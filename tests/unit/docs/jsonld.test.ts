import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildJsonLd, SECTION_CRUMB } from "../../../apps/docs/.vitepress/jsonld.mts";

const HOSTNAME = "https://docs.snapotter.com";
const base = { hostname: HOSTNAME, isLocale: false };

type Schema = Record<string, unknown>;
type Crumb = { position: number; name: string; item: string };

const byType = (out: Schema[], type: string) => out.find((s) => s["@type"] === type);
const crumbs = (out: Schema[]) => (byType(out, "BreadcrumbList")?.itemListElement ?? []) as Crumb[];

describe("buildJsonLd", () => {
  test("emits nothing on noindexed non-English pages", () => {
    // transformHead noindexes the translated trees; structured data on a
    // noindexed page is wasted and self-contradictory.
    const out = buildJsonLd({
      ...base,
      isLocale: true,
      enRel: "guide/architecture",
      title: "Architektur",
    });
    expect(out).toEqual([]);
  });

  test("home page carries WebSite and SoftwareApplication and no breadcrumb", () => {
    const out = buildJsonLd({ ...base, enRel: "", title: "SnapOtter Docs", description: "d" });
    const types = out.map((s) => s["@type"]);
    expect(types).toContain("WebSite");
    expect(types).toContain("SoftwareApplication");
    expect(types).not.toContain("BreadcrumbList");
    expect(byType(out, "SoftwareApplication")?.name).toBe("SnapOtter");
  });

  test("content page emits a BreadcrumbList then a TechArticle", () => {
    const out = buildJsonLd({
      ...base,
      enRel: "guide/architecture",
      title: "Architecture",
      description: "How it fits together",
    });
    expect(out.map((s) => s["@type"])).toEqual(["BreadcrumbList", "TechArticle"]);
    const article = byType(out, "TechArticle");
    expect(article?.headline).toBe("Architecture");
    expect(article?.url).toBe(`${HOSTNAME}/guide/architecture`);
    expect(article?.description).toBe("How it fits together");
    expect(article?.inLanguage).toBe("en");
  });

  test("TechArticle carries a representative image", () => {
    const out = buildJsonLd({ ...base, enRel: "guide/architecture", title: "Architecture" });
    expect(byType(out, "TechArticle")?.image).toBe(`${HOSTNAME}/og-image.png`);
  });

  test("TechArticle names SnapOtter as the Organization author", () => {
    const out = buildJsonLd({ ...base, enRel: "guide/architecture", title: "Architecture" });
    expect(byType(out, "TechArticle")?.author).toEqual({
      "@type": "Organization",
      name: "SnapOtter",
      url: "https://snapotter.com",
    });
  });

  test("breadcrumb trail is Docs > Section > Page with real URLs", () => {
    const out = buildJsonLd({ ...base, enRel: "guide/architecture", title: "Architecture" });
    const items = crumbs(out);
    expect(items.map((i) => i.name)).toEqual(["SnapOtter Docs", "Guide", "Architecture"]);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[0].item).toBe(HOSTNAME);
    expect(items[1].item).toBe(`${HOSTNAME}/guide/getting-started`);
    expect(items[2].item).toBe(`${HOSTNAME}/guide/architecture`);
  });

  test("a tools page resolves its section to the tools entry page", () => {
    const out = buildJsonLd({ ...base, enRel: "tools/video/trim", title: "Trim Video" });
    const items = crumbs(out);
    expect(items.map((i) => i.name)).toEqual(["SnapOtter Docs", "Tools", "Trim Video"]);
    expect(items[1].item).toBe(`${HOSTNAME}/tools/image/resize`);
    expect(items[2].item).toBe(`${HOSTNAME}/tools/video/trim`);
  });

  test("the section entry page itself is not duplicated in the trail", () => {
    const out = buildJsonLd({ ...base, enRel: "guide/getting-started", title: "Getting started" });
    expect(crumbs(out).map((i) => i.name)).toEqual(["SnapOtter Docs", "Getting started"]);
  });

  test("a top-level page with no section gets a two-level breadcrumb", () => {
    const out = buildJsonLd({ ...base, enRel: "changelog", title: "Changelog" });
    expect(crumbs(out).map((i) => i.name)).toEqual(["SnapOtter Docs", "Changelog"]);
  });

  test("TechArticle omits description when the page has none", () => {
    const out = buildJsonLd({ ...base, enRel: "guide/architecture", title: "Architecture" });
    expect(byType(out, "TechArticle")).not.toHaveProperty("description");
  });

  test("every schema declares the schema.org context", () => {
    const out = buildJsonLd({ ...base, enRel: "guide/architecture", title: "Architecture" });
    for (const s of out) {
      expect(s["@context"]).toBe("https://schema.org");
    }
  });

  test("every section-crumb target is a real docs page (guards silent 404s)", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../../apps/docs");
    const targets = Object.values(SECTION_CRUMB);
    expect(targets.length).toBeGreaterThan(0);
    for (const { path } of targets) {
      expect(existsSync(join(root, `${path}.md`)), `${path}.md must exist`).toBe(true);
    }
  });
});
