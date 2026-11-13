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
  // The Star button renders from 960px and the rest of the custom cluster
  // (toggle + Fund) from 1440px. Pin a wide desktop so all of it is present.
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

test.describe("GitHub Star button fit", () => {
  test("shows on a laptop-width English nav in place of the plain GitHub icon", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/guide/getting-started");
    await waitForHydration(page);
    await expect(page.locator(".github-btn-label")).toBeVisible();
    await expect(
      page.locator('.VPNavBarSocialLinks a[href="https://github.com/snapotter-hq/snapotter"]'),
    ).toBeHidden();
  });

  // Localized navs are fuller than English. The button must shrink or hide
  // rather than push the nav past the viewport, where the fixed nav clips it.
  // Spanish at 1440px clipped before the fit logic existed.
  for (const width of [1100, 1280, 1440]) {
    test(`never clips the Spanish nav at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/es/guide/getting-started");
      await waitForHydration(page);
      await expect(page.locator("html")).toHaveAttribute("data-star-fit", /\S/);
      const fit = await page.locator("html").getAttribute("data-star-fit");
      // A visible button must leave the nav fitting. Once it hides, any clipping
      // left is the stock nav's own (#4522), which font metrics move around.
      if (fit !== "hidden") {
        const right = await page
          .locator(".VPNavBar .content-body")
          .evaluate((el) => el.getBoundingClientRect().right);
        expect(right).toBeLessThanOrEqual(width);
      }
      // VitePress shows its social icons inline only from 1280px.
      if (width >= 1280 && fit === "hidden") {
        await expect(
          page.locator('.VPNavBarSocialLinks a[href="https://github.com/snapotter-hq/snapotter"]'),
        ).toBeVisible();
      }
    });
  }
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
