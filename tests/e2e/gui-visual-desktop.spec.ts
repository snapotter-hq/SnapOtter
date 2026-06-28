import { expect, openSettings, test, uploadTestImage } from "./helpers";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

// ---------------------------------------------------------------------------
// Helper: toggle theme and wait for CSS transition to settle
// ---------------------------------------------------------------------------
async function setTheme(page: import("@playwright/test").Page, theme: "light" | "dark") {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  const wantDark = theme === "dark";
  if (isDark !== wantDark) {
    // The toggle lives in the top nav. On pages without it (login) or when a
    // dialog overlay covers it (settings, help), the click is not actionable,
    // so fall back to the global mod+shift+d shortcut.
    const clicked = await page
      .locator("button[title='Toggle theme']")
      .click({ timeout: 1000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) {
      await page.keyboard.press(`${MOD}+Shift+d`);
    }
    await page.waitForTimeout(300);
  }
}

// ---------------------------------------------------------------------------
// Helper: take a themed screenshot pair (light + dark) for a given page state
// ---------------------------------------------------------------------------
async function takeThemedScreenshots(
  page: import("@playwright/test").Page,
  baseName: string,
  target?: import("@playwright/test").Locator,
) {
  // When a target locator is given (e.g. the settings dialog), screenshot just
  // that element so the live page behind a modal -- whose catalog/collapse state
  // varies between runs -- does not make the comparison flaky. fullPage only
  // applies to a full-page screenshot.
  const subject = target ?? page;
  const opts = target ? {} : { fullPage: false };

  // Light theme
  await setTheme(page, "light");
  await expect(subject).toHaveScreenshot(`desktop-${baseName}-light.png`, opts);

  // Dark theme
  await setTheme(page, "dark");
  await expect(subject).toHaveScreenshot(`desktop-${baseName}-dark.png`, opts);

  // Reset to light for next test
  await setTheme(page, "light");
}

// ---------------------------------------------------------------------------
// Desktop visual regression: 1280x720
// ---------------------------------------------------------------------------
test.describe("Visual Desktop (1280x720)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  // ---- Login page (unauthenticated) ----
  test.describe("Login page", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("login page empty form - light and dark", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Light screenshot
      await expect(page).toHaveScreenshot("desktop-login-empty-light.png", {
        fullPage: false,
      });

      // Toggle to dark via keyboard shortcut (login page may lack footer toggle)
      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot("desktop-login-empty-dark.png", {
        fullPage: false,
      });
    });

    test("login page filled with error - light and dark", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Fill in invalid credentials and submit
      await page.getByLabel("Username").fill("wronguser");
      await page.getByLabel("Password").fill("wrongpassword");
      await page.getByRole("button", { name: /login/i }).click();

      // Wait for the error message to appear
      await page.waitForTimeout(1000);
      await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible();

      // Light screenshot with error
      await expect(page).toHaveScreenshot("desktop-login-error-light.png", {
        fullPage: false,
      });

      // Toggle to dark
      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot("desktop-login-error-dark.png", {
        fullPage: false,
      });
    });
  });

  // ---- Home page (empty, no file uploaded) ----
  test("home page empty - light and dark", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "home-empty");
  });

  // ---- Home page (catalog loaded) ----
  test("home page with file uploaded - light and dark", async ({ loggedInPage: page }) => {
    // 2.0 home is a tool catalog with no dropzone or "Quick Actions" panel.
    // Capture the loaded catalog state.
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "home-uploaded");
  });

  // ---- Catalog grid (formerly the /fullscreen grid) ----
  test("fullscreen grid details shown - light and dark", async ({ loggedInPage: page }) => {
    // 2.0 removed /fullscreen; the home catalog ("/") is the equivalent grid.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "fullscreen-details-shown");
  });

  // ---- Catalog grid, Image tab selected ----
  test("fullscreen grid details hidden - light and dark", async ({ loggedInPage: page }) => {
    // The 1.x "hide details" toggle no longer exists. Capture the catalog
    // narrowed to a single modality tab so this stays a distinct view.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page
      .getByRole("button", { name: /^Image\s/ })
      .first()
      .click();
    await page.waitForTimeout(300);

    await takeThemedScreenshots(page, "fullscreen-details-hidden");
  });

  // ---- Automate page (empty pipeline) ----
  test("automate page empty pipeline - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(page.getByText("Pipeline Builder")).toBeVisible();

    await takeThemedScreenshots(page, "automate-empty");
  });

  // ---- Automate page (3 steps added + file uploaded) ----
  test("automate page with 3 steps and file - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Add 3 pipeline steps by clicking tool buttons
    const resizeBtn = page.getByRole("button", { name: /resize/i }).first();
    const compressBtn = page.getByRole("button", { name: /compress/i }).first();
    const convertBtn = page.getByRole("button", { name: /convert/i }).first();

    await resizeBtn.click();
    await page.waitForTimeout(300);
    await compressBtn.click();
    await page.waitForTimeout(300);
    await convertBtn.click();
    await page.waitForTimeout(300);

    // Upload a file to the pipeline
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "automate-3steps-file");
  });

  // ---- Files page (empty) ----
  test("files page empty - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/files");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "files-empty");
  });

  // ---- Settings dialog - General tab ----
  test("settings dialog general tab - light and dark", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "settings-general", page.getByRole("dialog"));
  });

  // ---- Settings dialog - People tab ----
  test("settings dialog people tab - light and dark", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Navigate to People tab
    await page.getByRole("button", { name: "People" }).click();
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "settings-people", page.getByRole("dialog"));
  });

  // ---- Settings dialog - About tab ----
  test("settings dialog about tab - light and dark", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Navigate to About tab
    await page.getByRole("button", { name: "About" }).click();
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "settings-about", page.getByRole("dialog"));
  });

  // ---- Help dialog ----
  test("help dialog - light and dark", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // 2.0 moved Help to the top nav bar (the sidebar was removed).
    await page.getByRole("button", { name: "Help", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "help-dialog");
  });

  // ---- Tool page - resize (empty, no file) ----
  test("resize tool empty - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-resize-empty");
  });

  // ---- Tool page - resize (file uploaded, settings visible) ----
  test("resize tool with file - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    // Verify settings panel appeared
    await expect(page.getByText("Settings").first()).toBeVisible();

    await takeThemedScreenshots(page, "tool-resize-settings");
  });

  // ---- Tool page - compress (before-after result) ----
  test("compress tool before-after result - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");

    // Upload image and wait for auto-processing
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Wait for the before-after slider to appear (indicates processing complete)
    const slider = page.locator("[class*='before-after'], [class*='BeforeAfter']").first();
    await slider.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-compress-result");
  });

  // ---- Tool page - crop (interactive canvas) ----
  test("crop tool interactive canvas - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/crop");
    await page.waitForLoadState("networkidle");

    // Upload image to get the interactive crop canvas
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Wait for the crop canvas to render
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-crop-canvas");
  });

  // ---- Tool page - qr-generate (no-dropzone, QR preview) ----
  test("qr-generate tool with preview - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // QR generate is a no-dropzone tool; enter text to generate a QR code
    const textInput = page.getByTestId("qr-input-url");
    await textInput.fill("https://snapotter.com");
    await page.waitForTimeout(1000);

    // Wait for QR preview to render
    const preview = page.locator("img, canvas, svg").first();
    await preview.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-qr-generate-preview");
  });

  // ---- Tool page - collage (template selection) ----
  test("collage tool template selection - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/collage");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Collage is a no-dropzone tool with template selection UI
    await takeThemedScreenshots(page, "tool-collage-templates");
  });

  // ---- Change password page ----
  test("change password page - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/change-password");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "change-password");
  });

  // ---- Privacy policy page ----
  test.describe("Privacy policy page", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("privacy policy page - light and dark", async ({ page }) => {
      await page.goto("/privacy");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Light screenshot
      await expect(page).toHaveScreenshot("desktop-privacy-policy-light.png", {
        fullPage: false,
      });

      // Toggle to dark
      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot("desktop-privacy-policy-dark.png", {
        fullPage: false,
      });
    });
  });

  // ---- 404 Not Found page ----
  test("not found page - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/this-route-does-not-exist-404");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "not-found");
  });

  // ---- Editor page (welcome/empty state) ----
  test("editor page welcome state - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/editor");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "editor-welcome");
  });

  // ---- Tool page - convert (empty state) ----
  test("convert tool empty - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/convert");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-convert-empty");
  });

  // ---- Tool page - convert (file uploaded, format selection visible) ----
  test("convert tool with file - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/convert");
    await uploadTestImage(page);
    await page.waitForTimeout(500);

    await expect(page.getByText("Settings").first()).toBeVisible();

    await takeThemedScreenshots(page, "tool-convert-settings");
  });

  // ---- Tool page - watermark-text (before-after mode) ----
  test("watermark-text tool empty - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/watermark-text");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-watermark-text-empty");
  });

  // ---- Tool page - border (live-preview mode) ----
  test("border tool empty - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/border");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-border-empty");
  });

  // ---- Settings dialog - Security tab ----
  test("settings dialog security tab - light and dark", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Navigate to Security tab
    await page.getByRole("button", { name: "Security" }).click();
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "settings-security", page.getByRole("dialog"));
  });

  // ---- Top nav bar (formerly the desktop sidebar) ----
  test("sidebar expanded state - light and dark", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // 2.0 removed the desktop sidebar; the top nav <header> banner is the
    // equivalent navigation chrome.
    const nav = page.getByRole("banner");
    await expect(nav).toBeVisible();

    await setTheme(page, "light");
    await expect(nav).toHaveScreenshot("desktop-sidebar-expanded-light.png");

    await setTheme(page, "dark");
    await expect(nav).toHaveScreenshot("desktop-sidebar-expanded-dark.png");

    await setTheme(page, "light");
  });

  // ---- Home page with search focused ----
  test("home page search focused - light and dark", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Focus search bar via keyboard shortcut
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForTimeout(300);

    await takeThemedScreenshots(page, "home-search-focused");
  });

  // ---- Tool page - strip-metadata (no-comparison mode) ----
  test("strip-metadata tool empty - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/strip-metadata");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-strip-metadata-empty");
  });

  // ---- Tool page - info (before-after mode) ----
  test("info tool empty - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/info");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-info-empty");
  });
});
