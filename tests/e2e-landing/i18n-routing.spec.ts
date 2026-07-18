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

  test("localized tools section pages render; tool-detail pages stay English-only", async ({
    page,
  }) => {
    // The tools SECTION pages (/tools/<section>/) are localized and render the
    // translated section title as their heading.
    const section = await page.goto("/de/tools/image/");
    expect(section?.status()).toBeLessThan(400);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Tool DETAIL pages (/tools/<section>/<tool>/) are English-only by design, so
    // a locale-prefixed detail URL has no built page and must not resolve. The
    // canonical English detail page is the one that exists.
    const localizedDetail = await page.goto("/de/tools/image/resize/");
    expect(localizedDetail?.status()).toBe(404);
    const englishDetail = await page.goto("/tools/image/resize/");
    expect(englishDetail?.status()).toBeLessThan(400);
  });
});
