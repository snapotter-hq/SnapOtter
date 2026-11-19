// tests/e2e-landing/index-policy.spec.ts
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SUPPORTED_LOCALES, TOOLS, toolSection } from "@snapotter/shared";
import { ALTERNATIVES } from "../../apps/landing/src/data/alternatives";
import { INDEXED_KEEP_PATHS } from "../../apps/landing/src/lib/index-policy";

/**
 * The built site's index policy (#4833): which pages carry a robots noindex, that
 * those pages are missing from the sitemap, and that no indexed page names one as
 * an hreflang alternate. Reads `dist` directly, like emitted-output.spec.ts, since
 * the landing harness builds before it previews.
 */

const DIST = path.resolve(__dirname, "../../apps/landing/dist");
const SITE = "https://snapotter.com";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

interface Page {
  pathname: string;
  noindex: boolean;
  alternates: string[];
}

function readPages(): Page[] {
  return walk(DIST)
    .map((f) => path.relative(DIST, f).split(path.sep).join("/"))
    .filter((f) => f.endsWith("index.html"))
    .map((rel) => {
      const html = fs.readFileSync(path.join(DIST, rel), "utf8");
      return {
        pathname: `/${rel.replace(/index\.html$/, "")}`,
        noindex: /<meta\s+name="robots"\s+content="noindex/i.test(html),
        alternates: [
          ...html.matchAll(
            /<link\b[^>]*\brel="alternate"[^>]*\bhreflang="[^"]+"[^>]*\bhref="([^"]+)"/gi,
          ),
        ].map((m) => new URL(m[1], SITE).pathname),
      };
    });
}

function readSitemap(): { locs: Set<string>; links: string[] } {
  const xml = fs
    .readdirSync(DIST)
    .filter((f) => /^sitemap-\d+\.xml$/.test(f))
    .map((f) => fs.readFileSync(path.join(DIST, f), "utf8"))
    .join("\n");
  const locs = new Set(
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname),
  );
  const links = [...xml.matchAll(/<xhtml:link\b[^>]*\bhref="([^"]+)"/g)].map(
    (m) => new URL(m[1]).pathname,
  );
  return { locs, links };
}

test.describe("landing index policy", () => {
  test("noindexes the localized alternatives copies and the converter tool pages", () => {
    const noindexed = new Set(
      readPages()
        .filter((p) => p.noindex && p.pathname !== "/404/")
        .map((p) => p.pathname),
    );
    const locales = SUPPORTED_LOCALES.map((l) => l.code).filter((c) => c !== "en");

    const expected = new Set<string>();
    for (const code of locales) {
      expected.add(`/${code}/alternatives/`);
      for (const alt of ALTERNATIVES) expected.add(`/${code}/alternatives/${alt.slug}/`);
    }
    for (const tool of TOOLS.filter((t) => t.id.includes("-to-"))) {
      expected.add(`/tools/${toolSection(tool)}/${tool.id}/`);
    }
    for (const keep of INDEXED_KEEP_PATHS) expected.delete(keep);

    expect([...noindexed].sort()).toEqual([...expected].sort());
    expect(noindexed.has("/de/alternatives/removebg/")).toBe(true);
    expect(noindexed.has("/tools/image/jpg-to-png/")).toBe(true);
    expect(noindexed.has("/tools/image/compress-image-to-100kb/")).toBe(true);
  });

  test("keeps the English alternatives and the pages that earned impressions indexed", () => {
    const pages = new Map(readPages().map((p) => [p.pathname, p]));
    const { locs } = readSitemap();
    const mustStay = [
      ...INDEXED_KEEP_PATHS,
      "/alternatives/",
      ...ALTERNATIVES.map((a) => `/alternatives/${a.slug}/`),
      "/tools/image/resize/",
    ];
    for (const p of mustStay) {
      expect(pages.get(p)?.noindex, `${p} must be built and indexable`).toBe(false);
      expect(locs.has(p), `${p} must be in the sitemap`).toBe(true);
    }
  });

  test("the sitemap lists exactly the indexable pages", () => {
    const pages = readPages().filter((p) => p.pathname !== "/404/");
    const { locs } = readSitemap();
    const indexable = pages.filter((p) => !p.noindex).map((p) => p.pathname);
    expect([...locs].sort()).toEqual(indexable.sort());
  });

  test("no hreflang alternate, in a page head or the sitemap, points at a noindexed page", () => {
    const pages = readPages();
    const noindexed = new Set(pages.filter((p) => p.noindex).map((p) => p.pathname));
    const offenders: string[] = [];
    for (const page of pages.filter((p) => !p.noindex)) {
      for (const target of page.alternates) {
        if (noindexed.has(target)) offenders.push(`${page.pathname} -> ${target}`);
      }
    }
    for (const target of readSitemap().links) {
      if (noindexed.has(target)) offenders.push(`sitemap -> ${target}`);
    }
    expect(offenders, offenders.slice(0, 8).join("\n")).toEqual([]);

    const acrobat = pages.find((p) => p.pathname === "/alternatives/adobe-acrobat-online/");
    expect(acrobat?.alternates).toContain("/ru/alternatives/adobe-acrobat-online/");
  });

  test("noindexed pages advertise no hreflang set", () => {
    const offenders = readPages()
      .filter((p) => p.noindex && p.alternates.length > 0)
      .map((p) => p.pathname);
    expect(offenders).toEqual([]);
  });
});
