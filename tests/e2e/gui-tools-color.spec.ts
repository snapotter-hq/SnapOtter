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
      await page.goto("/adjust-colors");
      await expect(page.getByText("Adjust Colors").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows light/color/detail/effects sections after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/adjust-colors");
      await uploadTestImage(page);

      await expect(page.getByText("Light").first()).toBeVisible();
      await expect(page.getByText("Color").first()).toBeVisible();
      await expect(page.getByText("Detail").first()).toBeVisible();
      await expect(page.getByText("Effects").first()).toBeVisible();
    });

    test("brightness/contrast/exposure sliders visible in Light section", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/adjust-colors");
      await uploadTestImage(page);

      await expect(page.locator("#color-slider-brightness")).toBeVisible();
      await expect(page.locator("#color-slider-contrast")).toBeVisible();
      await expect(page.locator("#color-slider-exposure")).toBeVisible();
    });

    test("saturation/temperature/tint/hue sliders visible in Color section", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/adjust-colors");
      await uploadTestImage(page);

      await expect(page.locator("#color-slider-saturation")).toBeVisible();
      await expect(page.locator("#color-slider-temperature")).toBeVisible();
      await expect(page.locator("#color-slider-tint")).toBeVisible();
      await expect(page.locator("#color-slider-hue")).toBeVisible();
    });

    test("effect buttons (none, grayscale, sepia, invert)", async ({ loggedInPage: page }) => {
      await page.goto("/adjust-colors");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "none" })).toBeVisible();
      await expect(page.getByRole("button", { name: "grayscale" })).toBeVisible();
      await expect(page.getByRole("button", { name: "sepia" })).toBeVisible();
      await expect(page.getByRole("button", { name: "invert" })).toBeVisible();
    });

    test("color channels expandable section", async ({ loggedInPage: page }) => {
      await page.goto("/adjust-colors");
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
      await page.goto("/adjust-colors");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("adjust-colors-submit");
      await expect(submitBtn).toBeDisabled();

      // Adjust brightness
      await page.locator("#color-slider-brightness").fill("20");
      await expect(submitBtn).toBeEnabled();
    });

    test("Reset All button appears after changes", async ({ loggedInPage: page }) => {
      await page.goto("/adjust-colors");
      await uploadTestImage(page);

      await page.locator("#color-slider-brightness").fill("20");
      await expect(page.getByRole("button", { name: "Reset All" })).toBeVisible();
    });

    test("processes color adjustment and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/adjust-colors");
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
      await page.goto("/sharpening");
      await expect(page.getByText("Sharpening").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows method selector with three options", async ({ loggedInPage: page }) => {
      await page.goto("/sharpening");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Adaptive" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Unsharp Mask" })).toBeVisible();
      await expect(page.getByRole("button", { name: "High-Pass" })).toBeVisible();
    });

    test("shows presets in adaptive mode", async ({ loggedInPage: page }) => {
      await page.goto("/sharpening");
      await uploadTestImage(page);

      // Adaptive mode is default
      await expect(page.getByRole("button", { name: "Light" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Medium" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Strong" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Portrait" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Landscape" })).toBeVisible();
    });

    test("noise reduction buttons visible", async ({ loggedInPage: page }) => {
      await page.goto("/sharpening");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "off" })).toBeVisible();
      await expect(page.getByRole("button", { name: "light" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "medium" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "strong" }).first()).toBeVisible();
    });

    test("advanced controls toggle reveals extra sliders", async ({ loggedInPage: page }) => {
      await page.goto("/sharpening");
      await uploadTestImage(page);

      await page.getByText("Advanced Controls").click();
      // Adaptive advanced controls
      await expect(page.locator("#sharpen-slider-radius")).toBeVisible();
      await expect(page.locator("#sharpen-slider-flat-protection")).toBeVisible();
    });

    test("switching to unsharp mask shows amount slider", async ({ loggedInPage: page }) => {
      await page.goto("/sharpening");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Unsharp Mask" }).click();
      await expect(page.locator("#sharpen-slider-amount")).toBeVisible();
    });

    test("processes sharpening and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/sharpening");
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
      await page.goto("/color-palette");
      await expect(page.getByText("Color Palette").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows Extract Colors button after upload", async ({ loggedInPage: page }) => {
      await page.goto("/color-palette");
      await uploadTestImage(page);

      const btn = page.getByTestId("color-palette-submit");
      await expect(btn).toBeVisible();
      await expect(btn).toHaveText(/Extract Colors/);
    });

    test("extracts colors and displays palette", async ({ loggedInPage: page }) => {
      await page.goto("/color-palette");
      await uploadTestImage(page);

      await page.getByTestId("color-palette-submit").click();
      await waitForProcessing(page);

      // Should show "Dominant Colors" heading with color swatches
      await expect(page.getByText("Dominant Colors").first()).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // REPLACE COLOR
  // ========================================================================
  test.describe("Replace Color", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/replace-color");
      await expect(page.getByText("Replace").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows source and target color pickers after upload", async ({ loggedInPage: page }) => {
      await page.goto("/replace-color");
      await uploadTestImage(page);

      await expect(page.locator("#replace-source-color")).toBeVisible();
      await expect(page.locator("#replace-target-color")).toBeVisible();
    });

    test("tolerance slider visible", async ({ loggedInPage: page }) => {
      await page.goto("/replace-color");
      await uploadTestImage(page);

      await expect(page.locator("#replace-tolerance")).toBeVisible();
      await expect(page.getByText("Exact match")).toBeVisible();
      await expect(page.getByText("Wide range")).toBeVisible();
    });

    test("make transparent checkbox hides target color", async ({ loggedInPage: page }) => {
      await page.goto("/replace-color");
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

    test("processes color replacement and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/replace-color");
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
      await page.goto("/image-enhancement");
      await expect(page.getByText("Image Enhancement").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows enhancement mode and controls after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image-enhancement");
      await uploadTestImage(page);

      // Wait for analysis to complete
      await expect(
        page.locator("text=Intensity").or(page.locator("text=Enhancement Mode")).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("processes enhancement and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image-enhancement");
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
});
