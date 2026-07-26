// tests/e2e-landing/en-only-links.spec.ts
import { expect, test } from "@playwright/test";
import { SUPPORTED_LOCALES } from "@snapotter/shared";

// Regression guard (QA sweep): tool-detail pages (/tools/<section>/<tool>/) and the
// /self-hosted pages are built ONLY in English (no per-locale route). Localized pages
// must therefore link to their UN-PREFIXED English URLs; a locale-prefixed link 404s in
// the static build.
const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");
// Rendered checks are the expensive ones, so two locales carry them and the rest
// are swept at the markup level. Two locales used to be the whole guard, which is
// how a fan-out across all twenty went unnoticed.
const RENDERED_LOCALES = ["de", "ja"];
const ENTRY_POINTS = ["/", "/tools/", "/tools/image/"];

function badLinks(hrefs: string[], loc: string) {
  // Tool-detail = /<loc>/tools/<section>/<tool>/ (two path segments after /tools/).
  // The /<loc>/tools/ index and /<loc>/tools/<section>/ pages ARE localized and stay prefixed.
  const toolDetailRe = new RegExp(`^/${loc}/tools/[^/]+/[^/]+/?$`);
  return {
    toolDetail: hrefs.filter((h) => toolDetailRe.test(h)),
    selfHosted: hrefs.filter((h) => h.startsWith(`/${loc}/self-hosted`)),
    englishToolDetail: hrefs.filter((h) => /^\/tools\/[^/]+\/[^/]+\/?$/.test(h)),
  };
}

for (const loc of RENDERED_LOCALES) {
  for (const entryPoint of ENTRY_POINTS) {
    test(`${loc}${entryPoint}: rendered English-only links are not locale-prefixed`, async ({
      page,
    }) => {
      const pagePath = `/${loc}${entryPoint}`;
      const res = await page.goto(pagePath);
      expect(res?.status()).toBeLessThan(400);

      const hrefs = await page.$$eval("a[href]", (nodes) =>
        nodes.map((n) => n.getAttribute("href") ?? ""),
      );
      const bad = badLinks(hrefs, loc);

      expect(
        bad.toolDetail,
        `localized tool-detail links on ${pagePath} (must be un-prefixed /tools/...): ${bad.toolDetail.slice(0, 3).join(", ")}`,
      ).toEqual([]);
      expect(
        bad.selfHosted,
        `localized self-hosted links on ${pagePath}: ${bad.selfHosted.join(", ")}`,
      ).toEqual([]);
      // Sanity: the un-prefixed English tool-detail links are actually present (fix didn't drop them).
      expect(bad.englishToolDetail.length).toBeGreaterThan(0);
    });
  }
}

test("every locale's served markup keeps English-only links un-prefixed", async ({ request }) => {
  expect(LOCALES.length).toBe(20);
  const offenders: string[] = [];

  for (const loc of LOCALES) {
    for (const entryPoint of ENTRY_POINTS) {
      const pagePath = `/${loc}${entryPoint}`;
      const res = await request.get(pagePath);
      expect(res.status(), `${pagePath} did not serve`).toBeLessThan(400);
      const html = await res.text();

      const hrefs = [...html.matchAll(/\shref=["']([^"']*)["']/gi)].map((m) => m[1]);
      const bad = badLinks(hrefs, loc);
      for (const href of [...bad.toolDetail, ...bad.selfHosted]) {
        offenders.push(`${pagePath} -> ${href}`);
      }
      expect(
        bad.englishToolDetail.length,
        `${pagePath} lost its English detail links`,
      ).toBeGreaterThan(0);
    }
  }

  expect(
    offenders,
    `locale-prefixed links to English-only pages:\n  ${offenders.slice(0, 10).join("\n  ")}`,
  ).toEqual([]);
});
