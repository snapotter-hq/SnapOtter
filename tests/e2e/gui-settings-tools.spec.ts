import { expect, openSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog -- Tools tab (enable/disable) and Usage tab
//
// 2.0 notes:
// - The settings dialog content and the AppLayout <main> both carry the
//   `.flex-1.overflow-y-auto` classes, so scope every query to the dialog via
//   page.getByRole("dialog") rather than that class pair.
// - Tool toggles are role="switch" with aria-label set to the tool name.
// - The old "Product Analytics" tab is now the "Usage" tab (t.settings.nav.usage)
//   and shows local usage statistics; the consent toggle / privacy link are gone.
// ---------------------------------------------------------------------------

test.describe("GUI Settings - Tools Tab", () => {
  test("displays tools list with category headings", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();

    await expect(dialog.locator("h3").filter({ hasText: "Tools" }).first()).toBeVisible();
    await expect(dialog.getByText("Enable or disable individual tools")).toBeVisible();

    // At least one category heading should be visible (uppercase text)
    await expect(dialog.locator("h4").first()).toBeVisible();
  });

  test("Save Tool Settings button and disabled tools counter", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();

    await expect(dialog.getByRole("button", { name: /save tool settings/i })).toBeVisible();

    // The disabled tools counter text
    await expect(dialog.getByText(/\d+ tools? disabled/)).toBeVisible();
  });

  test("saving tool settings shows restart banner", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();

    await dialog.getByRole("button", { name: /save tool settings/i }).click();

    await expect(dialog.getByText("Restart required for changes to take effect.")).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("GUI Settings - Tools Tab (additional)", () => {
  test("each category has a heading", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();

    await expect(dialog.locator("h3").filter({ hasText: "Tools" }).first()).toBeVisible();
    // Wait for tools to finish loading
    await expect(dialog.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // Category headings are h4 elements inside the dialog content
    const headings = dialog.locator("h4");
    const count = await headings.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("tools show both name and description", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();

    // Wait for tools to load
    await expect(dialog.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // The Resize tool is listed with its name (toggle aria-label) and description
    await expect(dialog.getByRole("switch", { name: "Resize Image", exact: true })).toBeVisible();
    await expect(
      dialog.getByText("Resize by pixels, percentage, or social media presets"),
    ).toBeVisible();
  });
});

test.describe("GUI Settings - Tools Tab (toggle visibility)", () => {
  test("disabling a tool and saving hides it from the catalog and tool page", async ({
    loggedInPage: page,
  }) => {
    // Open settings and disable the Resize tool
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();
    await expect(dialog.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // The toggle is a role="switch" labelled with the tool name; aria-checked
    // is true when the tool is enabled. Make sure Resize starts enabled, then
    // disable it, asserting each flip so the post-toggle state is flushed before
    // saving (saveToolSettings persists the current disabledTools state).
    const resizeSwitch = dialog.getByRole("switch", { name: "Resize Image", exact: true });
    await expect(resizeSwitch).toBeVisible();
    if ((await resizeSwitch.getAttribute("aria-checked")) === "false") {
      await resizeSwitch.click();
      await expect(resizeSwitch).toHaveAttribute("aria-checked", "true");
    }
    await resizeSwitch.click();
    await expect(resizeSwitch).toHaveAttribute("aria-checked", "false");

    // Save tool settings
    await dialog.getByRole("button", { name: /save tool settings/i }).click();
    await expect(dialog.getByText("Restart required for changes to take effect.")).toBeVisible({
      timeout: 5_000,
    });

    // Close settings and reload so the catalog re-reads the disabled-tool list.
    await page.keyboard.press("Escape");
    await page.goto("/");

    // Search is the deterministic way to probe the catalog (sections collapse,
    // so a tool card may be absent from the DOM even when enabled). A disabled
    // tool is filtered out of the searchable set, so searching for it yields no
    // resize card while a sibling search still resolves.
    const searchInput = page.locator("[data-search-input]");
    await searchInput.fill("Resize");
    await expect(page.locator('a[href="/image/resize"]')).toHaveCount(0, { timeout: 5_000 });
    await searchInput.fill("Crop");
    await expect(page.locator('a[href="/image/crop"]').first()).toBeVisible({ timeout: 5_000 });

    // The tool page itself shows the disabled message.
    await page.goto("/image/resize");
    await expect(page.getByText("This tool has been disabled by your administrator")).toBeVisible({
      timeout: 5_000,
    });

    // Re-enable the tool to clean up.
    await page.goto("/");
    await openSettings(page);
    const dialog2 = page.getByRole("dialog");
    await dialog2.getByRole("button", { name: /tools/i }).click();
    await expect(dialog2.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });
    const resizeSwitch2 = dialog2.getByRole("switch", { name: "Resize Image", exact: true });
    if ((await resizeSwitch2.getAttribute("aria-checked")) === "false") {
      await resizeSwitch2.click();
    }
    await dialog2.getByRole("button", { name: /save tool settings/i }).click();
    await page.waitForTimeout(500);
  });

  test("toggling a tool off and saving, then on again restores it", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();
    await expect(dialog.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // Read the initial disabled count
    const counterText = dialog.getByText(/\d+ tools? disabled/);
    const initialText = await counterText.textContent();
    const initialCount = parseInt(initialText?.match(/(\d+)/)?.[1] || "0", 10);

    // Toggle the first tool off (if it is currently enabled)
    const firstSwitch = dialog.getByRole("switch").first();
    const wasEnabled = (await firstSwitch.getAttribute("aria-checked")) === "true";

    if (wasEnabled) {
      await firstSwitch.click();
      // Counter should increase by 1
      const afterText = await counterText.textContent();
      const afterCount = parseInt(afterText?.match(/(\d+)/)?.[1] || "0", 10);
      expect(afterCount).toBe(initialCount + 1);

      // Toggle it back on
      await firstSwitch.click();
      const restoredText = await counterText.textContent();
      const restoredCount = parseInt(restoredText?.match(/(\d+)/)?.[1] || "0", 10);
      expect(restoredCount).toBe(initialCount);
    }
  });

  test("tool toggle state persists after saving and re-opening dialog", async ({
    loggedInPage: page,
  }) => {
    await openSettings(page);
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();
    await expect(dialog.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // Read the initial disabled count
    const initialText = await dialog.getByText(/\d+ tools? disabled/).textContent();
    const initialCount = parseInt(initialText?.match(/(\d+)/)?.[1] || "0", 10);

    // Toggle the first tool to change state
    await dialog.getByRole("switch").first().click();

    // Save
    await dialog.getByRole("button", { name: /save tool settings/i }).click();
    await expect(dialog.getByText("Restart required for changes to take effect.")).toBeVisible({
      timeout: 5_000,
    });

    // Close and re-open
    await page.keyboard.press("Escape");
    await openSettings(page);
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();
    await expect(dialog.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // The count should reflect the saved change
    const afterReopen = await dialog.getByText(/\d+ tools? disabled/).textContent();
    const afterCount = parseInt(afterReopen?.match(/(\d+)/)?.[1] || "0", 10);
    expect(Math.abs(afterCount - initialCount)).toBe(1);

    // Revert: toggle the first tool back and save
    await dialog.getByRole("switch").first().click();
    await dialog.getByRole("button", { name: /save tool settings/i }).click();
    await page.waitForTimeout(500);
  });

  test("toggling all tools in a category", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /tools/i }).click();
    await expect(dialog.getByText(/\d+ tools? disabled/)).toBeVisible({ timeout: 5_000 });

    // 2.0 has no bulk "Enable All" / "Disable All" controls. Each tool is an
    // individual role="switch". Verify a tool can be toggled and the counter
    // reacts, then revert.
    const counter = dialog.getByText(/\d+ tools? disabled/);
    const initialCount = parseInt((await counter.textContent())?.match(/(\d+)/)?.[1] || "0", 10);

    const firstSwitch = dialog.getByRole("switch").first();
    const wasEnabled = (await firstSwitch.getAttribute("aria-checked")) === "true";
    await firstSwitch.click();

    const toggledCount = parseInt((await counter.textContent())?.match(/(\d+)/)?.[1] || "0", 10);
    expect(toggledCount).toBe(wasEnabled ? initialCount + 1 : initialCount - 1);

    // Revert without saving so we leave no residue on the shared DB.
    await firstSwitch.click();
    const revertedCount = parseInt((await counter.textContent())?.match(/(\d+)/)?.[1] || "0", 10);
    expect(revertedCount).toBe(initialCount);
  });
});

test.describe("GUI Settings - Usage Tab", () => {
  test("displays usage section heading and description", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /usage/i }).click();

    await expect(dialog.locator("h3").filter({ hasText: "Usage" }).first()).toBeVisible();
    await expect(
      dialog.getByText("Local usage statistics from jobs and file storage."),
    ).toBeVisible();
  });

  test("shows the time period selector", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /usage/i }).click();

    // The period selector is always rendered (outside the loading branch).
    await expect(dialog.getByRole("button", { name: "7 days" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "30 days" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "90 days" })).toBeVisible();
  });

  test("switching the period updates the active selection", async ({ loggedInPage: page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /usage/i }).click();

    // 30 days is the default; switching to 7 days marks that pill active
    // (active pills carry the primary background).
    const sevenDays = dialog.getByRole("button", { name: "7 days" });
    await sevenDays.click();
    await expect(sevenDays).toHaveClass(/bg-primary/);
  });
});
