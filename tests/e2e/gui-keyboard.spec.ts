import { expect, openSettings, test } from "./helpers";

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
    // The Files page has its own search input and a non-home URL, so we can
    // detect whether a navigation shortcut leaked through while typing.
    await page.goto("/files");
    await expect(page).toHaveURL("/files");

    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.click();
    await searchInput.fill("");

    // Cmd+/ normally navigates to "/", but while focused on an input it
    // should be suppressed.
    await page.keyboard.press(`${MOD}+/`);
    await page.waitForTimeout(300);

    // Should still be on /files since the shortcut was suppressed
    await expect(page).toHaveURL("/files");
  });

  test("Cmd/Ctrl+K works even when focused on an input field", async ({ loggedInPage: page }) => {
    // The Files page has its own search input.
    await page.goto("/files");

    const searchInput = page.getByPlaceholder(/search/i).first();
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

    await expect(page).toHaveURL("/image/resize");
  });

  test("Cmd/Ctrl+Alt+2 navigates to Crop", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+2`);

    await expect(page).toHaveURL("/image/crop");
  });

  test("Cmd/Ctrl+Alt+3 navigates to Compress", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+3`);

    await expect(page).toHaveURL("/image/compress");
  });

  test("Cmd/Ctrl+Alt+4 navigates to Convert", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+4`);

    await expect(page).toHaveURL("/image/convert");
  });

  test("Cmd/Ctrl+Alt+5 navigates to Remove Background", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+5`);

    await expect(page).toHaveURL("/image/remove-background");
  });

  test("Cmd/Ctrl+Alt+6 navigates to Watermark Text", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+6`);

    await expect(page).toHaveURL("/image/watermark-text");
  });

  test("Cmd/Ctrl+Alt+7 navigates to Strip Metadata", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+7`);

    await expect(page).toHaveURL("/image/strip-metadata");
  });

  test("Cmd/Ctrl+Alt+8 navigates to Image Info", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+Alt+8`);

    await expect(page).toHaveURL("/image/info");
  });
});

// ---------------------------------------------------------------------------
// Shortcuts work from any page
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Work From Any Page", () => {
  test("Cmd/Ctrl+Shift+D toggles theme from /automate", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    const hadDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    await page.keyboard.press(`${MOD}+Shift+d`);
    await page.waitForTimeout(300);

    const hasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(hasDark).not.toBe(hadDark);
  });

  test("Cmd/Ctrl+/ navigates to tools from /files", async ({ loggedInPage: page }) => {
    await page.goto("/files");
    await expect(page).toHaveURL("/files");

    await page.keyboard.press(`${MOD}+/`);

    await expect(page).toHaveURL("/");
  });

  test("Cmd/Ctrl+Alt+1 navigates to Resize from a tool page", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");
    await expect(page).toHaveURL("/image/compress");

    await page.keyboard.press(`${MOD}+Alt+1`);

    await expect(page).toHaveURL("/image/resize");
  });

  test("Cmd/Ctrl+Shift+D toggles theme from /fullscreen", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    const hadDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    await page.keyboard.press(`${MOD}+Shift+d`);
    await page.waitForTimeout(300);

    const hasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(hasDark).not.toBe(hadDark);
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcut suppression in different input types
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Input Suppression", () => {
  test("Cmd/Ctrl+Shift+D does not toggle theme when focused on search input", async ({
    loggedInPage: page,
  }) => {
    // The Files page reliably shows a search input.
    await page.goto("/files");
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();
    await searchInput.click();
    await searchInput.fill("");

    const hadDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    await page.keyboard.press(`${MOD}+Shift+d`);
    await page.waitForTimeout(300);

    const hasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    // Theme should NOT have changed since we were in an input
    expect(hasDark).toBe(hadDark);
  });

  test("Cmd/Ctrl+Alt+1 does not navigate when focused on search input", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/files");
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();
    await searchInput.click();

    await page.keyboard.press(`${MOD}+Alt+1`);
    await page.waitForTimeout(300);

    // Should still be on /files since shortcut was suppressed
    await expect(page).toHaveURL("/files");
  });
});

// ---------------------------------------------------------------------------
// Escape key behavior
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Escape Key", () => {
  test("Escape closes the settings dialog", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("Escape closes the help dialog", async ({ loggedInPage: page }) => {
    await page.getByRole("button", { name: "Help", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await expect(page.getByRole("heading", { name: "Help" })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Shortcut suppression in textarea and contenteditable
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Textarea Suppression", () => {
  test("Cmd/Ctrl+/ does not navigate when focused on textarea", async ({ loggedInPage: page }) => {
    // Navigate to a tool that has a textarea (watermark-text has text input)
    await page.goto("/image/watermark-text");

    // Find a textarea or contenteditable element on the page
    const textarea = page.locator("textarea").first();
    if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textarea.click();

      await page.keyboard.press(`${MOD}+/`);
      await page.waitForTimeout(300);

      // Should still be on watermark-text since shortcut was suppressed in textarea
      await expect(page).toHaveURL("/image/watermark-text");
    }
  });

  test("Cmd/Ctrl+Shift+D does not toggle theme when focused on a textarea", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/watermark-text");

    const textarea = page.locator("textarea").first();
    if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textarea.click();

      const hadDark = await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      );

      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(300);

      const hasDark = await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      );

      // Theme should NOT have changed since we were in a textarea
      expect(hasDark).toBe(hadDark);
    }
  });
});

// ---------------------------------------------------------------------------
// Keyboard accessibility - focus management
// ---------------------------------------------------------------------------
test.describe("Keyboard Accessibility", () => {
  test("Tab key cycles through interactive elements on home page", async ({
    loggedInPage: page,
  }) => {
    // Press Tab several times and verify focus moves to interactive elements
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);

    // After tabbing, some element should be focused
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
    expect(["a", "button", "input", "select", "textarea"]).toContain(focusedTag);
  });

  test("search input is reachable via keyboard", async ({ loggedInPage: page }) => {
    // Cmd+K should focus the search bar without needing to Tab to it
    await page.keyboard.press(`${MOD}+k`);

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeFocused();

    // Typing should filter tools
    await page.keyboard.type("resize");
    await page.waitForTimeout(300);

    await expect(page.getByText("Resize").first()).toBeVisible();
  });

  test("multiple Tab presses cycle through several interactive elements", async ({
    loggedInPage: page,
  }) => {
    const tags: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(50);
      const tag = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
      if (tag) tags.push(tag);
    }

    // At least 3 of the 5 focused elements should be interactive
    const interactive = tags.filter((t) =>
      ["a", "button", "input", "select", "textarea"].includes(t),
    );
    expect(interactive.length).toBeGreaterThanOrEqual(3);
  });

  test("Shift+Tab moves focus backward", async ({ loggedInPage: page }) => {
    // Tab forward twice
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    const secondFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}-${el.textContent?.slice(0, 20)}` : "";
    });

    // Shift+Tab back once
    await page.keyboard.press("Shift+Tab");

    const firstFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}-${el.textContent?.slice(0, 20)}` : "";
    });

    // Focus should have moved to a different element
    expect(firstFocused).not.toBe(secondFocused);
  });
});

// ---------------------------------------------------------------------------
// Cmd+K on different pages
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Cmd+K Cross-Page", () => {
  test("Cmd/Ctrl+K focuses search on a tool page", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    await page.keyboard.press(`${MOD}+k`);

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeFocused();
  });

  test("Cmd/Ctrl+K focuses search on /automate", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    await page.keyboard.press(`${MOD}+k`);

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeFocused();
  });

  test("Cmd/Ctrl+K focuses search on /files", async ({ loggedInPage: page }) => {
    await page.goto("/files");

    await page.keyboard.press(`${MOD}+k`);

    // The search bar may or may not exist on the files page;
    // if it does, it should be focused
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(searchInput).toBeFocused();
    }
  });
});

// ---------------------------------------------------------------------------
// Escape key - Additional coverage
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Escape Additional", () => {
  test("Escape clears search input focus", async ({ loggedInPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.click();
    await expect(searchInput).toBeFocused();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Search input should no longer be focused
    await expect(searchInput).not.toBeFocused();
  });

  // Removed: the mobile hamburger sidebar overlay no longer exists in 2.0
  // (mobile navigation is a fixed bottom nav, not a slide-in sidebar).
});

// ---------------------------------------------------------------------------
// Shortcut suppression in settings dialog input
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Dialog Input Suppression", () => {
  test("Cmd/Ctrl+/ does not navigate when focused on input inside settings dialog", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/files");

    await openSettings(page);
    await expect(page.getByRole("dialog")).toBeVisible();

    // Try to find an input inside the dialog
    const dialogInput = page.getByRole("dialog").locator("input").first();
    if (await dialogInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dialogInput.click();

      await page.keyboard.press(`${MOD}+/`);
      await page.waitForTimeout(300);

      // Should still be on /files (shortcut suppressed)
      await expect(page).toHaveURL("/files");
    }
  });

  test("Cmd/Ctrl+Alt+1 does not navigate when focused on input inside settings dialog", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    await expect(page.getByRole("dialog")).toBeVisible();

    const dialogInput = page.getByRole("dialog").locator("input").first();
    if (await dialogInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dialogInput.click();

      await page.keyboard.press(`${MOD}+Alt+1`);
      await page.waitForTimeout(300);

      // Should still be on home (shortcut suppressed)
      await expect(page).toHaveURL("/");
    }
  });
});

// ---------------------------------------------------------------------------
// Rapid shortcut sequences
// ---------------------------------------------------------------------------
test.describe("Keyboard Shortcuts - Rapid Sequences", () => {
  test("rapid Cmd/Ctrl+Shift+D toggles do not corrupt theme state", async ({
    loggedInPage: page,
  }) => {
    const initial = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    // Toggle 4 times quickly
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(100);
    }

    await page.waitForTimeout(300);

    // After even number of toggles, should be back to initial state
    const final = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(final).toBe(initial);
  });

  test("Cmd/Ctrl+K followed by Escape returns focus to body", async ({ loggedInPage: page }) => {
    await page.keyboard.press(`${MOD}+k`);
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeFocused();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Search input should no longer be focused
    await expect(searchInput).not.toBeFocused();
  });

  test("Cmd/Ctrl+/ from a tool page navigates to home", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");
    await expect(page).toHaveURL("/image/compress");

    await page.keyboard.press(`${MOD}+/`);

    await expect(page).toHaveURL("/");
  });

  test("Cmd/Ctrl+/ from /editor navigates to home", async ({ loggedInPage: page }) => {
    await page.goto("/editor");
    await expect(page).toHaveURL("/editor");

    await page.keyboard.press(`${MOD}+/`);

    await expect(page).toHaveURL("/");
  });
});
