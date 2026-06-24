import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Format & Conversion Tools
// (svg-to-raster, vectorize, gif-tools, image-to-pdf, pdf-to-image, favicon,
//  optimize-for-web)
// ---------------------------------------------------------------------------

// A tool page renders its settings panel (and submit button) only after a file
// is present; before upload it shows just the full-width dropzone. svg-to-raster
// accepts only SVG and pdf-to-image only PDF, so the default PNG from
// uploadTestImage gets filtered out. uploadFixture uploads a matching file.
const SVG_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "image",
  "valid",
  "test-100x100.svg",
);
const PDF_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "document",
  "valid",
  "test-3page.pdf",
);

async function uploadFixture(page: Page, filePath: string): Promise<void> {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const uploadButton = page.getByRole("button", { name: /upload from computer/i }).first();
  if (await uploadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await uploadButton.click();
  } else {
    await page.locator("[class*='border-dashed']").first().click();
  }
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(500);
}

test.describe("GUI Format & Conversion Tools", () => {
  // ========================================================================
  // SVG TO RASTER
  // ========================================================================
  test.describe("SVG to Raster", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await expect(page.getByText("SVG to Raster").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows settings section", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      // Settings (and the submit button) render only after an SVG is uploaded.
      await uploadFixture(page, SVG_FIXTURE);
      await expect(page.getByTestId("svg-to-raster-submit")).toBeVisible();
    });

    test("shows sizing mode buttons (Scale Factor / Custom Size)", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await expect(page.getByRole("button", { name: "Scale Factor" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Custom Size" })).toBeVisible();
    });

    test("shows DPI preset buttons", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await expect(page.getByRole("button", { name: "72" })).toBeVisible();
      await expect(page.getByRole("button", { name: "96" })).toBeVisible();
      await expect(page.getByRole("button", { name: "150" })).toBeVisible();
      await expect(page.getByRole("button", { name: "300" })).toBeVisible();
    });

    test("shows format buttons (png, jpg, webp, avif, etc.)", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await expect(page.getByRole("button", { name: /^png$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^jpg$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^webp$/i })).toBeVisible();
    });

    test("shows background mode buttons (Transparent / Color)", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await expect(page.getByRole("button", { name: "Transparent" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Color" })).toBeVisible();
    });

    test("color mode shows color presets when selected", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await page.getByRole("button", { name: "Color" }).click();
      // Should show white and black color buttons
      await expect(page.locator("button[aria-label='White background']")).toBeVisible();
      await expect(page.locator("button[aria-label='Black background']")).toBeVisible();
    });

    test("custom size mode shows width and height inputs", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await page.getByRole("button", { name: "Custom Size" }).click();
      await expect(page.locator("#svg-custom-width")).toBeVisible();
      await expect(page.locator("#svg-custom-height")).toBeVisible();
    });

    test("scale factor mode shows scale presets", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");

      // Scale presets require an SVG file to detect dimensions; upload a test SVG
      await uploadFixture(page, SVG_FIXTURE);

      await page.getByRole("button", { name: "Scale Factor" }).click();
      // Scale presets should be visible (0.5x, 1x, 2x, 3x, 4x)
      await expect(page.getByRole("button", { name: "1x" }).first()).toBeVisible();
    });

    test("submit disabled without file", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");

      // The settings panel (and its submit button) mount only after upload,
      // so before a file there is no submit button to interact with.
      await expect(page.getByTestId("svg-to-raster-submit")).toHaveCount(0);
    });
  });

  // ========================================================================
  // VECTORIZE (Image to SVG)
  // ========================================================================
  test.describe("Vectorize", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await expect(page.getByText("Image to SVG").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows preset buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      // Presets from vectorize-settings.tsx
      await expect(page.getByRole("button", { name: /logo/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /illustration/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /photo/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /sketch/i }).first()).toBeVisible();
    });

    test("shows color mode toggle after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      // Color mode: B&W / Color from vectorize-settings.tsx
      await expect(page.getByText(/color mode|b&w|black/i).first()).toBeVisible();
    });

    test("shows detail level buttons (low, medium, high)", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /^low$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^medium$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^high$/i })).toBeVisible();
    });

    test("shows smoothing buttons (none, polygon, spline)", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /^none$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^polygon$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^spline$/i })).toBeVisible();
    });

    test("shows invert colors toggle", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await expect(page.getByText("Invert Colors")).toBeVisible();
    });

    test("switching to color mode shows color precision slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      // Logo preset defaults to B&W -- switch to illustration for color mode
      await page.getByRole("button", { name: /^illustration$/i }).click();
      await expect(page.locator("#vectorize-color-precision")).toBeVisible();
      await expect(page.getByText("Color Precision")).toBeVisible();
    });

    test("B&W mode shows threshold slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      // Logo preset defaults to B&W
      await expect(page.locator("#vectorize-threshold")).toBeVisible();
      await expect(page.getByText("Threshold")).toBeVisible();
    });

    test("shows custom preset button", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /^custom$/i })).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await expect(page.getByTestId("vectorize-submit")).toBeVisible();
    });

    test("processes vectorize and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await page.getByTestId("vectorize-submit").click();
      await waitForProcessing(page);

      // vectorize-settings renders a hardcoded data-testid for its download link.
      await expect(page.getByTestId("vectorize-download")).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // ========================================================================
  // GIF TOOLS
  // ========================================================================
  test.describe("GIF Tools", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await expect(page.getByText("GIF").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows mode selector tabs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      // Mode tabs from gif-tools-settings.tsx
      await expect(page.getByRole("button", { name: "Resize" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Optimize" }).first()).toBeVisible();
    });

    test("shows settings section", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("shows all six mode tabs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Resize" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Optimize" }).first()).toBeVisible();
      // Speed, Reverse, Extract require animated GIF -- may be disabled but visible
      await expect(page.getByRole("button", { name: "Speed" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Reverse" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Extract" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Rotate" }).first()).toBeVisible();
    });

    test("resize mode shows pixel and percentage tabs", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      // Resize is default mode
      await expect(page.getByRole("button", { name: "Pixels" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Percentage" })).toBeVisible();
    });

    test("resize pixel mode shows width and height inputs", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await expect(page.locator("#gif-width")).toBeVisible();
      await expect(page.locator("#gif-height")).toBeVisible();
    });

    test("optimize mode shows colors and dither sliders", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Optimize" }).first().click();
      await expect(page.locator("#gif-colors")).toBeVisible();
      await expect(page.locator("#gif-dither")).toBeVisible();
      await expect(page.locator("#gif-effort")).toBeVisible();
    });

    test("rotate mode shows angle buttons and flip controls", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Rotate" }).first().click();
      await expect(page.getByText("Angle")).toBeVisible();
      await expect(page.getByText("Flip")).toBeVisible();
      await expect(page.getByText("Horizontal")).toBeVisible();
      await expect(page.getByText("Vertical")).toBeVisible();
    });

    test("shows loop control section", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await expect(page.getByText("Loop")).toBeVisible();
      await expect(page.getByRole("button", { name: "Infinite" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Once" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Custom" })).toBeVisible();
    });

    test("speed mode shows speed factor controls", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");

      // Speed mode requires an animated GIF (disabled for static images)
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("[class*='border-dashed']").first().click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(
        path.join(process.cwd(), "tests", "fixtures", "image", "valid", "animated.gif"),
      );
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: "Speed" }).first().click();
      await expect(page.getByText(/speed/i).first()).toBeVisible();
    });

    test("extract mode shows extract controls", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");

      // Extract mode requires an animated GIF (disabled for static images)
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("[class*='border-dashed']").first().click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(
        path.join(process.cwd(), "tests", "fixtures", "image", "valid", "animated.gif"),
      );
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: "Extract" }).first().click();
      await expect(page.getByText(/format/i).first()).toBeVisible();
    });

    test("custom loop count input appears when Custom is selected", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Custom" }).click();
      // Custom loop count input should appear
      await expect(page.locator("input[type='number']").first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await expect(page.getByTestId("gif-tools-submit")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");

      // The submit button mounts only after a file is uploaded.
      await expect(page.getByTestId("gif-tools-submit")).toHaveCount(0);

      await uploadTestImage(page);
      await expect(page.getByTestId("gif-tools-submit")).toBeEnabled();
    });
  });

  // ========================================================================
  // IMAGE TO PDF
  // ========================================================================
  test.describe("Image to PDF", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await expect(page.getByText("Image to PDF").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows page size and orientation controls", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await expect(page.getByText("Page Size")).toBeVisible();
      await expect(page.getByText("Orientation")).toBeVisible();
      await expect(page.getByRole("button", { name: "Portrait" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Landscape" })).toBeVisible();
    });

    test("shows submit button with page count", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await expect(page.getByTestId("image-to-pdf-submit")).toBeVisible();
    });

    test("shows page size dropdown with options", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      const select = page.locator("#image-to-pdf-page-size");
      await expect(select).toBeVisible();
      const options = select.locator("option");
      await expect(options).toHaveCount(4); // A4, Letter, A3, A5
    });

    test("changing page size selects new value", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await page.selectOption("#image-to-pdf-page-size", "Letter");
      await expect(page.locator("#image-to-pdf-page-size")).toHaveValue("Letter");
    });

    test("shows margin slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      const slider = page.locator("#image-to-pdf-margin");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("shows target file size input", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await expect(page.getByTestId("image-to-pdf-target-size-value")).toBeVisible();
      await expect(page.getByTestId("image-to-pdf-target-size-unit")).toBeVisible();
    });

    test("orientation buttons toggle between portrait and landscape", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Landscape" }).click();
      await page.getByRole("button", { name: "Portrait" }).click();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");

      // The submit button mounts only after a file is uploaded.
      await expect(page.getByTestId("image-to-pdf-submit")).toHaveCount(0);

      await uploadTestImage(page);
      await expect(page.getByTestId("image-to-pdf-submit")).toBeEnabled();
    });

    test("processes image to PDF and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await page.getByTestId("image-to-pdf-submit").click();
      await waitForProcessing(page, 60_000);

      await expect(page.getByTestId("image-to-pdf-download")).toBeVisible({ timeout: 30_000 });
    });
  });

  // ========================================================================
  // PDF TO IMAGE
  // ========================================================================
  test.describe("PDF to Image", () => {
    test("renders tool page and shows settings after upload", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await expect(page.getByText("PDF to Image").first()).toBeVisible();

      // pdf-to-image uses the custom-results display mode: the settings panel
      // mounts only after a PDF is uploaded (before that it shows the dropzone).
      await uploadFixture(page, PDF_FIXTURE);
      await expect(page.getByText("Settings").first()).toBeVisible();
    });

    test("shows format options", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      // Format options from pdf-to-image-settings.tsx
      await expect(page.getByText(/format/i).first()).toBeVisible();
    });

    test("shows DPI presets", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      // DPI buttons from pdf-to-image-settings.tsx
      await expect(page.getByText(/dpi|resolution/i).first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await expect(page.getByTestId("pdf-to-image-submit")).toBeVisible();
    });

    test("shows all format buttons", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await expect(page.getByText("Output Format")).toBeVisible();
      await expect(page.getByRole("button", { name: "PNG" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "JPEG" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "WebP" }).first()).toBeVisible();
    });

    test("shows DPI preset buttons", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await expect(page.getByText("Resolution (DPI)")).toBeVisible();
      await expect(page.getByRole("button", { name: "72" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "150" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "300" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "600" }).first()).toBeVisible();
    });

    test("shows color mode buttons", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await expect(page.getByText("Color Mode")).toBeVisible();
      await expect(page.getByRole("button", { name: "Color" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Grayscale" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "B&W" }).first()).toBeVisible();
    });

    test("shows pages input field", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await expect(page.locator("#pdf-pages")).toBeVisible();
    });

    test("shows PDF upload area", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");

      // Before upload the tool shows its file dropzone with the upload button.
      await expect(
        page.getByRole("button", { name: /upload from computer/i }).first(),
      ).toBeVisible();
    });

    test("submit disabled without file", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");

      // The settings panel (and its submit button) mount only after upload.
      await expect(page.getByTestId("pdf-to-image-submit")).toHaveCount(0);
    });

    test("shows Custom DPI button", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await expect(page.getByRole("button", { name: "Custom" }).first()).toBeVisible();
    });
  });

  // ========================================================================
  // FAVICON
  // ========================================================================
  test.describe("Favicon Generator", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await expect(page.getByText("Favicon").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows generate button after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: /generate/i }).first()).toBeVisible();
    });

    test("shows generated sizes list", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      // Heading renders as "Generated Sizes (per image)"; getByText matches the substring.
      await expect(page.getByText("Generated Sizes")).toBeVisible();
      await expect(page.getByText("favicon-16x16.png")).toBeVisible();
      await expect(page.getByText("favicon-32x32.png")).toBeVisible();
      await expect(page.getByText("apple-touch-icon.png")).toBeVisible();
      await expect(page.getByText("android-chrome-512x512.png")).toBeVisible();
    });

    test("shows manifest and HTML snippet mention", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      // Rendered as a single line. "manifest.json" alone also appears in a
      // helper caption, so match the whole unique string.
      await expect(page.getByText("+ manifest.json + HTML snippet")).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      await expect(page.getByTestId("favicon-submit")).toBeVisible();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");

      // The submit button mounts only after a file is uploaded.
      await expect(page.getByTestId("favicon-submit")).toHaveCount(0);

      await uploadTestImage(page);
      await expect(page.getByTestId("favicon-submit")).toBeEnabled();
    });

    test("processes favicon generation and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      await page.getByTestId("favicon-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("favicon-download")).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // ========================================================================
  // OPTIMIZE FOR WEB
  // ========================================================================
  test.describe("Optimize for Web", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await expect(page.getByText("Optimize for Web").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      // Format buttons from optimize-for-web-settings.tsx
      await expect(page.getByText(/webp|jpeg|avif|png/i).first()).toBeVisible();
    });

    test("shows quality slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByText(/quality/i).first()).toBeVisible();
    });

    test("shows strip metadata checkbox after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByText(/strip metadata|remove metadata/i).first()).toBeVisible();
    });

    test("shows all five format buttons", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      // Scope to the settings panel. The uploaded file (test-image.png) also
      // appears as a list button whose name contains "PNG", so match the PNG
      // format button by exact accessible name to avoid a strict-mode collision.
      const settings = page.locator(".w-72");
      await expect(settings.getByRole("button", { name: "WebP" })).toBeVisible();
      await expect(settings.getByRole("button", { name: "JPEG" })).toBeVisible();
      await expect(settings.getByRole("button", { name: "AVIF" })).toBeVisible();
      await expect(settings.getByRole("button", { name: "PNG", exact: true })).toBeVisible();
      await expect(settings.getByRole("button", { name: "JXL" })).toBeVisible();
    });

    test("quality slider hidden for PNG format", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      // Match the PNG format button exactly so it does not collide with the
      // uploaded file's list button (filename test-image.png + "PNG" badge).
      const settings = page.locator(".w-72");
      await settings.getByRole("button", { name: "PNG", exact: true }).click();
      await expect(page.locator("#web-quality")).not.toBeVisible();
    });

    test("quality slider visible for WebP format", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      await settings.getByRole("button", { name: "WebP" }).click();
      await expect(page.locator("#web-quality")).toBeVisible();
    });

    test("shows collapsible Max Dimensions section", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      await expect(page.getByText("Max Dimensions")).toBeVisible();

      // Click to expand
      await page.getByText("Max Dimensions").click();
      await expect(page.locator("#max-width")).toBeVisible();
      await expect(page.locator("#max-height")).toBeVisible();
    });

    test("strip metadata toggle is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      const toggle = page.locator("#strip-meta");
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-checked", "true");

      // Toggle off
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
    });

    test("submit button is enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      // The optimize-for-web submit is a form submit button (no data-testid)
      const submitBtn = page.locator("button[type='submit']");
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).toBeEnabled();
    });

    test("submit disabled without file", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");

      // The settings form (with its submit button) mounts only after upload, so
      // before a file there is no submit button on the page at all.
      await expect(page.locator("button[type='submit']")).toHaveCount(0);
    });

    test("quality slider value changes for JPEG format", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      // Scope to the settings panel to avoid matching the file list item button
      const settings = page.locator(".w-72");
      await settings.getByRole("button", { name: "JPEG" }).click();
      const slider = page.locator("#web-quality");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("processes optimization and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      // The optimize-for-web submit is a form submit button (no data-testid)
      await page.locator("button[type='submit']").click();
      await waitForProcessing(page);

      // Download link has no data-testid; locate by role
      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });
});
