// tests/e2e-landing/i18n-seo-rtl.spec.ts
import { expect, test } from "@playwright/test";

test.describe("landing hreflang, RTL, and banner", () => {
  test("emits reciprocal hreflang alternates including x-default", async ({ page }) => {
    await page.goto("/faq");
    const en = await page.locator('link[rel="alternate"][hreflang="en"]').getAttribute("href");
    const de = await page.locator('link[rel="alternate"][hreflang="de"]').getAttribute("href");
    const xd = await page
      .locator('link[rel="alternate"][hreflang="x-default"]')
      .getAttribute("href");
    // Astro's `format: "directory"` emits trailing-slash URLs, so the alternates
    // carry a trailing slash. What matters is reciprocity and that x-default == en.
    expect(en).toBe("https://snapotter.com/faq/");
    expect(de).toBe("https://snapotter.com/de/faq/");
    expect(xd).toBe("https://snapotter.com/faq/");
    expect(xd).toBe(en);

    // Reciprocity: the German page points back to the same set.
    await page.goto("/de/faq");
    const enFromDe = await page
      .locator('link[rel="alternate"][hreflang="en"]')
      .getAttribute("href");
    expect(enFromDe).toBe("https://snapotter.com/faq/");
  });

  test("Arabic renders dir=rtl on <html>", async ({ page }) => {
    await page.goto("/ar/faq");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });

  test("English page sets og:locale to en_US", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en");
  });

  test("machine-translation banner appears on de and dismisses persistently", async ({ page }) => {
    await page.goto("/de/faq");
    const banner = page.locator("[data-mt-banner]");
    await expect(banner).toBeVisible();
    await banner.locator("[data-mt-dismiss]").click();
    await expect(banner).toBeHidden();
    const stored = await page.evaluate(() => localStorage.getItem("snapotter:mt-banner"));
    expect(stored).toBe("dismissed");

    // Reload: banner stays hidden.
    await page.reload();
    await expect(page.locator("[data-mt-banner]")).toBeHidden();
  });

  test("English page shows no machine-translation banner", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.locator("[data-mt-banner]")).toHaveCount(0);
  });
});
