import { expect, test } from "./helpers";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

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

  test("typing with nothing focused fills the tool search", async ({ loggedInPage: page }) => {
    const searchInput = page.locator("[data-search-input]");
    // The home page is lazy-loaded, so wait for it to mount before typing.
    // Without this the keystrokes land on an unmounted page and vanish.
    await expect(searchInput).toBeVisible();

    await page.keyboard.type("compress");

    await expect(searchInput).toHaveValue("compress");
    await expect(searchInput).toBeFocused();
    await expect(page.getByText("Compress").first()).toBeVisible();
  });

  test("typing does nothing once the search bar is scrolled out of view", async ({
    loggedInPage: page,
  }) => {
    const searchInput = page.locator("[data-search-input]");
    // Waiting for mount is load-bearing, not politeness: the home page is
    // lazy-loaded, and without this the element does not exist yet, so the
    // precondition below passes vacuously and the whole test asserts nothing.
    await expect(searchInput).toBeVisible();

    // The app shell is h-dvh overflow-hidden and #main-content is the scroller,
    // so the document does not scroll and mouse.wheel moves nothing at all.
    await page.locator("#main-content").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(searchInput).not.toBeInViewport();

    await page.keyboard.type("compress");

    await expect(searchInput).toHaveValue("");
  });

  test("typing works after a client-side navigation to home", async ({ loggedInPage: page }) => {
    // RouteAnnouncer moves focus 300ms after a client-side route change, which
    // would break type-to-search if that focus stuck. Every other test here
    // arrives by hard load, where the announcer short-circuits.
    await page.goto("/automate");
    await page.keyboard.press(`${MOD}+/`);
    await expect(page).toHaveURL("/");
    const searchInput = page.locator("[data-search-input]");
    await expect(searchInput).toBeVisible();
    await page.waitForTimeout(500);

    await page.keyboard.type("compress");

    await expect(searchInput).toHaveValue("compress");
  });

  test("the ?focus=search param focuses the search bar and cleans the URL", async ({
    loggedInPage: page,
  }) => {
    // Reachable via Mod+K from a page with no search box. Untested before this,
    // and type-to-search would now mask its failure by filling the box anyway.
    await page.goto("/?focus=search");

    await expect(page.locator("[data-search-input]")).toBeFocused();
    await expect(page).toHaveURL("/");
  });

  test("type-to-search does not leak onto pages with their own search", async ({
    loggedInPage: page,
  }) => {
    // The hook's scope claim: it is mounted next to the home search bar, so no
    // other page gets it. Automate has its own tool-palette search that must
    // stay untouched.
    await page.goto("/automate");
    await expect(page).toHaveURL("/automate");
    await page.waitForTimeout(500);

    await page.keyboard.type("abc");

    const anyInputTook = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input")).some((i) => i.value.includes("abc")),
    );
    expect(anyInputTook).toBe(false);
  });

  test("typing does not hijack when a control already holds focus", async ({
    loggedInPage: page,
  }) => {
    const searchInput = page.locator("[data-search-input]");
    await page
      .getByRole("button", { name: /^Image/ })
      .first()
      .focus();

    await page.keyboard.type("compress");

    await expect(searchInput).toHaveValue("");
  });

  test("typing after blurring appends and leaves the caret at the end", async ({
    loggedInPage: page,
  }) => {
    const searchInput = page.locator("[data-search-input]");
    await searchInput.fill("pdf");
    await searchInput.blur();

    await page.keyboard.type("x");

    await expect(searchInput).toHaveValue("pdfx");
    // A caret stranded at position 0 would put the next character in front.
    await expect
      .poll(() => searchInput.evaluate((el: HTMLInputElement) => el.selectionStart))
      .toBe(4);
  });

  test("editing inside the tool search keeps the native caret position", async ({
    loggedInPage: page,
  }) => {
    const searchInput = page.locator("[data-search-input]");
    await searchInput.click();
    await page.keyboard.type("ab");

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("x");

    // Appending instead of honouring the caret would produce "abx".
    await expect(searchInput).toHaveValue("axb");
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
