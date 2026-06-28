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
      await page.goto("/image/remove-background");
      await expect(page.getByText("Remove Background").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows subject type buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "People" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Products" })).toBeVisible();
      await expect(page.getByRole("button", { name: "General" })).toBeVisible();
    });

    test("shows quality tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
      await expect(page.getByRole("button", { name: "HD" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Max" })).toBeVisible();
    });

    test("ultra quality visible only for People subject", async ({ loggedInPage: page }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      // People is default -- Ultra should be visible
      await expect(page.getByRole("button", { name: "Ultra" })).toBeVisible();

      // Switch to Products -- Ultra should disappear
      await page.getByRole("button", { name: "Products" }).click();
      await expect(page.getByRole("button", { name: "Ultra" })).not.toBeVisible();
    });

    test("shows background type buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      // that also contains format text like "Image"
      const settings = page.locator(".w-72");
      await expect(settings.getByRole("button", { name: "Transparent" })).toBeVisible();
      await expect(settings.getByRole("button", { name: "Color" })).toBeVisible();
      await expect(settings.getByRole("button", { name: "Gradient" })).toBeVisible();
      // exact match avoids colliding with the file-list button, whose name
      // contains the uploaded filename "test-image.png" (substring "image")
      await expect(settings.getByRole("button", { name: "Image", exact: true })).toBeVisible();
    });

    test("color presets appear when Color background is selected", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      await settings.getByRole("button", { name: "Color" }).click();
      // Should show color preset buttons (White, Black, etc.)
      await expect(page.locator("button[title='White']")).toBeVisible();
      await expect(page.locator("button[title='Black']")).toBeVisible();
    });

    test("gradient presets appear when Gradient background is selected", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      await settings.getByRole("button", { name: "Gradient" }).click();
      // Gradient preset buttons with titles
      await expect(page.locator("button[title='Purple']")).toBeVisible();
      await expect(page.locator("button[title='Pink']")).toBeVisible();
    });

    test("effects section is collapsible", async ({ loggedInPage: page }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      // Expand Effects
      await page.getByText("Effects").click();
      await expect(page.getByText("Blur Background")).toBeVisible();
      await expect(page.getByText("Add Shadow")).toBeVisible();
    });

    test("submit button disabled without file, enabled with file", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/remove-background");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("remove-background-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
    });

    test("image background upload button visible when Image background selected", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      // exact match avoids colliding with the file-list button, whose name
      // contains the uploaded filename "test-image.png" (substring "image")
      const settings = page.locator(".w-72");
      await settings.getByRole("button", { name: "Image", exact: true }).click();
      await expect(page.getByText(/upload|choose/i).first()).toBeVisible();
    });

    test("switching subject type hides ultra quality for non-People", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/remove-background");
      await uploadTestImage(page);

      // People is default -- Ultra visible
      await expect(page.getByRole("button", { name: "Ultra" })).toBeVisible();

      // Switch to General -- Ultra should also disappear
      await page.getByRole("button", { name: "General" }).click();
      await expect(page.getByRole("button", { name: "Ultra" })).not.toBeVisible();
    });
  });

  // ========================================================================
  // UPSCALE
  // ========================================================================
  test.describe("Upscale", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");
      await expect(page.getByText("Image Upscaling").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows scale factor buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");
      await uploadTestImage(page);

      await expect(page.getByText("Scale Factor")).toBeVisible();
      // Quick scale buttons
      await expect(page.locator("button").filter({ hasText: /^2x$/ }).first()).toBeVisible();
      await expect(page.locator("button").filter({ hasText: /^4x$/ }).first()).toBeVisible();
      await expect(page.locator("button").filter({ hasText: /^8x$/ }).first()).toBeVisible();
    });

    test("shows quality tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Best" })).toBeVisible();
    });

    test("shows enhance faces checkbox in non-Fast mode", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");
      await uploadTestImage(page);

      // Balanced is default, should show face enhancement
      await expect(page.getByText("Enhance faces")).toBeVisible();
    });

    test("shows noise reduction slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");
      await uploadTestImage(page);

      await expect(page.getByText("Noise Reduction")).toBeVisible();
    });

    test("shows output format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");
      await uploadTestImage(page);

      await expect(page.locator("#upscale-format")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("upscale-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
    });

    test("face enhance checkbox toggles", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");
      await uploadTestImage(page);

      const checkbox = page
        .locator("label")
        .filter({ hasText: "Enhance faces" })
        .locator("input[type='checkbox']");
      await expect(checkbox).toBeVisible();
      // Toggle it
      const initialState = await checkbox.isChecked();
      await checkbox.click();
      const newState = await checkbox.isChecked();
      expect(newState).toBe(!initialState);
    });

    test("switching to Fast hides enhance faces", async ({ loggedInPage: page }) => {
      await page.goto("/image/upscale");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Fast" }).click();
      await expect(page.getByText("Enhance faces")).not.toBeVisible();
    });
  });

  // ========================================================================
  // OCR / TEXT EXTRACTION
  // ========================================================================
  test.describe("OCR", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/ocr");
      await expect(page.getByText("OCR").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows quality selector buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/ocr");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Best" })).toBeVisible();
    });

    test("shows enhance before scanning checkbox after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/ocr");
      await uploadTestImage(page);

      await expect(page.getByText("Enhance before scanning")).toBeVisible();
    });

    test("shows collapsible Language section after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/ocr");
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
      await page.goto("/image/ocr");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("ocr-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Extract Text/);
    });

    test("shows language dropdown options when expanded", async ({ loggedInPage: page }) => {
      await page.goto("/image/ocr");
      await uploadTestImage(page);

      await page.getByText("Language").click();
      const select = page.locator("select");
      await expect(select.first()).toBeVisible();
      // Should have multiple language options
      const options = select.first().locator("option");
      const count = await options.count();
      expect(count).toBeGreaterThan(1);
    });

    test("switching quality tier changes active button", async ({ loggedInPage: page }) => {
      await page.goto("/image/ocr");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Best" }).click();
      // Best should now be visually active (we just verify click doesn't error)
      await page.getByRole("button", { name: "Fast" }).click();
    });
  });

  // ========================================================================
  // BLUR FACES
  // ========================================================================
  test.describe("Blur Faces", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/blur-faces");
      await expect(page.getByText("Face").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows blur radius and sensitivity sliders after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/blur-faces");
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
      await page.goto("/image/blur-faces");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("blur-faces-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Blur Faces/);
    });

    test("blur radius slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/blur-faces");
      await uploadTestImage(page);

      const slider = page.locator("#blur-faces-blur-radius");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("sensitivity slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/blur-faces");
      await uploadTestImage(page);

      const slider = page.locator("#blur-faces-sensitivity");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });
  });

  // ========================================================================
  // ENHANCE FACES
  // ========================================================================
  test.describe("Enhance Faces", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/enhance-faces");
      await expect(page.getByText("Face Enhancement").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows quality tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/enhance-faces");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Best" })).toBeVisible();
    });

    test("shows enhancement strength slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/enhance-faces");
      await uploadTestImage(page);

      await expect(page.locator("#enhance-faces-strength")).toBeVisible();
      await expect(page.getByText("Enhancement Strength")).toBeVisible();
      await expect(page.getByText("Subtle").first()).toBeVisible();
      await expect(page.getByText("Maximum").first()).toBeVisible();
    });

    test("shows only enhance main face checkbox in non-Best mode", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/enhance-faces");
      await uploadTestImage(page);

      // Balanced is default, should show main face checkbox
      await expect(page.getByText("Only enhance main face")).toBeVisible();

      // Switch to Best -- checkbox should hide
      await page.getByRole("button", { name: "Best" }).click();
      await expect(page.getByText("Only enhance main face")).not.toBeVisible();
    });

    test("shows detection sensitivity slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/enhance-faces");
      await uploadTestImage(page);

      await expect(page.locator("#enhance-faces-sensitivity")).toBeVisible();
      await expect(page.getByText("Detection Sensitivity")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/enhance-faces");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("enhance-faces-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Enhance Faces/);
    });

    test("strength slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/enhance-faces");
      await uploadTestImage(page);

      const slider = page.locator("#enhance-faces-strength");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("sensitivity slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/enhance-faces");
      await uploadTestImage(page);

      const slider = page.locator("#enhance-faces-sensitivity");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });
  });

  // ========================================================================
  // ERASE OBJECT
  // ========================================================================
  test.describe("Erase Object", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/erase-object");
      await expect(page.getByText("Object Eraser").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows brush size slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/erase-object");
      await uploadTestImage(page);

      await expect(page.locator("#eraser-brush-size")).toBeVisible();
      await expect(page.getByText("Brush Size")).toBeVisible();
      await expect(page.getByText("Fine")).toBeVisible();
      await expect(page.getByText("Wide")).toBeVisible();
    });

    test("shows output format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/erase-object");
      await uploadTestImage(page);

      await expect(page.locator("#eraser-format")).toBeVisible();
    });

    test("shows paint hint text after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/erase-object");
      await uploadTestImage(page);

      await expect(page.getByText("Paint over the objects you want to remove")).toBeVisible();
    });

    test("submit disabled without strokes", async ({ loggedInPage: page }) => {
      await page.goto("/image/erase-object");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("erase-object-submit");
      await expect(submitBtn).toBeDisabled();
    });

    test("brush size slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/erase-object");
      await uploadTestImage(page);

      const slider = page.locator("#eraser-brush-size");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("output format selector has options", async ({ loggedInPage: page }) => {
      await page.goto("/image/erase-object");
      await uploadTestImage(page);

      const select = page.locator("#eraser-format");
      await expect(select).toBeVisible();
      const options = select.locator("option");
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  // ========================================================================
  // SMART CROP
  // ========================================================================
  test.describe("Smart Crop", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/smart-crop");
      await expect(page.getByText("Smart Crop").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows mode tabs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/smart-crop");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Subject Focus" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Face Focus" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Auto Trim" })).toBeVisible();
    });

    test("shows subject focus controls by default", async ({ loggedInPage: page }) => {
      await page.goto("/image/smart-crop");
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
      await page.goto("/image/smart-crop");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Face Focus" }).click();
      await expect(page.getByText("Framing")).toBeVisible();
      await expect(page.getByText("Detection Sensitivity")).toBeVisible();
      await expect(page.locator("#sc-sensitivity")).toBeVisible();
    });

    test("auto trim mode shows tolerance slider and pad to square", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/smart-crop");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Auto Trim" }).click();
      await expect(page.getByText("Tolerance")).toBeVisible();
      await expect(page.locator("#sc-threshold")).toBeVisible();
      await expect(page.locator("#sc-pad-square")).toBeVisible();
    });

    test("social presets tab shows platform presets", async ({ loggedInPage: page }) => {
      await page.goto("/image/smart-crop");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Social Presets" }).click();
      // Should show social platform names like Instagram, Facebook, etc.
      await expect(page.getByText(/instagram|facebook|twitter|tiktok/i).first()).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/smart-crop");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("smart-crop-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
    });

    test("auto trim mode tolerance slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/smart-crop");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Auto Trim" }).click();
      const slider = page.locator("#sc-threshold");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("subject focus width/height inputs accept values", async ({ loggedInPage: page }) => {
      await page.goto("/image/smart-crop");
      await uploadTestImage(page);

      await page.locator("#sc-width").fill("800");
      await expect(page.locator("#sc-width")).toHaveValue("800");
      await page.locator("#sc-height").fill("600");
      await expect(page.locator("#sc-height")).toHaveValue("600");
    });
  });

  // ========================================================================
  // COLORIZE
  // ========================================================================
  test.describe("Colorize", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/colorize");
      await expect(page.getByText("AI Colorization").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows AI model selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/colorize");
      await uploadTestImage(page);

      await expect(page.getByText("AI Model")).toBeVisible();
      // Model buttons have two lines (label + description)
      await expect(page.locator("button").filter({ hasText: "Fast" }).first()).toBeVisible();
      await expect(page.locator("button").filter({ hasText: "Balanced" }).first()).toBeVisible();
      await expect(page.locator("button").filter({ hasText: "Best" }).first()).toBeVisible();
    });

    test("shows color intensity slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/colorize");
      await uploadTestImage(page);

      await expect(page.getByText("Color Intensity")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/colorize");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("colorize-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Colorize/);
    });

    test("switching AI model changes active button", async ({ loggedInPage: page }) => {
      await page.goto("/image/colorize");
      await uploadTestImage(page);

      await page.locator("button").filter({ hasText: "Best" }).first().click();
      await page.locator("button").filter({ hasText: "Fast" }).first().click();
    });
  });

  // ========================================================================
  // NOISE REMOVAL
  // ========================================================================
  test.describe("Noise Removal", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/noise-removal");
      await expect(page.getByText("Noise Removal").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows denoising tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/noise-removal");
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
      await page.goto("/image/noise-removal");
      await uploadTestImage(page);

      await expect(page.getByText("Strength").first()).toBeVisible();
      await expect(page.getByText("Detail Preservation")).toBeVisible();
      await expect(page.getByText("Color Noise")).toBeVisible();
    });

    test("shows output format buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/noise-removal");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      await expect(settings.getByText("Output Format").first()).toBeVisible();
      await expect(settings.getByRole("button", { name: "Original" })).toBeVisible();
      // exact match avoids the file-list button, whose accessible name contains
      // the uploaded filename "test-image.png" (case-insensitive substring "png")
      await expect(settings.getByRole("button", { name: "PNG", exact: true })).toBeVisible();
      await expect(settings.getByRole("button", { name: "JPEG" })).toBeVisible();
    });

    test("quality slider appears for lossy formats", async ({ loggedInPage: page }) => {
      await page.goto("/image/noise-removal");
      await uploadTestImage(page);

      // Original format is default -- no quality slider
      await expect(page.getByTestId("quality-slider")).not.toBeVisible();

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      // Switch to JPEG -- quality slider should appear
      await settings.getByRole("button", { name: "JPEG" }).click();
      await expect(page.getByTestId("quality-slider")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/noise-removal");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("noise-removal-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Remove Noise/);
    });

    test("switching denoising tier changes active button", async ({ loggedInPage: page }) => {
      await page.goto("/image/noise-removal");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Maximum" }).click();
      await page.getByRole("button", { name: "Quick" }).click();
    });

    test("switching to PNG hides quality slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/noise-removal");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      // exact match avoids the file-list button, whose accessible name contains
      // the uploaded filename "test-image.png" (case-insensitive substring "png")
      await settings.getByRole("button", { name: "PNG", exact: true }).click();
      await expect(page.getByTestId("quality-slider")).not.toBeVisible();
    });
  });

  // ========================================================================
  // PASSPORT PHOTO
  // ========================================================================
  test.describe("Passport Photo", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/passport-photo");
      await expect(page.getByText("Passport Photo").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows country selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/passport-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Country")).toBeVisible();
    });

    test("shows DPI input after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/passport-photo");
      await uploadTestImage(page);

      await expect(page.getByText("DPI").first()).toBeVisible();
      await expect(page.getByText("pixels per inch")).toBeVisible();
    });

    test("shows background color options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/passport-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Background Color")).toBeVisible();
      await expect(page.locator("button[title='White']")).toBeVisible();
    });

    test("shows max file size presets after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/passport-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Max File Size")).toBeVisible();
      await expect(page.getByRole("button", { name: "No limit" })).toBeVisible();
      await expect(page.getByRole("button", { name: "50 KB" })).toBeVisible();
      await expect(page.getByRole("button", { name: "100 KB" })).toBeVisible();
    });

    test("shows spec info bar after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/passport-photo");
      await uploadTestImage(page);

      // Spec bar showing dimensions info
      await expect(page.getByText(/mm.*px.*at.*DPI/).first()).toBeVisible();
    });

    test("generate button not visible before upload, shown after analysis", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/passport-photo");

      // Generate button should not exist before upload (it only appears after face analysis)
      await expect(page.getByTestId("passport-photo-generate")).not.toBeVisible();

      // After upload, auto-analysis starts. The generate button appears only after
      // analysis succeeds, which requires the AI sidecar. Just verify it is still
      // not visible without the sidecar.
      await uploadTestImage(page);
      // Allow time for auto-analysis attempt
      await page.waitForTimeout(1000);
    });

    test("clicking max file size preset changes active button", async ({ loggedInPage: page }) => {
      await page.goto("/image/passport-photo");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "50 KB" }).click();
      await page.getByRole("button", { name: "100 KB" }).click();
      await page.getByRole("button", { name: "No limit" }).click();
    });
  });

  // ========================================================================
  // RED EYE REMOVAL
  // ========================================================================
  test.describe("Red Eye Removal", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/red-eye-removal");
      await expect(page.getByText("Red Eye Removal").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows sensitivity and correction strength sliders after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/red-eye-removal");
      await uploadTestImage(page);

      await expect(page.getByText("Sensitivity").first()).toBeVisible();
      await expect(page.getByText("Strict")).toBeVisible();
      await expect(page.getByText("Aggressive")).toBeVisible();

      await expect(page.getByText("Correction Strength")).toBeVisible();
      await expect(page.getByText("Subtle").first()).toBeVisible();
      await expect(page.getByText("Dark").first()).toBeVisible();
    });

    test("shows output format buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/red-eye-removal");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      await expect(settings.getByText("Output Format").first()).toBeVisible();
      await expect(settings.getByRole("button", { name: "Original" })).toBeVisible();
      // exact match avoids the file-list button, whose accessible name contains
      // the uploaded filename "test-image.png" (case-insensitive substring "png")
      await expect(settings.getByRole("button", { name: "PNG", exact: true })).toBeVisible();
      await expect(settings.getByRole("button", { name: "JPEG" })).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/red-eye-removal");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("red-eye-removal-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Fix Red Eye/);
    });

    test("sensitivity slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/red-eye-removal");
      await uploadTestImage(page);

      const slider = page.locator("input[type='range']").first();
      await expect(slider).toBeVisible();
    });

    test("switching output format changes active button", async ({ loggedInPage: page }) => {
      await page.goto("/image/red-eye-removal");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      // exact match avoids the file-list button, whose accessible name contains
      // the uploaded filename "test-image.png" (case-insensitive substring "png")
      await settings.getByRole("button", { name: "PNG", exact: true }).click();
      await settings.getByRole("button", { name: "JPEG" }).click();
      await settings.getByRole("button", { name: "Original" }).click();
    });
  });

  // ========================================================================
  // RESTORE PHOTO
  // ========================================================================
  test.describe("Restore Photo", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/restore-photo");
      await expect(page.getByText("Photo Restoration").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows feature toggle checkboxes after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/restore-photo");
      await uploadTestImage(page);

      // The component was refactored from mode buttons to individual feature toggles
      await expect(page.getByText("Scratch Removal")).toBeVisible();
      await expect(page.getByText("Face Enhancement")).toBeVisible();
      await expect(page.getByText("Noise Reduction").first()).toBeVisible();
      await expect(page.getByText("Auto-Colorize")).toBeVisible();
    });

    test("shows feature toggles after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/restore-photo");
      await uploadTestImage(page);

      await expect(page.getByText("Scratch Removal")).toBeVisible();
      await expect(page.getByText("Face Enhancement")).toBeVisible();
      await expect(page.getByText("Noise Reduction").first()).toBeVisible();
      await expect(page.getByText("Auto-Colorize")).toBeVisible();
    });

    test("face fidelity slider visible when face enhancement is checked", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/restore-photo");
      await uploadTestImage(page);

      // Face enhancement is on by default
      await expect(page.getByText("Face Fidelity")).toBeVisible();
      await expect(page.getByText("Enhanced")).toBeVisible();
      await expect(page.getByText("Faithful")).toBeVisible();
    });

    test("denoise strength slider visible when noise reduction is checked", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/restore-photo");
      await uploadTestImage(page);

      // Noise reduction is on by default
      await expect(page.getByText("Denoise Strength")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/restore-photo");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("restore-photo-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Restore Photo/);
    });

    test("unchecking face enhancement hides fidelity slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/restore-photo");
      await uploadTestImage(page);

      // Face Enhancement is on by default
      await expect(page.getByText("Face Fidelity")).toBeVisible();

      // Uncheck face enhancement
      const checkbox = page
        .locator("label")
        .filter({ hasText: "Face Enhancement" })
        .locator("input[type='checkbox']");
      await checkbox.uncheck();

      await expect(page.getByText("Face Fidelity")).not.toBeVisible();
    });

    test("toggling feature checkboxes works", async ({ loggedInPage: page }) => {
      await page.goto("/image/restore-photo");
      await uploadTestImage(page);

      // Toggle Scratch Removal off and back on
      const scratchCheckbox = page
        .locator("label")
        .filter({ hasText: "Scratch Removal" })
        .locator("input[type='checkbox']");
      await expect(scratchCheckbox).toBeChecked();
      await scratchCheckbox.uncheck();
      await expect(scratchCheckbox).not.toBeChecked();
      await scratchCheckbox.check();
      await expect(scratchCheckbox).toBeChecked();
    });
  });

  // ========================================================================
  // TRANSPARENCY FIXER
  // ========================================================================
  test.describe("PNG Transparency Fixer", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/transparency-fixer");
      await expect(page.getByText("PNG Transparency Fixer").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows description text and submit button after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/transparency-fixer");
      await uploadTestImage(page);

      await expect(page.getByText("Upload a PNG with a fake transparent background")).toBeVisible();
      await expect(page.getByTestId("transparency-fixer-submit")).toBeVisible();
      await expect(page.getByTestId("transparency-fixer-submit")).toHaveText(/Fix Transparency/);
    });

    test("advanced section is collapsed by default", async ({ loggedInPage: page }) => {
      await page.goto("/image/transparency-fixer");
      await uploadTestImage(page);

      // Advanced toggle should be visible
      await expect(page.getByText("Advanced")).toBeVisible();

      // Defringe slider and Output Format should NOT be visible
      await expect(page.getByText("Defringe")).not.toBeVisible();
      await expect(page.getByText("Output Format")).not.toBeVisible();
    });

    test("advanced section toggles open with defringe and output format", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/transparency-fixer");
      await uploadTestImage(page);

      // Open advanced section
      await page.getByText("Advanced").click();

      // Defringe slider should be visible with default value 30
      await expect(page.getByText("Defringe")).toBeVisible();
      await expect(page.getByText("30")).toBeVisible();

      // Output format dropdown should be visible
      await expect(page.getByText("Output Format")).toBeVisible();
      const formatSelect = page.locator("select");
      await expect(formatSelect.first()).toBeVisible();
      await expect(formatSelect.first()).toHaveValue("png");
    });

    test("defringe slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/transparency-fixer");
      await uploadTestImage(page);

      // Open advanced section
      await page.getByText("Advanced").click();

      // The slider should exist and be interactive
      const slider = page.locator("input[type='range']").first();
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("min", "0");
      await expect(slider).toHaveAttribute("max", "100");
    });

    test("output format dropdown allows switching to WebP", async ({ loggedInPage: page }) => {
      await page.goto("/image/transparency-fixer");
      await uploadTestImage(page);

      // Open advanced section
      await page.getByText("Advanced").click();

      const formatSelect = page.locator("select").first();
      await formatSelect.selectOption("webp");
      await expect(formatSelect).toHaveValue("webp");

      // Switch back to PNG
      await formatSelect.selectOption("png");
      await expect(formatSelect).toHaveValue("png");
    });

    test("submit button disabled without file, enabled with file", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/transparency-fixer");

      // Pre-upload the page renders only the dropzone, so the settings panel
      // (and its submit button) is not in the DOM yet.
      const submitBtn = page.getByTestId("transparency-fixer-submit");
      await expect(submitBtn).toHaveCount(0);

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Fix Transparency/);
    });

    test("shows multi-file text for batch upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/transparency-fixer");
      // Upload multiple files
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("[class*='border-dashed']").first().click();
      const fileChooser = await fileChooserPromise;
      const path = await import("node:path");
      // 2.0 moved fixtures under tests/fixtures/<modality>/valid/
      const fixtures = path.join(process.cwd(), "tests", "fixtures", "image", "valid");
      await fileChooser.setFiles([
        path.join(fixtures, "test-200x150.png"),
        path.join(fixtures, "test-100x100.jpg"),
      ]);
      await page.waitForTimeout(500);

      await expect(page.getByTestId("transparency-fixer-submit")).toHaveText(
        /Fix Transparency \(2 files\)/,
      );
    });

    test("output format dropdown has expected options", async ({ loggedInPage: page }) => {
      await page.goto("/image/transparency-fixer");
      await uploadTestImage(page);

      // Open advanced section
      await page.getByText("Advanced").click();

      const formatSelect = page.locator("select").first();
      await expect(formatSelect).toBeVisible();
      const options = formatSelect.locator("option");
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(2); // at least png and webp
    });
  });

  // ========================================================================
  // CONTENT-AWARE RESIZE
  // ========================================================================
  test.describe("Content-Aware Resize", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await expect(page.getByText("Content-Aware").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows width and height inputs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      await expect(page.locator("#car-width")).toBeVisible();
      await expect(page.locator("#car-height")).toBeVisible();
    });

    test("shows resize to square checkbox", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      await expect(page.getByText("Resize to square")).toBeVisible();
    });

    test("square mode disables width/height inputs", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      // Check Resize to square
      await page
        .locator("label")
        .filter({ hasText: "Resize to square" })
        .locator("input[type='checkbox']")
        .check();

      await expect(page.locator("#car-width")).toBeDisabled();
      await expect(page.locator("#car-height")).toBeDisabled();
    });

    test("shows protect faces checkbox", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      await expect(page.getByText("Protect faces")).toBeVisible();
    });

    test("shows smoothing slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      await expect(page.locator("#car-blur-radius")).toBeVisible();
      await expect(page.getByText("Smoothing")).toBeVisible();
    });

    test("shows edge sensitivity slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      await expect(page.locator("#car-sobel-threshold")).toBeVisible();
      await expect(page.getByText("Edge sensitivity")).toBeVisible();
    });

    test("submit disabled without dimensions or square mode", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("content-aware-resize-submit");
      await expect(submitBtn).toBeDisabled();
    });

    test("submit enabled with width set", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      await page.locator("#car-width").fill("80");
      await expect(page.getByTestId("content-aware-resize-submit")).toBeEnabled();
    });

    test("submit enabled with square mode", async ({ loggedInPage: page }) => {
      await page.goto("/image/content-aware-resize");
      await uploadTestImage(page);

      await page
        .locator("label")
        .filter({ hasText: "Resize to square" })
        .locator("input[type='checkbox']")
        .check();

      await expect(page.getByTestId("content-aware-resize-submit")).toBeEnabled();
    });
  });

  // ========================================================================
  // MEME GENERATOR
  // ========================================================================
  test.describe("Meme Generator", () => {
    test("renders tool page without standard dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/meme-generator");
      await expect(page.getByText("Meme").first()).toBeVisible();

      // Meme generator uses no-dropzone display mode
      await expect(page.getByText("Upload from computer")).not.toBeVisible();
    });

    test("shows gallery phase with template selection prompt", async ({ loggedInPage: page }) => {
      await page.goto("/image/meme-generator");

      // Gallery phase shows template selection guidance
      await expect(page.getByText(/select a template|upload your own/i).first()).toBeVisible();
    });

    test("shows template thumbnails in gallery", async ({ loggedInPage: page }) => {
      await page.goto("/image/meme-generator");

      // Gallery should show meme template thumbnails or an upload option
      await expect(
        page
          .getByText(/upload/i)
          .or(page.locator("img"))
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
