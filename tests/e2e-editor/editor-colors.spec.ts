import { createNewDocument, expect, test } from "./helpers";

test.describe("Editor Colors", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
  });

  test("foreground and background swatches are visible", async ({ editorPage: page }) => {
    const fgSwatch = page.locator("[data-testid='fg-color-swatch']");
    const bgSwatch = page.locator("[data-testid='bg-color-swatch']");

    await expect(fgSwatch).toBeVisible();
    await expect(bgSwatch).toBeVisible();
  });

  test("click foreground swatch opens color picker", async ({ editorPage: page }) => {
    const fgSwatch = page.locator("[data-testid='fg-color-swatch']");
    await fgSwatch.click();
    await page.waitForTimeout(300);

    const picker = page.locator("[data-testid='color-picker-popover']");
    await expect(picker).toBeVisible();

    // Picker should contain the react-colorful component
    await expect(picker.locator(".react-colorful")).toBeVisible();
  });

  test("click background swatch opens color picker", async ({ editorPage: page }) => {
    const bgSwatch = page.locator("[data-testid='bg-color-swatch']");
    await bgSwatch.click();
    await page.waitForTimeout(300);

    const picker = page.locator("[data-testid='color-picker-popover']");
    await expect(picker).toBeVisible();
  });

  test("D key resets colors to black and white", async ({ editorPage: page }) => {
    // First change the foreground color via hex input
    const hexInput = page.locator("[data-testid='foreground-hex-input']");
    await hexInput.fill("#FF0000");
    await page.waitForTimeout(300);

    // Press D to reset
    // Click canvas area first to ensure no input is focused
    await page
      .locator("canvas")
      .first()
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
    await page.keyboard.press("d");
    await page.waitForTimeout(300);

    // Foreground should be black (#000000)
    const fgSwatch = page.locator("[data-testid='fg-color-swatch']");
    const fgColor = await fgSwatch.evaluate((el) => (el as HTMLElement).style.backgroundColor);
    // rgb(0, 0, 0) is black
    expect(fgColor).toContain("rgb(0, 0, 0)");
  });

  test("swap button exchanges foreground and background", async ({ editorPage: page }) => {
    const swapBtn = page.locator("[data-testid='swap-colors']");
    await expect(swapBtn).toBeVisible();

    // Get initial colors
    const fgBefore = await page
      .locator("[data-testid='fg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);
    const bgBefore = await page
      .locator("[data-testid='bg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);

    await swapBtn.click();
    await page.waitForTimeout(300);

    const fgAfter = await page
      .locator("[data-testid='fg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);
    const bgAfter = await page
      .locator("[data-testid='bg-color-swatch']")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);

    expect(fgAfter).toBe(bgBefore);
    expect(bgAfter).toBe(fgBefore);
  });

  test("color picker has hex, rgb, and hsl mode tabs", async ({ editorPage: page }) => {
    // Open the color picker
    await page.locator("[data-testid='fg-color-swatch']").click();
    await page.waitForTimeout(300);

    const picker = page.locator("[data-testid='color-picker-popover']");
    // Input-mode tabs are buttons; scope to the button role so the "HEX" input
    // label (a separate <span>) does not collide with the "hex" tab.
    await expect(picker.getByRole("button", { name: /^hex$/i })).toBeVisible();
    await expect(picker.getByRole("button", { name: /^rgb$/i })).toBeVisible();
    await expect(picker.getByRole("button", { name: /^hsl$/i })).toBeVisible();
  });
});
