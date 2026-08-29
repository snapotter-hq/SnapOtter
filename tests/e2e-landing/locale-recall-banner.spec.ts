// tests/e2e-landing/locale-recall-banner.spec.ts
// The locale-recall script (Base.astro) silently rewrites English URLs to the
// stored locale. These specs pin the escape hatch: a revert banner that only
// appears right after that redirect, offers "View in English", and never shows
// on a direct localized visit.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// Seed the preference exactly once, the way the switcher would. An init
// script would re-seed on every navigation and mask the revert flow.
async function storeLocale(page: Page, locale: string) {
  await page.goto(`/${locale}/`);
  await page.evaluate((code) => localStorage.setItem("snapotter:locale", code), locale);
}

// Anchored to the origin: /\/$/ alone also matches /es/ and would pass
// against the pre-navigation URL.
const ROOT_URL = /^https?:\/\/[^/]+\/$/;

test.describe("locale recall revert banner", () => {
  test("recall redirect shows the banner and View in English escapes for good", async ({
    page,
  }) => {
    await storeLocale(page, "es");
    await page.goto("/");
    await expect(page).toHaveURL(/\/es\/$/);

    const banner = page.locator("[data-recall-banner]");
    await expect(banner).toBeVisible();
    const revert = banner.locator("[data-recall-revert]");
    await expect(revert).toHaveText("View in English");
    // Only one top bar at a time: the machine-translation banner stays out of
    // the way while the recall banner is up.
    await expect(page.locator("[data-mt-banner]")).toBeHidden();

    await revert.click();
    await expect(page).toHaveURL(ROOT_URL);

    // The choice sticks: the stored preference is now English, so a fresh
    // visit to the bare URL stays English with no banner.
    const stored = await page.evaluate(() => localStorage.getItem("snapotter:locale"));
    expect(stored).toBe("en");
    await page.goto("/");
    await expect(page).toHaveURL(ROOT_URL);
  });

  test("banner does not appear on a direct localized visit", async ({ page }) => {
    await page.goto("/es/");
    await expect(page.locator("[data-recall-banner]")).toBeHidden();
    // Without a recall redirect the machine-translation banner behaves as before.
    await expect(page.locator("[data-mt-banner]")).toBeVisible();
  });

  test("banner is one-shot: in-site navigation clears it and frees the MT banner", async ({
    page,
  }) => {
    await storeLocale(page, "es");
    await page.goto("/");
    await expect(page).toHaveURL(/\/es\/$/);
    await expect(page.locator("[data-recall-banner]")).toBeVisible();
    await expect(page.locator("[data-mt-banner]")).toBeHidden();

    // Browsing on within the localized site (no redirect involved) must not
    // carry the banner along, and the machine-translation banner comes back:
    // its skip is per page view, not a dismissal.
    await page.goto("/es/faq/");
    await expect(page.locator("[data-recall-banner]")).toBeHidden();
    await expect(page.locator("[data-mt-banner]")).toBeVisible();
  });

  test("revert from a deep page keeps path, query, and hash", async ({ page }) => {
    await storeLocale(page, "es");
    await page.goto("/faq/?ref=recall#top");
    await expect(page).toHaveURL(/\/es\/faq\/\?ref=recall#top$/);

    const banner = page.locator("[data-recall-banner]");
    await expect(banner).toBeVisible();
    await banner.locator("[data-recall-revert]").click();
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/faq\/\?ref=recall#top$/);

    const stored = await page.evaluate(() => localStorage.getItem("snapotter:locale"));
    expect(stored).toBe("en");
  });

  test("dismiss keeps the locale and stays quiet for the session", async ({ page }) => {
    await storeLocale(page, "es");
    await page.goto("/");
    await expect(page).toHaveURL(/\/es\/$/);

    const banner = page.locator("[data-recall-banner]");
    await expect(banner).toBeVisible();
    await banner.locator("[data-recall-dismiss]").click();
    await expect(banner).toBeHidden();

    // Still Spanish, and another recall redirect in the same session does not
    // re-surface the banner.
    await page.goto("/faq");
    await expect(page).toHaveURL(/\/es\/faq\/$/);
    await expect(page.locator("[data-recall-banner]")).toBeHidden();
  });

  test("banner notice is localized on the target page", async ({ page }) => {
    await storeLocale(page, "de");
    await page.goto("/");
    await expect(page).toHaveURL(/\/de\/$/);
    const banner = page.locator("[data-recall-banner]");
    await expect(banner).toBeVisible();
    // The notice is in the page language with the native name interpolated (a
    // literal "{language}" leaking through would fail this).
    await expect(banner).toContainText("Deutsch");
    // The escape link stays English on every locale on purpose.
    await expect(banner.locator("[data-recall-revert]")).toHaveText("View in English");
  });
});
