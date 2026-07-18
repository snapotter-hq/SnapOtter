import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Color-contrast smoke for the landing site (issue #557). The landing shares
 * the Otter palette with the app but had no axe coverage, so AA regressions
 * shipped unnoticed. Scans the pages that exercise every palette role:
 * hero + CTA gradient + category cards (/), tool grid chips (/tools),
 * dark sections and comparison table (/enterprise), prose links (/faq),
 * and the SEO card grids (/self-hosted).
 */

const PAGES = ["/", "/tools", "/enterprise", "/faq", "/self-hosted"];

for (const path of PAGES) {
  test(`landing ${path} has no color-contrast violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
    const contrast = results.violations.filter((v) => v.id === "color-contrast");
    const offenders = contrast.flatMap((v) =>
      v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary?.split("\n")[1] ?? ""}`),
    );
    expect(offenders, `color-contrast violations on ${path}`).toEqual([]);
  });
}
