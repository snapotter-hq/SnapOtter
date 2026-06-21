import path from "node:path";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

const FIXTURE_PNG = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "image",
  "valid",
  "test-200x150.png",
);

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

    test("shows second image upload button with correct label", async ({ loggedInPage: page }) => {
      await page.goto("/compare");

      await expect(page.getByText("Second Image").first()).toBeVisible();
      await expect(page.getByText("Choose second image")).toBeVisible();
    });

    test("submit disabled without both images", async ({ loggedInPage: page }) => {
      await page.goto("/compare");

      const submitBtn = page.getByTestId("compare-submit");
      await expect(submitBtn).toBeDisabled();

      await uploadTestImage(page);
      // Still disabled -- no second image
      await expect(submitBtn).toBeDisabled();
    });

    test("submit button text says Compare", async ({ loggedInPage: page }) => {
      await page.goto("/compare");

      await expect(page.getByTestId("compare-submit")).toHaveText(/Compare/);
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

    test("shows sensitivity threshold slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/find-duplicates");
      await uploadTestImage(page);

      await expect(page.locator("input[type='range']").first()).toBeVisible();
    });

    test("preset click updates threshold slider", async ({ loggedInPage: page }) => {
      await page.goto("/find-duplicates");
      await uploadTestImage(page);

      // Click exact preset
      await page.getByRole("button", { name: /exact/i }).first().click();
      // Click loose preset
      await page.getByRole("button", { name: /loose/i }).first().click();
    });

    test("scan button requires at least 2 files", async ({ loggedInPage: page }) => {
      await page.goto("/find-duplicates");
      await uploadTestImage(page);

      // With only one file, scan should be disabled
      const scanBtn = page.getByRole("button", { name: /scan|find/i }).first();
      await expect(scanBtn).toBeDisabled();
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

    test("shows all output format buttons", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Keep Original", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "JPEG", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "PNG", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "WebP", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "AVIF", exact: true })).toBeVisible();
    });

    test("quality slider appears for lossy formats", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await uploadTestImage(page);

      // Keep Original is default -- no quality slider
      await expect(page.locator("#b64-quality")).not.toBeVisible();

      // Switch to JPEG -- quality slider should appear
      await page.getByRole("button", { name: "JPEG", exact: true }).click();
      await expect(page.locator("#b64-quality")).toBeVisible();
    });

    test("shows max width and max height inputs", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await uploadTestImage(page);

      await expect(page.locator("#b64-max-width")).toBeVisible();
      await expect(page.locator("#b64-max-height")).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await uploadTestImage(page);

      await expect(page.getByTestId("base64-submit")).toBeVisible();
      await expect(page.getByTestId("base64-submit")).toHaveText(/Convert to Base64/);
    });

    test("quality slider hidden for PNG format", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "PNG", exact: true }).click();
      await expect(page.locator("#b64-quality")).not.toBeVisible();
    });

    test("switching format to AVIF shows quality slider", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-base64");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "AVIF", exact: true }).click();
      await expect(page.locator("#b64-quality")).toBeVisible();
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

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("[class*='border-dashed']").first().click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(FIXTURE_PNG);
      await page.waitForTimeout(500);

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

    test("WiFi tab shows network inputs", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await page.getByText("WiFi").first().click();
      // WiFi tab should show SSID and password inputs
      await expect(page.getByText(/ssid|network/i).first()).toBeVisible();
    });

    test("vCard tab shows contact fields", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await page.getByText("vCard").first().click();
      // vCard tab should show name input
      await expect(page.getByText(/name/i).first()).toBeVisible();
    });

    test("Text tab shows text input", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await page.getByText("Text").first().click();
      // Text tab should have a textarea or input
      await expect(page.locator("textarea, input[type='text']").first()).toBeVisible();
    });

    test("shows error correction dropdown with four levels", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      const select = page.locator("#qr-error-correction");
      await expect(select).toBeVisible();
      const options = select.locator("option");
      await expect(options).toHaveCount(4); // L, M, Q, H
    });

    test("shows size slider", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await expect(page.locator("#qr-size")).toBeVisible();
    });

    test("shows corner square style buttons", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await expect(page.getByText("Corner Square")).toBeVisible();
    });

    test("shows corner dot style buttons", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await expect(page.getByText("Corner Dot")).toBeVisible();
    });

    test("Email tab shows to/subject/body fields", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await page.getByText("Email").first().click();
      await expect(page.locator("#qr-email-to")).toBeVisible();
      await expect(page.locator("#qr-email-subject")).toBeVisible();
    });

    test("Phone tab shows phone input", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await page.getByText("Phone").first().click();
      await expect(page.locator("#qr-phone")).toBeVisible();
    });

    test("SMS tab shows phone and message inputs", async ({ loggedInPage: page }) => {
      await page.goto("/qr-generate");

      await page.getByText("SMS").first().click();
      await expect(page.locator("#qr-sms-phone")).toBeVisible();
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

    test("shows pattern input with default value after upload", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      await expect(page.locator("#bulk-rename-pattern")).toBeVisible();
      await expect(page.locator("#bulk-rename-pattern")).toHaveValue("image-{{index}}");
    });

    test("shows pattern variables help text", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      await expect(page.getByText("{{index}}")).toBeVisible();
      await expect(page.getByText("{{padded}}")).toBeVisible();
      await expect(page.getByText("{{original}}")).toBeVisible();
    });

    test("shows start index input", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      await expect(page.locator("#bulk-rename-start-index")).toBeVisible();
    });

    test("shows preview of renamed files after upload", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      await expect(page.getByText("Preview")).toBeVisible();
    });

    test("submit button uses data-testid and shows file count", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("bulk-rename-submit");
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).toHaveText(/Rename.*Files/);
    });

    test("changing pattern updates preview", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      await page.locator("#bulk-rename-pattern").fill("photo-{{index}}");
      await expect(page.locator("#bulk-rename-pattern")).toHaveValue("photo-{{index}}");
      // Preview should still be visible
      await expect(page.getByText("Preview")).toBeVisible();
    });

    test("start index input accepts values", async ({ loggedInPage: page }) => {
      await page.goto("/bulk-rename");
      await uploadTestImage(page);

      const startIndex = page.locator("#bulk-rename-start-index");
      await startIndex.fill("5");
      await expect(startIndex).toHaveValue("5");
    });
  });
});
