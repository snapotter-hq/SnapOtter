import { expect, openSettings, test } from "./helpers";

test.describe("Navigation", () => {
  test("sidebar Tools link goes to home", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.locator("aside").getByText("Tools").click();
    await expect(page).toHaveURL("/");
  });

  test("sidebar Grid link goes to fullscreen view", async ({ loggedInPage: page }) => {
    // Click the Grid link in the sidebar (links to /fullscreen)
    const gridLink = page.locator("aside").getByText("Grid");
    // If "Grid" text isn't directly visible (collapsed sidebar), try the link
    if (await gridLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gridLink.click();
    } else {
      // Fallback: navigate via the href directly
      await page.locator('aside a[href="/fullscreen"]').click();
    }
    await expect(page).toHaveURL("/fullscreen");
  });

  test("sidebar Automate link goes to automate page", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Automate").click();
    await expect(page).toHaveURL("/automate");
  });

  test("sidebar Settings button opens settings dialog", async ({ loggedInPage: page }) => {
    await openSettings(page);
    // Settings dialog should appear with section headings
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Security" })).toBeVisible();
  });

  test("fullscreen grid page renders tool cards", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    // Should show category headers
    await expect(page.getByText("Essentials")).toBeVisible();
    await expect(page.getByText("Optimization")).toBeVisible();
    await expect(page.getByText("Adjustments")).toBeVisible();

    // Should show tools (use heading-level locators to avoid matching descriptions)
    await expect(page.getByRole("link", { name: /^Resize/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Compress/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Convert/ }).first()).toBeVisible();
  });

  test("fullscreen grid has search functionality", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();

    // Search for a specific tool
    await searchInput.fill("resize");
    await expect(page.getByRole("link", { name: /^Resize/ }).first()).toBeVisible();
  });

  test("clicking a tool in fullscreen grid navigates to tool page", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/fullscreen");

    // Click on Resize tool
    await page
      .getByRole("link", { name: /resize/i })
      .first()
      .click();
    await expect(page).toHaveURL("/resize");
  });

  test("automate page shows pipeline templates", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    // Should show pipeline builder
    await expect(page.getByText(/pipeline|automation|workflow/i).first()).toBeVisible();
  });

  test("tool panel shows categories on home page", async ({ loggedInPage: page }) => {
    // The tool panel should show categorized tools
    await expect(page.getByText("Essentials").first()).toBeVisible();
  });
});
