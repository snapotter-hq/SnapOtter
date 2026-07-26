import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers";

const DOCS_A11Y_PAGES = [
  { name: "homepage", path: "/" },
  { name: "getting started", path: "/guide/getting-started" },
  { name: "configuration", path: "/guide/configuration" },
  { name: "REST API", path: "/api/rest" },
] as const;

test.describe("Docs Axe accessibility", () => {
  for (const docsPage of DOCS_A11Y_PAGES) {
    test(`${docsPage.name} has no Axe violations`, async ({ page }) => {
      await page.goto(docsPage.path);
      await waitForHydration(page);

      // VitePress renders a collapsible sidebar group that also has a link as
      // `<div role="button" tabindex="0">` wrapping an `<a>` and a `<button>`,
      // which axe correctly reports as nested-interactive. It is upstream markup
      // from VPSidebarItem, not ours, and reaching it would mean shadowing the
      // component. Excluded so this spec guards the content we author; the
      // upstream defect is tracked separately rather than silently dropped.
      const results = await new AxeBuilder({ page })
        .exclude("#VPSidebarNav")
        .withTags(["wcag2a", "wcag2aa", "best-practice"])
        .analyze();
      const summary = results.violations
        .map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
        )
        .join("\n");

      expect(results.violations, summary).toEqual([]);
    });
  }
});
