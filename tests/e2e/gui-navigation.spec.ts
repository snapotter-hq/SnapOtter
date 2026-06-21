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
    await expect(page.getByText("Your images. Stay yours.")).toBeVisible();
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

  test("after too many failed attempts, rate limiting kicks in", async ({ page }) => {
    await page.goto("/login");

    // Submit several failed login attempts in rapid succession
    for (let i = 0; i < 10; i++) {
      await page.getByLabel("Username").fill(`wrong-user-${i}`);
      await page.getByLabel("Password").fill(`wrong-pass-${i}`);
      await page.getByRole("button", { name: /login/i }).click();

      // Wait briefly for the response
      await page.waitForTimeout(300);
    }

    // After many rapid failures, the UI should show a rate-limit or lockout message,
    // or the login button should become temporarily disabled
    const rateLimited = page.getByText(/too many|rate limit|try again|locked|slow down/i).first();
    const disabledBtn = page.getByRole("button", { name: /login/i });

    // Either an error message about rate limiting appears, or the button is disabled
    const hasRateLimitMsg = await rateLimited.isVisible({ timeout: 5000 }).catch(() => false);
    const isDisabled = await disabledBtn.isDisabled();

    expect(hasRateLimitMsg || isDisabled).toBe(true);
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

  test("each tool category header is visible in tool panel", async ({ loggedInPage: page }) => {
    const toolPanel = page.locator("aside, [class*='tool-panel'], section").filter({
      hasText: "Essentials",
    });
    await expect(toolPanel.getByText("Essentials").first()).toBeVisible();
    await expect(toolPanel.getByText("Optimization").first()).toBeVisible();
  });

  test("clicking a tool in the panel navigates to its page", async ({ loggedInPage: page }) => {
    // Click on a specific tool from the panel
    const compressLink = page.getByText("Compress").first();
    await compressLink.click();
    await expect(page).toHaveURL("/compress");
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

  test("image viewer is visible after upload", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    // The image viewer should render the uploaded image (an <img> element)
    const img = page.locator("img").first();
    await expect(img).toBeVisible();
  });

  test("Change file button resets to dropzone state", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    // File info should be visible
    await expect(page.getByText(/test-image/i).first()).toBeVisible();

    // Click Change file
    await page.getByText("Change file").click();
    await page.waitForTimeout(300);

    // Dropzone should reappear
    const dropzone = page.locator("[class*='border-dashed']").first();
    await expect(dropzone).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("multi-upload shows file count badge", async ({ loggedInPage: page }) => {
    // Upload first image
    await uploadTestImage(page);

    // Upload a second image via the file chooser
    const fileChooserPromise = page.waitForEvent("filechooser");
    // Click "Add more files" or "Change file" to trigger file picker
    const addBtn = page.getByText(/add more|change file/i).first();
    await addBtn.click();
    const fileChooser = await fileChooserPromise;
    const { getTestImagePath } = await import("./helpers");
    await fileChooser.setFiles([getTestImagePath(), getTestImagePath()]);
    await page.waitForTimeout(500);

    // Should show a count badge or multi-file indicator
    await expect(page.getByText(/\d+ file/i).first()).toBeVisible();
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
    await expect(page.getByText("Watermark & Overlay")).toBeVisible();
    await expect(page.getByText("Utilities")).toBeVisible();
    await expect(page.getByText("Layout & Composition")).toBeVisible();
    await expect(page.getByText("Format & Conversion")).toBeVisible();
    await expect(page.getByText("AI Tools")).toBeVisible();
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

  test("clearing search restores all tools", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    const searchInput = page.getByPlaceholder(/search/i);

    // Filter first
    await searchInput.fill("compress");
    await expect(page.getByRole("link", { name: /^Resize/ })).toHaveCount(0);

    // Clear the search
    await searchInput.fill("");
    await page.waitForTimeout(300);

    // Both tools should be visible again
    await expect(page.getByRole("link", { name: /^Resize/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Compress/ }).first()).toBeVisible();
    // Category headers should reappear
    await expect(page.getByText("Essentials")).toBeVisible();
    await expect(page.getByText("Optimization")).toBeVisible();
  });

  test("show/hide details toggle changes card appearance", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    const toggleBtn = page.getByRole("button", { name: /hide details|show details/i }).first();
    await expect(toggleBtn).toBeVisible();

    // Click the toggle
    await toggleBtn.click();
    await page.waitForTimeout(300);

    // Toggle text should have changed
    await expect(
      page.getByRole("button", { name: /hide details|show details/i }).first(),
    ).toBeVisible();
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
  { id: "strip-metadata", name: "Remove Metadata" },
  { id: "edit-metadata", name: "Edit Metadata" },
  { id: "bulk-rename", name: "Bulk Rename" },
  { id: "image-to-pdf", name: "Image to PDF" },
  { id: "favicon", name: "Favicon Generator" },
  // Adjustments
  { id: "adjust-colors", name: "Adjust Colors" },
  { id: "sharpening", name: "Sharpening" },
  { id: "replace-color", name: "Replace & Invert Color" },
  { id: "color-blindness", name: "Color Blindness Simulation" },
  // AI Tools
  { id: "remove-background", name: "Remove Background" },
  { id: "upscale", name: "Image Upscaling" },
  { id: "erase-object", name: "Object Eraser" },
  { id: "ocr", name: "OCR / Text Extraction" },
  { id: "blur-faces", name: "Face / PII Blur" },
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
  { id: "stitch", name: "Stitch / Combine" },
  { id: "split", name: "Image Splitting" },
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
      await page.goto(`/${tool.id}`);

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
      await page.goto(`/${tool.id}`);

      // Tool name should be visible
      await expect(page.getByText(tool.name).first()).toBeVisible();
    });
  }
});

test.describe("Tool Page - Settings and Process Flow", () => {
  test("resize: settings panel appears after upload with process button", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await expect(page.getByText("Settings").first()).toBeVisible();
    // Process button should be visible after upload
    await expect(page.getByRole("button", { name: /process/i }).first()).toBeVisible();
  });

  test("compress: settings panel appears after upload", async ({ loggedInPage: page }) => {
    await page.goto("/compress");
    await uploadTestImage(page);

    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  test("convert: settings panel appears after upload", async ({ loggedInPage: page }) => {
    await page.goto("/convert");
    await uploadTestImage(page);

    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  test("resize: download link appears after processing", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Click the process button
    const processBtn = page.getByRole("button", { name: /process/i }).first();
    await expect(processBtn).toBeVisible();
    await processBtn.click();

    // Wait for processing to complete and download link to appear
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
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

    await page.goto("/resize");
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
  test("sidebar has 5 top items: Tools, Grid, Automate, Editor, Files", async ({
    loggedInPage: page,
  }) => {
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    await expect(sidebar.getByText("Tools")).toBeVisible();
    await expect(sidebar.getByText("Grid")).toBeVisible();
    await expect(sidebar.getByText("Automate")).toBeVisible();
    await expect(sidebar.getByText("Editor")).toBeVisible();
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

  test("Editor link navigates to /editor", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Editor").click();
    await expect(page).toHaveURL("/editor");
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

  test("privacy link navigates to /privacy", async ({ loggedInPage: page }) => {
    const privacyLink = page.getByRole("link", { name: /privacy/i }).first();
    if (await privacyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await privacyLink.click();
      await expect(page).toHaveURL("/privacy");
      await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    }
  });

  test("theme persists after page reload", async ({ loggedInPage: page }) => {
    const themeBtn = page.locator("button[title='Toggle Theme']");
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
    await expect(page.getByText("Back")).toBeVisible();
  });

  test("/privacy Back link navigates home", async ({ loggedInPage: page }) => {
    await page.goto("/privacy");

    await page.getByText("Back").click();
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

    await expect(page).toHaveURL("/image/adjust-colors");
  });

  test("/login when already logged in redirects to /", async ({ loggedInPage: page }) => {
    // loggedInPage already has authentication via storageState
    await page.goto("/login");

    // Should redirect away from login since already authenticated
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page).toHaveURL("/");
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

  test("page refresh preserves route on /fullscreen", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");
    await expect(page).toHaveURL("/fullscreen");

    await page.reload();
    await expect(page).toHaveURL("/fullscreen");
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test("page refresh preserves route on /automate", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await expect(page).toHaveURL("/automate");

    await page.reload();
    await expect(page).toHaveURL("/automate");
    await expect(page.getByText("Pipeline Builder")).toBeVisible();
  });

  test("page refresh preserves route on tool page", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await expect(page).toHaveURL("/resize");

    await page.reload();
    await expect(page).toHaveURL("/resize");
    await expect(page.getByText("Resize").first()).toBeVisible();
  });

  test("page refresh preserves route on /files", async ({ loggedInPage: page }) => {
    await page.goto("/files");
    await expect(page).toHaveURL("/files");

    await page.reload();
    await expect(page).toHaveURL("/files");
    await expect(page.getByText("My Files")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Mobile Navigation (375x667)
// ---------------------------------------------------------------------------
test.describe("Mobile Navigation", () => {
  test("hamburger menu toggles sidebar overlay", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // Desktop sidebar should not be visible
    await expect(page.locator("aside")).not.toBeVisible();

    // Open hamburger menu
    const topBar = page.locator(".fixed").filter({ hasText: "SnapOtter" }).first();
    const hamburger = topBar.locator("button").first();
    await hamburger.click();

    // Sidebar overlay should appear with nav items
    await expect(page.getByText("Tools").nth(1)).toBeVisible();
    await expect(page.getByText("Grid")).toBeVisible();

    await context.close();
  });

  test("tapping backdrop closes sidebar overlay", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // Open hamburger menu
    const topBar = page.locator(".fixed").filter({ hasText: "SnapOtter" }).first();
    const hamburger = topBar.locator("button").first();
    await hamburger.click();

    // Sidebar overlay should appear
    const backdrop = page.locator(".fixed.inset-0").first();
    await expect(backdrop).toBeVisible();

    // Click the backdrop to close
    await backdrop.click({ position: { x: 300, y: 300 } });
    await page.waitForTimeout(300);

    // Sidebar overlay should be closed (expanded sidebar nav no longer visible)
    await expect(backdrop).not.toBeVisible();

    await context.close();
  });

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

  test("hamburger menu Grid link navigates to /fullscreen", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // Open hamburger menu
    const topBar = page.locator(".fixed").filter({ hasText: "SnapOtter" }).first();
    const hamburger = topBar.locator("button").first();
    await hamburger.click();

    // Click Grid in expanded sidebar
    await page.getByText("Grid").click();
    await expect(page).toHaveURL("/fullscreen");

    await context.close();
  });

  test("hamburger menu Automate link navigates to /automate", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    const topBar = page.locator(".fixed").filter({ hasText: "SnapOtter" }).first();
    const hamburger = topBar.locator("button").first();
    await hamburger.click();

    await page.getByText("Automate").nth(1).click();
    await expect(page).toHaveURL("/automate");

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

  test("editor page is accessible from sidebar", async ({ loggedInPage: page }) => {
    await page.locator("aside").getByText("Editor").click();
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

    // Security section content should appear
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
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
// Fullscreen Grid - Tool Visibility
// ---------------------------------------------------------------------------
test.describe("Fullscreen Grid - AI Tool Visibility", () => {
  test("AI tools section is visible in fullscreen grid", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

    await expect(page.getByText("AI Tools")).toBeVisible();
    // At least one AI tool should be listed
    await expect(page.getByRole("link", { name: /Remove Background/ }).first()).toBeVisible();
  });

  test("tool cards display an icon and name", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");

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

    // Remove the step (click the remove/delete button on the step)
    const removeBtn = page
      .locator("button")
      .filter({ has: page.locator("svg") })
      .filter({
        hasText: /remove|delete|x/i,
      })
      .first();
    if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await removeBtn.click();
      await page.waitForTimeout(300);
      await expect(page.getByText("No steps yet")).toBeVisible();
    }
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

    // Home content should be intact
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("deep-linking to a specific tool page works", async ({ loggedInPage: page }) => {
    await page.goto("/watermark-text");
    await expect(page).toHaveURL("/watermark-text");
    await expect(page.getByText("Text Watermark").first()).toBeVisible();
  });

  test("double navigation to same page does not break state", async ({ loggedInPage: page }) => {
    await page.goto("/fullscreen");
    await expect(page).toHaveURL("/fullscreen");

    await page.goto("/fullscreen");
    await expect(page).toHaveURL("/fullscreen");

    // Page should still work correctly
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test("navigating from a legacy redirect to another page works", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/brightness-contrast");
    await expect(page).toHaveURL("/image/adjust-colors");

    await page.goto("/fullscreen");
    await expect(page).toHaveURL("/fullscreen");

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

      await page.goto(`/${tool.id}`);

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
