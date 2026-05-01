import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Essential Tools (resize, crop, rotate, convert, compress)
// Covers settings UI, control interactions, processing flow, and download.
// ---------------------------------------------------------------------------

test.describe("GUI Essential Tools", () => {
  // ========================================================================
  // RESIZE
  // ========================================================================
  test.describe("Resize", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/resize");
      await expect(page.getByText("Resize").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("shows custom size tab with width/height inputs after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/resize");
      await uploadTestImage(page);

      // Custom Size tab is active by default
      await expect(page.getByText("Custom Size")).toBeVisible();
      await expect(page.locator("#resize-width")).toBeVisible();
      await expect(page.locator("#resize-height")).toBeVisible();
    });

    test("tab switching between Custom Size, Scale, and Presets", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/resize");
      await uploadTestImage(page);

      // Switch to Scale tab
      await page.getByText("Scale").click();
      await expect(page.locator("#resize-scale")).toBeVisible();
      // Verify percentage quick buttons
      await expect(page.getByRole("button", { name: "25%" })).toBeVisible();
      await expect(page.getByRole("button", { name: "50%" })).toBeVisible();
      await expect(page.getByRole("button", { name: "75%" })).toBeVisible();

      // Switch to Presets tab
      await page.getByText("Presets").click();
      await expect(page.getByText("Instagram").first()).toBeVisible();

      // Switch back to Custom Size
      await page.getByText("Custom Size").click();
      await expect(page.locator("#resize-width")).toBeVisible();
    });

    test("fit mode buttons work in custom tab", async ({ loggedInPage: page }) => {
      await page.goto("/resize");
      await uploadTestImage(page);

      await expect(page.getByText("Fit Mode")).toBeVisible();
      await expect(page.getByText("Crop to fit")).toBeVisible();
      await expect(page.getByText("Fit inside")).toBeVisible();
      await expect(page.getByText("Stretch")).toBeVisible();

      // Click Fit inside
      await page.getByText("Fit inside").click();
    });

    test("content-aware toggle reveals advanced options", async ({ loggedInPage: page }) => {
      await page.goto("/resize");
      await uploadTestImage(page);

      // Toggle content-aware switch (label is a sibling span, not aria-label)
      const toggle = page.locator("button[role='switch'][aria-checked]").first();
      await toggle.click();

      // Advanced options should appear
      await expect(page.getByText("Resize to square")).toBeVisible();
      await expect(page.getByText("Protect faces")).toBeVisible();
      await expect(page.getByText("Smoothing")).toBeVisible();
      await expect(page.getByText("Edge sensitivity")).toBeVisible();
    });

    test("submit disabled without dimensions, enabled with width", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/resize");
      await uploadTestImage(page);

      // Submit should be disabled without dimensions
      const submitBtn = page.getByTestId("resize-submit");
      await expect(submitBtn).toBeDisabled();

      // Set width
      await page.locator("#resize-width").fill("50");
      await expect(submitBtn).toBeEnabled();
    });

    test("processes image and shows download link", async ({ loggedInPage: page }) => {
      await page.goto("/resize");
      await uploadTestImage(page);

      await page.locator("#resize-width").fill("50");
      await page.getByTestId("resize-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });
    });

    test("scale tab processes image at 25%", async ({ loggedInPage: page }) => {
      await page.goto("/resize");
      await uploadTestImage(page);

      await page.getByText("Scale").click();
      await page.getByRole("button", { name: "25%" }).click();
      await page.getByTestId("resize-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // CROP
  // ========================================================================
  test.describe("Crop", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/crop");
      await expect(page.getByText("Crop").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows aspect ratio presets after upload", async ({ loggedInPage: page }) => {
      await page.goto("/crop");
      await uploadTestImage(page);

      await expect(page.getByText("Aspect Ratio")).toBeVisible();
      // Verify preset buttons
      await expect(page.getByRole("button", { name: "Free" })).toBeVisible();
      await expect(page.getByRole("button", { name: "1:1" })).toBeVisible();
      await expect(page.getByRole("button", { name: "4:3" })).toBeVisible();
      await expect(page.getByRole("button", { name: "16:9" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Custom" })).toBeVisible();
    });

    test("shows position and size inputs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/crop");
      await uploadTestImage(page);

      await expect(page.getByText("Position & Size")).toBeVisible();
      await expect(page.locator("#crop-x")).toBeVisible();
      await expect(page.locator("#crop-y")).toBeVisible();
      await expect(page.locator("#crop-width")).toBeVisible();
      await expect(page.locator("#crop-height")).toBeVisible();
    });

    test("custom aspect ratio reveals input fields", async ({ loggedInPage: page }) => {
      await page.goto("/crop");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Custom" }).click();
      // Custom mode shows two number inputs for ratio
      const customInputs = page.locator("input[type='number']");
      await expect(customInputs.first()).toBeVisible();
    });

    test("rule of thirds grid toggle", async ({ loggedInPage: page }) => {
      await page.goto("/crop");
      await uploadTestImage(page);

      await expect(page.getByText("Rule of Thirds")).toBeVisible();
    });

    test("crop submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/crop");
      await uploadTestImage(page);
      await page.waitForTimeout(500);

      await expect(page.getByTestId("crop-submit")).toBeVisible();
    });

    test("processes crop and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/crop");
      await uploadTestImage(page);
      await page.waitForTimeout(1000);

      // Set crop dimensions via number inputs
      const widthInputs = page.locator("input[type='number']");
      if ((await widthInputs.count()) >= 4) {
        await widthInputs.nth(2).fill("50");
        await widthInputs.nth(3).fill("50");
      }

      await page.getByTestId("crop-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("crop-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // ROTATE
  // ========================================================================
  test.describe("Rotate", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/rotate");
      await expect(page.getByText("Rotate").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows rotate controls after upload", async ({ loggedInPage: page }) => {
      await page.goto("/rotate");
      await uploadTestImage(page);

      // Quick rotate buttons
      await expect(page.getByTestId("rotate-left")).toBeVisible();
      await expect(page.getByTestId("rotate-right")).toBeVisible();
      await expect(page.getByRole("button", { name: "180" })).toBeVisible();
    });

    test("shows flip buttons", async ({ loggedInPage: page }) => {
      await page.goto("/rotate");
      await uploadTestImage(page);

      await expect(page.getByText("Flip").first()).toBeVisible();
      await expect(page.getByTestId("rotate-flip-h")).toBeVisible();
      await expect(page.getByTestId("rotate-flip-v")).toBeVisible();
    });

    test("shows straighten slider", async ({ loggedInPage: page }) => {
      await page.goto("/rotate");
      await uploadTestImage(page);

      await expect(page.getByText("Straighten")).toBeVisible();
      await expect(page.locator("#rotate-straighten")).toBeVisible();
    });

    test("angle input updates on rotate-right click", async ({ loggedInPage: page }) => {
      await page.goto("/rotate");
      await uploadTestImage(page);

      await page.getByTestId("rotate-right").click();
      await expect(page.locator("input[inputmode='numeric']")).toHaveValue("90", {
        timeout: 2000,
      });
    });

    test("submit disabled without changes, enabled after rotation", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/rotate");
      await uploadTestImage(page);

      // Submit should be disabled with no changes
      const submitBtn = page.getByTestId("rotate-submit");
      await expect(submitBtn).toBeDisabled();

      // Rotate 90 degrees
      await page.getByTestId("rotate-right").click();
      await expect(submitBtn).toBeEnabled();
    });

    test("reset all changes button appears after modification", async ({ loggedInPage: page }) => {
      await page.goto("/rotate");
      await uploadTestImage(page);

      await page.getByTestId("rotate-right").click();
      await expect(page.getByText("Reset all changes")).toBeVisible();
    });

    test("processes rotation and shows result", async ({ loggedInPage: page }) => {
      await page.goto("/rotate");
      await uploadTestImage(page);

      await page.getByTestId("rotate-right").click();
      await page.getByTestId("rotate-submit").click();
      await waitForProcessing(page);

      await expect(
        page
          .getByRole("button", { name: /^download$/i })
          .or(page.getByRole("link", { name: /download/i }))
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // CONVERT
  // ========================================================================
  test.describe("Convert", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/convert");
      await expect(page.getByText("Convert").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows source format and target format selector after upload", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/convert");
      await uploadTestImage(page);

      await expect(page.getByText("Source Format")).toBeVisible();
      await expect(page.locator("#convert-target-format")).toBeVisible();
    });

    test("format selector contains all output formats", async ({ loggedInPage: page }) => {
      await page.goto("/convert");
      await uploadTestImage(page);

      const select = page.locator("#convert-target-format");
      const options = select.locator("option");
      await expect(options).toHaveCount(8); // jpg, png, webp, avif, tiff, gif, heic, heif
    });

    test("quality slider appears for lossy formats", async ({ loggedInPage: page }) => {
      await page.goto("/convert");
      await uploadTestImage(page);

      // Select JPG (lossy)
      await page.selectOption("#convert-target-format", "jpg");
      await expect(page.locator("#convert-quality")).toBeVisible();

      // Switch to PNG (lossless) - quality should disappear
      await page.selectOption("#convert-target-format", "png");
      await expect(page.locator("#convert-quality")).not.toBeVisible();
    });

    test("processes conversion and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/convert");
      await uploadTestImage(page);

      await page.selectOption("#convert-target-format", "webp");
      await page.getByTestId("convert-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("convert-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // COMPRESS
  // ========================================================================
  test.describe("Compress", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/compress");
      await expect(page.getByText("Compress").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows compression mode toggle after upload", async ({ loggedInPage: page }) => {
      await page.goto("/compress");
      await uploadTestImage(page);

      await expect(page.getByText("Compression Mode")).toBeVisible();
      await expect(page.getByRole("button", { name: "Quality" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Target Size" })).toBeVisible();
    });

    test("quality mode shows quality slider", async ({ loggedInPage: page }) => {
      await page.goto("/compress");
      await uploadTestImage(page);

      await expect(page.locator("#compress-quality")).toBeVisible();
      await expect(page.getByText("Smallest file")).toBeVisible();
      await expect(page.getByText("Best quality")).toBeVisible();
    });

    test("target size mode shows size input", async ({ loggedInPage: page }) => {
      await page.goto("/compress");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Target Size" }).click();
      await expect(page.locator("#compress-target-size")).toBeVisible();
    });

    test("processes compression and shows download with size info", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/compress");
      await uploadTestImage(page);

      await page.getByTestId("compress-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("compress-download")).toBeVisible({ timeout: 15_000 });
      // Verify size comparison is displayed
      await expect(page.getByText("Saved:")).toBeVisible();
    });
  });
});
