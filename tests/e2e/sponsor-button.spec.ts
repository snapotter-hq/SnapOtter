import { expect, test } from "./helpers";

const SPONSOR_URL = "https://github.com/sponsors/snapotter-hq";

test.describe("Sponsor button", () => {
  // Pin a desktop viewport so the full pill (with visible text) renders,
  // not the mobile icon-only form.
  test.use({ viewport: { width: 1280, height: 720 } });

  test("top nav links to GitHub Sponsors with safe rel", async ({ page }) => {
    await page.goto("/");

    const link = page.locator(`a[href="${SPONSOR_URL}"]`);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toContainText(/keep it free/i);
  });
});
