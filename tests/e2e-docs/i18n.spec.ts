// tests/e2e-docs/i18n.spec.ts
import { expect, test } from "@playwright/test";

test.describe("docs i18n (English + seeded German locale)", () => {
  test("English home still renders at root", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SnapOtter/);
  });

  test("German locale subtree renders under /de/", async ({ page }) => {
    await page.goto("/de/guide/getting-started");
    // The seed prefixes headings with [DE]; the page must resolve, not 404.
    await expect(page.getByRole("heading", { name: /\[DE\]/ }).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("machine-translation banner shows on a non-English page, not on English", async ({
    page,
  }) => {
    await page.goto("/de/guide/getting-started");
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

  test("hreflang alternates are reciprocal and include x-default", async ({ page }) => {
    await page.goto("/guide/getting-started");
    const en = await page.locator('link[hreflang="en"]').getAttribute("href");
    const de = await page.locator('link[hreflang="de"]').getAttribute("href");
    const xd = await page.locator('link[hreflang="x-default"]').getAttribute("href");
    expect(en).toContain("/guide/getting-started");
    expect(de).toContain("/de/guide/getting-started");
    expect(xd).toBe(en);
  });

  test("pagefind returns results within the German locale", async ({ page }) => {
    await page.goto("/de/guide/getting-started");
    await page.locator(".blog-search").first().click();
    const input = page.locator("input[placeholder]").first();
    await input.fill("docker");
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10000 });
  });
});
