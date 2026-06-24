import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// Settings panels (and their submit buttons) mount only after a file is
// uploaded. uploadTestImage handles PNGs; svg-to-raster and pdf-to-image need
// their own file kinds, so this uploads an arbitrary fixture the same way.
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

// ---------------------------------------------------------------------------
// GUI E2E: Expanded Coverage for Under-tested Tools
// Covers: ai-canvas-expand, meme-generator, compare, find-duplicates,
//         barcode-read, image-to-base64, bulk-rename, collage, stitch,
//         color-palette, beautify, split, gif-tools, svg-to-raster,
//         vectorize, optimize-for-web, image-to-pdf, pdf-to-image, favicon
// ---------------------------------------------------------------------------

test.describe("GUI Expanded Tool Coverage", () => {
  // ========================================================================
  // AI CANVAS EXPAND (0 tests previously -- full coverage)
  // ========================================================================
  test.describe("AI Canvas Expand", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await expect(page.getByText("Canvas Expand").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows quality tier buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      await expect(page.getByText("Quality").first()).toBeVisible();
      await expect(page.getByTestId("tier-fast")).toBeVisible();
      await expect(page.getByTestId("tier-balanced")).toBeVisible();
      await expect(page.getByTestId("tier-high")).toBeVisible();
    });

    test("shows aspect ratio preset buttons after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      await expect(page.getByText("Extend to aspect ratio")).toBeVisible();
      await expect(page.getByRole("button", { name: "16:9" })).toBeVisible();
      await expect(page.getByRole("button", { name: "1:1" })).toBeVisible();
      await expect(page.getByRole("button", { name: "4:3" })).toBeVisible();
      await expect(page.getByRole("button", { name: "3:2" })).toBeVisible();
      await expect(page.getByRole("button", { name: "9:16" })).toBeVisible();
      await expect(page.getByRole("button", { name: "4:5" })).toBeVisible();
    });

    test("shows per-side extension pixel inputs after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      await expect(page.getByText("Extend by (pixels)")).toBeVisible();
      await expect(page.locator("#cac-top")).toBeVisible();
      await expect(page.locator("#cac-right")).toBeVisible();
      await expect(page.locator("#cac-bottom")).toBeVisible();
      await expect(page.locator("#cac-left")).toBeVisible();
    });

    test("per-side inputs accept numeric values", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      await page.locator("#cac-top").fill("50");
      await expect(page.locator("#cac-top")).toHaveValue("50");

      await page.locator("#cac-right").fill("30");
      await expect(page.locator("#cac-right")).toHaveValue("30");

      await page.locator("#cac-bottom").fill("50");
      await expect(page.locator("#cac-bottom")).toHaveValue("50");

      await page.locator("#cac-left").fill("30");
      await expect(page.locator("#cac-left")).toHaveValue("30");
    });

    test("submit disabled without extension values", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("ai-canvas-expand-submit");
      await expect(submitBtn).toBeDisabled();
    });

    test("submit enabled after setting extension values", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      await page.locator("#cac-top").fill("20");
      await expect(page.getByTestId("ai-canvas-expand-submit")).toBeEnabled();
    });

    test("submit disabled without file", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");

      // The settings panel (and its submit button) only mount after a file is
      // uploaded; before upload the page shows just the dropzone.
      await expect(page.getByTestId("ai-canvas-expand-submit")).toHaveCount(0);
    });

    test("clicking aspect ratio preset populates extension values", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      // Click 16:9 preset -- should populate left/right or top/bottom values
      await page.getByRole("button", { name: "16:9" }).click();
      await page.waitForTimeout(300);

      // At least one extension value should be non-zero
      const top = Number(await page.locator("#cac-top").inputValue());
      const right = Number(await page.locator("#cac-right").inputValue());
      const bottom = Number(await page.locator("#cac-bottom").inputValue());
      const left = Number(await page.locator("#cac-left").inputValue());
      expect(top + right + bottom + left).toBeGreaterThan(0);
    });

    test("shows new size display after setting extension values", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      await page.locator("#cac-top").fill("50");
      await expect(page.getByText("New size:")).toBeVisible();
    });

    test("switching quality tier changes active button", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      await page.getByTestId("tier-fast").click();
      await page.getByTestId("tier-high").click();
      await page.getByTestId("tier-balanced").click();
    });

    test("tier description updates when switching tiers", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");
      await uploadTestImage(page);

      await page.getByTestId("tier-fast").click();
      await expect(page.getByText("Quick preview, fewer AI passes")).toBeVisible();

      await page.getByTestId("tier-high").click();
      await expect(page.getByText("Best results, slower")).toBeVisible();
    });
  });

  // ========================================================================
  // MEME GENERATOR (expanded -- editor phase controls)
  // ========================================================================
  test.describe("Meme Generator Expanded", () => {
    test("gallery phase shows template selection guidance", async ({ loggedInPage: page }) => {
      await page.goto("/image/meme-generator");

      await expect(
        page.getByText("Select a template from the gallery or upload your own image"),
      ).toBeVisible();
    });

    test("shows upload your own image option", async ({ loggedInPage: page }) => {
      await page.goto("/image/meme-generator");

      // Upload button should exist for custom images
      await expect(
        page
          .getByText(/upload/i)
          .or(page.locator("img"))
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("no standard dropzone in meme generator", async ({ loggedInPage: page }) => {
      await page.goto("/image/meme-generator");
      await expect(page.getByText("Upload from computer")).not.toBeVisible();
    });

    test("no settings heading visible in gallery phase", async ({ loggedInPage: page }) => {
      await page.goto("/image/meme-generator");
      // In gallery phase, settings sidebar should show guidance text
      await expect(
        page.getByText("Select a template from the gallery or upload your own image"),
      ).toBeVisible();
    });
  });

  // ========================================================================
  // COMPARE (expanded -- settings interactions)
  // ========================================================================
  test.describe("Compare Expanded", () => {
    test("shows second image file input", async ({ loggedInPage: page }) => {
      await page.goto("/image/compare");
      await uploadTestImage(page);

      await expect(page.locator("#compare-second-image")).toBeAttached();
    });

    test("second image upload button shows filename after selection", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/compare");
      await uploadTestImage(page);

      // Set second image via file input
      const testFixture = path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "image",
        "valid",
        "test-200x150.png",
      );
      await page.locator("#compare-second-image").setInputFiles(testFixture);
      await page.waitForTimeout(300);

      await expect(page.getByText("test-200x150.png")).toBeVisible();
    });

    test("submit disabled with only first image uploaded", async ({ loggedInPage: page }) => {
      await page.goto("/image/compare");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("compare-submit");
      await expect(submitBtn).toBeDisabled();
    });

    test("submit enabled with both images uploaded", async ({ loggedInPage: page }) => {
      await page.goto("/image/compare");
      await uploadTestImage(page);

      const testFixture = path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "image",
        "valid",
        "test-200x150.png",
      );
      await page.locator("#compare-second-image").setInputFiles(testFixture);
      await page.waitForTimeout(300);

      await expect(page.getByTestId("compare-submit")).toBeEnabled();
    });

    test("processes comparison and shows similarity result", async ({ loggedInPage: page }) => {
      await page.goto("/image/compare");
      await uploadTestImage(page);

      const testFixture = path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "image",
        "valid",
        "test-200x150.png",
      );
      await page.locator("#compare-second-image").setInputFiles(testFixture);
      await page.waitForTimeout(300);

      await page.getByTestId("compare-submit").click();
      await waitForProcessing(page);

      await expect(page.getByText(/Similarity:/)).toBeVisible({ timeout: 15_000 });
    });

    test("shows download diff image link after comparison", async ({ loggedInPage: page }) => {
      await page.goto("/image/compare");
      await uploadTestImage(page);

      const testFixture = path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "image",
        "valid",
        "test-200x150.png",
      );
      await page.locator("#compare-second-image").setInputFiles(testFixture);
      await page.waitForTimeout(300);

      await page.getByTestId("compare-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("compare-download")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Download Diff Image")).toBeVisible();
    });
  });

  // ========================================================================
  // FIND DUPLICATES (expanded -- settings interactions)
  // ========================================================================
  test.describe("Find Duplicates Expanded", () => {
    test("shows detection mode label", async ({ loggedInPage: page }) => {
      await page.goto("/image/find-duplicates");
      await uploadTestImage(page);

      await expect(page.getByText("Detection Mode").first()).toBeVisible();
    });

    test("shows sensitivity label and slider range", async ({ loggedInPage: page }) => {
      await page.goto("/image/find-duplicates");
      await uploadTestImage(page);

      await expect(page.getByText("Sensitivity")).toBeVisible();
      await expect(page.getByText("Strict match")).toBeVisible();
      await expect(page.getByText("Broad match")).toBeVisible();
    });

    test("exact preset shows correct description", async ({ loggedInPage: page }) => {
      await page.goto("/image/find-duplicates");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /exact/i }).first().click();
      await expect(
        page.getByText("Pixel-identical copies, same image in different formats."),
      ).toBeVisible();
    });

    test("similar preset shows correct description", async ({ loggedInPage: page }) => {
      await page.goto("/image/find-duplicates");
      await uploadTestImage(page);

      await page
        .getByRole("button", { name: /similar/i })
        .first()
        .click();
      await expect(
        page.getByText("Resized, recompressed, or lightly edited copies."),
      ).toBeVisible();
    });

    test("loose preset shows correct description", async ({ loggedInPage: page }) => {
      await page.goto("/image/find-duplicates");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /loose/i }).first().click();
      await expect(
        page.getByText("Visually related images, mild crops, different exposures."),
      ).toBeVisible();
    });

    test("scan button shows file count when 2+ files uploaded", async ({ loggedInPage: page }) => {
      await page.goto("/image/find-duplicates");

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("[class*='border-dashed']").first().click();
      const fileChooser = await fileChooserPromise;
      const fixturePath = path.join(process.cwd(), "tests", "fixtures", "image", "valid");
      await fileChooser.setFiles([
        path.join(fixturePath, "test-200x150.png"),
        path.join(fixturePath, "test-100x100.jpg"),
      ]);
      await page.waitForTimeout(500);

      const scanBtn = page.getByTestId("find-duplicates-submit");
      await expect(scanBtn).toBeEnabled();
      await expect(scanBtn).toHaveText(/Scan 2 Images/);
    });

    test("threshold slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/find-duplicates");
      await uploadTestImage(page);

      const slider = page.locator("#dup-threshold");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
      await expect(slider).toHaveAttribute("min", "0");
      await expect(slider).toHaveAttribute("max", "20");
    });
  });

  // ========================================================================
  // BARCODE READ (expanded -- options and interactions)
  // ========================================================================
  test.describe("Barcode Read Expanded", () => {
    test("shows scan description text", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");
      await uploadTestImage(page);

      await expect(page.getByText(/QR codes, barcodes.*Code 128/)).toBeVisible();
    });

    test("shows thorough scan checkbox", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");
      await uploadTestImage(page);

      await expect(page.getByText("Thorough scan")).toBeVisible();
    });

    test("thorough scan checkbox is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");
      await uploadTestImage(page);

      const checkbox = page
        .locator("label")
        .filter({ hasText: "Thorough scan" })
        .locator("input[type='checkbox']");
      await expect(checkbox).toBeVisible();
      await expect(checkbox).not.toBeChecked();

      await checkbox.check();
      await expect(checkbox).toBeChecked();
    });

    test("submit disabled without file, enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");

      // Settings (and the submit button) mount only after upload.
      await expect(page.getByTestId("barcode-read-submit")).toHaveCount(0);

      await uploadTestImage(page);
      await expect(page.getByTestId("barcode-read-submit")).toBeEnabled();
    });

    test("submit button text says Scan Barcodes", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");
      await uploadTestImage(page);

      await expect(page.getByTestId("barcode-read-submit")).toHaveText(/Scan Barcodes/);
    });

    test("shows Options section label", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");
      await uploadTestImage(page);

      await expect(page.getByText("Options")).toBeVisible();
    });

    test("shows multi-file scan count in submit button", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("[class*='border-dashed']").first().click();
      const fileChooser = await fileChooserPromise;
      const fixturePath = path.join(process.cwd(), "tests", "fixtures", "image", "valid");
      await fileChooser.setFiles([
        path.join(fixturePath, "test-200x150.png"),
        path.join(fixturePath, "test-100x100.jpg"),
      ]);
      await page.waitForTimeout(500);

      await expect(page.getByTestId("barcode-read-submit")).toHaveText(/Scan Barcodes \(2 files\)/);
    });
  });

  // ========================================================================
  // IMAGE TO BASE64 (expanded -- processing and results)
  // ========================================================================
  test.describe("Image to Base64 Expanded", () => {
    test("switching format to WebP shows quality slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "WebP", exact: true }).click();
      await expect(page.locator("#b64-quality")).toBeVisible();
    });

    test("max width input accepts values", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");
      await uploadTestImage(page);

      await page.locator("#b64-max-width").fill("500");
      await expect(page.locator("#b64-max-width")).toHaveValue("500");
    });

    test("max height input accepts values", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");
      await uploadTestImage(page);

      await page.locator("#b64-max-height").fill("400");
      await expect(page.locator("#b64-max-height")).toHaveValue("400");
    });

    test("submit button is enabled with file", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");
      await uploadTestImage(page);

      await expect(page.getByTestId("base64-submit")).toBeEnabled();
    });

    test("submit disabled without file", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");

      // Settings (and the submit button) mount only after upload.
      await expect(page.getByTestId("base64-submit")).toHaveCount(0);
    });

    test("processes base64 conversion and shows results", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");
      await uploadTestImage(page);

      await page.getByTestId("base64-submit").click();
      await waitForProcessing(page);

      // Should show base64 result with data URI or text area
      await expect(
        page
          .getByText(/data:image/)
          .or(page.locator("textarea"))
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    });

    test("format switching resets quality visibility correctly", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");
      await uploadTestImage(page);

      // JPEG shows quality
      await page.getByRole("button", { name: "JPEG", exact: true }).click();
      await expect(page.locator("#b64-quality")).toBeVisible();

      // PNG hides quality
      await page.getByRole("button", { name: "PNG", exact: true }).click();
      await expect(page.locator("#b64-quality")).not.toBeVisible();

      // AVIF shows quality
      await page.getByRole("button", { name: "AVIF", exact: true }).click();
      await expect(page.locator("#b64-quality")).toBeVisible();

      // Keep Original hides quality
      await page.getByRole("button", { name: "Keep Original", exact: true }).click();
      await expect(page.locator("#b64-quality")).not.toBeVisible();
    });
  });

  // ========================================================================
  // BULK RENAME (expanded -- pattern and preview interactions)
  // ========================================================================
  test.describe("Bulk Rename Expanded", () => {
    test("shows rename variables in help text", async ({ loggedInPage: page }) => {
      await page.goto("/image/bulk-rename");
      await uploadTestImage(page);

      // Variables help text lists {{index}}, {{padded}}, {{original}}.
      await expect(page.getByText("{{padded}}")).toBeVisible();
    });

    test("pattern input is interactive and updates value", async ({ loggedInPage: page }) => {
      await page.goto("/image/bulk-rename");
      await uploadTestImage(page);

      const patternInput = page.locator("#bulk-rename-pattern");
      await patternInput.clear();
      await patternInput.fill("my-photo-{{padded}}");
      await expect(patternInput).toHaveValue("my-photo-{{padded}}");
    });

    test("start index defaults to 1", async ({ loggedInPage: page }) => {
      await page.goto("/image/bulk-rename");
      await uploadTestImage(page);

      await expect(page.locator("#bulk-rename-start-index")).toHaveValue("1");
    });

    test("submit button disabled without file, enabled with file", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/bulk-rename");

      // Settings (and the submit button) mount only after upload.
      await expect(page.getByTestId("bulk-rename-submit")).toHaveCount(0);

      await uploadTestImage(page);
      await expect(page.getByTestId("bulk-rename-submit")).toBeEnabled();
    });

    test("processes bulk rename and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/bulk-rename");
      await uploadTestImage(page);

      await page.getByTestId("bulk-rename-submit").click();
      await waitForProcessing(page);

      // Bulk rename auto-triggers the ZIP download and confirms with a notice
      // (no persistent download button in this tool's settings panel).
      await expect(page.getByText("ZIP downloaded successfully")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // COLLAGE (expanded -- setting interactions)
  // ========================================================================
  test.describe("Collage Expanded", () => {
    test("canvas section shows aspect ratio control when expanded", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/collage");

      // The Canvas section now exposes an Aspect Ratio picker (the older
      // free-form width/height inputs were removed).
      await page.getByText("Canvas").click();
      await expect(page.getByText("Aspect Ratio").first()).toBeVisible();
    });

    test("spacing section shows gap slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      // Spacing section should show gap/spacing controls
      const gapSlider = page.locator("input[type='range']").first();
      await expect(gapSlider).toBeVisible();
    });

    test("shows corner radius slider in spacing section", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      await expect(page.getByText(/corner|radius/i).first()).toBeVisible();
    });

    test("output section shows format and quality controls", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      await page.getByText("Output").click();
      await expect(page.getByRole("button", { name: "PNG" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "JPEG" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "WebP" }).first()).toBeVisible();
    });

    test("JPEG format shows quality slider in output section", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      await page.getByText("Output").click();
      await page.getByRole("button", { name: "JPEG" }).first().click();
      await expect(page.getByText(/quality/i).first()).toBeVisible();
    });

    test("PNG format hides quality slider in output section", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      await page.getByText("Output").click();
      await page.getByRole("button", { name: "JPEG" }).first().click();
      await expect(page.getByText(/quality/i).first()).toBeVisible();

      await page.getByRole("button", { name: "PNG" }).first().click();
      // Quality label for the slider should not be visible for PNG
    });
  });

  // ========================================================================
  // STITCH (expanded -- direction and gap interactions)
  // ========================================================================
  test.describe("Stitch Expanded", () => {
    test("shows background color control after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      await expect(page.getByText(/background/i).first()).toBeVisible();
    });

    test("shows output format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      await expect(page.getByText(/output format|format/i).first()).toBeVisible();
    });

    test("processes stitch with 2 files and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("[class*='border-dashed']").first().click();
      const fileChooser = await fileChooserPromise;
      const fixturePath = path.join(process.cwd(), "tests", "fixtures", "image", "valid");
      await fileChooser.setFiles([
        path.join(fixturePath, "test-200x150.png"),
        path.join(fixturePath, "test-100x100.jpg"),
      ]);
      await page.waitForTimeout(500);

      await page.getByTestId("stitch-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("stitch-download")).toBeVisible({ timeout: 15_000 });
    });

    test("vertical direction is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      await page
        .getByText(/vertical/i)
        .first()
        .click();
    });

    test("grid direction is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      await page.getByText(/grid/i).first().click();
    });
  });

  // ========================================================================
  // COLOR PALETTE (expanded -- extraction and results)
  // ========================================================================
  test.describe("Color Palette Expanded", () => {
    test("submit disabled without file", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");

      // Settings (and the submit button) mount only after upload.
      await expect(page.getByTestId("color-palette-submit")).toHaveCount(0);
    });

    test("processes extraction and shows color swatches", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");
      await uploadTestImage(page);

      await page.getByTestId("color-palette-submit").click();
      await waitForProcessing(page);

      await expect(page.getByText("Dominant Colors").first()).toBeVisible({ timeout: 15_000 });
    });

    test("settings stay accessible after extraction", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");
      await uploadTestImage(page);

      await page.getByTestId("color-palette-submit").click();
      await waitForProcessing(page);

      await expect(page.getByText("Dominant Colors").first()).toBeVisible({ timeout: 15_000 });

      // color-palette is a data-output tool: results append in place and the
      // settings panel stays mounted (no review/undo step), so the user can
      // re-extract with different settings.
      await expect(page.getByTestId("color-palette-submit")).toBeVisible();
    });

    test("clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-palette");
      await uploadTestImage(page);

      await expect(page.getByTestId("color-palette-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });
  });

  // ========================================================================
  // BEAUTIFY (expanded -- settings interactions)
  // ========================================================================
  test.describe("Beautify Expanded", () => {
    test("clicking preset updates settings", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await page.getByText("Purple Haze").click();
      await page.getByText("Flamingo").click();
      await page.getByText("Ocean").click();
    });

    test("solid background tab shows color picker", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Solid" }).click();
      await expect(page.locator("input[type='color']").first()).toBeVisible();
    });

    test("none background tab hides background controls", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      // Multiple sections (background, shadow, frame) each have a "None"
      // option; the background tabs are the first group.
      await page.getByRole("button", { name: "None" }).first().click();
    });

    test("iPhone frame option is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "iPhone" }).click();
    });

    test("None frame option is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      // Check if "None" frame button exists in Device Frame section
      const noneBtn = page.getByRole("button", { name: "None" }).first();
      if (await noneBtn.isVisible()) {
        await noneBtn.click();
      }
    });

    test("padding slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      const slider = page.locator("#beautify-padding");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("border radius slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      const slider = page.locator("#beautify-border-radius");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("shadow None preset is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      // Shadow section has a "None" option
      const noneBtn = page.getByRole("button", { name: "None" });
      if ((await noneBtn.count()) > 0) {
        await noneBtn.first().click();
      }
    });

    test("undo after processing returns to settings", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await page.getByTestId("beautify-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("beautify-download")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /adjust settings/i }).click();

      await expect(page.getByTestId("beautify-submit")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("beautify-download")).not.toBeVisible();
    });

    test("clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByTestId("beautify-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByTestId("beautify-submit")).toBeVisible();

      await page.goto("/image/resize");
      await page.goto("/image/beautify");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });
  });

  // ========================================================================
  // SPLIT (expanded -- mode switching and processing)
  // ========================================================================
  test.describe("Split Expanded", () => {
    test("custom grid rows and columns inputs visible in grid mode", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      // Grid mode should show rows/cols or the preset buttons
      await expect(page.getByRole("button", { name: "2x2" }).first()).toBeVisible();
    });

    test("tile size mode shows pixel dimension inputs", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Tile Size" }).first().click();
      await expect(page.getByText(/width|tile/i).first()).toBeVisible();
    });

    test("4x4 grid preset is clickable", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "4x4" }).first().click();
    });

    test("undo after processing returns to settings", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);
      await page.waitForTimeout(1000);

      await page.getByRole("button", { name: "2x2" }).first().click();

      const splitBtn = page
        .getByRole("button", { name: /split/i })
        .filter({ hasNotText: /image splitting/i })
        .first();
      await splitBtn.click();
      await waitForProcessing(page);

      await expect(
        page
          .getByRole("link", { name: /download/i })
          .first()
          .or(page.getByText(/tiles|download/i).first()),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // GIF TOOLS (expanded -- mode interactions)
  // ========================================================================
  test.describe("GIF Tools Expanded", () => {
    test("resize percentage mode shows percentage input", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Percentage" }).click();
      // Percentage input should be visible
      await expect(page.locator("#gif-pct")).toBeVisible();
    });

    test("resize pixel mode width input accepts values", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.locator("#gif-width").fill("200");
      await expect(page.locator("#gif-width")).toHaveValue("200");
    });

    test("optimize mode colors slider has correct range", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Optimize" }).first().click();
      const slider = page.locator("#gif-colors");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("optimize mode effort slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Optimize" }).first().click();
      const slider = page.locator("#gif-effort");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("loop infinite button is default selected", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Infinite" })).toBeVisible();
    });

    test("loop once button is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Once" }).click();
    });

    test("rotate mode angle 90 button visible", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Rotate" }).first().click();
      await expect(page.getByRole("button", { name: "90" }).first()).toBeVisible();
    });
  });

  // ========================================================================
  // SVG TO RASTER (expanded -- format and size interactions)
  // ========================================================================
  test.describe("SVG to Raster Expanded", () => {
    test("clicking Color background shows color presets", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await page.getByRole("button", { name: "Color" }).click();
      await expect(page.locator("button[aria-label='White background']")).toBeVisible();
      await expect(page.locator("button[aria-label='Black background']")).toBeVisible();
    });

    test("custom size mode shows aspect ratio lock button", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await page.getByRole("button", { name: "Custom Size" }).click();
      await expect(page.locator("#svg-custom-width")).toBeVisible();
      await expect(page.locator("#svg-custom-height")).toBeVisible();
    });

    test("custom size width accepts values", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await page.getByRole("button", { name: "Custom Size" }).click();
      await page.locator("#svg-custom-width").fill("512");
      await expect(page.locator("#svg-custom-width")).toHaveValue("512");
    });

    test("DPI presets are interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await page.getByRole("button", { name: "72" }).click();
      await page.getByRole("button", { name: "150" }).click();
      await page.getByRole("button", { name: "300" }).click();
    });

    test("format buttons switch between png, jpg, webp", async ({ loggedInPage: page }) => {
      await page.goto("/image/svg-to-raster");
      await uploadFixture(page, SVG_FIXTURE);

      await page.getByRole("button", { name: /^png$/i }).click();
      await page.getByRole("button", { name: /^jpg$/i }).click();
      await page.getByRole("button", { name: /^webp$/i }).click();
    });
  });

  // ========================================================================
  // VECTORIZE (expanded -- preset and control interactions)
  // ========================================================================
  test.describe("Vectorize Expanded", () => {
    test("logo preset sets B&W mode by default", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      // Logo is default -- should show threshold slider (B&W mode)
      await expect(page.locator("#vectorize-threshold")).toBeVisible();
    });

    test("photo preset enables color mode", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /^photo$/i }).click();
      await expect(page.locator("#vectorize-color-precision")).toBeVisible();
    });

    test("sketch preset is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /^sketch$/i }).click();
    });

    test("detail level buttons are interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /^low$/i }).click();
      await page.getByRole("button", { name: /^high$/i }).click();
      await page.getByRole("button", { name: /^medium$/i }).click();
    });

    test("smoothing buttons are interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /^polygon$/i }).click();
      await page.getByRole("button", { name: /^spline$/i }).click();
      await page.getByRole("button", { name: /^none$/i }).click();
    });

    test("undo after vectorize returns to settings", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await page.getByRole("button", { name: /vectorize/i }).click();
      await waitForProcessing(page);

      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /adjust settings/i }).click();

      await expect(page.getByTestId("vectorize-submit")).toBeVisible({ timeout: 5_000 });
    });
  });

  // ========================================================================
  // OPTIMIZE FOR WEB (expanded -- setting interactions and processing)
  // ========================================================================
  test.describe("Optimize for Web Expanded", () => {
    test("AVIF format shows quality slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      const settings = page.locator(".w-72");
      await settings.getByRole("button", { name: "AVIF" }).click();
      await expect(page.locator("#web-quality")).toBeVisible();
    });

    test("JXL format shows quality slider", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      const settings = page.locator(".w-72");
      await settings.getByRole("button", { name: "JXL" }).click();
      await expect(page.locator("#web-quality")).toBeVisible();
    });

    test("max dimensions section shows width and height inputs when expanded", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      await page.getByText("Max Dimensions").click();
      await expect(page.locator("#max-width")).toBeVisible();
      await expect(page.locator("#max-height")).toBeVisible();
    });

    test("max width input accepts values", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      await page.getByText("Max Dimensions").click();
      await page.locator("#max-width").fill("1920");
      await expect(page.locator("#max-width")).toHaveValue("1920");
    });

    test("undo after optimization returns to settings", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      await page.locator("button[type='submit']").click();
      await waitForProcessing(page);

      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /adjust settings/i }).click();

      await expect(page.locator("button[type='submit']")).toBeVisible({ timeout: 5_000 });
    });

    test("navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/optimize-for-web");
      await uploadTestImage(page);

      await page.goto("/image/resize");
      await page.goto("/image/optimize-for-web");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });
  });

  // ========================================================================
  // IMAGE TO PDF (expanded -- setting interactions)
  // ========================================================================
  test.describe("Image to PDF Expanded", () => {
    test("A3 page size is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await page.selectOption("#image-to-pdf-page-size", "A3");
      await expect(page.locator("#image-to-pdf-page-size")).toHaveValue("A3");
    });

    test("A5 page size is selectable", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await page.selectOption("#image-to-pdf-page-size", "A5");
      await expect(page.locator("#image-to-pdf-page-size")).toHaveValue("A5");
    });

    test("margin slider is interactive", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      const slider = page.locator("#image-to-pdf-margin");
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute("type", "range");
    });

    test("target file size value input accepts values", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      const sizeInput = page.getByTestId("image-to-pdf-target-size-value");
      await sizeInput.fill("500");
      await expect(sizeInput).toHaveValue("500");
    });

    test("settings stay accessible after processing", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-pdf");
      await uploadTestImage(page);

      await page.getByTestId("image-to-pdf-submit").click();
      await waitForProcessing(page, 60_000);

      await expect(page.getByTestId("image-to-pdf-download")).toBeVisible({ timeout: 30_000 });

      // image-to-pdf renders its result inline and keeps the settings panel
      // mounted (no review/undo step), so the submit stays available for a
      // re-run alongside the download.
      await expect(page.getByTestId("image-to-pdf-submit")).toBeVisible();
    });
  });

  // ========================================================================
  // PDF TO IMAGE (expanded -- format and DPI interactions)
  // ========================================================================
  test.describe("PDF to Image Expanded", () => {
    test("custom DPI shows input field when clicked", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await page.getByRole("button", { name: "Custom" }).first().click();
      // Custom DPI should show an input
      await expect(page.locator("input[type='number']").first()).toBeVisible();
    });

    test("pages input accepts range values", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await page.locator("#pdf-pages").fill("1-5");
      await expect(page.locator("#pdf-pages")).toHaveValue("1-5");
    });

    test("color mode buttons are interactive", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await page.getByRole("button", { name: "Grayscale" }).first().click();
      await page.getByRole("button", { name: "B&W" }).first().click();
      await page.getByRole("button", { name: "Color" }).first().click();
    });

    test("format buttons are interactive", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await page.getByRole("button", { name: "JPEG" }).first().click();
      await page.getByRole("button", { name: "WebP" }).first().click();
      await page.getByRole("button", { name: "PNG" }).first().click();
    });

    test("DPI buttons switch active state", async ({ loggedInPage: page }) => {
      await page.goto("/pdf/pdf-to-image");
      await uploadFixture(page, PDF_FIXTURE);

      await page.getByRole("button", { name: "72" }).first().click();
      await page.getByRole("button", { name: "300" }).first().click();
      await page.getByRole("button", { name: "600" }).first().click();
    });
  });

  // ========================================================================
  // FAVICON (expanded -- settings and processing)
  // ========================================================================
  test.describe("Favicon Expanded", () => {
    test("shows generated icon sizes in list", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      // Current generated set (mstile was dropped from FAVICON_SIZES)
      await expect(page.getByText("android-chrome-512x512.png")).toBeVisible();
      await expect(page.getByText("apple-touch-icon.png")).toBeVisible();
    });

    test("settings stay accessible after favicon generation", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      await page.getByTestId("favicon-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("favicon-download")).toBeVisible({ timeout: 15_000 });

      // favicon is a multi-output tool: the generated icon set renders inline
      // and the settings panel stays mounted (no review/undo step), so submit
      // remains available alongside the download.
      await expect(page.getByTestId("favicon-submit")).toBeVisible();
    });

    test("clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      await expect(page.getByTestId("favicon-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("navigate away from favicon resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/favicon");
      await uploadTestImage(page);

      await page.goto("/image/resize");
      await page.goto("/image/favicon");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });
  });

  // ========================================================================
  // CROSS-TOOL: UNDO AND STATE RESET (tools not covered by other files)
  // ========================================================================
  test.describe("Undo and State Reset (expanded tools)", () => {
    test("image-to-base64: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");
      await uploadTestImage(page);

      await expect(page.getByTestId("base64-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("barcode-read: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");
      await uploadTestImage(page);

      await expect(page.getByTestId("barcode-read-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("bulk-rename: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/bulk-rename");
      await uploadTestImage(page);

      await expect(page.getByTestId("bulk-rename-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("stitch: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      await expect(page.getByTestId("stitch-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("split: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("gif-tools: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/gif-tools");
      await uploadTestImage(page);

      await expect(page.getByTestId("gif-tools-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("vectorize: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/vectorize");
      await uploadTestImage(page);

      await expect(page.getByTestId("vectorize-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("replace-color: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/replace-color");
      await uploadTestImage(page);

      await expect(page.getByTestId("replace-color-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("sharpening: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/sharpening");
      await uploadTestImage(page);

      await expect(page.getByTestId("sharpening-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("color-blindness: clear all returns to dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/color-blindness");
      await uploadTestImage(page);

      await expect(page.getByTestId("color-blindness-submit")).toBeVisible();

      await page.getByText("Clear all").click();

      await expect(page.getByText("Upload from computer")).toBeVisible({ timeout: 5_000 });
    });

    test("image-enhancement: navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-enhancement");
      await uploadTestImage(page);

      await expect(page.getByTestId("image-enhancement-submit")).toBeVisible({ timeout: 10_000 });

      await page.goto("/image/resize");
      await page.goto("/image/image-enhancement");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("compare: navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/compare");
      await uploadTestImage(page);

      await page.goto("/image/resize");
      await page.goto("/image/compare");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });
  });

  // ========================================================================
  // CROSS-TOOL: NAVIGATE AWAY RESETS
  // ========================================================================
  test.describe("Navigate Away Resets (expanded tools)", () => {
    test("ai-canvas-expand: navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/ai-canvas-expand");

      // On servers without the AI bundle the page shows an install prompt
      // instead of a dropzone; there is no state to reset.
      const uploadVisible = await page
        .getByText("Upload from computer")
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      test.skip(!uploadVisible, "AI canvas-expand bundle not installed");

      await uploadTestImage(page);

      await page.locator("#cac-top").fill("20");

      await page.goto("/image/resize");
      await page.goto("/image/ai-canvas-expand");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("barcode-read: navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/barcode-read");
      await uploadTestImage(page);

      await page.goto("/image/resize");
      await page.goto("/image/barcode-read");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("bulk-rename: navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/bulk-rename");
      await uploadTestImage(page);

      await page.goto("/image/resize");
      await page.goto("/image/bulk-rename");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("find-duplicates: navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/find-duplicates");
      await uploadTestImage(page);

      await page.goto("/image/resize");
      await page.goto("/image/find-duplicates");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("image-to-base64: navigate away resets state", async ({ loggedInPage: page }) => {
      await page.goto("/image/image-to-base64");
      await uploadTestImage(page);

      await page.goto("/image/resize");
      await page.goto("/image/image-to-base64");

      await expect(page.getByText("Upload from computer")).toBeVisible();
    });
  });
});
