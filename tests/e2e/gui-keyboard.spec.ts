import { expect, test } from "./helpers";

// ---------------------------------------------------------------------------
// Helper: the correct modifier key for the OS running Playwright
// On macOS Playwright uses "Meta", on others "Control".
// ---------------------------------------------------------------------------
const MOD = process.platform === "darwin" ? "Meta" : "Control";

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts", () => {
  test("Cmd/Ctrl+K focuses the search bar", async ({ loggedInPage: page }) => {
    // Ensure search bar exists but is not focused
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    await page.keyboard.press(`${MOD}+k`);

    await expect(searchInput).toBeFocused();
  });

  test("Cmd/Ctrl+/ navigates to tools (home) page", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await expect(page).toHaveURL("/automate");

    await page.keyboard.press(`${MOD}+/`);

    await expect(page).toHaveURL("/");
  });

  test("Cmd/Ctrl+Shift+D toggles the theme", async ({ loggedInPage: page }) => {
    // Check the initial dark class state
    const hadDarkBefore = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    await page.keyboard.press(`${MOD}+Shift+d`);

    // Wait briefly for the class toggle to apply
    await page.waitForTimeout(300);

    const hasDarkAfter = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    // Theme should have toggled
    expect(hasDarkAfter).not.toBe(hadDarkBefore);
  });

  test("Cmd/Ctrl+Shift+D toggles theme back on second press", async ({ loggedInPage: page }) => {
    const initial = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    // First toggle
    await page.keyboard.press(`${MOD}+Shift+d`);
    await page.waitForTimeout(300);

    // Second toggle
    await page.keyboard.press(`${MOD}+Shift+d`);
    await page.waitForTimeout(300);

    const afterDouble = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    expect(afterDouble).toBe(initial);
  });

  test("shortcuts do not fire when typing in an input field", async ({ loggedInPage: page }) => {
    // Focus the search input
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.click();
    await searchInput.fill("");

    // Press Cmd+/ which normally navigates to /
    // But since we're in an input, it should NOT navigate
    await page.goto("/fullscreen");
    await page.waitForTimeout(300);

    const searchOnFullscreen = page.getByPlaceholder(/search/i);
    await searchOnFullscreen.click();

    // Type the / character while focused on input - this should not navigate
    await page.keyboard.press(`${MOD}+/`);
    await page.waitForTimeout(300);

    // Should still be on fullscreen since the shortcut was suppressed
    await expect(page).toHaveURL("/fullscreen");
  });

  test("Cmd/Ctrl+K works even when focused on an input field", async ({ loggedInPage: page }) => {
    // Navigate to fullscreen which has its own search input
    await page.goto("/fullscreen");

    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.click();
    await searchInput.fill("test");

    // Cmd+K is the exception - it should still fire in inputs
    await page.keyboard.press(`${MOD}+k`);

    // The search input should be focused and selected
    await expect(searchInput).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// Tool navigation shortcuts (Cmd+Alt+N)
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Tool Navigation", () => {
  test("Cmd/Ctrl+Alt+1 navigates to Resize", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+1`);

    await expect(page).toHaveURL("/resize");
  });

  test("Cmd/Ctrl+Alt+2 navigates to Crop", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+2`);

    await expect(page).toHaveURL("/crop");
  });

  test("Cmd/Ctrl+Alt+3 navigates to Compress", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+3`);

    await expect(page).toHaveURL("/compress");
  });

  test("Cmd/Ctrl+Alt+4 navigates to Convert", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+4`);

    await expect(page).toHaveURL("/convert");
  });
});
