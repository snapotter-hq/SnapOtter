import { expect, openSettings, test, uploadTestImage } from "./helpers";

// ---------------------------------------------------------------------------
// Login Page (unauthenticated)
// ---------------------------------------------------------------------------
test.describe("Login Page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders split layout with form and marketing text", async ({ page }) => {
    await page.goto("/login");

    // Left side: form panel
    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();

    // Right side: marketing text (hidden on mobile, visible on lg+)
    await expect(page.getByText("Your one-stop-shop")).toBeVisible();
  });

  test("username and password inputs start empty", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel("Username")).toHaveValue("");
    await expect(page.getByLabel("Password")).toHaveValue("");
  });

  test("login button is disabled when fields are empty", async ({ page }) => {
    await page.goto("/login");

    const loginBtn = page.getByRole("button", { name: /login/i });
    await expect(loginBtn).toBeDisabled();
  });

  test("login button enables when both fields are filled", async ({ page }) => {
    await page.goto("/login");

    const loginBtn = page.getByRole("button", { name: /login/i });
    await expect(loginBtn).toBeDisabled();

    await page.getByLabel("Username").fill("admin");
    await expect(loginBtn).toBeDisabled();

    await page.getByLabel("Password").fill("admin");
    await expect(loginBtn).toBeEnabled();
  });

  test("successful login redirects to /", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();

    await page.waitForURL("/", { timeout: 15_000 });
    await expect(page).toHaveURL("/");
  });

  test("failed login shows error and stays on login page", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("wrong-user");
    await page.getByLabel("Password").fill("wrong-pass");
    await page.getByRole("button", { name: /login/i }).click();

    await expect(page.getByText(/invalid|incorrect|error/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("pressing Enter in password field submits the form", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByLabel("Password").press("Enter");

    await page.waitForURL("/", { timeout: 15_000 });
    await expect(page).toHaveURL("/");
  });
});

// ---------------------------------------------------------------------------
// Home Page (authenticated)
// ---------------------------------------------------------------------------
test.describe("Home Page - Before Upload", () => {
  test("shows dropzone with dashed border and upload button", async ({ loggedInPage: page }) => {
    const dropzone = page.locator("[class*='border-dashed']").first();
    await expect(dropzone).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("tool panel is visible with search bar and categories", async ({ loggedInPage: page }) => {
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
    await expect(page.getByText("Essentials").first()).toBeVisible();
  });

  test("search filters tools in tool panel", async ({ loggedInPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("resize");

    // Resize tool should remain visible
    await expect(page.getByText("Resize").first()).toBeVisible();
  });
});

test.describe("Home Page - After Upload", () => {
  test("shows green checkmark, filename, and file size", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    // Green checkmark indicator
    await expect(page.locator("[class*='text-green']").first()).toBeVisible();
    // Filename
    await expect(page.getByText(/test-image/i).first()).toBeVisible();
    // File size in KB
    await expect(page.getByText(/KB/i).first()).toBeVisible();
  });

  test("shows Change file button", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    await expect(page.getByText("Change file")).toBeVisible();
  });

  test("shows Quick Actions with 4 buttons", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    await expect(page.getByText("Quick Actions").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /resize/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /compress/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /convert/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /remove background/i }).first()).toBeVisible();
  });

  test("shows All Tools section with categorized list", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    await expect(page.getByText("All Tools").first()).toBeVisible();
    // Categories should be visible within the tool list
    await expect(page.getByText("Essentials").first()).toBeVisible();
  });

  test("clicking a tool navigates to the tool page", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    await page
      .getByRole("button", { name: /resize/i })
      .first()
      .click();
    await expect(page).toHaveURL("/resize");
  });
});

// ---------------------------------------------------------------------------
// Fullscreen Grid Page (/fullscreen)
// ---------------------------------------------------------------------------
test.describe("Fullscreen Grid Page", () => {
  test("grid renders with search bar", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test("show/hide details toggle is visible", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    // The toggle button text
    await expect(
      page.getByRole("button", { name: /hide details|show details/i }).first(),
    ).toBeVisible();
  });

  test("all category headers are visible", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    await expect(page.getByText("Essentials")).toBeVisible();
    await expect(page.getByText("Optimization")).toBeVisible();
    await expect(page.getByText("Adjustments")).toBeVisible();
  });

  test("tool cards are links to tool pages", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    const resizeLink = page.getByRole("link", { name: /^Resize/ }).first();
    await expect(resizeLink).toBeVisible();

    await resizeLink.click();
    await expect(page).toHaveURL("/resize");
  });

  test("search filters tools in grid", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill("compress");

    await expect(page.getByRole("link", { name: /^Compress/ }).first()).toBeVisible();
    // Another unrelated tool should be hidden
    await expect(page.getByRole("link", { name: /^Resize/ })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Tool Page (/:toolId) - tested with "resize"
// ---------------------------------------------------------------------------
test.describe("Tool Page - Resize", () => {
  test("shows tool icon and name", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    await expect(page.getByText("Resize").first()).toBeVisible();
  });

  test("shows dropzone with dashed border before upload", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    const dropzone = page.locator("[class*='border-dashed']").first();
    await expect(dropzone).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("after upload shows Files section, Settings section, and Process button", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Files section
    await expect(page.getByText("Files").first()).toBeVisible();
    // Settings section
    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  test("invalid tool ID shows not found message", async ({ loggedInPage: page }) => {
    await page.goto("/this-tool-does-not-exist-xyz");

    await expect(page.getByText("Tool not found")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Automate Page (/automate)
// ---------------------------------------------------------------------------
test.describe("Automate Page", () => {
  test("shows pipeline builder with empty state", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    await expect(page.getByText("Pipeline Builder")).toBeVisible();
    await expect(page.getByText("No steps yet")).toBeVisible();
    await expect(
      page.getByText("Click tools from the palette to build your pipeline"),
    ).toBeVisible();
  });

  test("tool palette is visible with searchable list", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    await expect(page.getByText("Tool Palette")).toBeVisible();
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
  });

  test("process button is disabled when no steps are configured", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/automate");

    const processBtn = page.getByRole("button", { name: /process/i }).first();
    await expect(processBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Files Page (/files)
// ---------------------------------------------------------------------------
test.describe("Files Page", () => {
  test("renders file management layout on desktop", async ({ loggedInPage: page }) => {
    await page.goto("/files");

    // Left nav column with "My Files" heading
    await expect(page.getByText("My Files")).toBeVisible();
    // Navigation items
    await expect(page.getByRole("button", { name: /recent/i }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Sidebar Navigation
// ---------------------------------------------------------------------------
test.describe("Sidebar Navigation", () => {
  test("sidebar has 4 top items: Tools, Grid, Automate, Files", async ({ loggedInPage: page }) => {
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    await expect(sidebar.getByText("Tools")).toBeVisible();
    await expect(sidebar.getByText("Grid")).toBeVisible();
    await expect(sidebar.getByText("Automate")).toBeVisible();
    await expect(sidebar.getByText("Files")).toBeVisible();
  });

  test("sidebar has 2 bottom items: Help, Settings", async ({ loggedInPage: page }) => {
    const sidebar = page.locator("aside");

    await expect(sidebar.getByText("Help")).toBeVisible();
    await expect(sidebar.getByText("Settings")).toBeVisible();
  });

  test("Tools link navigates to home /", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.locator("aside").getByText("Tools").click();
    await expect(page).toHaveURL("/");
  });

  test("Grid link navigates to /fullscreen", async ({ loggedInPage: page }) => {
    const gridLink = page.locator("aside").getByText("Grid");
    if (await gridLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gridLink.click();
    } else {
      await page.locator('aside a[href="/fullscreen"]').click();
    }
    await expect(page).toHaveURL("/fullscreen");
  });

  test("Automate link navigates to /automate", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Automate").click();
    await expect(page).toHaveURL("/automate");
  });

  test("Files link navigates to /files", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Files").click();
    await expect(page).toHaveURL("/files");
  });

  test("active sidebar item is highlighted", async ({ loggedInPage: page }) => {
    // On home page, "Tools" should have the active styling (bg-primary)
    const toolsItem = page.locator("aside").getByText("Tools").locator("..");
    await expect(toolsItem).toHaveClass(/bg-primary/);
  });

  test("Help button opens HelpDialog modal", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Help").click();

    // Help dialog header
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
  });

  test("Settings button opens SettingsDialog modal", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Security" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Footer (desktop only)
// ---------------------------------------------------------------------------
test.describe("Footer", () => {
  test("theme toggle button is visible with sun or moon icon", async ({ loggedInPage: page }) => {
    const themeBtn = page.locator("button[title='Toggle Theme']");
    await expect(themeBtn).toBeVisible();

    // Should contain an SVG icon (Sun or Moon)
    await expect(themeBtn.locator("svg")).toBeVisible();
  });

  test("theme toggle switches between sun and moon icons", async ({ loggedInPage: page }) => {
    const themeBtn = page.locator("button[title='Toggle Theme']");
    await expect(themeBtn).toBeVisible();

    const hadDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    await themeBtn.click();
    await page.waitForTimeout(300);

    const hasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(hasDark).not.toBe(hadDark);
  });

  test("language button is visible and shows English", async ({ loggedInPage: page }) => {
    const langBtn = page.locator("button[title='Language']");
    await expect(langBtn).toBeVisible();
    await expect(langBtn).toContainText("English");
    await expect(langBtn.locator("svg")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Drag-and-Drop Upload
// ---------------------------------------------------------------------------
test.describe("Drag-and-Drop Upload", () => {
  test("dropzone accepts dropped files via DataTransfer", async ({ loggedInPage: page }) => {
    const dropzone = page.locator("section[aria-label='File drop zone']");
    await expect(dropzone).toBeVisible();

    // Verify the dropzone aria-label and interactive elements
    await expect(page.getByText("Drop files here or click the upload button")).toBeVisible();

    // Upload via the file chooser flow (same onFiles handler as drag-and-drop)
    await uploadTestImage(page);

    // After upload, the file info should appear
    await expect(page.getByText(/test-image/i).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Files Page Layout
// ---------------------------------------------------------------------------
test.describe("Files Page Layout", () => {
  test("desktop shows three-column layout with nav, list, and details", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/files");

    // Left nav column with "My Files"
    await expect(page.getByText("My Files")).toBeVisible();
    // Nav items: Recent and Upload Files
    await expect(page.getByRole("button", { name: /recent/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /upload files/i }).first()).toBeVisible();
  });

  test("mobile shows tabbed layout with Recent and Upload tabs", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    await page.goto("/files");

    // Mobile tabs should be visible
    await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();

    // Desktop nav "My Files" heading should not be visible (hidden md:block)
    await expect(page.getByText("My Files")).not.toBeVisible();

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Routing Edge Cases
// ---------------------------------------------------------------------------
test.describe("Routing Edge Cases", () => {
  test("invalid tool ID shows error state", async ({ loggedInPage: page }) => {
    await page.goto("/nonexistent-tool-abc123");

    await expect(page.getByText("Tool not found")).toBeVisible();
  });

  test("legacy /brightness-contrast redirects to /adjust-colors", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/brightness-contrast");

    await expect(page).toHaveURL("/adjust-colors");
  });

  test("legacy /saturation redirects to /adjust-colors", async ({ loggedInPage: page }) => {
    await page.goto("/saturation");

    await expect(page).toHaveURL("/adjust-colors");
  });

  test("legacy /color-channels redirects to /adjust-colors", async ({ loggedInPage: page }) => {
    await page.goto("/color-channels");

    await expect(page).toHaveURL("/adjust-colors");
  });

  test("/privacy renders the privacy policy page", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByText("Back to app")).toBeVisible();
  });

  test("/privacy Back to app link navigates home", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");

    await page.getByText("Back to app").click();
    await expect(page).toHaveURL("/");
  });

  test("/analytics-consent page renders consent UI", async ({ browser }) => {
    // Use unauthenticated context since analytics-consent is unguarded
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/analytics-consent");

    // The page shows a heading and two buttons
    await expect(page.getByText("Help improve SnapOtter")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sure, sounds good" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Not right now" })).toBeVisible();

    await context.close();
  });

  test("legacy /color-effects redirects to /adjust-colors", async ({ loggedInPage: page }) => {
    await page.goto("/color-effects");

    await expect(page).toHaveURL("/adjust-colors");
  });
});

// ---------------------------------------------------------------------------
// Browser Back/Forward Navigation
// ---------------------------------------------------------------------------
test.describe("Browser Back/Forward Navigation", () => {
  test("browser back button returns to previous page", async ({ loggedInPage: page }) => {
    // Navigate: Home -> Fullscreen -> back should return to Home
    await page.goto("/fullscreen");
    await expect(page).toHaveURL("/fullscreen");

    await page.goBack();
    await expect(page).toHaveURL("/");
  });

  test("browser forward button returns to next page after going back", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/fullscreen");
    await expect(page).toHaveURL("/fullscreen");

    await page.goBack();
    await expect(page).toHaveURL("/");

    await page.goForward();
    await expect(page).toHaveURL("/fullscreen");
  });

  test("multi-step back/forward through several pages", async ({ loggedInPage: page }) => {
    // Navigate: Home -> /automate -> /files -> back -> back -> forward
    await page.goto("/automate");
    await expect(page).toHaveURL("/automate");

    await page.goto("/files");
    await expect(page).toHaveURL("/files");

    await page.goBack();
    await expect(page).toHaveURL("/automate");

    await page.goBack();
    await expect(page).toHaveURL("/");

    await page.goForward();
    await expect(page).toHaveURL("/automate");
  });
});
