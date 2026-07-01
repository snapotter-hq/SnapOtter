import { expect, test } from "@playwright/test";

test.describe("search-miss tool request", () => {
  test("offers a request when a search finds nothing", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator("[data-search-input]");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("zzxqwv nonexistent capability");

    const request = page.getByTestId("request-tool").first();
    await expect(request).toBeVisible();

    const href = await request.getAttribute("href");
    if (href) {
      expect(href).toContain("/discussions/new");
      expect(href).toContain("category=ideas");
    } else {
      await request.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Request a tool");
    }
  });
});
