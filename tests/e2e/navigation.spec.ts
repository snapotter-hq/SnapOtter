import { expect, test } from "./helpers";

test.describe("Navigation", () => {
  test("nav Tools link goes to home", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    // Top-nav link: top-nav.tsx useNavLinks() -> { label: t.sidebar.tools, href: "/" }
    await page.getByRole("link", { name: "Tools" }).click();
    await expect(page).toHaveURL("/");
  });

  test("nav Files link goes to files page", async ({ loggedInPage: page }) => {
    // Top-nav link: top-nav.tsx useNavLinks() -> { label: t.sidebar.files, href: "/files" }.
    // Scope to the nav landmark so a stray "Files" link elsewhere can't make this strict-mode ambiguous.
    await page.getByRole("navigation").getByRole("link", { name: "Files" }).first().click();
    await expect(page).toHaveURL("/files");
  });

  test("nav Automate link goes to automate page", async ({ loggedInPage: page }) => {
    // Top-nav link: top-nav.tsx useNavLinks() -> { label: t.sidebar.automate, href: "/automate" }
    await page.getByRole("link", { name: "Automate" }).click();
    await expect(page).toHaveURL("/automate");
  });

  test("Settings button opens settings dialog", async ({ loggedInPage: page }) => {
    // Settings is accessed via avatar dropdown (avatar-dropdown.tsx).
    // The avatar button has aria-label={username}; the logged-in user is "admin".
    await page.getByRole("button", { name: "admin" }).click();
    // Then click Settings inside the dropdown (avatar-dropdown.tsx line 82-97, text = t.common.settings)
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5000 });
    // Settings dialog should appear with section headings (settings-dialog.tsx line 422, 85)
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Security" })).toBeVisible();
  });

  test("home page renders tool cards", async ({ loggedInPage: page }) => {
    // Home page (/) is the tool grid with modality tabs (home-page.tsx AllTabContent)
    await page.goto("/");

    // Should show category headers (home-page.tsx line 405-407, getCategoryName())
    await expect(page.getByText("Essentials")).toBeVisible();
    await expect(page.getByText("Optimization")).toBeVisible();
    await expect(page.getByText("Adjustments")).toBeVisible();

    // Should show tools (tool-card.tsx renders <Link> with tool name text)
    await expect(page.getByRole("link", { name: /^Resize/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Compress/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Convert/ }).first()).toBeVisible();
  });

  test("home page has search functionality", async ({ loggedInPage: page }) => {
    // Home page search: home-page.tsx HomeSearchBar with data-search-input,
    // placeholder from t.homePage.searchPlaceholder = "Search {count} tools..."
    await page.goto("/");

    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();

    // Search for a specific tool
    await searchInput.fill("resize");
    await expect(page.getByRole("link", { name: /^Resize/ }).first()).toBeVisible();
  });

  test("clicking a tool on home page navigates to tool page", async ({ loggedInPage: page }) => {
    // Routes are /:modality/:toolId (App.tsx line 243).
    // Resize route = /image/resize (constants.ts: route "/resize" + modality "image",
    // post-processed at line 1793 with MODALITY_URL_SLUG prefix).
    await page.goto("/");

    // Click on Resize tool
    await page
      .getByRole("link", { name: /resize/i })
      .first()
      .click();
    await expect(page).toHaveURL("/image/resize");
  });

  test("automate page shows pipeline builder", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    // Should show pipeline builder heading (automate-page.tsx line 802-804,
    // t.automate.pipelineBuilder = "Pipeline Builder")
    await expect(page.getByText(/pipeline/i).first()).toBeVisible();
  });

  test("home page shows categories", async ({ loggedInPage: page }) => {
    // The home page shows categorized tools (home-page.tsx AllTabContent,
    // category headers via getCategoryName(), en.ts categories.essentials = "Essentials")
    await expect(page.getByText("Essentials").first()).toBeVisible();
  });
});
