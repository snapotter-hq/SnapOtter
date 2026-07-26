import { expect, test } from "./helpers";

const REQUIRED_WIDTHS = [320, 768, 1024, 1536, 2560] as const;

test.describe("Required viewport width coverage", () => {
  for (const width of REQUIRED_WIDTHS) {
    test(`${width}px viewport has no horizontal overflow`, async ({ loggedInPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.locator("[data-search-input]")).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));

      expect(dimensions.viewport).toBe(width);
      expect(dimensions.document).toBeLessThanOrEqual(width);
      expect(dimensions.body).toBeLessThanOrEqual(width);
    });
  }
});
