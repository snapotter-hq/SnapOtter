// tests/e2e-docs/i18n.spec.ts
import { expect, test } from "@playwright/test";
import { openDocsSearch } from "./helpers";

test.describe("docs i18n (English + committed German locale)", () => {
  test("English home still renders at root", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SnapOtter/);
  });

  test("German locale subtree renders under /de/", async ({ page }) => {
    await page.goto("/de/guide/getting-started");
    await expect(page.getByRole("heading", { name: "Erste Schritte" }).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("machine-translation banner shows on a non-English page, not on English", async ({
    page,
  }) => {
    await page.goto("/de/guide/low-resource");
    await expect(page.locator(".mt-banner")).toBeVisible();
    await page.goto("/guide/getting-started");
    await expect(page.locator(".mt-banner")).toHaveCount(0);
  });

  test("locale nav/sidebar links keep the /de prefix", async ({ page }) => {
    await page.goto("/de/guide/getting-started");
    const sidebar = page.locator(".VPSidebar, aside");
    const firstLink = sidebar.locator('a[href^="/de/"]').first();
    await expect(firstLink).toBeVisible();
  });

  test("an in-content #anchor deep link resolves in the German locale", async ({ page }) => {
    // Anchors are stable across locales; #quick-start exists on the German page too.
    await page.goto("/de/guide/getting-started#quick-start");
    const target = page.locator("#quick-start");
    await expect(target).toBeAttached();
    await expect(target).toBeInViewport();
  });

  test("English pages are indexable and self-canonical", async ({ page }) => {
    await page.goto("/guide/getting-started");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toBe("https://docs.snapotter.com/guide/getting-started");
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  // Only English is indexable, so there is no hreflang cluster left to annotate.
  // See the transformHead comment in apps/docs/.vitepress/config.mts.
  test("translated pages are noindex, self-canonical, and carry no hreflang", async ({ page }) => {
    await page.goto("/de/guide/getting-started");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toBe("https://docs.snapotter.com/de/guide/getting-started");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator("link[hreflang]")).toHaveCount(0);
  });

  test("pagefind returns results within the German locale", async ({ page }) => {
    await page.goto("/de/guide/getting-started");
    const input = await openDocsSearch(page);
    await input.fill("docker");
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });
  });
});
