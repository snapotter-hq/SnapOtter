import { expect, test } from "./helpers";

test.describe("Smoke tests", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
    // Right panel marketing text (en.ts auth.heroTitle)
    await expect(page.getByText("Your files. Stay yours.")).toBeVisible();
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

    // The home page shows a tool grid with modality tabs (home-page.tsx). Tab
    // buttons render label + count span, so match on the label prefix.
    await expect(page.getByRole("button", { name: /^All/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Image/ }).first()).toBeVisible();
  });

  test("top nav is visible on desktop", async ({ loggedInPage: page }) => {
    // 2.0 uses a top nav bar (top-nav.tsx) instead of an aside sidebar
    const nav = page.getByRole("navigation", { name: "Navigation" });
    await expect(nav).toBeVisible();

    // Check nav links (top-nav.tsx useNavLinks: Tools, Automate, Editor, Files)
    await expect(nav.getByText("Tools")).toBeVisible();
    await expect(nav.getByText("Automate")).toBeVisible();
    await expect(nav.getByText("Editor")).toBeVisible();
    await expect(nav.getByText("Files")).toBeVisible();
    // Help is an icon-only button with aria-label (top-nav.tsx:244)
    await expect(page.getByRole("button", { name: "Help" })).toBeVisible();
  });
});
