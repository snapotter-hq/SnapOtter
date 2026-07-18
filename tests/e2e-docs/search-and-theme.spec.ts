import { expect, test } from "@playwright/test";
import { openDocsSearch, waitForHydration } from "./helpers";

test.describe("docs search (Pagefind)", () => {
  test("search button is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".blog-search").first()).toBeVisible();
  });

  test("clicking search opens the dialog with an input", async ({ page }) => {
    await page.goto("/");
    const input = await openDocsSearch(page);
    // It's the real search combobox with a (config-driven) placeholder. Don't
    // assert the exact placeholder copy, just that one is present.
    await expect(input).toHaveAttribute("role", "combobox");
    await expect(input).toHaveAttribute("placeholder", /\S/);
  });

  test("typing a query shows results", async ({ page }) => {
    await page.goto("/");
    const input = await openDocsSearch(page);
    await input.fill("docker");
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });
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
    // The appearance switch is a Vue handler, so wait for hydration before the
    // single click (otherwise the click is swallowed and the class never flips).
    await waitForHydration(page);

    const html = page.locator("html");
    const wasDark = ((await html.getAttribute("class")) ?? "").includes("dark");

    // Click whichever theme toggle is actually visible at this viewport: below
    // 1440px the nav uses VitePress's native inline toggle, at >=1440px our
    // custom cluster toggle takes over. Filtering to :visible skips the hidden
    // duplicates that sit earlier in DOM order.
    await page.locator('button[role="switch"]:visible').first().click();

    // Assert the dark class actually toggled
    if (wasDark) {
      await expect(html).not.toHaveClass(/dark/);
    } else {
      await expect(html).toHaveClass(/dark/);
    }
  });
});

test.describe("GitHub Stars Component", () => {
  // The custom nav cluster (toggle + Fund + GitHub Star) only renders at
  // >=1440px, where it fits without overflowing the nav. Below that the nav
  // defers to VitePress's native responsive layout, so pin a wide desktop here.
  test.use({ viewport: { width: 1500, height: 900 } });

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

// Regression guard for the nav overflow reported in #556. The custom nav cluster
// used to render inline at every width, pushing the nav past narrow viewports
// (a horizontal scrollbar at 768-959px, off-screen clipping at 1280-1366px).
test.describe("Nav has no horizontal overflow", () => {
  for (const width of [768, 834, 900, 1024, 1280, 1366]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/guide/getting-started");
      await waitForHydration(page);
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return de.scrollWidth - de.clientWidth;
      });
      // Allow a 1px sub-pixel rounding margin; the bug produced 300px+ scroll.
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
