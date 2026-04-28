import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Format & Conversion Tools
// (svg-to-raster, vectorize, gif-tools, image-to-pdf, pdf-to-image, favicon,
//  optimize-for-web)
// ---------------------------------------------------------------------------

test.describe("GUI Format & Conversion Tools", () => {
  // ========================================================================
  // SVG TO RASTER
  // ========================================================================
  test.describe("SVG to Raster", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");
      await expect(page.getByText("SVG to Raster").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows settings section", async ({ loggedInPage: page }) => {
      await page.goto("/svg-to-raster");
      await expect(page.getByText("Settings").first()).toBeVisible();
    });
  });

  // ========================================================================
  // VECTORIZE (Image to SVG)
  // ========================================================================
  test.describe("Vectorize", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await expect(page.getByText("Image to SVG").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows preset buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      // Presets from vectorize-settings.tsx
      await expect(page.getByRole("button", { name: /logo/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /illustration/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /photo/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /sketch/i }).first()).toBeVisible();
    });

    test("shows color mode toggle after upload", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      // Color mode: B&W / Color from vectorize-settings.tsx
      await expect(page.getByText(/color mode|b&w|black/i).first()).toBeVisible();
    });

    test("processes vectorize and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/vectorize");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /vectorize/i }).click();
      await waitForProcessing(page);

      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // ========================================================================
  // GIF TOOLS
  // ========================================================================
  test.describe("GIF Tools", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await expect(page.getByText("GIF").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows mode selector tabs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await uploadTestImage(page);

      // Mode tabs from gif-tools-settings.tsx
      await expect(page.getByRole("button", { name: "Resize" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Optimize" }).first()).toBeVisible();
    });

    test("shows settings section", async ({ loggedInPage: page }) => {
      await page.goto("/gif-tools");
      await expect(page.getByText("Settings").first()).toBeVisible();
    });
  });

  // ========================================================================
  // IMAGE TO PDF
  // ========================================================================
  test.describe("Image to PDF", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image-to-pdf");
      await expect(page.getByText("Image to PDF").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });
  });

  // ========================================================================
  // PDF TO IMAGE
  // ========================================================================
  test.describe("PDF to Image", () => {
    test("renders tool page without standard dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/pdf-to-image");
      await expect(page.getByText("PDF to Image").first()).toBeVisible();

      // PDF to Image uses no-dropzone display mode with custom file input
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("shows format options", async ({ loggedInPage: page }) => {
      await page.goto("/pdf-to-image");

      // Format options from pdf-to-image-settings.tsx
      await expect(page.getByText(/format/i).first()).toBeVisible();
    });

    test("shows DPI presets", async ({ loggedInPage: page }) => {
      await page.goto("/pdf-to-image");

      // DPI buttons from pdf-to-image-settings.tsx
      await expect(page.getByText(/dpi|resolution/i).first()).toBeVisible();
    });
  });

  // ========================================================================
  // FAVICON
  // ========================================================================
  test.describe("Favicon Generator", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/favicon");
      await expect(page.getByText("Favicon").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows generate button after upload", async ({ loggedInPage: page }) => {
      await page.goto("/favicon");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /generate/i }).first()).toBeVisible();
    });

    test("processes favicon generation and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/favicon");
      await uploadTestImage(page);

      await page
        .getByRole("button", { name: /generate/i })
        .first()
        .click();
      await waitForProcessing(page);

      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // ========================================================================
  // OPTIMIZE FOR WEB
  // ========================================================================
  test.describe("Optimize for Web", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await expect(page.getByText("Optimize for Web").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      // Format buttons from optimize-for-web-settings.tsx
      await expect(page.getByText(/webp|jpeg|avif|png/i).first()).toBeVisible();
    });

    test("shows quality slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByText(/quality/i).first()).toBeVisible();
    });

    test("shows strip metadata checkbox after upload", async ({ loggedInPage: page }) => {
      await page.goto("/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByText(/strip metadata|remove metadata/i).first()).toBeVisible();
    });
  });
});
