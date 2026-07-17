// tests/e2e-landing/en-only-links.spec.ts
import { expect, test } from "@playwright/test";

// Regression guard (QA sweep): tool-detail pages (/tools/<section>/<tool>/) and the
// /self-hosted pages are built ONLY in English (no per-locale route). Localized pages
// must therefore link to their UN-PREFIXED English URLs; a locale-prefixed link 404s in
// the static build. We assert on the emitted href attributes (identical in dev and the
// static build) so this catches the regression even though the webServer runs `astro dev`.
const LOCALES = ["de", "ja"];

async function collectHrefs(page: import("@playwright/test").Page): Promise<string[]> {
  const anchors = await page.$$("a[href]");
  const hrefs: string[] = [];
  for (const a of anchors) hrefs.push((await a.getAttribute("href")) ?? "");
  return hrefs;
}

for (const loc of LOCALES) {
  test(`${loc}: English-only tool-detail & self-hosted links are not locale-prefixed`, async ({
    page,
  }) => {
    const res = await page.goto(`/${loc}/`);
    expect(res?.status()).toBeLessThan(400);

    const hrefs = await collectHrefs(page);

    // Tool-detail = /<loc>/tools/<section>/<tool>/ (two path segments after /tools/).
    // The /<loc>/tools/ index and /<loc>/tools/<section>/ pages ARE localized and stay prefixed.
    const toolDetailRe = new RegExp(`^/${loc}/tools/[^/]+/[^/]+/?$`);
    const badToolDetail = hrefs.filter((h) => toolDetailRe.test(h));
    expect(
      badToolDetail,
      `localized tool-detail links on /${loc}/ (must be un-prefixed /tools/...): ${badToolDetail.slice(0, 3).join(", ")}`,
    ).toEqual([]);

    // /self-hosted pages are English-only.
    const badSelfHosted = hrefs.filter((h) => h.startsWith(`/${loc}/self-hosted`));
    expect(
      badSelfHosted,
      `localized self-hosted links on /${loc}/: ${badSelfHosted.join(", ")}`,
    ).toEqual([]);

    // Sanity: the un-prefixed English tool-detail links are actually present (fix didn't drop them).
    const enToolDetail = hrefs.filter((h) => /^\/tools\/[^/]+\/[^/]+\/?$/.test(h));
    expect(enToolDetail.length).toBeGreaterThan(0);
  });
}
