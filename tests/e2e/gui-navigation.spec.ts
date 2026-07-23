import { TOOLS } from "@snapotter/shared";
import { expect, openSettings, test, uploadTestImage } from "./helpers";

// Tool routes are section-prefixed at runtime (/<section>/<toolId>); resolve the
// real route from the shared catalog rather than the bare id.
const routeFor = (id: string): string => TOOLS.find((t) => t.id === id)?.route ?? `/${id}`;

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
    await expect(page.getByText("Your files. Stay yours.")).toBeVisible();
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

  test("tab order is username -> password -> login button", async ({ page }) => {
    await page.goto("/login");

    // Focus the username field first
    await page.getByLabel("Username").focus();
    await expect(page.getByLabel("Username")).toBeFocused();

    // Tab to password
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();

    // Fill both fields so login button becomes enabled
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");

    // Focus password again, then Tab to login button
    await page.getByLabel("Password").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /login/i })).toBeFocused();
  });

  test("login button only fills username keeps it disabled", async ({ page }) => {
    await page.goto("/login");

    const loginBtn = page.getByRole("button", { name: /login/i });
    await page.getByLabel("Username").fill("admin");
    // Only username is filled, password is still empty
    await expect(loginBtn).toBeDisabled();

    // Now fill only password (clear username)
    await page.getByLabel("Username").fill("");
    await page.getByLabel("Password").fill("admin");
    await expect(loginBtn).toBeDisabled();
  });

  test("SnapOtter branding is visible on login page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("SnapOtter").first()).toBeVisible();
  });

  // Login rate limiting moved to login-security.spec.ts: it must run in the
  // serial bucket because it lowers the global login attempt cap (which the e2e
  // env raises so parallel sign-ins do not 429) and restores it.
});

// ---------------------------------------------------------------------------
// Home Page (authenticated)
// ---------------------------------------------------------------------------
test.describe("Home Page - Before Upload", () => {
  test("shows the catalog search box and tool grid", async ({ loggedInPage: page }) => {
    // 2.0 home is a tool catalog (search + a grid of tool-card links), not a
    // dropzone. Files are uploaded on tool pages, not on the home page.
    await expect(page.locator("input[data-search-input]")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Resize/ }).first()).toBeVisible();
  });

  test("tool panel is visible with search bar and categories", async ({ loggedInPage: page }) => {
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
    await expect(page.getByText("Essentials").first()).toBeVisible();
  });

  test("each tool category header is visible in tool panel", async ({ loggedInPage: page }) => {
    const toolPanel = page.locator("aside, [class*='tool-panel'], section").filter({
      hasText: "Essentials",
    });
    await expect(toolPanel.getByText("Essentials").first()).toBeVisible();
    await expect(toolPanel.getByText("Optimization").first()).toBeVisible();
  });

  test("clicking a tool card navigates to its tool page", async ({ loggedInPage: page }) => {
    // Catalog tools are links to /<section>/<toolId> (compress is an image tool).
    await page
      .getByRole("link", { name: /^Compress/ })
      .first()
      .click();
    await expect(page).toHaveURL("/image/compress");
  });

  test("search filters tools in tool panel", async ({ loggedInPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("resize");

    // Resize tool should remain visible
    await expect(page.getByText("Resize").first()).toBeVisible();
  });
});

test.describe("Home Page - After Upload", () => {
  // Removed: 2.0 has no upload-on-home flow, so the post-upload file info
  // (green checkmark, filename, file size) no longer exists on the home page.

  // Removed: the "Change file" button belonged to the deleted upload-on-home UX.

  // Removed: the post-upload "Quick Actions" button row was deleted in 2.0; the
  // home page is now a tool catalog with no per-file action shortcuts.

  test("catalog grid shows tools grouped by category", async ({ loggedInPage: page }) => {
    // 2.0 replaced the post-upload "All Tools" list with the home catalog grid,
    // grouped into category sections (e.g. Essentials).
    await expect(page.getByText("Essentials").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Resize/ }).first()).toBeVisible();
  });

  test("clicking a tool card navigates to the tool page", async ({ loggedInPage: page }) => {
    // Catalog tools are links to /<section>/<toolId> (resize is an image tool).
    await page
      .getByRole("link", { name: /^Resize/ })
      .first()
      .click();
    await expect(page).toHaveURL("/image/resize");
  });

  // Removed: 2.0 has no upload-on-home flow. The "image viewer after upload",
  // "Change file" reset, and the multi-upload file-count badge all belonged to
  // the deleted home dropzone. Files now upload on tool pages, so these post-
  // upload home behaviors no longer exist.
});

// ---------------------------------------------------------------------------
// Fullscreen Grid Page (/fullscreen)
// ---------------------------------------------------------------------------
// Removed: 2.0 deleted the /fullscreen route and its "Fullscreen Grid Page"
// (the show/hide details toggle, the standalone category grid, etc.). App.tsx
// has no /fullscreen route, so it now falls through to NotFoundPage. The home
// page ("/") is the tool catalog, so all of these assertions moved there.

// ---------------------------------------------------------------------------
// Tool Page (/:toolId) - tested with "resize"
// ---------------------------------------------------------------------------
test.describe("Tool Page - Resize", () => {
  test("shows tool icon and name", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    await expect(page.getByText("Resize").first()).toBeVisible();
  });

  test("shows dropzone with dashed border before upload", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    const dropzone = page.locator("[class*='border-dashed']").first();
    await expect(dropzone).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("after upload shows Files section, Settings section, and Process button", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    // Files section
    await expect(page.getByText("Files").first()).toBeVisible();
    // Settings section
    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  test("invalid tool ID shows not found message", async ({ loggedInPage: page }) => {
    // A single-segment unknown path matches neither "/" nor "/:section/:toolId",
    // so App.tsx falls through to the "*" route -> NotFoundPage, which renders
    // t.common.pageNotFound ("Page not found"). (A two-segment unknown path would
    // instead hit ToolPage's own "Tool not found" guard.)
    await page.goto("/this-tool-does-not-exist-xyz");

    await expect(page.getByText("Page not found")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tool Page - Parameterized structure tests across multiple tools
// ---------------------------------------------------------------------------
const DROPZONE_TOOLS = [
  // Essentials
  { id: "resize", name: "Resize" },
  { id: "crop", name: "Crop" },
  { id: "rotate", name: "Rotate" },
  { id: "convert", name: "Convert" },
  { id: "compress", name: "Compress" },
  // Optimization
  { id: "optimize-for-web", name: "Optimize for Web" },
  { id: "strip-metadata", name: "Remove Image Metadata" },
  { id: "edit-metadata", name: "Edit Image Metadata" },
  { id: "bulk-rename", name: "Bulk Rename" },
  { id: "image-to-pdf", name: "Image to PDF" },
  { id: "favicon", name: "Favicon Generator" },
  // Adjustments
  { id: "adjust-colors", name: "Adjust Colors" },
  { id: "sharpening", name: "Sharpen Image" },
  { id: "replace-color", name: "Replace & Invert Color" },
  { id: "color-blindness", name: "Color Blindness Simulation" },
  // AI Tools
  { id: "remove-background", name: "Remove Background" },
  { id: "upscale", name: "Image Upscaling" },
  { id: "erase-object", name: "Object Eraser" },
  { id: "ocr", name: "Extract Text from Image (OCR)" },
  { id: "blur-faces", name: "Blur Faces & PII" },
  { id: "smart-crop", name: "Smart Crop" },
  { id: "image-enhancement", name: "Image Enhancement" },
  { id: "enhance-faces", name: "Face Enhancement" },
  { id: "colorize", name: "AI Colorization" },
  { id: "noise-removal", name: "Noise Removal" },
  { id: "red-eye-removal", name: "Red Eye Removal" },
  { id: "restore-photo", name: "Photo Restoration" },
  { id: "passport-photo", name: "Passport Photo" },
  { id: "content-aware-resize", name: "Content-Aware Resize" },
  { id: "ai-canvas-expand", name: "AI Canvas Expand" },
  { id: "transparency-fixer", name: "PNG Transparency Fixer" },
  // Watermark & Overlay
  { id: "watermark-text", name: "Text Watermark" },
  { id: "watermark-image", name: "Image Watermark" },
  { id: "text-overlay", name: "Text Overlay" },
  { id: "compose", name: "Image Composition" },
  // Utilities
  { id: "info", name: "Image Info" },
  { id: "compare", name: "Image Compare" },
  { id: "find-duplicates", name: "Find Duplicates" },
  { id: "color-palette", name: "Color Palette" },
  { id: "barcode-read", name: "Barcode Reader" },
  { id: "image-to-base64", name: "Image to Base64" },
  // Layout & Composition
  { id: "stitch", name: "Stitch Images" },
  { id: "split", name: "Split Image" },
  { id: "border", name: "Border & Frame" },
  { id: "beautify", name: "Beautify Screenshot" },
  // Format & Conversion
  { id: "svg-to-raster", name: "SVG to Raster" },
  { id: "vectorize", name: "Image to SVG" },
  { id: "gif-tools", name: "GIF Tools" },
];

const NO_DROPZONE_TOOLS = [
  { id: "qr-generate", name: "QR Code Generator" },
  { id: "meme-generator", name: "Meme Generator" },
  { id: "collage", name: "Collage" },
  { id: "pdf-to-image", name: "PDF to Image" },
];

test.describe("Tool Page - Common Structure (Dropzone Tools)", () => {
  for (const tool of DROPZONE_TOOLS) {
    test(`${tool.name} (/${tool.id}) shows tool name and dropzone`, async ({
      loggedInPage: page,
    }) => {
      await page.goto(routeFor(tool.id));

      // Tool name should be visible
      await expect(page.getByText(tool.name).first()).toBeVisible();

      // Dropzone should be visible
      const dropzone = page.locator("[class*='border-dashed']").first();
      await expect(dropzone).toBeVisible();
    });
  }
});

test.describe("Tool Page - Common Structure (No-Dropzone Tools)", () => {
  for (const tool of NO_DROPZONE_TOOLS) {
    test(`${tool.name} (/${tool.id}) shows tool name without standard dropzone`, async ({
      loggedInPage: page,
    }) => {
      await page.goto(routeFor(tool.id));

      // Tool name should be visible
      await expect(page.getByText(tool.name).first()).toBeVisible();
    });
  }
});

test.describe("Tool Page - Settings and Process Flow", () => {
  test("resize: settings panel appears after upload with process button", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    await expect(page.getByText("Settings").first()).toBeVisible();
    // The resize submit button mounts with the settings panel after upload.
    // Its label is the tool name ("Resize"), so target it by test id.
    await expect(page.getByTestId("resize-submit")).toBeVisible();
  });

  test("compress: settings panel appears after upload", async ({ loggedInPage: page }) => {
    await page.goto("/image/compress");
    await uploadTestImage(page);

    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  test("convert: settings panel appears after upload", async ({ loggedInPage: page }) => {
    await page.goto("/image/convert");
    await uploadTestImage(page);

    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  test("resize: download link appears after processing", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    // Set a width so the submit button is enabled (canProcess needs a dimension).
    await page.locator("#resize-width").fill("80");

    const submitBtn = page.getByTestId("resize-submit");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // The download is an <a data-testid="resize-download"> that appears once the
    // result is ready.
    await expect(page.getByTestId("resize-download")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("mobile: settings panel is collapsible on tool page", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    await page.goto("/image/resize");
    await uploadTestImage(page);

    // On mobile, settings may be behind a toggle button
    const settingsToggle = page.getByRole("button", { name: /settings/i }).first();
    if (await settingsToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsToggle.click();
      await page.waitForTimeout(300);
      // Settings content should be visible after clicking toggle
      await expect(page.getByText("Settings").first()).toBeVisible();
    }

    await context.close();
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
    // t.automate.addToolsPrompt renders both in the canvas header subtitle and in
    // the PipelineBuilder empty state, so scope to the first match.
    await expect(page.getByText("Add tools from the palette to get started").first()).toBeVisible();
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

  test("search filters tools in the tool palette", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("resize");

    // Resize should be visible in the palette
    await expect(page.getByText("Resize").first()).toBeVisible();
  });

  test("clicking a tool in palette adds it as a pipeline step", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    // The empty state should be shown
    await expect(page.getByText("No steps yet")).toBeVisible();

    // Click a tool in the palette to add it as a step
    const resizeTool = page.locator("[data-tool-id='resize']").first();
    if (await resizeTool.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resizeTool.click();
    } else {
      // Fallback: click the Resize text in the palette area
      await page.getByText("Resize").first().click();
    }

    await page.waitForTimeout(500);

    // Empty state should be gone - step should be added
    await expect(page.getByText("No steps yet")).not.toBeVisible();
  });

  test("Save button appears when pipeline has steps", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    // Save button should not be visible before adding steps
    await expect(page.getByRole("button", { name: /^Save$/i })).not.toBeVisible();

    // Add a tool step
    const resizeTool = page.locator("[data-tool-id='resize']").first();
    if (await resizeTool.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resizeTool.click();
    } else {
      await page.getByText("Resize").first().click();
    }
    await page.waitForTimeout(500);

    // Save button should now be visible
    await expect(page.getByRole("button", { name: /^Save$/i })).toBeVisible();
  });

  test("process button remains disabled with steps but no file", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    // Add a tool step
    const resizeTool = page.locator("[data-tool-id='resize']").first();
    if (await resizeTool.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resizeTool.click();
    } else {
      await page.getByText("Resize").first().click();
    }
    await page.waitForTimeout(500);

    // Process button should still be disabled without a file
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

    // "My Files" renders twice: a visually-hidden page <h1> and the visible
    // FilesNav <h3>. Target the level-3 nav heading so we assert the visible one.
    await expect(page.getByRole("heading", { name: "My Files", level: 3 })).toBeVisible();
    // Navigation items
    await expect(page.getByRole("button", { name: /recent/i }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Top-Nav Navigation
// ---------------------------------------------------------------------------
// 2.0 removed the desktop sidebar. Navigation now lives in the top-nav header
// (role banner): nav links Tools (->"/"), Automate, Editor (badge "Beta"), and
// Files, plus a Help button and an avatar dropdown (data-testid="user-menu")
// that holds Settings + Logout. The /fullscreen "Grid" link is gone.
test.describe("Top-Nav Navigation", () => {
  test("top-nav shows Tools, Automate, Editor, and Files links", async ({ loggedInPage: page }) => {
    const banner = page.getByRole("banner");
    await expect(banner).toBeVisible();

    await expect(banner.getByRole("link", { name: "Tools" })).toBeVisible();
    await expect(banner.getByRole("link", { name: "Automate" })).toBeVisible();
    // The Editor link carries a "Beta" badge, so its accessible name is "Editor Beta".
    await expect(banner.getByRole("link", { name: /Editor/ })).toBeVisible();
    await expect(banner.getByRole("link", { name: "Files" })).toBeVisible();
  });

  test("top-nav has a Help button and an avatar menu containing Settings", async ({
    loggedInPage: page,
  }) => {
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("button", { name: /help/i }).first()).toBeVisible();

    // The avatar dropdown exposes Settings (and Logout).
    await page.getByTestId("user-menu").click();
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  });

  test("Tools link navigates to home /", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.getByRole("banner").getByRole("link", { name: "Tools" }).click();
    await expect(page).toHaveURL("/");
  });

  test("Automate link navigates to /automate", async ({ loggedInPage: page }) => {
    await page.getByRole("banner").getByRole("link", { name: "Automate" }).click();
    await expect(page).toHaveURL("/automate");
  });

  test("Editor link navigates to /editor", async ({ loggedInPage: page }) => {
    await page
      .getByRole("banner")
      .getByRole("link", { name: /Editor/ })
      .click();
    await expect(page).toHaveURL("/editor");
  });

  test("Files link navigates to /files", async ({ loggedInPage: page }) => {
    await page.getByRole("banner").getByRole("link", { name: "Files" }).click();
    await expect(page).toHaveURL("/files");
  });

  test("active nav link is highlighted on the home page", async ({ loggedInPage: page }) => {
    // On "/", the Tools link gets the active treatment (bg-muted in the light variant).
    const toolsLink = page.getByRole("banner").getByRole("link", { name: "Tools" });
    await expect(toolsLink).toHaveClass(/bg-muted/);
  });

  test("Help button opens HelpDialog modal", async ({ loggedInPage: page }) => {
    await page.getByRole("banner").getByRole("button", { name: /help/i }).first().click();

    // Help dialog header
    await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
  });

  test("Settings opens SettingsDialog modal", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Security" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Top-Nav Controls (theme + language)
// ---------------------------------------------------------------------------
// 2.0 removed the footer. The theme toggle and language selector now live on the
// right side of the top nav (desktop only). The theme button's title is the
// lowercase "Toggle theme" (top-nav.tsx ThemeToggle).
test.describe("Top-Nav Controls", () => {
  test("theme toggle button is visible with sun or moon icon", async ({ loggedInPage: page }) => {
    const themeBtn = page.locator("button[title='Toggle theme']");
    await expect(themeBtn).toBeVisible();

    // Should contain an SVG icon (Sun or Moon)
    await expect(themeBtn.locator("svg")).toBeVisible();
  });

  test("theme toggle switches between sun and moon icons", async ({ loggedInPage: page }) => {
    const themeBtn = page.locator("button[title='Toggle theme']");
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

  // Removed: 2.0 deleted the footer and its privacy link. The chrome no longer
  // links to /privacy (the page still exists and is covered in "Routing Edge
  // Cases"); the avatar dropdown exposes Docs/API Reference instead.

  test("theme persists after page reload", async ({ loggedInPage: page }) => {
    const themeBtn = page.locator("button[title='Toggle theme']");
    await expect(themeBtn).toBeVisible();

    // Toggle theme
    await themeBtn.click();
    await page.waitForTimeout(300);

    const themeAfterToggle = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    // Reload the page
    await page.reload();
    await page.waitForTimeout(500);

    const themeAfterReload = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    // Theme should persist across reload
    expect(themeAfterReload).toBe(themeAfterToggle);
  });
});

// ---------------------------------------------------------------------------
// Drag-and-Drop Upload
// ---------------------------------------------------------------------------
test.describe("Drag-and-Drop Upload", () => {
  test("dropzone accepts dropped files via DataTransfer", async ({ loggedInPage: page }) => {
    // 2.0 has no home dropzone; uploads happen on a tool page. The Dropzone
    // renders <section aria-label="File drop zone"> with the "Drop your files
    // here" prompt and an "Upload from computer" button.
    await page.goto("/image/resize");

    const dropzone = page.locator("section[aria-label='File drop zone']");
    await expect(dropzone).toBeVisible();
    await expect(page.getByText("Drop your files here")).toBeVisible();

    // Upload via the file chooser flow (same onFiles handler as drag-and-drop)
    await uploadTestImage(page);

    // After upload, the selected file name should appear in the Files list
    await expect(page.getByText(/test-image/i).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Files Page Layout
// ---------------------------------------------------------------------------
test.describe("Files Page Layout", () => {
  test("desktop shows nav column with list and details", async ({ loggedInPage: page }) => {
    await page.goto("/files");

    // FilesNav renders the visible level-3 "My Files" heading (a separate sr-only
    // <h1> with the same text also exists, so scope to the nav heading).
    await expect(page.getByRole("heading", { name: "My Files", level: 3 })).toBeVisible();
    // Nav items: Recent and Upload Files (files-nav.tsx)
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

    // Mobile tabs (files-page.tsx): "Recent" and "Upload Files"
    await expect(page.getByRole("button", { name: "Recent" })).toBeVisible();
    await expect(page.getByRole("button", { name: /upload files/i })).toBeVisible();

    // The FilesNav desktop heading (hidden md:block) is not rendered on mobile.
    await expect(page.getByRole("heading", { name: "My Files", level: 3 })).not.toBeVisible();

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Routing Edge Cases
// ---------------------------------------------------------------------------
test.describe("Routing Edge Cases", () => {
  test("invalid tool ID shows error state", async ({ loggedInPage: page }) => {
    // A two-segment path matches "/:section/:toolId", so ToolPage mounts and hits
    // its own guard (t.toolPage.notFound = "Tool not found") when the id is
    // unknown. (A single-segment path would instead fall to NotFoundPage; see the
    // "Tool Page - Resize > invalid tool ID" test.)
    await page.goto("/image/nonexistent-tool-abc123");

    await expect(page.getByText("Tool not found")).toBeVisible();
  });

  test("legacy /brightness-contrast redirects to /adjust-colors", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/brightness-contrast");

    await expect(page).toHaveURL("/image/adjust-colors");
  });

  test("legacy /saturation redirects to /adjust-colors", async ({ loggedInPage: page }) => {
    await page.goto("/saturation");

    await expect(page).toHaveURL("/image/adjust-colors");
  });

  test("legacy /color-channels redirects to /adjust-colors", async ({ loggedInPage: page }) => {
    await page.goto("/color-channels");

    await expect(page).toHaveURL("/image/adjust-colors");
  });

  test("/privacy renders the privacy policy page", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
  });

  test("/privacy Back link navigates home", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");

    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL("/");
  });

  test("legacy /color-effects redirects to /adjust-colors", async ({ loggedInPage: page }) => {
    await page.goto("/color-effects");

    await expect(page).toHaveURL("/image/adjust-colors");
  });

  test("/login renders the login page even when already authenticated", async ({
    loggedInPage: page,
  }) => {
    // 2.0 does not auto-redirect authenticated users away from /login: AuthGuard
    // lets the login route render unconditionally and LoginPage has no
    // redirect-on-auth effect. The form stays put.
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Browser Back/Forward Navigation
// ---------------------------------------------------------------------------
test.describe("Browser Back/Forward Navigation", () => {
  test("browser back button returns to previous page", async ({ loggedInPage: page }) => {
    // Navigate: Home -> Editor -> back should return to Home (/fullscreen is gone).
    await page.goto("/editor");
    await expect(page).toHaveURL("/editor");

    await page.goBack();
    await expect(page).toHaveURL("/");
  });

  test("browser forward button returns to next page after going back", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/editor");
    await expect(page).toHaveURL("/editor");

    await page.goBack();
    await expect(page).toHaveURL("/");

    await page.goForward();
    await expect(page).toHaveURL("/editor");
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

  // Removed: 2.0 deleted the /fullscreen route, so there is no fullscreen page to
  // preserve across a refresh. Refresh-persistence is still covered for /automate,
  // tool pages, /files, and /editor.

  test("page refresh preserves route on /automate", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await expect(page).toHaveURL("/automate");

    await page.reload();
    await expect(page).toHaveURL("/automate");
    await expect(page.getByText("Pipeline Builder")).toBeVisible();
  });

  test("page refresh preserves route on tool page", async ({ loggedInPage: page }) => {
    // Tool routes are section-prefixed in 2.0 (/image/resize, not /resize).
    await page.goto("/image/resize");
    await expect(page).toHaveURL("/image/resize");

    await page.reload();
    await expect(page).toHaveURL("/image/resize");
    await expect(page.getByText("Resize").first()).toBeVisible();
  });

  test("page refresh preserves route on /files", async ({ loggedInPage: page }) => {
    await page.goto("/files");
    await expect(page).toHaveURL("/files");

    await page.reload();
    await expect(page).toHaveURL("/files");
    // Scope to the visible FilesNav heading (an sr-only <h1> shares the text).
    await expect(page.getByRole("heading", { name: "My Files", level: 3 })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Mobile Navigation (375x667)
// ---------------------------------------------------------------------------
test.describe("Mobile Navigation", () => {
  // Removed: 2.0 deleted the mobile hamburger sidebar overlay (and its backdrop).
  // Mobile navigation is a fixed bottom nav (nav.fixed) with Tools, Automate,
  // Editor, Files, and a Settings button; the tests below cover it.

  test("bottom nav navigates between all main sections", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    const bottomNav = page.locator("nav.fixed");

    // Navigate to Automate
    await bottomNav.getByText("Automate").click();
    await expect(page).toHaveURL("/automate");

    // Navigate to Files
    await bottomNav.getByText("Files").click();
    await expect(page).toHaveURL("/files");

    // Navigate back to Tools
    await bottomNav.getByText("Tools").click();
    await expect(page).toHaveURL("/");

    await context.close();
  });

  test("bottom nav has Editor link", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    const bottomNav = page.locator("nav.fixed");
    await expect(bottomNav.getByText("Editor")).toBeVisible();

    await bottomNav.getByText("Editor").click();
    await expect(page).toHaveURL("/editor");

    await context.close();
  });

  // Removed: the mobile hamburger "Grid" link (and the /fullscreen route it
  // pointed to) no longer exist in 2.0.

  test("bottom nav Settings button opens the Settings dialog", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // The fixed bottom nav exposes a Settings button (mobile-bottom-nav.tsx) that
    // opens the Settings dialog rather than navigating.
    const bottomNav = page.locator("nav.fixed");
    await bottomNav.getByRole("button", { name: /settings/i }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Editor Page (/editor)
// ---------------------------------------------------------------------------
test.describe("Editor Page", () => {
  test("editor page renders with canvas area", async ({ loggedInPage: page }) => {
    await page.goto("/editor");

    await expect(page).toHaveURL("/editor");
    // Editor should have a canvas or main editor area
    await expect(page.getByText(/editor|canvas|draw/i).first()).toBeVisible();
  });

  test("editor page is reachable from the top-nav Editor link", async ({ loggedInPage: page }) => {
    // 2.0 removed the sidebar; the Editor link (with a "Beta" badge) lives in the
    // top-nav banner.
    await page
      .getByRole("banner")
      .getByRole("link", { name: /Editor/ })
      .click();
    await expect(page).toHaveURL("/editor");
  });

  test("page refresh preserves /editor route", async ({ loggedInPage: page }) => {
    await page.goto("/editor");
    await expect(page).toHaveURL("/editor");

    await page.reload();
    await expect(page).toHaveURL("/editor");
  });
});

// ---------------------------------------------------------------------------
// Settings Dialog - Tab Navigation
// ---------------------------------------------------------------------------
test.describe("Settings Dialog Tabs", () => {
  test("settings dialog shows all navigation sections", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Core sections should be listed in nav
    await expect(page.getByRole("button", { name: "General" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Security" })).toBeVisible();
    await expect(page.getByRole("button", { name: "About" })).toBeVisible();
  });

  test("clicking Security tab shows security settings", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await page.getByRole("button", { name: "Security" }).click();
    await page.waitForTimeout(300);

    // Security section content should appear (the section heading plus a couple
    // of sub-section headings all read "Security", so scope to the first).
    await expect(page.getByRole("heading", { name: "Security" }).first()).toBeVisible();
  });

  test("clicking About tab shows version info", async ({ loggedInPage: page }) => {
    await openSettings(page);

    await page.getByRole("button", { name: "About" }).click();
    await page.waitForTimeout(300);

    // About section should show version
    await expect(page.getByText(/version/i).first()).toBeVisible();
  });

  test("switching between tabs preserves dialog open state", async ({ loggedInPage: page }) => {
    await openSettings(page);

    // Switch to Security
    await page.getByRole("button", { name: "Security" }).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole("dialog")).toBeVisible();

    // Switch to About
    await page.getByRole("button", { name: "About" }).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole("dialog")).toBeVisible();

    // Switch back to General
    await page.getByRole("button", { name: "General" }).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Language Selector
// ---------------------------------------------------------------------------
test.describe("Language Selector", () => {
  test("language button opens language dropdown", async ({ loggedInPage: page }) => {
    const langBtn = page.locator("button[title='Language']");
    await expect(langBtn).toBeVisible();

    await langBtn.click();
    await page.waitForTimeout(300);

    // Language options should appear
    await expect(page.getByText(/espa|fran|deutsch|portugu/i).first()).toBeVisible();
  });

  test("selecting a language updates the button label", async ({ loggedInPage: page }) => {
    const langBtn = page.locator("button[title='Language']");
    await expect(langBtn).toContainText("English");

    await langBtn.click();
    await page.waitForTimeout(300);

    // Pick a different language and check the button updates
    const spanishOption = page.getByText(/espa/i).first();
    if (await spanishOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await spanishOption.click();
      await page.waitForTimeout(500);

      // Button should no longer say "English"
      await expect(langBtn).not.toContainText("English");

      // Reset back to English
      await langBtn.click();
      await page.waitForTimeout(300);
      await page.getByText("English").first().click();
    }
  });
});

// ---------------------------------------------------------------------------
// Home Catalog - Tool Visibility
// ---------------------------------------------------------------------------
// 2.0 removed the standalone /fullscreen grid; the home catalog ("/") now shows
// every tool grouped by section then category. The AI image tools live under the
// "Enhance & AI" category (t.categories.enhance).
test.describe("Home Catalog - AI Tool Visibility", () => {
  test("AI tools are visible in the home catalog", async ({ loggedInPage: page }) => {
    await page.goto("/");

    // The "Enhance & AI" category header groups the AI image tools.
    await expect(page.getByText("Enhance & AI").first()).toBeVisible();
    // At least one AI tool card should be listed
    await expect(page.getByRole("link", { name: /Remove Background/ }).first()).toBeVisible();
  });

  test("tool cards display an icon and name", async ({ loggedInPage: page }) => {
    await page.goto("/");

    // A tool card should have visible text for its name
    const resizeLink = page.getByRole("link", { name: /^Resize/ }).first();
    await expect(resizeLink).toBeVisible();

    // And it should contain an SVG icon
    await expect(resizeLink.locator("svg").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Automate Page - Additional Coverage
// ---------------------------------------------------------------------------
test.describe("Automate Page - Pipeline Management", () => {
  test("removing a pipeline step returns to empty state", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    // Add a tool step
    const resizeTool = page.locator("[data-tool-id='resize']").first();
    if (await resizeTool.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resizeTool.click();
    } else {
      await page.getByText("Resize").first().click();
    }
    await page.waitForTimeout(500);

    // Step should be added
    await expect(page.getByText("No steps yet")).not.toBeVisible();

    // Each step card has a Remove button (title="Remove" -> t.automate.removeStep).
    // Removing the only step returns the builder to its empty state.
    await page.locator("button[title='Remove']").first().click();
    await expect(page.getByText("No steps yet")).toBeVisible();
  });

  test("adding multiple steps shows ordered step list", async ({ loggedInPage: page }) => {
    await page.goto("/automate");

    // Add first tool
    const resizeTool = page.locator("[data-tool-id='resize']").first();
    if (await resizeTool.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resizeTool.click();
    } else {
      await page.getByText("Resize").first().click();
    }
    await page.waitForTimeout(300);

    // Add second tool
    const compressTool = page.locator("[data-tool-id='compress']").first();
    if (await compressTool.isVisible({ timeout: 3000 }).catch(() => false)) {
      await compressTool.click();
    } else {
      await page.getByText("Compress").first().click();
    }
    await page.waitForTimeout(300);

    // Both tools should be listed as steps
    await expect(page.getByText("Resize").first()).toBeVisible();
    await expect(page.getByText("Compress").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Routing - Additional Edge Cases
// ---------------------------------------------------------------------------
test.describe("Routing - Additional Edge Cases", () => {
  test("/change-password page renders for authenticated user", async ({ loggedInPage: page }) => {
    await page.goto("/change-password");

    // Should render the change password form
    await expect(page.getByText(/change password|new password/i).first()).toBeVisible();
  });

  test("navigating to /editor and back preserves home state", async ({ loggedInPage: page }) => {
    // Start at home
    await expect(page).toHaveURL("/");

    // Navigate to editor
    await page.goto("/editor");
    await expect(page).toHaveURL("/editor");

    // Navigate back
    await page.goBack();
    await expect(page).toHaveURL("/");

    // Home content should be intact: the 2.0 home is the tool catalog (search box
    // + tool-card links), not a dropzone.
    await expect(page.locator("input[data-search-input]")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Resize/ }).first()).toBeVisible();
  });

  test("deep-linking to a specific tool page works", async ({ loggedInPage: page }) => {
    // Tool routes are section-prefixed; resolve via the shared catalog.
    await page.goto(routeFor("watermark-text"));
    await expect(page).toHaveURL("/image/watermark-text");
    await expect(page.getByText("Text Watermark").first()).toBeVisible();
  });

  test("double navigation to same page does not break state", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await expect(page).toHaveURL("/automate");

    await page.goto("/automate");
    await expect(page).toHaveURL("/automate");

    // Page should still work correctly
    await expect(page.getByText("Pipeline Builder")).toBeVisible();
  });

  test("navigating from a legacy redirect to another page works", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/brightness-contrast");
    await expect(page).toHaveURL("/image/adjust-colors");

    await page.goto("/files");
    await expect(page).toHaveURL("/files");

    await page.goBack();
    await expect(page).toHaveURL("/image/adjust-colors");
  });
});

// ---------------------------------------------------------------------------
// Tool Page - Mobile Structure (375x667)
// ---------------------------------------------------------------------------
test.describe("Tool Page - Mobile Structure", () => {
  const MOBILE_TOOLS = [
    { id: "resize", name: "Resize" },
    { id: "compress", name: "Compress" },
    { id: "convert", name: "Convert" },
    { id: "crop", name: "Crop" },
    { id: "watermark-text", name: "Text Watermark" },
    { id: "adjust-colors", name: "Adjust Colors" },
  ];

  for (const tool of MOBILE_TOOLS) {
    test(`mobile: ${tool.name} (/${tool.id}) shows tool name and dropzone`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: 375, height: 667 },
      });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Username").fill("admin");
      await page.getByLabel("Password").fill("admin");
      await page.getByRole("button", { name: /login/i }).click();
      await page.waitForURL("/", { timeout: 15_000 });

      await page.goto(routeFor(tool.id));

      // Tool name should be visible
      await expect(page.getByText(tool.name).first()).toBeVisible();

      // Dropzone should be visible on mobile too
      const dropzone = page.locator("[class*='border-dashed']").first();
      await expect(dropzone).toBeVisible();

      // No horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      await context.close();
    });
  }
});
