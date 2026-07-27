import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { waitForRevealsSettled } from "./helpers.js";

/**
 * Color-contrast smoke for the landing site (issue #557). The landing shares
 * the Otter palette with the app but had no axe coverage, so AA regressions
 * shipped unnoticed. Scans the pages that exercise every palette role:
 * hero + CTA gradient + category cards (/), tool grid chips (/tools),
 * dark sections and comparison table (/enterprise), prose links (/faq),
 * and the SEO card grids (/self-hosted).
 */

// Every page family, not every page. The five original entries all sit at the top
// of their trees, so the two families with their own palette work (the category
// badge on a tool-detail page, the risk callout on a self-hosted spoke) were the
// only ones with AA failures and the only ones nobody was scanning.
const PAGES = [
  "/",
  "/tools",
  "/enterprise",
  "/faq",
  "/self-hosted",
  "/tools/image/resize/",
  "/tools/pdf/merge-pdf/",
  "/self-hosted/pdf-ocr/",
  "/alternatives/convertio/",
];

for (const path of PAGES) {
  test(`landing ${path} has no color-contrast violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await waitForRevealsSettled(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
    const contrast = results.violations.filter((v) => v.id === "color-contrast");
    const offenders = contrast.flatMap((v) =>
      v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary?.split("\n")[1] ?? ""}`),
    );
    expect(offenders, `color-contrast violations on ${path}`).toEqual([]);
  });
}

/**
 * Contrast was the only rule under watch, so a critical ARIA defect on the hero
 * search sat on every localized home page unnoticed. This covers the rest of
 * WCAG A/AA plus heading order, across the same page families.
 */
const WCAG_PAGES = ["/", "/ar/", "/tools/image/resize/", "/self-hosted/pdf-ocr/", "/tools/"];

for (const path of WCAG_PAGES) {
  test(`landing ${path} has no WCAG A/AA or heading-order violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await waitForRevealsSettled(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .withRules(["heading-order"])
      .analyze();
    const offenders = results.violations.map(
      (v) => `${v.id} [${v.impact}] ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
    expect(offenders, `axe violations on ${path}`).toEqual([]);
  });
}
