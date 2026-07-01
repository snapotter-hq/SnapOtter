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

  test("opens the in-app request dialog when analytics is enabled", async ({ page }) => {
    // Force the client to see analytics as enabled so the affordance renders as an
    // in-app dialog trigger instead of a Discussions link. Merge with the real
    // config response so unrelated fields stay intact.
    await page.route("**/api/v1/config/analytics", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ json: { ...body, enabled: true } });
    });

    await page.goto("/");

    const searchInput = page.locator("[data-search-input]");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("zzxqwv nonexistent capability");

    const request = page.getByTestId("request-tool").first();
    await expect(request).toBeVisible();
    // With analytics "on" the affordance is a button (no href) that opens the dialog.
    await expect(request).not.toHaveAttribute("href", /.+/);
    await request.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Request a tool");
    await expect(dialog).toContainText("zzxqwv nonexistent capability");
  });
});
