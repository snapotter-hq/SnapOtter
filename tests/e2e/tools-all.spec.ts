import { expect, test, uploadTestImage } from "./helpers";

// ---------------------------------------------------------------------------
// Test that EVERY tool page loads, shows correct name, and has the right UI.
// This covers the full 37-tool catalog from the PRD.
// ---------------------------------------------------------------------------

const TOOLS_WITH_DROPZONE = [
  { id: "resize", name: "Resize" },
  { id: "crop", name: "Crop" },
  { id: "rotate", name: "Rotate" },
  { id: "convert", name: "Convert" },
  { id: "compress", name: "Compress" },
  { id: "strip-metadata", name: "Strip Metadata" },
  { id: "edit-metadata", name: "Edit Metadata" },
  { id: "bulk-rename", name: "Bulk Rename" },
  { id: "image-to-pdf", name: "Image to PDF" },
  { id: "favicon", name: "Favicon" },
  { id: "adjust-colors", name: "Adjust Colors" },
  { id: "replace-color", name: "Replace" },
  { id: "remove-background", name: "Remove Background" },
  { id: "upscale", name: "Upscal" },
  { id: "erase-object", name: "Object Eraser" },
  { id: "ocr", name: "OCR" },
  { id: "blur-faces", name: "Face" },
  { id: "smart-crop", name: "Smart Crop" },
  { id: "watermark-text", name: "Text Watermark" },
  { id: "watermark-image", name: "Image Watermark" },
  { id: "text-overlay", name: "Text Overlay" },
  { id: "compose", name: "Image Composition" },
  { id: "info", name: "Image Info" },
  { id: "compare", name: "Image Compare" },
  { id: "find-duplicates", name: "Find Duplicates" },
  { id: "color-palette", name: "Color Palette" },
  { id: "barcode-read", name: "Barcode" },
  { id: "collage", name: "Collage" },
  { id: "stitch", name: "Stitch" },
  { id: "split", name: "Image Splitting" },
  { id: "border", name: "Border" },
  { id: "svg-to-raster", name: "SVG to Raster" },
  { id: "vectorize", name: "Image to SVG" },
  { id: "gif-tools", name: "GIF" },
  { id: "noise-removal", name: "Noise Removal" },
];

const TOOLS_WITHOUT_DROPZONE = [{ id: "qr-generate", name: "QR Code" }];

test.describe("All tool pages render", () => {
  for (const tool of TOOLS_WITH_DROPZONE) {
    test(`${tool.name} (/${tool.id}) loads with dropzone`, async ({ loggedInPage: page }) => {
      await page.goto(`/${tool.id}`);

      // Tool name should be visible
      await expect(page.getByText(tool.name, { exact: false }).first()).toBeVisible();

      // Should show dropzone
      await expect(page.getByText("Upload from computer")).toBeVisible();

      // Should show Files section
      await expect(page.getByText("Files").first()).toBeVisible();

      // Should show Settings section
      await expect(page.getByText("Settings").first()).toBeVisible();
    });
  }

  for (const tool of TOOLS_WITHOUT_DROPZONE) {
    test(`${tool.name} (/${tool.id}) loads without dropzone`, async ({ loggedInPage: page }) => {
      await page.goto(`/${tool.id}`);

      // Tool name should be visible
      await expect(page.getByText(tool.name, { exact: false }).first()).toBeVisible();

      // Should show settings
      await expect(page.getByText("Settings").first()).toBeVisible();

      // Should NOT show the file upload dropzone
      await expect(page.getByText("Upload from computer")).not.toBeVisible();
    });
  }
});

test.describe("Tool pages accept file upload", () => {
  // Test a representative subset (testing all 35 would be very slow)
  const REPRESENTATIVE_TOOLS = [
    "resize",
    "compress",
    "convert",
    "strip-metadata",
    "adjust-colors",
    "watermark-text",
    "info",
    "border",
    "vectorize",
    "gif-tools",
  ];

  for (const toolId of REPRESENTATIVE_TOOLS) {
    test(`${toolId} accepts file upload`, async ({ loggedInPage: page }) => {
      await page.goto(`/${toolId}`);
      await uploadTestImage(page);

      // After upload, dropzone should be replaced with image viewer
      await expect(page.getByText("Upload from computer")).not.toBeVisible();
      // Should show file info (Selected: or the filename)
      await expect(page.getByText(/selected|test-image/i).first()).toBeVisible();
    });
  }
});

test.describe("Tool not found", () => {
  test("nonexistent tool shows error", async ({ loggedInPage: page }) => {
    await page.goto("/nonexistent-tool-xyz");
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});
