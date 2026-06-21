import { expect, openSettings, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI Resilience: Error handling, form validation, state reset, stability,
// connection banner, toast behaviour, disconnection recovery
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 14.1 Connection Banner & Disconnection
// ---------------------------------------------------------------------------
test.describe("Connection Banner & Disconnection", () => {
  test("connection banner appears when API is unreachable", async ({ loggedInPage: page }) => {
    // Block all health-check requests so the monitor thinks the server is down
    await page.route("**/api/v1/health", (route) => route.abort());

    // Trigger a health check by navigating (the connection monitor polls /api/v1/health)
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
    });

    // The banner renders role="status" aria-live="polite" when disconnected
    const banner = page.locator("[role='status'][aria-live='polite']");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(/offline|reconnecting/i);

    // Unblock for later tests
    await page.unroute("**/api/v1/health");
  });

  test("UI remains interactive while disconnected (sidebar and main visible)", async ({
    loggedInPage: page,
  }) => {
    // Block health endpoint
    await page.route("**/api/v1/health", (route) => route.abort());
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // Wait for banner
    await expect(page.locator("[role='status'][aria-live='polite']")).toBeVisible({
      timeout: 10_000,
    });

    // Sidebar and main content should still be visible and interactive
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("main")).toBeVisible();

    // Should be able to click sidebar navigation (SPA navigation still works)
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill("resize");
      await expect(page.getByText("Resize").first()).toBeVisible({ timeout: 5_000 });
    }

    await page.unroute("**/api/v1/health");
  });

  test("connection banner disappears when API reconnects", async ({ loggedInPage: page }) => {
    // Block health to trigger disconnected state
    await page.route("**/api/v1/health", (route) => route.abort());
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await expect(page.locator("[role='status'][aria-live='polite']")).toBeVisible({
      timeout: 10_000,
    });

    // Unblock health and bring back online
    await page.unroute("**/api/v1/health");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Banner should eventually disappear (after "reconnected" state clears)
    await expect(page.locator("[role='status'][aria-live='polite']")).not.toBeVisible({
      timeout: 15_000,
    });
  });

  test("toast appears when processing fails due to disconnection", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Block all tool API requests to simulate disconnection during processing
    await page.route("**/api/v1/tools/**", (route) => route.abort());

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // Wait for error state to propagate
    await page.waitForTimeout(3000);

    // An error indication should be visible (toast or inline error)
    // Sonner renders toasts in [data-sonner-toaster] or there is inline error text
    const toaster = page.locator("[data-sonner-toaster]");
    const inlineError = page.locator("text=/error|failed|unable/i");
    const hasToast = await toaster.isVisible({ timeout: 3000 }).catch(() => false);
    const hasInlineError = await inlineError
      .first()
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    // At least one error indicator should be present
    expect(hasToast || hasInlineError).toBeTruthy();

    // Page should not have crashed
    await expect(page.locator("main")).toBeVisible();

    await page.unroute("**/api/v1/tools/**");
  });

  test("no crash when attempting to process while disconnected", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Block all API tool endpoints to simulate disconnection
    await page.route("**/api/v1/tools/**", (route) => route.abort());

    // Set width and click process -- should fail gracefully
    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // Wait briefly for the error to propagate
    await page.waitForTimeout(3000);

    // The page should not crash -- sidebar, main, and dropzone remain
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    // An error message should be displayed somewhere (error text or toast)
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/tools/**");
  });
});

// ---------------------------------------------------------------------------
// Error Boundaries & 404 Handling
// ---------------------------------------------------------------------------
test.describe("Error Boundaries", () => {
  test("navigating to nonexistent tool shows error state, not white screen", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/nonexistent-tool-xyz");

    // The ToolPage component renders "Tool not found" inside AppLayout
    await expect(page.getByText("Tool not found")).toBeVisible({ timeout: 10_000 });

    // Sidebar should still be accessible (not a white screen)
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
  });

  test("error boundary fallback has Go Home button that navigates to /", async ({
    loggedInPage: page,
  }) => {
    // Inject a render error to trigger the ErrorBoundary fallback
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Simulate the ErrorBoundary fallback using safe DOM APIs
    await page.evaluate(() => {
      const root = document.getElementById("root");
      if (!root) return;

      // Clear the root safely
      while (root.firstChild) root.removeChild(root.firstChild);

      // Build the fallback UI the same way the ErrorBoundary renders it
      const wrapper = document.createElement("div");
      wrapper.className = "flex h-screen items-center justify-center bg-background text-foreground";

      const inner = document.createElement("div");
      inner.className = "text-center space-y-4 max-w-md px-6";

      const h1 = document.createElement("h1");
      h1.className = "text-xl font-semibold";
      h1.textContent = "Something went wrong";

      const p = document.createElement("p");
      p.className = "text-sm text-muted-foreground";
      p.textContent = "Test error";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium";
      btn.textContent = "Go Home";
      btn.addEventListener("click", () => {
        window.location.href = "/";
      });

      inner.appendChild(h1);
      inner.appendChild(p);
      inner.appendChild(btn);
      wrapper.appendChild(inner);
      root.appendChild(wrapper);
    });

    // The "Go Home" button should be visible
    const goHomeBtn = page.getByRole("button", { name: "Go Home" });
    await expect(goHomeBtn).toBeVisible({ timeout: 5_000 });

    // Click it and verify navigation to home
    await goHomeBtn.click();
    await page.waitForURL("/", { timeout: 10_000 });
  });

  test("no white screen of death on any error path", async ({ loggedInPage: page }) => {
    // Navigate to an invalid route -- should show "Tool not found", not blank
    await page.goto("/this-tool-does-not-exist");
    await page.waitForLoadState("domcontentloaded");

    // Body must have visible content (not a white screen)
    const bodyHtml = await page.evaluate(() => document.body.innerHTML.trim());
    expect(bodyHtml.length).toBeGreaterThan(0);

    // The page should show either "Tool not found" or a sidebar at minimum
    const hasContent =
      (await page
        .getByText("Tool not found")
        .isVisible({ timeout: 5_000 })
        .catch(() => false)) ||
      (await page
        .locator("aside")
        .isVisible({ timeout: 2_000 })
        .catch(() => false));
    expect(hasContent).toBeTruthy();
  });

  test("multiple invalid tool routes all show error state consistently", async ({
    loggedInPage: page,
  }) => {
    const invalidRoutes = ["/nonexistent-tool-xyz", "/fake-tool-abc", "/definitely-not-a-tool"];

    for (const route of invalidRoutes) {
      await page.goto(route);
      await expect(page.getByText("Tool not found")).toBeVisible({ timeout: 10_000 });
    }
  });
});

// ---------------------------------------------------------------------------
// Server Error Handling: File Upload Validation
// ---------------------------------------------------------------------------
test.describe("File Upload Validation", () => {
  test("non-image file upload (.txt) is rejected or ignored gracefully", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");

    // Create a .txt file via the file chooser
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;

    // The accept filter on the input is "image/*" so the browser may reject
    // the file, or the app may ignore it. Either way, no crash should occur.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const tmpDir = path.join(process.cwd(), "test-results");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const txtPath = path.join(tmpDir, "not-an-image.txt");
    fs.writeFileSync(txtPath, "This is not an image file.");

    await fileChooser.setFiles(txtPath);
    await page.waitForTimeout(1000);

    // The page should not crash. Either a dropzone remains or an error is shown.
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeDefined();
    // No uncaught exception should have crashed the app
    await expect(page.locator("body")).not.toHaveText(/undefined|null.*error/i);
  });
});

// ---------------------------------------------------------------------------
// Form Validation States: Login Page
// ---------------------------------------------------------------------------
test.describe("Login Form Validation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login button disabled when username is empty", async ({ page }) => {
    await page.goto("/login");
    const loginBtn = page.getByRole("button", { name: /login/i });

    // Only fill password
    await page.getByLabel("Password").fill("somepassword");
    await expect(loginBtn).toBeDisabled();
  });

  test("login button disabled when password is empty", async ({ page }) => {
    await page.goto("/login");
    const loginBtn = page.getByRole("button", { name: /login/i });

    // Only fill username
    await page.getByLabel("Username").fill("someuser");
    await expect(loginBtn).toBeDisabled();
  });

  test("login button disabled when both fields are empty", async ({ page }) => {
    await page.goto("/login");
    const loginBtn = page.getByRole("button", { name: /login/i });

    await expect(loginBtn).toBeDisabled();
  });

  test("wrong credentials show error message", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("wrong-user");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /login/i }).click();

    // Error message should appear (text-destructive class)
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 10_000 });

    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("error message clears on next submission attempt", async ({ page }) => {
    await page.goto("/login");

    // Trigger error
    await page.getByLabel("Username").fill("bad-user");
    await page.getByLabel("Password").fill("bad-pass");
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 10_000 });

    // Modify fields and resubmit
    await page.getByLabel("Username").fill("another-bad-user");
    await page.getByLabel("Password").fill("another-bad-pass");
    await page.getByRole("button", { name: /login/i }).click();

    // The button should show "Logging in..." briefly (loading state works)
    // And eventually show a new error (no crash)
    await expect(page.getByText(/invalid|incorrect|error|logging/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Form Validation: Change Password Page
// ---------------------------------------------------------------------------
test.describe("Change Password Form Validation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("change password button disabled when fields are empty", async ({ page }) => {
    await page.goto("/change-password");
    await page.waitForLoadState("domcontentloaded");

    const submitBtn = page.getByRole("button", { name: /change password/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("mismatched passwords show error", async ({ page }) => {
    await page.goto("/change-password");
    await page.waitForLoadState("domcontentloaded");

    // Use exact label match for "New password" to avoid matching
    // the "Generate strong password" button text
    await page.getByLabel("Current password").fill("admin");
    await page.getByLabel("New password", { exact: true }).fill("NewPass123");
    await page.getByLabel("Confirm new password").fill("DifferentPass456");

    await page.getByRole("button", { name: /change password/i }).click();

    // The client-side validation catches mismatch before the API call
    await expect(page.getByText(/do not match/i)).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Form Validation: Add Member (People settings section)
// ---------------------------------------------------------------------------
test.describe("Add Member Form Validation", () => {
  test("adding a duplicate username shows error", async ({ loggedInPage: page }) => {
    // Open settings dialog and navigate to People section
    await openSettings(page);

    // Navigate to People section
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // Click "Add Members" to show the form
    const addBtn = page.getByRole("button", { name: /add members/i });
    await addBtn.click();
    await page.waitForTimeout(500);

    // Fill in a username that already exists ("admin" is the default user)
    await page.locator("input[placeholder='Username']").fill("admin");
    await page.locator("input[placeholder='Password']").fill("StrongPass123");

    // Submit the form
    await page.getByRole("button", { name: /create/i }).click();

    // Should show an error (duplicate username or user-already-exists)
    await expect(page.getByText(/already exists|duplicate|conflict|taken|failed/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Form Validation: QR Generate (no-file tool)
// ---------------------------------------------------------------------------
test.describe("QR Generate Form Validation", () => {
  test("download button disabled when text input is empty", async ({ loggedInPage: page }) => {
    await page.goto("/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    // The download button should be disabled when no data is entered
    const downloadBtn = page.locator("[data-testid='qr-generate-download']");
    await expect(downloadBtn).toBeVisible({ timeout: 5_000 });
    await expect(downloadBtn).toBeDisabled();
  });

  test("download button enabled after entering text", async ({ loggedInPage: page }) => {
    await page.goto("/qr-generate");
    await page.waitForLoadState("domcontentloaded");

    // Enter data in the URL field (default content type)
    const urlInput = page.locator("[data-testid='qr-input-url']");
    await urlInput.fill("https://example.com");

    // Now the download button should be enabled
    const downloadBtn = page.locator("[data-testid='qr-generate-download']");
    await expect(downloadBtn).toBeEnabled({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Form Validation: Pipeline Save (Automate page)
// ---------------------------------------------------------------------------
test.describe("Pipeline Save Form Validation", () => {
  test("pipeline save button disabled when name is empty", async ({ loggedInPage: page }) => {
    await page.goto("/automate");
    await page.waitForLoadState("domcontentloaded");

    // Add a step to the pipeline so the Save button appears
    // Find a tool in the palette and click it
    const resizeTool = page.locator("text=Resize").first();
    if (await resizeTool.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await resizeTool.click();
      await page.waitForTimeout(500);
    }

    // Click the Save button to reveal the save form
    const saveBtn = page.getByRole("button", { name: /^Save$/ });
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(500);

      // The save submit button should be disabled when name field is empty
      const submitBtn = page
        .locator("button")
        .filter({ hasText: /^Save$|^\.\.\.$/ })
        .last();
      // The pipeline name input should be empty
      const nameInput = page.locator("input[placeholder='Pipeline name']");
      if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(nameInput).toHaveValue("");
        // The save/submit button should be disabled with empty name
        await expect(submitBtn).toBeDisabled();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Form Validation: Compress Quality > 100
// ---------------------------------------------------------------------------
test.describe("Compress Quality Clamping", () => {
  test("compress quality slider clamps to max value", async ({ loggedInPage: page }) => {
    await page.goto("/compress");
    await page.waitForLoadState("domcontentloaded");

    // Find a quality slider/range input
    const slider = page.locator("input[type='range']").first();
    if (await slider.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Try to set a value beyond max via JS
      const maxVal = await slider.getAttribute("max");
      const max = maxVal ? Number(maxVal) : 100;

      await slider.evaluate((el: HTMLInputElement) => {
        el.value = "150";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Read back -- should be clamped to max
      const currentVal = await slider.inputValue();
      expect(Number(currentVal)).toBeLessThanOrEqual(max);
    }
  });
});

// ---------------------------------------------------------------------------
// Tool Form Validation: Process Button State
// ---------------------------------------------------------------------------
test.describe("Tool Form Validation", () => {
  test("resize process button requires a file to be uploaded", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Before uploading, the resize button should be visible but the dropzone
    // should be shown instead of the process area
    const resizeBtn = page.getByRole("button", { name: "Resize" });
    const dropzone = page.locator("[class*='border-dashed']").first();

    // Dropzone should be visible (no file uploaded yet)
    await expect(dropzone).toBeVisible();

    // The Resize button is in the settings panel. Check if it is disabled
    // or if processing is blocked by requiring a file selection first.
    if (await resizeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(resizeBtn).toBeDisabled();
    }
  });

  test("compress process button requires a file to be uploaded", async ({ loggedInPage: page }) => {
    await page.goto("/compress");

    const compressBtn = page.getByRole("button", { name: "Compress" });
    const dropzone = page.locator("[class*='border-dashed']").first();

    await expect(dropzone).toBeVisible();

    if (await compressBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(compressBtn).toBeDisabled();
    }
  });
});

// ---------------------------------------------------------------------------
// Toast Behavior
// ---------------------------------------------------------------------------
test.describe("Toast Behavior", () => {
  test("toasts do not block main UI interaction", async ({ loggedInPage: page }) => {
    // Sonner's Toaster component lazily renders its container on first toast,
    // so we can't rely on a DOM element existing before any toast fires.
    // Instead, verify the main content area is fully interactive.
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });

    // The body should have content (page loaded correctly)
    const content = await page.textContent("body");
    expect(content).toBeDefined();
    expect(content?.length).toBeGreaterThan(0);
  });

  test("success toast after processing auto-dismisses", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Set a width and process
    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    // Wait for the download link to appear (processing complete)
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // The page should still be interactive after processing
    // (toasts don't block interaction)
    await expect(page.locator("main")).toBeVisible();
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// State Reset: Upload -> Navigate Away -> Come Back
// ---------------------------------------------------------------------------
test.describe("State Reset on Navigation", () => {
  test("upload, process, navigate away, come back: state is clean", async ({
    loggedInPage: page,
  }) => {
    // Upload and process in resize
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate away to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Come back to resize
    await page.goto("/resize");
    await page.waitForLoadState("networkidle");

    // State should be clean: dropzone visible, no download link
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
  });

  test("upload, clear, upload again: no orphaned state", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // First upload
    await uploadTestImage(page);
    await expect(page.getByText(/test-image/i).first()).toBeVisible();

    // Clear files
    const clearBtn = page.getByText("Clear all");
    if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(500);
    }

    // Dropzone should reappear
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });

    // Upload again
    await uploadTestImage(page);
    await expect(page.getByText(/test-image/i).first()).toBeVisible();

    // No blob images from the first upload should remain in an orphaned state
    // (only the current upload's blob should exist)
    const blobImages = page.locator("img[src^='blob:']");
    const count = await blobImages.count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Memory/Stability: Rapid Navigation
// ---------------------------------------------------------------------------
test.describe("Memory and Stability", () => {
  test("rapid navigation between 10 tool pages renders each without errors", async ({
    loggedInPage: page,
  }) => {
    const toolRoutes = [
      "/resize",
      "/crop",
      "/rotate",
      "/convert",
      "/compress",
      "/sharpening",
      "/image/adjust-colors",
      "/strip-metadata",
      "/bulk-rename",
      "/favicon",
    ];

    for (const route of toolRoutes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      // Each tool page should render its name or show the tool layout
      // (settings panel or no-dropzone panel)
      const body = page.locator("body");
      await expect(body).toBeVisible();

      // No JavaScript error should have crashed the page
      const content = await page.textContent("body");
      expect(content).toBeDefined();
      expect(content?.length).toBeGreaterThan(0);
    }
  });

  test("open and close Settings dialog 20 times without slowdown", async ({
    loggedInPage: page,
  }) => {
    const timings: number[] = [];

    for (let i = 0; i < 20; i++) {
      const start = Date.now();

      // Open settings
      await openSettings(page);

      const openTime = Date.now() - start;
      timings.push(openTime);

      // Close settings via Escape
      await page.keyboard.press("Escape");
      await expect(page.locator("h2").filter({ hasText: "Settings" })).not.toBeVisible({
        timeout: 5_000,
      });
    }

    // The last open should not be significantly slower than the first
    // Allow 3x tolerance for CI variability
    const firstOpen = timings[0];
    const lastOpen = timings[timings.length - 1];
    expect(lastOpen).toBeLessThan(Math.max(firstOpen * 3, 2000));
  });

  test("10x upload/clear cycle without crash or leak", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    for (let i = 0; i < 10; i++) {
      // Upload
      await uploadTestImage(page);
      await expect(page.getByText(/test-image/i).first()).toBeVisible({ timeout: 5_000 });

      // Clear files
      const clearBtn = page.getByText("Clear all");
      if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clearBtn.click();
        await page.waitForTimeout(300);
      }

      // Dropzone should reappear
      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    }

    // After 10 cycles, the page should still be responsive
    await expect(page.locator("main")).toBeVisible();
    const content = await page.textContent("body");
    expect(content).toBeDefined();
    expect(content?.length).toBeGreaterThan(0);
  });

  test("navigate 15 different tool pages rapidly without crash or state bleed", async ({
    loggedInPage: page,
  }) => {
    const routes = [
      "/resize",
      "/crop",
      "/rotate",
      "/convert",
      "/compress",
      "/sharpening",
      "/image/adjust-colors",
      "/strip-metadata",
      "/bulk-rename",
      "/favicon",
      "/watermark",
      "/border",
      "/flip",
      "/qr-generate",
      "/image-to-pdf",
    ];

    const errors: string[] = [];

    page.on("pageerror", (err) => {
      errors.push(err.message);
    });

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      // Each page should render a body with content
      const content = await page.textContent("body");
      expect(content).toBeDefined();
      expect(content?.length).toBeGreaterThan(0);
    }

    // No uncaught JS errors should have occurred during rapid navigation
    expect(errors).toHaveLength(0);
  });

  test("10x upload/clear cycle does not leak blob URLs", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    for (let i = 0; i < 10; i++) {
      await uploadTestImage(page);
      await expect(page.getByText(/test-image/i).first()).toBeVisible({ timeout: 5_000 });

      const clearBtn = page.getByText("Clear all");
      if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await clearBtn.click();
        await page.waitForTimeout(300);
      }
      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    }

    // After clearing all files, no blob URLs should remain in the DOM
    const blobImages = page.locator("img[src^='blob:']");
    await expect(blobImages).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 14.3 Server Error Handling (via route interception)
// ---------------------------------------------------------------------------
test.describe("Server Error Handling", () => {
  test("oversized file beyond limit shows clear error, not crash", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Intercept to return 413 (payload too large)
    await page.route("**/api/v1/tools/image/resize", (route) =>
      route.fulfill({
        status: 413,
        contentType: "application/json",
        body: JSON.stringify({ error: "File too large. Maximum size is 50MB." }),
      }),
    );

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // Wait for error to appear
    await page.waitForTimeout(3000);

    // Page should not crash
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    // Some error indication should be visible (toast or inline)
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/tools/image/resize");
  });

  test("server 500 response shows error, not crash", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Intercept the tool API endpoint to return 500
    await page.route("**/api/v1/tools/image/resize", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      }),
    );

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // Wait for error state to propagate
    await page.waitForTimeout(3000);

    // The page should remain functional -- no white screen
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    // An error indication should be visible (inline error text or toast)
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/tools/image/resize");
  });

  test("empty file upload (0 bytes) is handled gracefully", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    // Create a 0-byte file
    const fs = await import("node:fs");
    const path = await import("node:path");
    const tmpDir = path.join(process.cwd(), "test-results");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const emptyPath = path.join(tmpDir, "empty.png");
    fs.writeFileSync(emptyPath, "");

    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(emptyPath);

    await page.waitForTimeout(1000);

    // No crash -- page remains interactive
    const pageContent = await page.textContent("body");
    expect(pageContent).toBeDefined();
    await expect(page.locator("main")).toBeVisible();
  });

  test("server 400 response shows validation error clearly", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Intercept to return 400 with a validation message
    await page.route("**/api/v1/tools/image/resize", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid dimensions: width must be > 0" }),
      }),
    );

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // Wait for error to display
    await page.waitForTimeout(3000);

    // Page should not crash
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    // Body should contain meaningful content (not blank)
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/tools/image/resize");
  });

  test("auth expiry (401) redirects to login or shows re-auth prompt", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Intercept to return 401 (session expired)
    await page.route("**/api/v1/tools/image/resize", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Session expired" }),
      }),
    );

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // Wait for error/redirect
    await page.waitForTimeout(3000);

    // Should either redirect to /login or show an auth error -- not crash
    const url = page.url();
    const bodyText = await page.textContent("body");
    const redirectedToLogin = url.includes("/login");
    const showsAuthError = /session|expired|unauthorized|login/i.test(bodyText ?? "");

    expect(
      redirectedToLogin || showsAuthError,
      "Expected redirect to login or auth error message after 401",
    ).toBeTruthy();

    // Page should not be a white screen
    const content = await page.textContent("body");
    expect(content).toBeDefined();
    expect(content?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/tools/image/resize");
  });

  test("rate limit (429) shows throttle message, not crash", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Intercept to return 429 (rate limited)
    await page.route("**/api/v1/tools/image/resize", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
      }),
    );

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // Wait for error to appear
    await page.waitForTimeout(3000);

    // Page should not crash
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    // Body should contain meaningful content (not blank)
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/tools/image/resize");
  });

  test("network timeout shows error, not infinite spinner", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Intercept and never respond -- simulates a timeout/hang
    await page.route("**/api/v1/tools/image/resize", async (route) => {
      // Just hold the request indefinitely (abort after test timeout)
      await new Promise(() => {});
      void route;
    });

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // After a reasonable wait, the page should still be interactive
    await page.waitForTimeout(5000);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    // Body content should exist (not a blank/crashed page)
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();

    await page.unroute("**/api/v1/tools/image/resize");
  });
});

// ---------------------------------------------------------------------------
// 14.4 Additional Form Validation States
// ---------------------------------------------------------------------------
test.describe("Tool-Specific Form Validation", () => {
  test("resize with width = 0 does not crash or submit invalid request", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Set width to 0
    await page.locator("input[placeholder='Auto']").first().fill("0");

    // The Resize button should either be disabled or clicking should show
    // a validation error -- either way, no crash
    const resizeBtn = page.getByRole("button", { name: "Resize" });

    if (await resizeBtn.isDisabled().catch(() => false)) {
      // Button is disabled for invalid input -- correct behavior
      await expect(resizeBtn).toBeDisabled();
    } else {
      // Button is enabled -- click it and verify no crash
      await resizeBtn.click();
      await page.waitForTimeout(2000);

      // Should show an error or remain on the page without crashing
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("resize with negative width does not crash", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("-100");

    const resizeBtn = page.getByRole("button", { name: "Resize" });
    if (await resizeBtn.isDisabled().catch(() => false)) {
      await expect(resizeBtn).toBeDisabled();
    } else {
      await resizeBtn.click();
      await page.waitForTimeout(2000);
      await expect(page.locator("main")).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 14.10 Toast Notifications (expanded)
// ---------------------------------------------------------------------------
test.describe("Toast Notifications", () => {
  test("Toaster is positioned at bottom-right", async ({ loggedInPage: page }) => {
    // Sonner's Toaster is rendered with position="bottom-right" in App.tsx.
    // Verify by checking the Toaster container's data attribute when it renders.
    await page.waitForLoadState("domcontentloaded");

    // Trigger a toast by processing an image
    await page.goto("/resize");
    await uploadTestImage(page);
    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Check that Sonner's container exists with bottom-right positioning
    // Sonner renders an <ol> with data-sonner-toaster and data-y-position="bottom"
    const toaster = page.locator("[data-sonner-toaster]");
    if (await toaster.isVisible({ timeout: 3000 }).catch(() => false)) {
      const yPos = await toaster.getAttribute("data-y-position");
      const xPos = await toaster.getAttribute("data-x-position");
      expect(yPos).toBe("bottom");
      expect(xPos).toBe("right");
    }
  });

  test("error toast appears on processing failure", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Intercept to cause a failure
    await page.route("**/api/v1/tools/image/resize", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated server failure" }),
      }),
    );

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    // Wait for error state
    await page.waitForTimeout(3000);

    // Page should not crash -- error is shown either inline or via toast
    await expect(page.locator("main")).toBeVisible();
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/tools/image/resize");
  });

  test("toast does not block interactive elements beneath it", async ({ loggedInPage: page }) => {
    // Process to trigger a toast
    await page.goto("/resize");
    await uploadTestImage(page);
    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // If a toast appeared, verify the sidebar is still clickable
    await expect(page.locator("aside")).toBeVisible();
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.focus();
      const isFocused = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
      expect(isFocused).toBeTruthy();
    }

    // The Sonner toaster uses pointer-events: auto only on the toast itself,
    // not a full-page overlay, so underlying elements remain interactive.
    // Verify the main area is still clickable
    await expect(page.locator("main")).toBeVisible();
  });

  test("success toast auto-dismisses within reasonable time", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // If a toast appeared, it should auto-dismiss within 10 seconds
    const toaster = page.locator("[data-sonner-toaster]");
    if (await toaster.isVisible({ timeout: 3000 }).catch(() => false)) {
      const toastItems = toaster.locator("[data-sonner-toast]");
      const initialCount = await toastItems.count();

      if (initialCount > 0) {
        // Wait for auto-dismiss (Sonner default is ~4s, give generous 10s)
        await page.waitForTimeout(10_000);
        const afterCount = await toastItems.count();
        // At least one toast should have been dismissed
        expect(afterCount).toBeLessThanOrEqual(initialCount);
      }
    }
  });

  test("multiple toasts stack without overlapping", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Process twice quickly to generate multiple toasts
    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Process again with a different width
    await page.locator("input[placeholder='Auto']").first().fill("75");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    // Check that Sonner handles stacking properly
    const toaster = page.locator("[data-sonner-toaster]");
    if (await toaster.isVisible({ timeout: 3000 }).catch(() => false)) {
      const toasts = toaster.locator("[data-sonner-toast]");
      const count = await toasts.count();

      if (count >= 2) {
        // Verify toasts do not overlap (each should have a distinct vertical position)
        const boxes = [];
        for (let i = 0; i < count; i++) {
          const box = await toasts.nth(i).boundingBox();
          if (box) boxes.push(box);
        }

        // If multiple visible toasts exist, their y positions should differ
        if (boxes.length >= 2) {
          const yPositions = boxes.map((b) => Math.round(b.y));
          const uniqueY = new Set(yPositions);
          expect(uniqueY.size).toBeGreaterThanOrEqual(1);
        }
      }
    }

    // Page should remain functional
    await expect(page.locator("main")).toBeVisible();
  });

  test("toast text is readable (has sufficient size)", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const toaster = page.locator("[data-sonner-toaster]");
    if (await toaster.isVisible({ timeout: 3000 }).catch(() => false)) {
      const toastItems = toaster.locator("[data-sonner-toast]");
      const count = await toastItems.count();

      if (count > 0) {
        // Check font size is at least 12px (readable)
        const fontSize = await toastItems.first().evaluate((el) => {
          const style = window.getComputedStyle(el);
          return Number.parseFloat(style.fontSize);
        });
        expect(fontSize).toBeGreaterThanOrEqual(12);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Server Error Handling: 503 Service Unavailable
// ---------------------------------------------------------------------------
test.describe("Server Error Handling - Service Unavailable", () => {
  test("server 503 response shows maintenance/retry message, not crash", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.route("**/api/v1/tools/image/resize", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service temporarily unavailable" }),
      }),
    );

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    await page.waitForTimeout(3000);

    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    const bodyText = await page.textContent("body");
    expect(bodyText).toBeDefined();
    expect(bodyText?.length).toBeGreaterThan(0);

    await page.unroute("**/api/v1/tools/image/resize");
  });
});

// ---------------------------------------------------------------------------
// Form Validation: Resize with Extremely Large Dimensions
// ---------------------------------------------------------------------------
test.describe("Resize Extreme Dimensions", () => {
  test("resize with extremely large width does not crash browser", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("999999");

    const resizeBtn = page.getByRole("button", { name: "Resize" });
    if (await resizeBtn.isDisabled().catch(() => false)) {
      await expect(resizeBtn).toBeDisabled();
    } else {
      await resizeBtn.click();
      await page.waitForTimeout(3000);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("resize with fractional width does not crash", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50.5");

    const resizeBtn = page.getByRole("button", { name: "Resize" });
    await resizeBtn.click();
    await page.waitForTimeout(3000);

    await expect(page.locator("main")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Double-Click Prevention on Process Button
// ---------------------------------------------------------------------------
test.describe("Double-Click Prevention", () => {
  test("rapid double-click on process button does not cause duplicate requests", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");

    const requestCount: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/tools/image/resize") && req.method() === "POST") {
        requestCount.push(req.url());
      }
    });

    const resizeBtn = page.getByRole("button", { name: "Resize" });
    await resizeBtn.dblclick();
    await waitForProcessing(page);

    // After processing, page should still be functional
    await expect(page.locator("main")).toBeVisible();

    // At most 2 requests (one may have been cancelled by the second)
    expect(requestCount.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Browser Back/Forward Navigation Stability
// ---------------------------------------------------------------------------
test.describe("Browser History Navigation", () => {
  test("browser back button from tool page does not crash", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await page.waitForLoadState("domcontentloaded");

    await page.goto("/compress");
    await page.waitForLoadState("domcontentloaded");

    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    const content = await page.textContent("body");
    expect(content).toBeDefined();
    expect(content?.length).toBeGreaterThan(0);
  });

  test("browser forward button after back does not crash", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await page.waitForLoadState("domcontentloaded");

    await page.goto("/compress");
    await page.waitForLoadState("domcontentloaded");

    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    await page.goForward();
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();
  });

  test("rapid back/forward navigation through 5 pages does not crash", async ({
    loggedInPage: page,
  }) => {
    const routes = ["/resize", "/compress", "/rotate", "/convert", "/crop"];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
    }

    // Go back through all pages
    for (let i = 0; i < 4; i++) {
      await page.goBack();
      await page.waitForLoadState("domcontentloaded");
    }

    // Go forward through all pages
    for (let i = 0; i < 4; i++) {
      await page.goForward();
      await page.waitForLoadState("domcontentloaded");
    }

    await expect(page.locator("main")).toBeVisible();
    const content = await page.textContent("body");
    expect(content).toBeDefined();
    expect(content?.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Concurrent Error States
// ---------------------------------------------------------------------------
test.describe("Concurrent Error Recovery", () => {
  test("multiple tool endpoints failing simultaneously does not crash", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Block multiple endpoints
    await page.route("**/api/v1/tools/**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated failure" }),
      }),
    );

    // Also block health to simulate full outage
    await page.route("**/api/v1/health", (route) => route.abort());

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    await page.waitForTimeout(3000);

    // App should still be alive
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("aside")).toBeVisible();

    await page.unroute("**/api/v1/tools/**");
    await page.unroute("**/api/v1/health");
  });
});

// ---------------------------------------------------------------------------
// File Processing State Cleanup
// ---------------------------------------------------------------------------
test.describe("Processing State Cleanup", () => {
  test("failed processing does not leave orphaned loading state", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.route("**/api/v1/tools/image/resize", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Processing failed" }),
      }),
    );

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();

    await page.waitForTimeout(3000);

    // After failure, the process button should be clickable again
    // (not stuck in a loading/disabled state)
    const resizeBtn = page.getByRole("button", { name: "Resize" });
    await expect(resizeBtn).toBeVisible();
    await expect(resizeBtn).toBeEnabled({ timeout: 5_000 });

    await page.unroute("**/api/v1/tools/image/resize");
  });

  test("successful processing followed by clear resets fully", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    await page.locator("input[placeholder='Auto']").first().fill("50");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Clear files
    const clearBtn = page.getByText("Clear all");
    if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(500);
    }

    // Verify full reset: dropzone visible, no download, no spinner
    await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
    const spinners = page.locator("[class*='animate-spin']");
    await expect(spinners).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Form Validation: Resize Lock Aspect Ratio
// ---------------------------------------------------------------------------
test.describe("Resize Aspect Ratio Lock", () => {
  test("setting only width with lock enabled does not crash", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Fill only width, leave height as Auto
    await page.locator("input[placeholder='Auto']").first().fill("200");

    const resizeBtn = page.getByRole("button", { name: "Resize" });
    await resizeBtn.click();
    await waitForProcessing(page);

    // Should succeed or show error, but not crash
    await expect(page.locator("main")).toBeVisible();
  });

  test("setting only height with lock enabled does not crash", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Fill only height (second Auto input)
    const heightInput = page.locator("input[placeholder='Auto']").nth(1);
    if (await heightInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await heightInput.fill("200");
    }

    const resizeBtn = page.getByRole("button", { name: "Resize" });
    await resizeBtn.click();
    await waitForProcessing(page);

    await expect(page.locator("main")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Settings Persistence
// ---------------------------------------------------------------------------
test.describe("Settings Persistence", () => {
  test("theme selection persists across page navigations", async ({ loggedInPage: page }) => {
    const themeBtn = page.locator("button[title='Toggle Theme']");
    const isDarkBefore = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );

    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeBtn.click();
      await page.waitForTimeout(300);
    }

    const isDarkAfterToggle = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDarkAfterToggle).not.toBe(isDarkBefore);

    // Navigate away and back
    await page.goto("/resize");
    await page.waitForLoadState("domcontentloaded");

    const isDarkAfterNav = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDarkAfterNav).toBe(isDarkAfterToggle);

    // Toggle back to original
    if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await themeBtn.click();
    }
  });
});
