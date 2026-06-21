import { expect, test } from "./helpers";

test.describe("Home Page", () => {
  test("shows branding and search bar", async ({ loggedInPage: page }) => {
    // The wordmark renders as a logo image, not text; the document title is
    // the stable brand assertion.
    await expect(page).toHaveTitle(/SnapOtter/i);

    // 2.0 home page is a tool grid with a search bar (no dropzone)
    await expect(page.locator("[data-search-input]")).toBeVisible();
  });

  test("modality tabs are visible", async ({ loggedInPage: page }) => {
    // 2.0 home page has modality tabs: All, Image, Video, Audio, PDF, Files
    // Tab buttons render label + a count span, so the accessible name is e.g.
    // "Image5" (no word boundary before the digit) — match on the label prefix.
    await expect(page.getByRole("button", { name: /^All/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Image/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Video/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Audio/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^PDF/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Files/ }).first()).toBeVisible();
  });

  test("tool categories are visible on home page", async ({ loggedInPage: page }) => {
    // Search bar should be visible
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();

    // Tool categories should be visible under All tab (default)
    await expect(page.getByText("Essentials").first()).toBeVisible();
  });

  test("search filters tools", async ({ loggedInPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("compress");

    // Should show Compress tool
    await expect(page.getByText("Compress").first()).toBeVisible();
  });

  test("clicking a tool card navigates to tool page", async ({ loggedInPage: page }) => {
    // Find and click a tool link (Resize is in Image > Essentials)
    await page.locator("a").filter({ hasText: "Resize" }).first().click();

    // 2.0 routes are /{modality}/{toolId}
    await expect(page).toHaveURL("/image/resize");
  });

  test("modality tab filters tools by modality", async ({ loggedInPage: page }) => {
    // Click the Video tab
    await page
      .getByRole("button", { name: /^Video/ })
      .first()
      .click();

    // Should show video-specific category headings (Subtitles is unique to video)
    await expect(page.getByText("Subtitles").first()).toBeVisible();

    // Image-only categories should not be present
    await expect(page.getByText("Essentials")).not.toBeVisible();
  });

  test("search shows no-results message for unknown query", async ({ loggedInPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("xyznonexistent");

    // Should show no-results message (en.ts: homePage.noToolsMatch)
    await expect(page.getByText(/no tools match/i).first()).toBeVisible();
  });

  test("search can be cleared", async ({ loggedInPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("xyznonexistent");

    // Should show no-results with a clear button (en.ts: homePage.clearSearch)
    await expect(page.getByText(/no tools match/i).first()).toBeVisible();
    await page.getByText("Clear search").click();

    // Tool grid should reappear after clearing
    await expect(page.getByText("Essentials").first()).toBeVisible();
  });

  test("top nav has theme toggle", async ({ loggedInPage: page }) => {
    // Theme toggle moved to the top-nav header in 2.0
    await expect(page.getByTitle("Toggle theme")).toBeVisible();
  });
});
