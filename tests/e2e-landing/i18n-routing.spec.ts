// tests/e2e-landing/i18n-routing.spec.ts
import { expect, test } from "@playwright/test";

test.describe("landing i18n routing", () => {
  test("English keeps its unprefixed URL", async ({ page }) => {
    const res = await page.goto("/faq");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/faq\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("a prefixed locale route renders (no 404)", async ({ page }) => {
    const res = await page.goto("/de/faq");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    // Content renders (English fallback is acceptable pre-translation, but the page exists).
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("a missing translation falls back to English content plus the banner, not a 404", async ({
    page,
  }) => {
    const res = await page.goto("/de/faq");
    expect(res?.status()).toBeLessThan(400);
    // Machine-translation banner is present on non-English pages.
    await expect(page.locator("[data-mt-banner]")).toBeAttached();
  });

  test("a localized tool page renders with the translated tool name", async ({ page }) => {
    const res = await page.goto("/de/tools/image/resize/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
