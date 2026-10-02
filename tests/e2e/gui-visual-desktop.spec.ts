import { errors } from "@playwright/test";
import { expect, expectNoPinnedSection, openSettings, test, uploadTestImage } from "./helpers";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

// ---------------------------------------------------------------------------
// Helper: fail unless the page is showing the given theme. The app marks dark
// mode with a `dark` class on <html> and nothing else, so that class is the
// only reliable signal. Call it right before every themed screenshot: without
// it a theme switch that silently did nothing gets screenshotted as the other
// theme, and a freshly written baseline stores the wrong theme for good.
// ---------------------------------------------------------------------------
async function expectTheme(
  page: import("@playwright/test").Page,
  theme: "light" | "dark",
  detail?: string,
) {
  const html = page.locator("html");
  const base =
    theme === "dark"
      ? "expected the dark theme (html.dark), but the page is still light, so a dark screenshot would capture the light theme"
      : "expected the light theme (no html.dark), but the page is still dark, so a light screenshot would capture the dark theme";
  const message = detail ? `${base} (${detail})` : base;
  if (theme === "dark") {
    await expect(html, message).toHaveClass(/\bdark\b/);
  } else {
    await expect(html, message).not.toHaveClass(/\bdark\b/);
  }
}

// ---------------------------------------------------------------------------
// Helper: toggle theme, check it applied, and wait for CSS transition to settle
// ---------------------------------------------------------------------------
async function setTheme(page: import("@playwright/test").Page, theme: "light" | "dark") {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  const wantDark = theme === "dark";
  let detail: string | undefined;
  if (isDark !== wantDark) {
    // The toggle lives in the top nav. On pages without it (login) or when a
    // dialog overlay covers it (settings, help), the click times out, so fall
    // back to the global mod+shift+d shortcut. Any other click error is a real
    // failure and propagates. The app ignores that shortcut while an input,
    // textarea, or select has focus, so the switch can still fail; expectTheme
    // below catches that and names what had focus.
    const clicked = await page
      .locator("button[title='Toggle theme']")
      .click({ timeout: 1000 })
      .then(() => true)
      .catch((err: unknown) => {
        if (err instanceof errors.TimeoutError) return false;
        throw err;
      });
    if (clicked) {
      detail = "switched with the nav toggle";
    } else {
      const focused = await page.evaluate(
        () => document.activeElement?.tagName.toLowerCase() ?? "nothing",
      );
      await page.keyboard.press(`${MOD}+Shift+d`);
      detail = `toggle not clickable, pressed ${MOD}+Shift+D with focus on <${focused}>`;
    }
    await page.waitForTimeout(300);
  }
  await expectTheme(page, theme, detail);
}

// ---------------------------------------------------------------------------
// Helper: the login hero's rotating phrase changes every 3s on a timer, so
// whichever phrase (or the blank fade between two) is up when the shot is
// taken depends on timing. Mask it so the login shots compare everything else.
// ---------------------------------------------------------------------------
async function rotatingPhraseMask(page: import("@playwright/test").Page) {
  const phrase = page.getByTestId("login-rotating-phrase");
  await expect(phrase).toBeVisible();
  return [phrase];
}

// ---------------------------------------------------------------------------
// Helper: fail unless `count` images match and every one has decoded. A
// visible <img> can still be blank while its bytes load, and a screenshot of
// that would become the baseline.
// ---------------------------------------------------------------------------
async function expectImagesLoaded(images: import("@playwright/test").Locator, count: number) {
  await expect(images).toHaveCount(count);
  await expect
    .poll(
      () =>
        images.evaluateAll((els) =>
          els.every((el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0),
        ),
      { message: "an image never finished loading", timeout: 10000 },
    )
    .toBe(true);
}

// ---------------------------------------------------------------------------
// Helper: what the QR preview is currently drawing, or null while it's blank.
// qr-code-styling swaps in a fresh, empty canvas on every update and paints it
// a moment later, so a blank canvas means "still drawing", not a result.
// ---------------------------------------------------------------------------
async function qrContent(qrCode: import("@playwright/test").Locator) {
  return qrCode.evaluate((el) => {
    if (!(el instanceof HTMLCanvasElement)) return el.outerHTML;
    const blank = document.createElement("canvas");
    blank.width = el.width;
    blank.height = el.height;
    const drawn = el.toDataURL();
    return drawn === blank.toDataURL() ? null : drawn;
  });
}

// ---------------------------------------------------------------------------
// Helper: wait until the QR preview has finished drawing something other than
// `previous`, and return it. "Finished" means two polls in a row read the same
// non-blank content.
// ---------------------------------------------------------------------------
async function settledQr(
  qrCode: import("@playwright/test").Locator,
  previous: string | null,
  message: string,
) {
  let last: string | null = null;
  let settled: string | null = null;
  await expect
    .poll(
      async () => {
        const now = await qrContent(qrCode);
        const ready = now !== null && now !== previous && now === last;
        last = now;
        if (ready) settled = now;
        return ready;
      },
      { message, timeout: 10000 },
    )
    .toBe(true);
  return settled as string | null;
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
      const mask = await rotatingPhraseMask(page);

      // Light screenshot
      await expectTheme(page, "light");
      await expect(page).toHaveScreenshot("desktop-login-empty-light.png", {
        fullPage: false,
        mask,
      });

      // Toggle to dark via keyboard shortcut (login page may lack footer toggle)
      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(300);
      await expectTheme(page, "dark");

      await expect(page).toHaveScreenshot("desktop-login-empty-dark.png", {
        fullPage: false,
        mask,
      });
    });

    test("login page filled with error - light and dark", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      const mask = await rotatingPhraseMask(page);

      // Fill in invalid credentials and submit
      await page.getByLabel("Username").fill("wronguser");
      await page.getByLabel("Password").fill("wrongpassword");
      await page.getByRole("button", { name: /login/i }).click();

      // Wait for the error message to appear
      await page.waitForTimeout(1000);
      await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible();

      // Light screenshot with error
      await expectTheme(page, "light");
      await expect(page).toHaveScreenshot("desktop-login-error-light.png", {
        fullPage: false,
        mask,
      });

      // Toggle to dark
      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(300);
      await expectTheme(page, "dark");

      await expect(page).toHaveScreenshot("desktop-login-error-dark.png", {
        fullPage: false,
        mask,
      });
    });
  });

  // ---- Home page (empty, no file uploaded) ----
  test("home page empty - light and dark", async ({ loggedInPage: page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await expectNoPinnedSection(page);

    await takeThemedScreenshots(page, "home-empty");
  });

  // ---- Home page (catalog loaded) ----
  test("home page with file uploaded - light and dark", async ({ loggedInPage: page }) => {
    // 2.0 home is a tool catalog with no dropzone or "Quick Actions" panel.
    // Capture the loaded catalog state.
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page.waitForTimeout(500);
    await expectNoPinnedSection(page);

    await takeThemedScreenshots(page, "home-uploaded");
  });

  // ---- Catalog grid (formerly the /fullscreen grid) ----
  test("fullscreen grid details shown - light and dark", async ({ loggedInPage: page }) => {
    // 2.0 removed /fullscreen; the home catalog ("/") is the equivalent grid.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-search-input]")).toBeVisible();
    await page.waitForTimeout(500);
    await expectNoPinnedSection(page);

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
    await expectNoPinnedSection(page);

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
    await expectNoPinnedSection(page);

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

    // Compress doesn't run on upload: the default Target Size mode starts
    // empty with the button disabled. Quality mode has a default, so pick it
    // and run the tool.
    await uploadTestImage(page);
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await page.getByTestId("compress-submit").click();

    // The comparison slider only mounts once the result is back. If it never
    // does, fail here instead of screenshotting the upload state (#1861).
    const slider = page.getByRole("slider", { name: "Before/after comparison slider" });
    await expect(slider).toBeVisible({ timeout: 15000 });
    const sliderImages = slider.locator("img");
    await expectImagesLoaded(sliderImages, 2);
    // Before and after must be different files, or the shot shows the
    // original twice.
    const [beforeSrc, afterSrc] = await sliderImages.evaluateAll((els) =>
      els.map((el) => (el as HTMLImageElement).src),
    );
    expect(afterSrc, "the after image is the original, not the compressed result").not.toBe(
      beforeSrc,
    );
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

    // The crop stage is react-image-crop over a plain <img>, not a canvas.
    // Wait for the image to decode, the selection box to draw, and the info
    // bar to read the original size (set from the image's onLoad).
    const cropImage = page.getByRole("img", { name: "Crop preview" });
    await expect(cropImage).toBeVisible({ timeout: 10000 });
    await expectImagesLoaded(cropImage, 1);
    await expect(page.locator(".ReactCrop__crop-selection")).toBeVisible();
    await expect(page.getByText(/^Original: \d+ x \d+$/)).toBeVisible();
    await page.waitForTimeout(500);

    await takeThemedScreenshots(page, "tool-crop-canvas");
  });

  // ---- Tool page - qr-generate (no-dropzone, QR preview) ----
  test("qr-generate tool with preview - light and dark", async ({ loggedInPage: page }) => {
    await page.goto("/image/qr-generate");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // The preview draws a placeholder QR before any input, so "a QR is
    // visible" proves nothing. Record the finished placeholder, enter the URL,
    // and wait for the preview to finish drawing something else (#1861).
    const qrCode = page.getByTestId("qr-preview").locator("canvas, svg");
    await expect(qrCode).toBeVisible({ timeout: 10000 });
    const placeholder = await settledQr(qrCode, null, "the placeholder QR never finished drawing");

    await page.getByTestId("qr-input-url").fill("https://snapotter.com");
    await expect(page.getByText("Enter content to generate a QR code")).toBeHidden();
    await settledQr(qrCode, placeholder, "the QR preview never redrew for the entered URL");
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
      await expectTheme(page, "light");
      await expect(page).toHaveScreenshot("desktop-privacy-policy-light.png", {
        fullPage: false,
      });

      // Toggle to dark
      await page.keyboard.press(`${MOD}+Shift+d`);
      await page.waitForTimeout(300);
      await expectTheme(page, "dark");

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
    await expectNoPinnedSection(page);

    const search = page.locator("[data-search-input]");

    // Light theme: focus the search bar via its keyboard shortcut
    await setTheme(page, "light");
    await page.keyboard.press(`${MOD}+k`);
    await expect(search).toBeFocused();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("desktop-home-search-focused-light.png", {
      fullPage: false,
    });

    // Dark theme: setTheme clicks the nav toggle, which takes focus, so focus
    // the search bar again after the switch. Without this the dark shot shows
    // the search box unfocused (#1527). The focus ring was under the old 1%
    // pixel tolerance, so the screenshot alone did not notice.
    await setTheme(page, "dark");
    await page.keyboard.press(`${MOD}+k`);
    await expect(search).toBeFocused();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("desktop-home-search-focused-dark.png", {
      fullPage: false,
    });
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
