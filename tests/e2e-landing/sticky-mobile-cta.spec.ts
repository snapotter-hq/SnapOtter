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
