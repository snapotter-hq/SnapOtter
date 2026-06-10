import { expect, test } from "./helpers";

test.describe("Smoke tests", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
    // Right panel marketing text
    await expect(page.getByText("Your images. Stay yours.")).toBeVisible();
  });

  test("can log in with admin credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();

    // Login does window.location.href = "/" (full page reload)
    await page.waitForURL("/", { timeout: 15_000 });
    await expect(page).toHaveURL("/");
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("wrong");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: /login/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible();
    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("login button is disabled when fields are empty", async ({ page }) => {
    await page.goto("/login");

    const loginBtn = page.getByRole("button", { name: /login/i });
    await expect(loginBtn).toBeDisabled();

    // Fill only username
    await page.getByLabel("Username").fill("admin");
    await expect(loginBtn).toBeDisabled();

    // Fill password too
    await page.getByLabel("Password").fill("admin");
    await expect(loginBtn).toBeEnabled();
  });

  test("unauthenticated user is redirected to login", async ({ browser }) => {
    // Use a fresh context without storageState to test unauthenticated access
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("home page loads after login", async ({ loggedInPage: page }) => {
    await expect(page).toHaveURL("/");

    // The dropzone should be visible
    await expect(page.getByText("Upload from computer")).toBeVisible();
    await expect(page.getByText("Drop your images here")).toBeVisible();
  });

  test("sidebar is visible on desktop", async ({ loggedInPage: page }) => {
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Check sidebar labels
    await expect(sidebar.getByText("Tools")).toBeVisible();
    await expect(sidebar.getByText("Grid")).toBeVisible();
    await expect(sidebar.getByText("Automate")).toBeVisible();
    await expect(sidebar.getByText("Files")).toBeVisible();
    await expect(sidebar.getByText("Help")).toBeVisible();
    await expect(sidebar.getByText("Settings")).toBeVisible();
  });
});
