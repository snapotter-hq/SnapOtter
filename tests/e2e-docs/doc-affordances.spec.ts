import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers";

// #5008: PostHog recorded dead clicks on code blocks (readers clicking the
// command to copy it) and on heading text (readers expecting a section link).
test.describe("Docs click affordances", () => {
  test("code blocks show their copy button without hovering", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await waitForHydration(page);
    await page.mouse.move(0, 0);
    const copy = page.locator(".vp-doc div[class*='language-'] > button.copy").first();
    await expect(copy).toBeVisible();
    await expect(copy).toHaveCSS("opacity", "1");
  });

  test("clicking a heading's text links to that section", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await waitForHydration(page);
    const heading = page.locator(".vp-doc h2#gpu-acceleration");
    await expect(heading).toHaveCSS("cursor", "pointer");
    await heading.click();
    await expect(page).toHaveURL(/\/guide\/getting-started#gpu-acceleration$/);
  });

  test("selecting heading text does not jump to the section", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await waitForHydration(page);
    const heading = page.locator(".vp-doc h2#gpu-acceleration");
    const box = await heading.boundingBox();
    if (!box) throw new Error("heading has no box");
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(
      await page.evaluate(() => window.getSelection()?.toString().length ?? 0),
    ).toBeGreaterThan(0);
    await expect(page).not.toHaveURL(/#gpu-acceleration$/);
  });

  // #5095: readers also clicked env var names expecting their definition.
  test("an env var mention links to its row in Configuration", async ({ page }) => {
    await page.goto("/guide/low-resource");
    await waitForHydration(page);
    await page.locator(".vp-doc a[href$='#env-max-worker-threads']").first().click();
    await expect(page).toHaveURL(/\/guide\/configuration#env-max-worker-threads$/);
    await expect(page.locator(".vp-doc td#env-max-worker-threads")).toBeInViewport();
  });
});
