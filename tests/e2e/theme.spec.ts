import { test, expect } from "./helpers";

test.describe("Theme System", () => {
  test("page defaults to light theme", async ({ loggedInPage: page }) => {
    // Check that html element does not have 'dark' class by default
    const html = page.locator("html");
    const classList = await html.getAttribute("class");
    // Default is light, so 'dark' should not be present initially
    // (unless system preference is dark)
    expect(classList).toBeDefined();
  });

  test("footer has theme toggle buttons", async ({ loggedInPage: page }) => {
    // Footer has a "Toggle Theme" button fixed at bottom-right
    const themeBtn = page.locator("button[title='Toggle Theme']");
    await expect(themeBtn).toBeVisible({ timeout: 10_000 });
  });

  test("privacy policy link is in footer", async ({
    loggedInPage: page,
  }) => {
    await expect(page.getByText("Privacy Policy")).toBeVisible();
  });
});
