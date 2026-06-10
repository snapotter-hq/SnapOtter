import { TOOL_DISPLAY_MODES } from "../../apps/web/src/lib/tool-display-modes";
import { TOOLS } from "../../packages/shared/src/constants";
import { TOOL_BUNDLE_MAP } from "../../packages/shared/src/features";
import { expect, test, uploadTestImage } from "./helpers";

// ---------------------------------------------------------------------------
// Every tool page must load, show its name, and render the right UI shell.
// Generated from the shared TOOLS catalog + the display-mode map, so a newly
// added tool is covered automatically and a missing registry entry fails here.
// ---------------------------------------------------------------------------

const NO_DROPZONE_MODES = new Set(["no-dropzone"]);

test.describe("All tool pages render", () => {
  for (const tool of TOOLS) {
    const displayMode = TOOL_DISPLAY_MODES[tool.id];
    const isAiTool = tool.id in TOOL_BUNDLE_MAP;

    test(`${tool.name} (/${tool.id}) renders its UI shell`, async ({ loggedInPage: page }) => {
      expect(displayMode, `tool "${tool.id}" missing from tool-display-modes.ts`).toBeTruthy();

      await page.goto(`/${tool.id}`);

      // Tool name should be visible (header renders the shared TOOLS name)
      await expect(page.getByText(tool.name, { exact: false }).first()).toBeVisible();

      // AI tools may show an install prompt instead of a dropzone when the
      // model bundle is not installed.
      if (isAiTool) {
        const uploadVisible = await page.getByText("Upload from computer").isVisible();
        if (!uploadVisible) {
          await expect(
            page.getByText(/additional download|Feature Not Enabled/i).first(),
          ).toBeVisible();
          return;
        }
      }

      if (NO_DROPZONE_MODES.has(displayMode)) {
        // Custom-input tools (meme-generator, qr-generate, collage, html-to-image,
        // pdf-to-image) render their own input UI; just require the settings panel.
        await expect(page.getByText("Settings").first()).toBeVisible();
        return;
      }

      // Standard dropzone tools
      await expect(page.getByText("Upload from computer")).toBeVisible();
      await expect(page.getByText("Files").first()).toBeVisible();
      await expect(page.getByText("Settings").first()).toBeVisible();
    });
  }
});

test.describe("Tool pages accept file upload", () => {
  // Representative subset across display modes (uploading on all tools would
  // be slow; per-tool processing flows live in gui-tools-*.spec.ts)
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
