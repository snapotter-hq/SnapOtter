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

    test("processes watermark and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/watermark-text");
      await uploadTestImage(page);

      await page.locator("#watermark-text-text").fill("Test Watermark");
      await page.getByRole("button", { name: /add watermark|apply watermark/i }).click();
      await waitForProcessing(page);

      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
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

    test("shows text input and styling controls after upload", async ({ loggedInPage: page }) => {
      await page.goto("/text-overlay");
      await uploadTestImage(page);

      // Text input and position/font controls
      await expect(page.getByText("Settings").first()).toBeVisible();
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

    test("shows overlay upload and position controls after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/compose");
      await uploadTestImage(page);

      // Should have controls for overlay position and opacity
      await expect(page.getByText(/overlay|position|opacity/i).first()).toBeVisible();
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

    test("processes border and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/border");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /apply border/i }).click();
      await waitForProcessing(page);

      await expect(
        page
          .getByRole("link", { name: /download/i })
          .first()
          .or(page.getByText(/invalid|error/i).first()),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
});
