import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Watermark & Overlay Tools
// (watermark-text, watermark-image, text-overlay, compose, border)
// ---------------------------------------------------------------------------

test.describe("GUI Watermark & Overlay Tools", () => {
  // ========================================================================
  // WATERMARK TEXT
  // ========================================================================
  test.describe("Watermark Text", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-text");
      await expect(page.getByText("Text Watermark").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows watermark text input and settings after upload", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-text");
      await uploadTestImage(page);

      await expect(page.locator("#watermark-text-text")).toBeVisible();
      // Default text is "Sample Watermark"
      await expect(page.locator("#watermark-text-text")).toHaveValue("Sample Watermark");
    });

    test("font size slider visible", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-text");
      await uploadTestImage(page);

      await expect(page.locator("#watermark-text-font-size")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-text");

      const submitBtn = page.getByTestId("watermark-text-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
    });

    test("processes watermark and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-text");
      await uploadTestImage(page);

      await page.locator("#watermark-text-text").fill("Test Watermark");
      await page.getByTestId("watermark-text-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("watermark-text-download")).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // ========================================================================
  // WATERMARK IMAGE
  // ========================================================================
  test.describe("Watermark Image", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-image");
      await expect(page.getByText("Image Watermark").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows position and opacity controls after upload", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-image");
      await uploadTestImage(page);

      // Position selector should be visible
      await expect(page.getByText(/position/i).first()).toBeVisible();
      // Opacity slider
      await expect(page.getByText(/opacity/i).first()).toBeVisible();
    });

    test("shows watermark upload area after main image upload", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-image");
      await uploadTestImage(page);

      // Should see a prompt to upload the watermark/logo image
      await expect(page.getByText(/watermark|logo|overlay/i).first()).toBeVisible();
    });
  });

  // ========================================================================
  // TEXT OVERLAY
  // ========================================================================
  test.describe("Text Overlay", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/text-overlay");
      await expect(page.getByText("Text Overlay").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows text input and font size slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/text-overlay");
      await uploadTestImage(page);

      await expect(page.locator("#text-overlay-text")).toBeVisible();
      await expect(page.locator("#text-overlay-text")).toHaveValue("Your Text Here");
      await expect(page.locator("#text-overlay-font-size")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/text-overlay");

      const submitBtn = page.getByTestId("text-overlay-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      await expect(submitBtn).toBeEnabled();
    });

    test("processes text overlay and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/text-overlay");
      await uploadTestImage(page);

      await page.getByTestId("text-overlay-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("text-overlay-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // COMPOSE (Image Composition)
  // ========================================================================
  test.describe("Compose", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/compose");
      await expect(page.getByText("Image Composition").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows overlay upload and position controls", async ({ loggedInPage: page }) => {
      await page.goto("/compose");

      // Position and opacity controls visible in settings panel
      await expect(page.getByText("X Position")).toBeVisible();
      await expect(page.getByText("Y Position")).toBeVisible();
      await expect(page.getByText("Opacity").first()).toBeVisible();
      await expect(page.getByText("Blend Mode")).toBeVisible();
      await expect(page.getByTestId("compose-submit")).toBeVisible();
    });
  });

  // ========================================================================
  // BORDER
  // ========================================================================
  test.describe("Border", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/border");
      await expect(page.getByText("Border").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows border preset buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/border");
      await uploadTestImage(page);

      // Presets from border-settings.tsx
      await expect(page.getByText("Clean White").first()).toBeVisible();
      await expect(page.getByText("Gallery Black").first()).toBeVisible();
      await expect(page.getByText("Shadow").first()).toBeVisible();
      await expect(page.getByText("Rounded").first()).toBeVisible();
    });

    test("shows border width and color controls after upload", async ({ loggedInPage: page }) => {
      await page.goto("/border");
      await uploadTestImage(page);

      await expect(page.getByText(/border width|width/i).first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/border");
      await uploadTestImage(page);

      await expect(page.getByTestId("border-submit")).toBeVisible();
    });

    test("processes border and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/border");
      await uploadTestImage(page);

      await page.getByTestId("border-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("border-download")).toBeVisible({ timeout: 15_000 });
    });
  });
});
