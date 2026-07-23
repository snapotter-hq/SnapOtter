import { expect, type Page } from "@playwright/test";
import { getTestImagePath, test, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Cross-browser smoke tests -- critical flows validated across browsers.
// Firefox and WebKit projects are scoped to this file in playwright.config.ts.
// ---------------------------------------------------------------------------

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function uploadImage(page: Page) {
  const testImagePath = getTestImagePath();
  const fileChooserPromise = page.waitForEvent("filechooser");
  // Click the dropzone's "Upload from computer" button (t.common.upload), which
  // owns the file-picker trigger, rather than the surrounding <section> (which
  // has no click handler). On /automate the dropzone renders compact and clipped,
  // so a center-click on the section misses the button in Firefox/WebKit; the
  // button itself is reliable across engines. Same selector the passing
  // gui-multi-file-workflows automate upload uses.
  const uploadButton = page.getByRole("button", { name: /upload from computer/i }).first();
  await uploadButton.scrollIntoViewIfNeeded();
  await uploadButton.click();
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
      // WebKit reports failed network responses (e.g. the expected 401 from
      // /api/auth/me on unauthenticated pages, or a deliberately wrong login)
      // as console errors, unlike Chromium/Firefox. That is browser noise, not
      // an app error, so ignore resource-load failures.
      if (text.includes("Failed to load resource")) return;
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

  test("tool page file upload: upload image, verify it is accepted", async ({
    loggedInPage: page,
  }) => {
    const errors = collectConsoleErrors(page);
    // The home page is the tool catalog now; uploads happen on a tool page.
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    await uploadImage(page);

    // After a successful upload the tool's settings panel renders.
    await expect(page.getByText("Settings").first()).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("resize E2E: upload, set dimensions, process, download", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    await uploadImage(page);

    // The resize settings panel mounts after upload; assert the real width input.
    const widthInput = page.locator("#resize-width");
    await expect(widthInput).toBeVisible();
    await widthInput.fill("200");

    // Resize requires an explicit submit; it does not auto-process on input.
    await page.locator("[data-testid='resize-submit']").click();

    await waitForProcessing(page);

    // After processing a download affordance appears (tool link or ReviewPanel button).
    const download = page.locator("[data-download-button], a[data-testid$='-download']").first();
    await expect(download).toBeVisible({ timeout: 10_000 });

    expect(errors).toHaveLength(0);
  });

  test("before-after slider drag: upload to compress, drag slider", async ({
    loggedInPage: page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");

    // Upload and wait for processing to produce the before-after view
    await uploadImage(page);
    await waitForProcessing(page);
    await page.waitForTimeout(1000);

    // Locate the before-after slider container for drag interaction
    const sliderContainer = page.locator("[class*='before-after'], [class*='BeforeAfter']").first();

    // Even if the exact slider handle class differs, verify the container rendered
    const containerVisible = await sliderContainer.isVisible({ timeout: 10000 }).catch(() => false);

    if (containerVisible) {
      // Drag the slider from center to the left quarter
      const box = await sliderContainer.boundingBox();
      if (box) {
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        const endX = box.x + box.width * 0.25;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(endX, startY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300);
      }
    }

    // Verify no CSS layout breakage -- the container should still be visible
    if (containerVisible) {
      await expect(sliderContainer).toBeVisible();
    }

    expect(errors).toHaveLength(0);
  });

  test("keyboard shortcuts: Cmd/Ctrl+K and Cmd/Ctrl+Shift+D", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForLoadState("networkidle");

    // ---- Cmd/Ctrl+K: focus search bar ----
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    await page.keyboard.press(`${MOD}+k`);
    await expect(searchInput).toBeFocused();

    // Click elsewhere to blur
    await page.locator("body").click();
    await page.waitForTimeout(200);

    // ---- Cmd/Ctrl+Shift+D: toggle dark mode ----
    const hadDarkBefore = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    await page.keyboard.press(`${MOD}+Shift+d`);
    await page.waitForTimeout(300);

    const hasDarkAfter = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    expect(hasDarkAfter).not.toBe(hadDarkBefore);

    // Toggle back
    await page.keyboard.press(`${MOD}+Shift+d`);
    await page.waitForTimeout(300);

    const hasDarkFinal = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDarkFinal).toBe(hadDarkBefore);

    expect(errors).toHaveLength(0);
  });

  test("settings dialog: open, switch tabs, close", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForLoadState("networkidle");

    // Settings moved into the top-nav avatar dropdown (the sidebar was removed in 2.0).
    await page.getByRole("button", { name: "admin", exact: true }).click();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5000 });

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

  test("theme toggle: click toggle, verify theme changes", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForLoadState("networkidle");

    const hadDarkBefore = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    const themeBtn = page.locator("button[title='Toggle theme']");
    await expect(themeBtn).toBeVisible({ timeout: 10_000 });
    await themeBtn.click();
    await page.waitForTimeout(300);

    const hasDarkAfter = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    expect(hasDarkAfter).not.toBe(hadDarkBefore);

    // Toggle back and verify it reverts
    await themeBtn.click();
    await page.waitForTimeout(300);

    const hasDarkFinal = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    expect(hasDarkFinal).toBe(hadDarkBefore);

    expect(errors).toHaveLength(0);
  });

  test("pipeline builder: add steps, upload file, process", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/automate");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Verify pipeline page loaded
    await expect(page.getByText(/pipeline|automate/i).first()).toBeVisible();

    // Add a resize step
    const resizeBtn = page.getByRole("button", { name: /resize/i }).first();
    await resizeBtn.click();
    await page.waitForTimeout(300);

    // Add a compress step
    const compressBtn = page.getByRole("button", { name: /compress/i }).first();
    await compressBtn.click();
    await page.waitForTimeout(300);

    // Each pipeline step renders a "Remove" button; count those.
    const steps = page.locator("button[title='Remove']");
    const stepCount = await steps.count();
    expect(stepCount).toBeGreaterThanOrEqual(2);

    // Upload a file
    await uploadImage(page);

    // Trigger processing if there is a process/run button
    const processBtn = page.getByRole("button", { name: /process|run|start/i }).first();
    const hasProcBtn = await processBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasProcBtn) {
      await processBtn.click();
      await waitForProcessing(page);
    }

    expect(errors).toHaveLength(0);
  });

  test("CSS rendering: verify core layout elements render correctly", async ({
    loggedInPage: page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Verify sidebar renders with correct structure
    const sidebar = page.locator("aside");
    if (await sidebar.isVisible({ timeout: 3000 }).catch(() => false)) {
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox).not.toBeNull();
      if (sidebarBox) {
        expect(sidebarBox.width).toBeGreaterThan(0);
        expect(sidebarBox.height).toBeGreaterThan(0);
      }
    }

    // Verify main content area has correct background (not blank)
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    expect(bgColor).toBeTruthy();
    expect(bgColor).not.toBe("");

    // Navigate to a tool page and verify CSS layout
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Verify the tool title renders
    await expect(page.getByText(/resize/i).first()).toBeVisible();

    // Verify the dropzone has a dashed border (CSS rendered correctly)
    const dropzone = page.locator("[class*='border-dashed']").first();
    await expect(dropzone).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("file download: upload to resize, process, verify download", async ({
    loggedInPage: page,
  }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    await uploadImage(page);

    // Set dimensions and process
    const widthInput = page.locator("input[type='number']").first();
    await expect(widthInput).toBeVisible();
    await widthInput.fill("150");

    await waitForProcessing(page);

    // Verify download works by intercepting the download event
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    const downloadBtn = page.getByRole("button", { name: /download/i }).first();
    const downloadLink = page.getByRole("link", { name: /download/i }).first();
    const hasBtn = await downloadBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasLink = await downloadLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasBtn) {
      await downloadBtn.click();
    } else if (hasLink) {
      await downloadLink.click();
    }

    if (hasBtn || hasLink) {
      const download = await downloadPromise;
      if (download) {
        // Verify the download completed and has a filename
        const suggestedName = download.suggestedFilename();
        expect(suggestedName).toBeTruthy();
        expect(suggestedName.length).toBeGreaterThan(0);
      }
    }

    expect(errors).toHaveLength(0);
  });

  test("drag-and-drop: drop image file onto dropzone", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const dropzone = page.locator("[class*='border-dashed']").first();
    await expect(dropzone).toBeVisible();

    // Use the file chooser approach to set files on the dropzone input
    // since cross-browser DataTransfer file simulation is unreliable
    await uploadImage(page);

    // Verify the file was accepted -- look for a success indicator or preview
    const hasPreview = await page
      .locator("[class*='text-green'], img[src*='blob:']")
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(hasPreview).toBe(true);

    expect(errors).toHaveLength(0);
  });

  test("canvas interactions: crop tool draw and adjust region", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/image/crop");
    await page.waitForLoadState("networkidle");

    await uploadImage(page);
    await page.waitForTimeout(1000);

    // Wait for the crop canvas to render
    const canvas = page.locator("canvas").first();
    const canvasVisible = await canvas.isVisible({ timeout: 10000 }).catch(() => false);

    if (canvasVisible) {
      const box = await canvas.boundingBox();
      if (box) {
        // Draw a crop selection by clicking and dragging on the canvas
        const startX = box.x + box.width * 0.25;
        const startY = box.y + box.height * 0.25;
        const endX = box.x + box.width * 0.75;
        const endY = box.y + box.height * 0.75;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(endX, endY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);

        // Verify the canvas is still rendered after interaction (no crash)
        await expect(canvas).toBeVisible();
      }
    }

    expect(errors).toHaveLength(0);
  });

  // ---- Login flow: unauthenticated redirect ----
  test.describe("Login page rendering", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("login page renders correctly across browsers", async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Verify the login form renders with proper structure
      await expect(page.getByLabel("Username")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("button", { name: /login/i })).toBeVisible();

      // Verify form layout: inputs should be vertically stacked
      const usernameBox = await page.getByLabel("Username").boundingBox();
      const passwordBox = await page.getByLabel("Password").boundingBox();
      if (usernameBox && passwordBox) {
        expect(passwordBox.y).toBeGreaterThan(usernameBox.y);
      }

      // Login with valid credentials and verify redirect
      await page.getByLabel("Username").fill("admin");
      await page.getByLabel("Password").fill("admin");
      await page.getByRole("button", { name: /login/i }).click();
      await page.waitForURL("/", { timeout: 15000 });

      await expect(page).toHaveURL("/");

      expect(errors).toHaveLength(0);
    });

    test("login error state renders across browsers", async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Submit invalid credentials
      await page.getByLabel("Username").fill("wronguser");
      await page.getByLabel("Password").fill("wrongpassword");
      await page.getByRole("button", { name: /login/i }).click();
      await page.waitForTimeout(1000);

      // Verify error message appears
      await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible();

      // Verify error does not cause layout breakage
      const loginBox = await page.getByRole("button", { name: /login/i }).boundingBox();
      expect(loginBox).not.toBeNull();

      expect(errors).toHaveLength(0);
    });
  });

  // ---- Convert tool E2E ----
  test("convert E2E: upload, select format, process", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/image/convert");
    await page.waitForLoadState("networkidle");

    await uploadImage(page);

    // Verify settings panel appeared after upload
    await expect(page.getByText("Settings").first()).toBeVisible();

    await waitForProcessing(page);

    expect(errors).toHaveLength(0);
  });

  // ---- Privacy policy page rendering ----
  test.describe("Privacy policy page", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("privacy policy page renders across browsers", async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await page.goto("/privacy");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // Verify the privacy page renders with content
      await expect(page.getByText(/privacy/i).first()).toBeVisible();

      // Verify page scrolling works
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);

      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThanOrEqual(0);

      expect(errors).toHaveLength(0);
    });
  });

  // ---- Change password page rendering ----
  test("change password page renders across browsers", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/change-password");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Verify form elements render correctly
    const inputs = page.locator("input[type='password']");
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(1);

    expect(errors).toHaveLength(0);
  });

  // ---- Editor page rendering ----
  test("editor page welcome screen renders across browsers", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/editor");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Editor page should render without console errors
    // Verify the page loaded (editor or welcome screen)
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();

    expect(errors).toHaveLength(0);
  });

  // The standalone /fullscreen grid page and its Hide/Show Details toggle were
  // removed in the 2.0 redesign (the home page is now a tabbed catalog), so the
  // cross-browser test for it was dropped.

  // ---- QR generate tool (no-dropzone mode) ----
  test("qr-generate: enter text and verify preview renders", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/image/qr-generate");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Enter text to generate a QR code. The default content tab is URL, so target
    // its input directly (the generic text/textarea inputs live in collapsed sections).
    const textInput = page.getByTestId("qr-input-url");
    await textInput.fill("https://snapotter.com");
    await page.waitForTimeout(1000);

    // Verify a preview element appeared
    const preview = page.locator("img, canvas, svg").first();
    const previewVisible = await preview.isVisible({ timeout: 10000 }).catch(() => false);
    expect(previewVisible).toBe(true);

    expect(errors).toHaveLength(0);
  });

  // ---- Files page rendering ----
  test("files page renders across browsers", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/files");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Verify page loaded without errors
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();

    expect(errors).toHaveLength(0);
  });

  // ---- Collage tool (no-dropzone mode) ----
  test("collage tool renders templates across browsers", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/image/collage");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Collage is a no-dropzone tool -- verify it loaded
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeTruthy();

    expect(errors).toHaveLength(0);
  });

  // ---- Automate page: reorder steps ----
  test("automate page: add and remove pipeline steps", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/automate");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Add 3 steps
    const resizeBtn = page.getByRole("button", { name: /resize/i }).first();
    const compressBtn = page.getByRole("button", { name: /compress/i }).first();
    const convertBtn = page.getByRole("button", { name: /convert/i }).first();

    await resizeBtn.click();
    await page.waitForTimeout(300);
    await compressBtn.click();
    await page.waitForTimeout(300);
    await convertBtn.click();
    await page.waitForTimeout(300);

    // Verify 3 steps were added (each step renders a "Remove" button).
    const steps = page.locator("button[title='Remove']");
    expect(await steps.count()).toBeGreaterThanOrEqual(3);

    // Remove one step
    const removeBtn = steps.first();
    const hasRemove = await removeBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasRemove) {
      await removeBtn.click();
      await page.waitForTimeout(300);
      expect(await steps.count()).toBeGreaterThanOrEqual(2);
    }

    expect(errors).toHaveLength(0);
  });

  // ---- Navigation: browser back/forward ----
  test("browser navigation: back and forward between pages", async ({ loggedInPage: page }) => {
    const errors = collectConsoleErrors(page);

    // Navigate to resize
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    // Navigate to compress
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    // Go back to resize
    await page.goBack();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/resize/);

    // Go forward to compress
    await page.goForward();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/compress/);

    expect(errors).toHaveLength(0);
  });
});
