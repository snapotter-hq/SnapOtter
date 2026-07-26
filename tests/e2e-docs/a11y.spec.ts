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

      const results = await new AxeBuilder({ page })
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
