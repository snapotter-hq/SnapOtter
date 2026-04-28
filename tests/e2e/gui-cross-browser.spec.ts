import { expect, type Page } from "@playwright/test";
import { getTestImagePath, test } from "./helpers";

// ---------------------------------------------------------------------------
// Cross-browser smoke tests -- critical flows validated on Chromium.
// To add Firefox/WebKit, configure additional projects in playwright.config.ts.
// ---------------------------------------------------------------------------

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function uploadImage(page: Page) {
  const testImagePath = getTestImagePath();
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(testImagePath);
  await page.waitForTimeout(500);
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (text.includes("favicon") || text.includes("analytics")) return;
      errors.push(text);
    }
  });
  return errors;
}

test.describe("Cross-browser smoke tests", () => {
  test("login flow: fill form, submit, verify redirect", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);
    await expect(page).toHaveURL("/");
    expect(errors).toHaveLength(0);
  });

  test("home page file upload: upload image, verify preview", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForLoadState("networkidle");

    await uploadImage(page);

    await expect(page.locator("[class*='text-green']").first()).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("theme toggle: click toggle, verify theme changes", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForLoadState("networkidle");

    const hadDarkBefore = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    const themeBtn = page.locator("button[title='Toggle Theme']");
    await expect(themeBtn).toBeVisible({ timeout: 10_000 });
    await themeBtn.click();
    await page.waitForTimeout(300);

    const hasDarkAfter = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    expect(hasDarkAfter).not.toBe(hadDarkBefore);

    expect(errors).toHaveLength(0);
  });

  test("settings dialog: open, switch tabs, close", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForLoadState("networkidle");

    await page.locator("aside").getByText("Settings").click();
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();

    await page.getByRole("button", { name: "About" }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/about/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Security" }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/security/i).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await expect(page.getByRole("heading", { name: "General" })).not.toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("keyboard shortcut: Cmd/Ctrl+K focuses search bar", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    await page.keyboard.press(`${MOD}+k`);

    await expect(searchInput).toBeFocused();

    expect(errors).toHaveLength(0);
  });
});
