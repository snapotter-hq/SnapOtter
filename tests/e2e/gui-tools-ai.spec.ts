import { expect, test, uploadTestImage } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: AI-Powered Tools
// (remove-background, upscale, ocr, blur-faces, enhance-faces, erase-object,
//  smart-crop, colorize, noise-removal, passport-photo, red-eye-removal,
//  restore-photo)
//
// NOTE: The AI sidecar is NOT running in CI. These tests verify UI rendering,
// control interactions, and graceful error handling -- not AI processing.
// ---------------------------------------------------------------------------

test.describe("GUI AI Tools", () => {
  // ========================================================================
  // REMOVE BACKGROUND
  // ========================================================================
  test.describe("Remove Background", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/remove-background");
      await expect(page.getByText("Remove Background").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows subject type buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/remove-background");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "People" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Products" })).toBeVisible();
      await expect(page.getByRole("button", { name: "General" })).toBeVisible();
    });

    test("shows quality tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/remove-background");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
      await expect(page.getByRole("button", { name: "HD" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Max" })).toBeVisible();
    });

    test("ultra quality visible only for People subject", async ({ loggedInPage: page }) => {
      await page.goto("/remove-background");
      await uploadTestImage(page);

      // People is default -- Ultra should be visible
      await expect(page.getByRole("button", { name: "Ultra" })).toBeVisible();

      // Switch to Products -- Ultra should disappear
      await page.getByRole("button", { name: "Products" }).click();
      await expect(page.getByRole("button", { name: "Ultra" })).not.toBeVisible();
    });

    test("shows background type buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/remove-background");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Transparent" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Color" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Gradient" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Image" })).toBeVisible();
    });

    test("color presets appear when Color background is selected", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/remove-background");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Color" }).click();
      // Should show color preset buttons (White, Black, etc.)
      await expect(page.locator("button[title='White']")).toBeVisible();
      await expect(page.locator("button[title='Black']")).toBeVisible();
    });

    test("gradient presets appear when Gradient background is selected", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/remove-background");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Gradient" }).click();
      // Gradient preset buttons with titles
      await expect(page.locator("button[title='Purple']")).toBeVisible();
      await expect(page.locator("button[title='Pink']")).toBeVisible();
    });

    test("effects section is collapsible", async ({ loggedInPage: page }) => {
      await page.goto("/remove-background");
      await uploadTestImage(page);

      // Expand Effects
      await page.getByText("Effects").click();
      await expect(page.getByText("Blur Background")).toBeVisible();
      await expect(page.getByText("Add Shadow")).toBeVisible();
    });

    test("submit button disabled without file, enabled with file", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/remove-background");

      const submitBtn = page.getByTestId("remove-background-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
    });

    // NOTE: Error handling tests for AI sidecar unavailability require the
    // sidecar to be running (to return a "not installed" response). These are
    // covered by integration tests instead.
  });

  // ========================================================================
  // UPSCALE
  // ========================================================================
  test.describe("Upscale", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/upscale");
      await expect(page.getByText("Image Upscaling").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows scale factor buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/upscale");
      await uploadTestImage(page);

      await expect(page.getByText("Scale Factor")).toBeVisible();
      // Quick scale buttons
      await expect(page.locator("button").filter({ hasText: /^2x$/ }).first()).toBeVisible();
      await expect(page.locator("button").filter({ hasText: /^4x$/ }).first()).toBeVisible();
      await expect(page.locator("button").filter({ hasText: /^8x$/ }).first()).toBeVisible();
    });

    test("shows quality tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/upscale");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Best" })).toBeVisible();
    });

    test("shows enhance faces checkbox in non-Fast mode", async ({ loggedInPage: page }) => {
      await page.goto("/upscale");
      await uploadTestImage(page);

      // Balanced is default, should show face enhancement
      await expect(page.getByText("Enhance faces")).toBeVisible();
    });

    test("shows noise reduction slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/upscale");
      await uploadTestImage(page);

      await expect(page.getByText("Noise Reduction")).toBeVisible();
    });

    test("shows output format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/upscale");
      await uploadTestImage(page);

      await expect(page.locator("#upscale-format")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/upscale");

      const submitBtn = page.getByTestId("upscale-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/upscale");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ========================================================================
  // OCR / TEXT EXTRACTION
  // ========================================================================
  test.describe("OCR", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/ocr");
      await expect(page.getByText("OCR").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows quality selector buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/ocr");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Best" })).toBeVisible();
    });

    test("shows enhance before scanning checkbox after upload", async ({ loggedInPage: page }) => {
      await page.goto("/ocr");
      await uploadTestImage(page);

      await expect(page.getByText("Enhance before scanning")).toBeVisible();
    });

    test("shows collapsible Language section after upload", async ({ loggedInPage: page }) => {
      await page.goto("/ocr");
      await uploadTestImage(page);

      // Language section shows default "Auto-detect"
      await expect(page.getByText("Language")).toBeVisible();
      await expect(page.getByText("Auto-detect")).toBeVisible();

      // Expand language section
      await page.getByText("Language").click();
      // Language dropdown should appear
      const select = page.locator("select");
      await expect(select.first()).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/ocr");

      const submitBtn = page.getByTestId("ocr-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Extract Text/);
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/ocr");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ========================================================================
  // BLUR FACES
  // ========================================================================
  test.describe("Blur Faces", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/blur-faces");
      await expect(page.getByText("Face").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows blur radius and sensitivity sliders after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/blur-faces");
      await uploadTestImage(page);

      await expect(page.locator("#blur-faces-blur-radius")).toBeVisible();
      await expect(page.getByText("Blur Radius")).toBeVisible();
      await expect(page.getByText("Light").first()).toBeVisible();
      await expect(page.getByText("Heavy").first()).toBeVisible();

      await expect(page.locator("#blur-faces-sensitivity")).toBeVisible();
      await expect(page.getByText("Detection Sensitivity")).toBeVisible();
      await expect(page.getByText("More faces")).toBeVisible();
      await expect(page.getByText("Fewer faces")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/blur-faces");

      const submitBtn = page.getByTestId("blur-faces-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Blur Faces/);
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/blur-faces");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ========================================================================
  // ENHANCE FACES
  // ========================================================================
  test.describe("Enhance Faces", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/enhance-faces");
      await expect(page.getByText("Face Enhancement").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows quality tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/enhance-faces");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Best" })).toBeVisible();
    });

    test("shows enhancement strength slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/enhance-faces");
      await uploadTestImage(page);

      await expect(page.locator("#enhance-faces-strength")).toBeVisible();
      await expect(page.getByText("Enhancement Strength")).toBeVisible();
      await expect(page.getByText("Subtle").first()).toBeVisible();
      await expect(page.getByText("Maximum").first()).toBeVisible();
    });

    test("shows only enhance main face checkbox in non-Best mode", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/enhance-faces");
      await uploadTestImage(page);

      // Balanced is default, should show main face checkbox
      await expect(page.getByText("Only enhance main face")).toBeVisible();

      // Switch to Best -- checkbox should hide
      await page.getByRole("button", { name: "Best" }).click();
      await expect(page.getByText("Only enhance main face")).not.toBeVisible();
    });

    test("shows detection sensitivity slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/enhance-faces");
      await uploadTestImage(page);

      await expect(page.locator("#enhance-faces-sensitivity")).toBeVisible();
      await expect(page.getByText("Detection Sensitivity")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/enhance-faces");

      const submitBtn = page.getByTestId("enhance-faces-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Enhance Faces/);
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/enhance-faces");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ========================================================================
  // ERASE OBJECT
  // ========================================================================
  test.describe("Erase Object", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/erase-object");
      await expect(page.getByText("Object Eraser").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows brush size slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/erase-object");
      await uploadTestImage(page);

      await expect(page.locator("#eraser-brush-size")).toBeVisible();
      await expect(page.getByText("Brush Size")).toBeVisible();
      await expect(page.getByText("Fine")).toBeVisible();
      await expect(page.getByText("Wide")).toBeVisible();
    });

    test("shows output format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/erase-object");
      await uploadTestImage(page);

      await expect(page.locator("#eraser-format")).toBeVisible();
    });

    test("shows paint hint text after upload", async ({ loggedInPage: page }) => {
      await page.goto("/erase-object");
      await uploadTestImage(page);

      await expect(page.getByText("Paint over the objects you want to remove")).toBeVisible();
    });

    test("submit disabled without strokes", async ({ loggedInPage: page }) => {
      await page.goto("/erase-object");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("erase-object-submit");
      await expect(submitBtn).toBeDisabled();
    });
  });

  // ========================================================================
  // SMART CROP
  // ========================================================================
  test.describe("Smart Crop", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/smart-crop");
      await expect(page.getByText("Smart Crop").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows mode tabs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/smart-crop");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Subject Focus" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Face Focus" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Auto Trim" })).toBeVisible();
    });

    test("shows subject focus controls by default", async ({ loggedInPage: page }) => {
      await page.goto("/smart-crop");
      await uploadTestImage(page);

      // Strategy buttons
      await expect(page.getByRole("button", { name: "Attention" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Entropy" })).toBeVisible();

      // Width/height inputs
      await expect(page.locator("#sc-width")).toBeVisible();
      await expect(page.locator("#sc-height")).toBeVisible();

      // Aspect presets
      await expect(page.getByRole("button", { name: "1:1" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "16:9" }).first()).toBeVisible();
    });

    test("face focus mode shows framing presets", async ({ loggedInPage: page }) => {
      await page.goto("/smart-crop");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Face Focus" }).click();
      await expect(page.getByText("Framing")).toBeVisible();
      await expect(page.getByText("Detection Sensitivity")).toBeVisible();
      await expect(page.locator("#sc-sensitivity")).toBeVisible();
    });

    test("auto trim mode shows tolerance slider and pad to square", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/smart-crop");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Auto Trim" }).click();
      await expect(page.getByText("Tolerance")).toBeVisible();
      await expect(page.locator("#sc-threshold")).toBeVisible();
      await expect(page.locator("#sc-pad-square")).toBeVisible();
    });

    test("social presets tab shows platform presets", async ({ loggedInPage: page }) => {
      await page.goto("/smart-crop");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Social Presets" }).click();
      // Should show social platform names like Instagram, Facebook, etc.
      await expect(page.getByText(/instagram|facebook|twitter|tiktok/i).first()).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/smart-crop");

      const submitBtn = page.getByTestId("smart-crop-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/smart-crop");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ========================================================================
  // COLORIZE
  // ========================================================================
  test.describe("Colorize", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/colorize");
      await expect(page.getByText("Colorize").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows AI model selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/colorize");
      await uploadTestImage(page);

      await expect(page.getByText("AI Model")).toBeVisible();
      // Model buttons have two lines (label + description)
      await expect(page.locator("button").filter({ hasText: "Fast" }).first()).toBeVisible();
      await expect(page.locator("button").filter({ hasText: "Balanced" }).first()).toBeVisible();
      await expect(page.locator("button").filter({ hasText: "Best" }).first()).toBeVisible();
    });

    test("shows color intensity slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/colorize");
      await uploadTestImage(page);

      await expect(page.getByText("Color Intensity")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/colorize");

      const submitBtn = page.getByTestId("colorize-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Colorize/);
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/colorize");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ========================================================================
  // NOISE REMOVAL
  // ========================================================================
  test.describe("Noise Removal", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/noise-removal");
      await expect(page.getByText("Noise Removal").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows denoising tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/noise-removal");
      await uploadTestImage(page);

      await expect(page.getByText("Denoising Tier")).toBeVisible();
      await expect(page.getByRole("button", { name: "Quick" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Quality" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Maximum" })).toBeVisible();
    });

    test("shows strength, detail preservation, and color noise sliders after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/noise-removal");
      await uploadTestImage(page);

      await expect(page.getByText("Strength").first()).toBeVisible();
      await expect(page.getByText("Detail Preservation")).toBeVisible();
      await expect(page.getByText("Color Noise")).toBeVisible();
    });

    test("shows output format buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/noise-removal");
      await uploadTestImage(page);

      await expect(page.getByText("Output Format").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
      await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
      await expect(page.getByRole("button", { name: "JPEG" })).toBeVisible();
    });

    test("quality slider appears for lossy formats", async ({ loggedInPage: page }) => {
      await page.goto("/noise-removal");
      await uploadTestImage(page);

      // Original format is default -- no quality slider
      await expect(page.getByTestId("quality-slider")).not.toBeVisible();

      // Switch to JPEG -- quality slider should appear
      await page.getByRole("button", { name: "JPEG" }).click();
      await expect(page.getByTestId("quality-slider")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/noise-removal");

      const submitBtn = page.getByTestId("noise-removal-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Remove Noise/);
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/noise-removal");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ========================================================================
  // PASSPORT PHOTO
  // ========================================================================
  test.describe("Passport Photo", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/passport-photo");
      await expect(page.getByText("Passport Photo").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows country selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/passport-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Country")).toBeVisible();
    });

    test("shows DPI input after upload", async ({ loggedInPage: page }) => {
      await page.goto("/passport-photo");
      await uploadTestImage(page);

      await expect(page.getByText("DPI").first()).toBeVisible();
      await expect(page.getByText("pixels per inch")).toBeVisible();
    });

    test("shows background color options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/passport-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Background Color")).toBeVisible();
      await expect(page.locator("button[title='White']")).toBeVisible();
    });

    test("shows max file size presets after upload", async ({ loggedInPage: page }) => {
      await page.goto("/passport-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Max File Size")).toBeVisible();
      await expect(page.getByRole("button", { name: "No limit" })).toBeVisible();
      await expect(page.getByRole("button", { name: "50 KB" })).toBeVisible();
      await expect(page.getByRole("button", { name: "100 KB" })).toBeVisible();
    });

    test("shows spec info bar after upload", async ({ loggedInPage: page }) => {
      await page.goto("/passport-photo");
      await uploadTestImage(page);

      // Spec bar showing dimensions info
      await expect(page.getByText(/mm.*px.*at.*DPI/).first()).toBeVisible();
    });

    // NOTE: The auto-analyze test for passport photo requires the AI sidecar
    // to respond (either with analysis results or a "not installed" error).
    // This is covered by integration tests instead.
  });

  // ========================================================================
  // RED EYE REMOVAL
  // ========================================================================
  test.describe("Red Eye Removal", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/red-eye-removal");
      await expect(page.getByText("Red Eye Removal").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows sensitivity and correction strength sliders after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/red-eye-removal");
      await uploadTestImage(page);

      await expect(page.getByText("Sensitivity").first()).toBeVisible();
      await expect(page.getByText("Strict")).toBeVisible();
      await expect(page.getByText("Aggressive")).toBeVisible();

      await expect(page.getByText("Correction Strength")).toBeVisible();
      await expect(page.getByText("Subtle").first()).toBeVisible();
      await expect(page.getByText("Dark").first()).toBeVisible();
    });

    test("shows output format buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/red-eye-removal");
      await uploadTestImage(page);

      await expect(page.getByText("Output Format").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
      await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
      await expect(page.getByRole("button", { name: "JPEG" })).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/red-eye-removal");

      const submitBtn = page.getByTestId("red-eye-removal-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Fix Red Eye/);
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/red-eye-removal");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ========================================================================
  // RESTORE PHOTO
  // ========================================================================
  test.describe("Restore Photo", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/restore-photo");
      await expect(page.getByText("Photo Restoration").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows restoration mode buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/restore-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Restoration Mode")).toBeVisible();
      await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Auto" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Heavy" })).toBeVisible();
    });

    test("shows feature toggles after upload", async ({ loggedInPage: page }) => {
      await page.goto("/restore-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Scratch Removal")).toBeVisible();
      await expect(page.getByText("Face Enhancement")).toBeVisible();
      await expect(page.getByText("Noise Reduction").first()).toBeVisible();
      await expect(page.getByText("Auto-Colorize")).toBeVisible();
    });

    test("face fidelity slider visible when face enhancement is checked", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/restore-photo");
      await uploadTestImage(page);

      // Face enhancement is on by default
      await expect(page.getByText("Face Fidelity")).toBeVisible();
      await expect(page.getByText("Enhanced")).toBeVisible();
      await expect(page.getByText("Faithful")).toBeVisible();
    });

    test("denoise strength slider visible when noise reduction is checked", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/restore-photo");
      await uploadTestImage(page);

      // Noise reduction is on by default
      await expect(page.getByText("Denoise Strength")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/restore-photo");

      const submitBtn = page.getByTestId("restore-photo-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Restore Photo/);
    });

    test.skip("shows feature-not-installed warning when AI sidecar is down", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/restore-photo");
      await uploadTestImage(page);

      // Without the AI sidecar, tool should show a "not installed" or error indication
      await expect(
        page.locator("text=/not installed|Feature.*not|is not available/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
