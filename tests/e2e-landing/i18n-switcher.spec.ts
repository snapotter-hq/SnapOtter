// tests/e2e-landing/i18n-switcher.spec.ts
import { expect, test } from "@playwright/test";

test.describe("landing language switcher", () => {
  test("opens and lists native language names", async ({ page }) => {
    await page.goto("/faq");
    await page.locator("[data-switcher-button]").click();
    const menu = page.locator("[data-switcher-menu]");
    await expect(menu).toBeVisible();
    await expect(menu.locator('a[data-locale="de"]')).toHaveText("Deutsch");
    await expect(menu.locator('a[data-locale="ar"]')).toHaveText("العربية");
  });

  test("navigates to the chosen locale and persists it to localStorage", async ({ page }) => {
    await page.goto("/faq");
    await page.locator("[data-switcher-button]").click();
    await page.locator('[data-switcher-menu] a[data-locale="de"]').click();
    await expect(page).toHaveURL(/\/de\/faq\/?$/);
    const stored = await page.evaluate(() => localStorage.getItem("snapotter:locale"));
    expect(stored).toBe("de");
  });

  test("switcher shows the active locale label on a prefixed page", async ({ page }) => {
    await page.goto("/de/faq");
    await expect(page.locator("[data-switcher-button]")).toContainText("Deutsch");
  });
});
