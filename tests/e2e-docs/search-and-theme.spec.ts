import { expect, test } from "@playwright/test";

test.describe("docs search (Pagefind)", () => {
  test("search button is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".blog-search").first()).toBeVisible();
  });

  test("clicking search opens the dialog with an input", async ({ page }) => {
    await page.goto("/");
    await page.locator(".blog-search").first().click();
    await expect(page.locator('input[placeholder="Search Docs"]')).toBeVisible();
  });

  test("typing a query shows results", async ({ page }) => {
    await page.goto("/");
    await page.locator(".blog-search").first().click();
    const input = page.locator('input[placeholder="Search Docs"]');
    await input.fill("docker");
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Theme Toggle", () => {
  test("theme toggle exists in DOM", async ({ page }) => {
    await page.goto("/guide/getting-started");
    const toggle = page.locator(
      'button[role="switch"][title*="dark"], button[role="switch"][title*="light"]',
    );
    await expect(toggle.first()).toBeAttached();
  });

  test("clicking theme toggle changes appearance", async ({ page }) => {
    await page.goto("/guide/getting-started");
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");
    const wasDark = initialClass?.includes("dark") ?? false;

    // Click the visible toggle inside our custom nav area (the hidden default
    // VPNavBarAppearance is first in DOM order, so a bare querySelector would
    // hit it instead). Playwright's click auto-waits for hydration.
    await page.locator('.nav-bar-right button[role="switch"]').click();

    // Assert the dark class actually toggled
    if (wasDark) {
      await expect(html).not.toHaveClass(/dark/);
    } else {
      await expect(html).toHaveClass(/dark/);
    }
  });
});

test.describe("GitHub Stars Component", () => {
  test("GitHub star button is visible in navbar", async ({ page }) => {
    await page.goto("/");
    const githubBtn = page.locator(".github-btn, .github-btn-wrapper").first();
    await expect(githubBtn).toBeVisible();
  });

  test("GitHub star button links to correct repo", async ({ page }) => {
    await page.goto("/");
    const starLink = page.locator('a[title="Star on GitHub"]').first();
    await expect(starLink).toHaveAttribute("href", "https://github.com/snapotter-hq/snapotter");
    await expect(starLink).toHaveAttribute("target", "_blank");
  });
});
