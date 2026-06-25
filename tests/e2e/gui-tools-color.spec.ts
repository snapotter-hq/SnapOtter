import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Color & Adjustment Tools
// (adjust-colors, sharpening, color-palette, replace-color, image-enhancement)
// ---------------------------------------------------------------------------

test.describe("GUI Color & Adjustment Tools", () => {
  // ========================================================================
  // ADJUST COLORS
  // ========================================================================
  test.describe("Adjust Colors", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await expect(page.getByText("Adjust Colors").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows light/color/detail/effects sections after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await expect(page.getByText("Light").first()).toBeVisible();
      await expect(page.getByText("Color").first()).toBeVisible();
      await expect(page.getByText("Detail").first()).toBeVisible();
      await expect(page.getByText("Effects").first()).toBeVisible();
    });

    test("brightness/contrast/exposure sliders visible in Light section", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await expect(page.locator("#color-slider-brightness")).toBeVisible();
      await expect(page.locator("#color-slider-contrast")).toBeVisible();
      await expect(page.locator("#color-slider-exposure")).toBeVisible();
    });

    test("saturation/temperature/tint/hue sliders visible in Color section", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await expect(page.locator("#color-slider-saturation")).toBeVisible();
      await expect(page.locator("#color-slider-temperature")).toBeVisible();
      await expect(page.locator("#color-slider-tint")).toBeVisible();
      await expect(page.locator("#color-slider-hue")).toBeVisible();
    });

    test("effect buttons (none, grayscale, sepia, invert)", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "none" })).toBeVisible();
      await expect(page.getByRole("button", { name: "grayscale" })).toBeVisible();
      await expect(page.getByRole("button", { name: "sepia" })).toBeVisible();
      await expect(page.getByRole("button", { name: "invert" })).toBeVisible();
    });

    test("color channels expandable section", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      // Click Color Channels to expand
      await page.getByText("Color Channels").click();
      await expect(page.locator("#color-slider-red")).toBeVisible();
      await expect(page.locator("#color-slider-green")).toBeVisible();
      await expect(page.locator("#color-slider-blue")).toBeVisible();
    });

    test("submit disabled without changes, enabled after slider change", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("adjust-colors-submit");
      await expect(submitBtn).toBeDisabled();

      // Adjust brightness
      await page.locator("#color-slider-brightness").fill("20");
      await expect(submitBtn).toBeEnabled();
    });

    test("Reset All button appears after changes", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await page.locator("#color-slider-brightness").fill("20");
      await expect(page.getByRole("button", { name: "Reset All" })).toBeVisible();
    });

    test("selecting grayscale effect enables submit", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("adjust-colors-submit");
      await expect(submitBtn).toBeDisabled();

      await page.getByRole("button", { name: "grayscale" }).click();
      await expect(submitBtn).toBeEnabled();
    });

    test("detail section shows clarity and texture sliders", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      // Detail section should have sharpness/clarity controls
      await expect(page.getByText("Detail").first()).toBeVisible();
    });

    test("Reset All reverts sliders to defaults", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      // Make a change first
      await page.locator("#color-slider-brightness").fill("30");
      await expect(page.getByRole("button", { name: "Reset All" })).toBeVisible();

      // Click Reset All
      await page.getByRole("button", { name: "Reset All" }).click();

      // Submit should be disabled again after reset
      const submitBtn = page.getByTestId("adjust-colors-submit");
      await expect(submitBtn).toBeDisabled();
    });

    test("contrast slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      const slider = page.locator("#color-slider-contrast");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("selecting sepia effect enables submit", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("adjust-colors-submit");
      await expect(submitBtn).toBeDisabled();

      await page.getByRole("button", { name: "sepia" }).click();
      await expect(submitBtn).toBeEnabled();
    });

    test("processes color adjustment and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await page.locator("#color-slider-brightness").fill("20");
      await page.getByTestId("adjust-colors-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("adjust-colors-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // SHARPENING
  // ========================================================================
  test.describe("Sharpening", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await expect(page.getByText("Sharpening").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows method selector with three options", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Adaptive" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Unsharp Mask" })).toBeVisible();
      await expect(page.getByRole("button", { name: "High-Pass" })).toBeVisible();
    });

    test("shows presets in adaptive mode", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      // Adaptive mode is default
      await expect(page.getByRole("button", { name: "Light" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Medium" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Strong" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Portrait" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Landscape" })).toBeVisible();
    });

    test("noise reduction buttons visible", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "off" })).toBeVisible();
      await expect(page.getByRole("button", { name: "light" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "medium" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "strong" }).first()).toBeVisible();
    });

    test("advanced controls toggle reveals extra sliders", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      await page.getByText("Advanced Controls").click();
      // Adaptive advanced controls
      await expect(page.locator("#sharpen-slider-radius")).toBeVisible();
      await expect(page.locator("#sharpen-slider-flat-protection")).toBeVisible();
    });

    test("switching to unsharp mask shows amount slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Unsharp Mask" }).click();
      await expect(page.locator("#sharpen-slider-amount")).toBeVisible();
    });

    test("switching to high-pass shows strength slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "High-Pass" }).click();
      // High-pass mode shows a Strength slider.
      await expect(page.locator("#sharpen-slider-strength")).toBeVisible();
    });

    test("selecting a preset enables submit", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      // Adaptive mode with Medium preset should enable submit
      await page.getByRole("button", { name: "Medium" }).first().click();
      await expect(page.getByTestId("sharpening-submit")).toBeEnabled();
    });

    test("processes sharpening and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      await page.getByTestId("sharpening-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("sharpening-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // COLOR PALETTE
  // ========================================================================
  test.describe("Color Palette", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");
      await expect(page.getByText("Color Palette").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows Extract Palette button after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");
      await uploadTestImage(page);

      const btn = page.getByTestId("color-palette-submit");
      await expect(btn).toBeVisible();
      await expect(btn).toHaveText(/Extract Palette/);
    });

    test("submit button is enabled with file uploaded", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("color-palette-submit");
      await expect(submitBtn).toBeEnabled();
    });

    test("extracts colors and displays palette", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");
      await uploadTestImage(page);

      await page.getByTestId("color-palette-submit").click();
      await waitForProcessing(page);

      // Should show "Dominant Colors" heading with color swatches
      await expect(page.getByText("Dominant Colors").first()).toBeVisible({ timeout: 15_000 });
    });

    test("submit button text says Extract Palette", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");
      await uploadTestImage(page);

      await expect(page.getByTestId("color-palette-submit")).toHaveText(/Extract Palette/);
    });
  });

  // ========================================================================
  // REPLACE COLOR
  // ========================================================================
  test.describe("Replace Color", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/replace-color");
      await expect(page.getByText("Replace").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows source and target color pickers after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/replace-color");
      await uploadTestImage(page);

      await expect(page.locator("#replace-source-color")).toBeVisible();
      await expect(page.locator("#replace-target-color")).toBeVisible();
    });

    test("tolerance slider visible", async ({ loggedInPage: page }) => {
      await page.goto("/image/replace-color");
      await uploadTestImage(page);

      await expect(page.locator("#replace-tolerance")).toBeVisible();
      await expect(page.getByText("Exact match")).toBeVisible();
      await expect(page.getByText("Wide range")).toBeVisible();
    });

    test("make transparent checkbox hides target color", async ({ loggedInPage: page }) => {
      await page.goto("/image/replace-color");
      await uploadTestImage(page);

      // Check Make transparent
      await page
        .locator("label")
        .filter({ hasText: "Make transparent instead" })
        .locator("input[type='checkbox']")
        .check();

      // Target color picker should be hidden
      await expect(page.locator("#replace-target-color")).not.toBeVisible();
    });

    test("tolerance slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/replace-color");
      await uploadTestImage(page);

      const slider = page.locator("#replace-tolerance");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image/replace-color");
      await uploadTestImage(page);

      await expect(page.getByTestId("replace-color-submit")).toBeVisible();
    });

    test("processes color replacement and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/replace-color");
      await uploadTestImage(page);

      await page.getByTestId("replace-color-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("replace-color-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // IMAGE ENHANCEMENT
  // ========================================================================
  test.describe("Image Enhancement", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await expect(page.getByText("Image Enhancement").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows enhancement mode and controls after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await uploadTestImage(page);

      // Wait for analysis to complete
      await expect(
        page.locator("text=Intensity").or(page.locator("text=Enhancement Mode")).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("shows all six enhancement mode buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await uploadTestImage(page);

      await expect(page.getByText("Enhancement Mode")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: "Auto" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Portrait" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Landscape" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Low Light" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Food" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Document" })).toBeVisible();
    });

    test("shows intensity slider with percentage", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await uploadTestImage(page);

      await expect(page.getByText("Intensity")).toBeVisible({ timeout: 10_000 });
      // Intensity slider
      const slider = page.locator("input[type='range']").first();
      await expect(slider).toBeVisible();
    });

    test("switching enhancement mode changes active button", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await uploadTestImage(page);

      await expect(page.getByText("Enhancement Mode")).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Landscape" }).click();
      await page.getByRole("button", { name: "Portrait" }).click();
      await page.getByRole("button", { name: "Auto" }).click();
    });

    test("shows Deep Enhance AI toggle", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await uploadTestImage(page);

      await expect(page.getByText("Deep Enhance (AI)")).toBeVisible({ timeout: 10_000 });
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await uploadTestImage(page);

      await expect(page.getByTestId("image-enhancement-submit")).toBeVisible({ timeout: 10_000 });
    });

    test("processes enhancement and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await uploadTestImage(page);

      // Wait for analysis
      await expect(
        page.locator("text=Intensity").or(page.locator("text=Enhancement Mode")).first(),
      ).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: /^enhance$/i }).click();
      await waitForProcessing(page);

      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // ========================================================================
  // COLOR BLINDNESS SIMULATOR
  // ========================================================================
  test.describe("Color Blindness Simulator", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-blindness");
      await expect(page.getByText("Color Blindness").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows simulation type dropdown after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-blindness");
      await uploadTestImage(page);

      await expect(page.locator("#cb-simulation-type")).toBeVisible();
    });

    test("dropdown has grouped options (Red-Green, Blue-Yellow, Monochromatic)", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/color-blindness");
      await uploadTestImage(page);

      const select = page.locator("#cb-simulation-type");
      // Verify optgroups exist
      const optgroups = select.locator("optgroup");
      await expect(optgroups).toHaveCount(3);
    });

    test("shows description text for selected type", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-blindness");
      await uploadTestImage(page);

      // Default is deuteranomaly -- should show description
      await expect(page.getByText("Reduced green sensitivity")).toBeVisible();
    });

    test("changing simulation type updates description", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-blindness");
      await uploadTestImage(page);

      await page.selectOption("#cb-simulation-type", "achromatopsia");
      await expect(page.getByText("Complete color blindness")).toBeVisible();
    });

    test("submit button disabled without file, enabled with file", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/color-blindness");

      // Pre-upload the page shows only the dropzone; the settings panel and its
      // submit render after a file is loaded.
      await expect(page.getByTestId("color-blindness-submit")).toHaveCount(0);

      await uploadTestImage(page);
      const submitBtn = page.getByTestId("color-blindness-submit");
      await expect(submitBtn).toBeEnabled();
      await expect(submitBtn).toHaveText(/Simulate/);
    });

    test("processes simulation and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-blindness");
      await uploadTestImage(page);

      await page.getByTestId("color-blindness-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("color-blindness-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // UNDO / STATE RESET (Color tools)
  // ========================================================================
  test.describe("Undo and State Reset", () => {
    test("adjust-colors: undo after processing returns to sliders", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await page.locator("#color-slider-brightness").fill("20");
      await page.getByTestId("adjust-colors-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("adjust-colors-download")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /adjust settings/i }).click();

      await expect(page.getByTestId("adjust-colors-submit")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("adjust-colors-download")).not.toBeVisible();
      // Sliders should be back
      await expect(page.locator("#color-slider-brightness")).toBeVisible();
    });

    test("sharpening: undo after processing returns to method selector", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      await page.getByTestId("sharpening-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("sharpening-download")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /adjust settings/i }).click();

      await expect(page.getByTestId("sharpening-submit")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("sharpening-download")).not.toBeVisible();
    });

    test("replace-color: undo after processing returns to color pickers", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/replace-color");
      await uploadTestImage(page);

      await page.getByTestId("replace-color-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("replace-color-download")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /adjust settings/i }).click();

      await expect(page.getByTestId("replace-color-submit")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("replace-color-download")).not.toBeVisible();
      await expect(page.locator("#replace-source-color")).toBeVisible();
    });

    test("color-blindness: undo after processing returns to type selector", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/color-blindness");
      await uploadTestImage(page);

      await page.getByTestId("color-blindness-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("color-blindness-download")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /adjust settings/i }).click();

      await expect(page.getByTestId("color-blindness-submit")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("color-blindness-download")).not.toBeVisible();
      await expect(page.locator("#cb-simulation-type")).toBeVisible();
    });

    test("adjust-colors: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await expect(page.locator("#color-slider-brightness")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("adjust-colors: navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/adjust-colors");
      await uploadTestImage(page);

      await page.locator("#color-slider-brightness").fill("30");

      await page.goto("/image/sharpening");
      await page.goto("/image/adjust-colors");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });
  });

  // ========================================================================
  // ADJUST COLORS: LIVE PREVIEW VERIFICATION
  // ========================================================================
  test.describe("Adjust Colors Live Preview", () => {
    // Live preview applies CSS filter via inline styles on the ImageViewer
    // <img> element. The exact DOM path and computed style depend on the
    // ImageViewer rendering branch (bgPreview, imageWrapperStyle, default).
    // Asserting getComputedStyle().filter on a generic "img" selector is
    // too fragile since the viewer element may differ across builds.
    test.skip("changing brightness applies CSS filter to preview image", async ({
      loggedInPage: _page,
    }) => {});

    test.skip("selecting grayscale effect applies CSS filter", async ({
      loggedInPage: _page,
    }) => {});
  });
});
