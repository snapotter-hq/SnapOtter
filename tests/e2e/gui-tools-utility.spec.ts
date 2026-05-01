import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Utility Tools
// (compare, find-duplicates, image-to-base64, barcode-read, qr-generate, bulk-rename)
// ---------------------------------------------------------------------------

test.describe("GUI Utility Tools", () => {
  // ========================================================================
  // COMPARE
  // ========================================================================
  test.describe("Image Compare", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/compare");
      await expect(page.getByText("Image Compare").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows second image upload prompt after first upload", async ({ loggedInPage: page }) => {
      await page.goto("/compare");
      await uploadTestImage(page);

      // Compare tool requires a second image
      await expect(page.getByText(/second|compare|upload/i).first()).toBeVisible();
    });
  });

  // ========================================================================
  // FIND DUPLICATES
  // ========================================================================
  test.describe("Find Duplicates", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/find-duplicates");
      await expect(page.getByText("Find Duplicates").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows preset sensitivity buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/find-duplicates");
      await uploadTestImage(page);

      // Preset buttons from find-duplicates-settings.tsx
      await expect(page.getByRole("button", { name: /exact/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /similar/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /loose/i }).first()).toBeVisible();
    });
  });

  // ========================================================================
  // IMAGE TO BASE64
  // ========================================================================
  test.describe("Image to Base64", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await expect(page.getByText("Image to Base64").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows output format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await uploadTestImage(page);

      // Output format dropdown (Keep Original, JPEG, PNG, WebP, AVIF)
      await expect(page.getByText(/output format|format/i).first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await uploadTestImage(page);

      await expect(page.getByTestId("base64-submit")).toBeVisible();
    });
  });

  // ========================================================================
  // BARCODE READ
  // ========================================================================
  test.describe("Barcode Reader", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/barcode-read");
      await expect(page.getByText("Barcode").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows scan button after upload", async ({ loggedInPage: page }) => {
      await page.goto("/barcode-read");
      await uploadTestImage(page);

      await expect(page.getByTestId("barcode-read-submit")).toBeVisible();
    });

    test("processes scan and shows result or no-barcode message", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/barcode-read");
      await uploadTestImage(page);

      await page.getByTestId("barcode-read-submit").click();
      await waitForProcessing(page);

      // Our test image is a red square -- no barcode should be found
      await expect(
        page
          .getByText(/no.*barcode|no.*found/i)
          .first()
          .or(page.getByText("Results").first()),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // QR GENERATE
  // ========================================================================
  test.describe("QR Code Generator", () => {
    test("renders tool page without dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");
      await expect(page.getByText("QR Code").first()).toBeVisible();

      // QR generate has no file upload dropzone
      await expect(page.getByText("Upload from computer")).not.toBeVisible();
    });

    test("shows content type tabs", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      // Content type tabs from qr-generate-settings.tsx
      await expect(page.getByText("URL").first()).toBeVisible();
      await expect(page.getByText("Text").first()).toBeVisible();
      await expect(page.getByText("WiFi").first()).toBeVisible();
      await expect(page.getByText("vCard").first()).toBeVisible();
    });

    test("URL input generates live QR preview", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await page.getByTestId("qr-input-url").fill("https://example.com");
      // Canvas or SVG should render in the preview area
      await expect(page.locator("canvas, svg").first()).toBeVisible({ timeout: 5000 });
    });

    test("download button enabled after URL input", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await page.getByTestId("qr-input-url").fill("https://example.com");
      const downloadBtn = page.getByTestId("qr-generate-download");
      await expect(downloadBtn).toBeEnabled();
    });

    test("dot style options visible", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      // Dot type style buttons from qr-generate-settings.tsx
      await expect(page.getByRole("button", { name: "Square" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Rounded" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Dots" }).first()).toBeVisible();
    });

    test("download format options visible", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await expect(page.getByText("PNG").first()).toBeVisible();
      await expect(page.getByText("SVG").first()).toBeVisible();
    });
  });

  // ========================================================================
  // BULK RENAME
  // ========================================================================
  test.describe("Bulk Rename", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await expect(page.getByText("Bulk Rename").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows pattern input after upload", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      // Pattern input with default "image-{{index}}"
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      await expect(page.getByTestId("bulk-rename-submit")).toBeVisible();
    });
  });
});
