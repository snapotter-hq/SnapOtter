import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers";

/**
 * VitePress switches to the desktop nav at 768px. Several locales carry
 * top-level labels far longer than English (es 55 characters, pt-BR 54, th 53,
 * ru 52, de 48 against en 33), so between 768px and the 960px sidebar
 * breakpoint the navbar's right edge landed outside the viewport and the page
 * scrolled sideways. apps/docs/.vitepress/theme/vars.css moves that one switch
 * to 960px.
 *
 * English fits at every width, so an English-only check would have stayed green
 * through the whole regression. The long-label locales are the point.
 */

const WIDTHS = [375, 767, 768, 900, 959, 960, 1280];

// The five longest nav-label locales plus English as the control.
const PAGES = [
  "/guide/getting-started",
  "/de/guide/getting-started",
  "/es/guide/getting-started",
  "/pt-BR/guide/getting-started",
  "/th/guide/getting-started",
  "/ru/guide/getting-started",
];

test.describe("Docs responsive layout", () => {
  for (const path of PAGES) {
    for (const width of WIDTHS) {
      test(`${path} does not scroll sideways at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await waitForHydration(page);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(
          scrollWidth,
          `${path} overflows by ${scrollWidth - clientWidth}px at ${width}px`,
        ).toBeLessThanOrEqual(clientWidth);
      });
    }
  }

  // Hiding the desktop menu is only safe if the overlay replaces it, so this
  // pins the replacement rather than trusting the CSS to have both halves.
  for (const width of [768, 900, 959]) {
    test(`the hamburger overlay carries the top-level nav at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/de/guide/getting-started");
      await waitForHydration(page);

      await expect(page.locator(".VPNavBarMenu")).toBeHidden();
      const hamburger = page.locator(".VPNavBarHamburger");
      await expect(hamburger).toBeVisible();

      await hamburger.click();
      const screen = page.locator(".VPNavScreen");
      await expect(screen).toBeVisible();
      await expect(screen.locator(".VPNavScreenMenu")).toContainText("Anleitung");
      await expect(screen.locator(".translations")).toBeVisible();
    });
  }

  test("the desktop nav returns at the sidebar breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 900 });
    await page.goto("/de/guide/getting-started");
    await waitForHydration(page);
    await expect(page.locator(".VPNavBarMenu")).toBeVisible();
    await expect(page.locator(".VPNavBarHamburger")).toBeHidden();
  });
});
