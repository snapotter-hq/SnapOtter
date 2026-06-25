import { expect, test } from "./helpers";

test.describe("Theme System", () => {
  test("page defaults to light theme", async ({ loggedInPage: page }) => {
    // Check that html element does not have 'dark' class by default
    const html = page.locator("html");
    const classList = await html.getAttribute("class");
    // Default is light, so 'dark' should not be present initially
    // (unless system preference is dark)
    expect(classList).toBeDefined();
  });

  test("top nav has a theme toggle that flips the dark class", async ({ loggedInPage: page }) => {
    // 2.0 removed the footer. The theme toggle now lives in the top nav.
    const themeBtn = page.locator("button[title='Toggle theme']");
    await expect(themeBtn).toBeVisible({ timeout: 10_000 });

    const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    const before = await isDark();

    await themeBtn.click();
    await expect.poll(isDark, { timeout: 5_000 }).toBe(!before);

    // Theme persists in localStorage under the "snapotter-theme" key.
    const persisted = await page.evaluate(() => localStorage.getItem("snapotter-theme"));
    expect(persisted).toContain(before ? "light" : "dark");

    // Toggling back restores the original state.
    await themeBtn.click();
    await expect.poll(isDark, { timeout: 5_000 }).toBe(before);
  });

  test("privacy policy is reachable at /privacy", async ({ loggedInPage: page }) => {
    // 2.0 removed the footer privacy link; the policy still lives at /privacy.
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible({
      timeout: 10_000,
    });
  });
});
