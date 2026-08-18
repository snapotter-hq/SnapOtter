import { expect, test } from "@playwright/test";

// The navbar's CTAs live in the md:flex desktop cluster, so on phones they are
// hidden until the hamburger is opened. This bar keeps a one-tap action in view.
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test.describe("Sticky mobile CTA", () => {
  test("shows a persistent CTA bar on phone viewports", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");

    const bar = page.locator("#mobile-cta");
    await expect(bar).toBeVisible();

    // Both actions are reachable without opening the hamburger menu.
    await expect(bar.getByRole("link", { name: "Try the live demo" })).toHaveAttribute(
      "href",
      "https://demo.snapotter.com",
    );
    await expect(bar.getByRole("link", { name: "Get Started Free" })).toHaveAttribute(
      "href",
      "https://docs.snapotter.com/guide/getting-started.html",
    );
  });

  test("stays cheap to composite: no backdrop blur, opaque background", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");

    // Regression guard: backdrop-filter on a bottom-fixed bar flickers and lags
    // on phones while the browser repositions it during URL-bar collapse. The
    // bar must stay a plain opaque layer so the compositor can keep it glued
    // to the bottom edge.
    const bar = page.locator("#mobile-cta");
    const { backdropFilter, alpha } = await bar.evaluate((el) => {
      const style = getComputedStyle(el);
      const bg = style.backgroundColor;
      const slash = bg.match(/\/\s*([\d.]+)\s*\)$/);
      const rgba = bg.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/);
      const parsed = slash ?? rgba;
      return {
        backdropFilter: style.backdropFilter,
        alpha: parsed ? Number.parseFloat(parsed[1]) : 1,
      };
    });
    expect(backdropFilter).toBe("none");
    expect(alpha).toBe(1);
  });

  // The bar auto-hides while scrolling down so the browser's URL-bar
  // collapse (which re-anchors every fixed bottom element and toggles
  // safe-area-inset-bottom on Android Chrome) never moves it in view.
  // Shown/hidden is judged by bounding box, not class names: hidden means
  // the bar's top is at or below the viewport's bottom edge.
  const barTop = (page: import("@playwright/test").Page) =>
    page
      .locator("#mobile-cta")
      .boundingBox()
      .then((box) => box?.y ?? Number.POSITIVE_INFINITY);

  test("slides away while scrolling down and back on scroll up", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await expect(page.locator("#mobile-cta")).toBeVisible();

    // Two spaced scroll steps keep the idle-reveal timer from firing while
    // we assert the hidden state.
    await page.evaluate(() => window.scrollBy(0, 900));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.scrollBy(0, 300));
    await expect
      .poll(() => barTop(page), { timeout: 2000 })
      .toBeGreaterThanOrEqual(PHONE.height - 1);

    await page.evaluate(() => window.scrollBy(0, -300));
    await expect.poll(() => barTop(page), { timeout: 2000 }).toBeLessThan(PHONE.height);
  });

  test("slides back on its own once scrolling stops", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");

    await page.evaluate(() => window.scrollBy(0, 1200));
    await expect
      .poll(() => barTop(page), { timeout: 2000 })
      .toBeGreaterThanOrEqual(PHONE.height - 1);

    // No further scrolling: the idle timer should bring the bar back.
    await expect.poll(() => barTop(page), { timeout: 4000 }).toBeLessThan(PHONE.height);
  });

  test("is hidden on desktop where the navbar CTAs are already visible", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");

    // Present in the DOM but display:none via md:hidden, not simply absent.
    const bar = page.locator("#mobile-cta");
    await expect(bar).toBeAttached();
    await expect(bar).toBeHidden();
  });

  test("does not render on pages that already end in their own CTA", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/contact");

    // contact opts out (the form is the page's CTA), so the bar is absent entirely.
    await expect(page.locator("#mobile-cta")).toHaveCount(0);
  });
});
