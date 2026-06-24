import path from "node:path";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Layout & Composition Tools (collage, stitch, split)
// ---------------------------------------------------------------------------

test.describe("GUI Layout Tools", () => {
  // ========================================================================
  // COLLAGE
  // ========================================================================
  test.describe("Collage", () => {
    test("renders tool page without standard dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");
      await expect(page.getByText("Collage").first()).toBeVisible();

      // Collage uses custom upload UI, not standard dropzone
      await expect(page.getByText(/upload/i).first()).toBeVisible();
    });

    test("shows aspect ratio options in Canvas section", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      // Canvas section is collapsed by default -- expand it
      await page.getByText("Canvas").click();

      await expect(page.getByRole("button", { name: "Free" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "1:1" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "4:3" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "16:9" }).first()).toBeVisible();
    });

    test("shows output format selector in Output section", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      // Output section is collapsed by default -- expand it
      await page.getByText("Output").click();

      await expect(page.getByRole("button", { name: "PNG" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "JPEG" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "WebP" }).first()).toBeVisible();
    });

    test("shows background color in Spacing section", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      // Spacing & Style section is open by default
      await expect(page.getByText(/background/i).first()).toBeVisible();
    });

    test("submit button uses data-testid", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      await expect(page.getByTestId("collage-submit")).toBeVisible();
    });

    test("shows gap/spacing slider in Spacing section", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      // Spacing & Style section should show gap controls
      await expect(page.getByText(/gap|spacing/i).first()).toBeVisible();
    });

    test("submit button is disabled without images", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      const submitBtn = page.getByTestId("collage-submit");
      await expect(submitBtn).toBeDisabled();
    });

    test("shows quality slider in Output section for JPEG", async ({ loggedInPage: page }) => {
      await page.goto("/image/collage");

      await page.getByText("Output").click();
      await page.getByRole("button", { name: "JPEG" }).first().click();
      // Quality slider should appear for lossy format
      await expect(page.getByText(/quality/i).first()).toBeVisible();
    });
  });

  // ========================================================================
  // STITCH
  // ========================================================================
  test.describe("Stitch", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await expect(page.getByText("Stitch").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows direction options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      // Direction buttons: horizontal, vertical, grid
      await expect(page.getByText(/horizontal/i).first()).toBeVisible();
      await expect(page.getByText(/vertical/i).first()).toBeVisible();
      await expect(page.getByText(/grid/i).first()).toBeVisible();
    });

    test("shows resize mode options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      await expect(page.getByText(/resize mode|fit|original/i).first()).toBeVisible();
    });

    test("shows alignment options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      await expect(page.getByText(/alignment|align/i).first()).toBeVisible();
    });

    test("submit button uses data-testid and has correct label", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      const submitBtn = page.getByTestId("stitch-submit");
      await expect(submitBtn).toBeVisible();
    });

    test("submit disabled without file, enabled with 2+ files", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");

      // Settings (and the submit button) only render after a file is uploaded.
      await expect(page.getByTestId("stitch-submit")).toHaveCount(0);

      // Stitch requires 2+ images to enable submit
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.locator("[class*='border-dashed']").first().click();
      const fileChooser = await fileChooserPromise;
      const fixturePath = path.join(process.cwd(), "tests", "fixtures", "image", "valid");
      await fileChooser.setFiles([
        path.join(fixturePath, "test-200x150.png"),
        path.join(fixturePath, "test-100x100.jpg"),
      ]);
      await page.waitForTimeout(500);

      const submitBtn = page.getByTestId("stitch-submit");
      await expect(submitBtn).toBeEnabled();
    });

    test("direction buttons switch active state", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      // Click vertical
      await page
        .getByText(/vertical/i)
        .first()
        .click();
      // Click grid
      await page.getByText(/grid/i).first().click();
      // Click horizontal
      await page
        .getByText(/horizontal/i)
        .first()
        .click();
    });

    test("shows gap slider after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/stitch");
      await uploadTestImage(page);

      await expect(page.getByText(/gap/i).first()).toBeVisible();
    });
  });

  // ========================================================================
  // SPLIT
  // ========================================================================
  test.describe("Split", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await expect(page.getByText("Image Splitting").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows mode selector (Grid / Tile Size) after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Grid" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Tile Size" }).first()).toBeVisible();
    });

    test("shows grid presets after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      // Grid presets from split-settings.tsx
      await expect(page.getByRole("button", { name: "2x2" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "3x3" }).first()).toBeVisible();
    });

    test("tile size mode shows width and height inputs", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Tile Size" }).first().click();
      // Tile size mode should show dimension inputs
      await expect(page.getByText(/width|tile/i).first()).toBeVisible();
    });

    test("shows output format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      // Output format options
      await expect(page.getByText(/output format|format/i).first()).toBeVisible();
    });

    test("shows 3x3 and 4x4 grid presets", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "3x3" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "4x4" }).first()).toBeVisible();
    });

    test("switching to tile size mode and back to grid works", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Tile Size" }).first().click();
      await page.getByRole("button", { name: "Grid" }).first().click();
      // Grid presets should reappear
      await expect(page.getByRole("button", { name: "2x2" }).first()).toBeVisible();
    });

    test("processes split and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/split");
      await uploadTestImage(page);
      await page.waitForTimeout(1000);

      // Select a preset (2x2)
      await page.getByRole("button", { name: "2x2" }).first().click();

      // Click split button
      const splitBtn = page
        .getByRole("button", { name: /split/i })
        .filter({ hasNotText: /image splitting/i })
        .first();
      await splitBtn.click();
      await waitForProcessing(page);

      // Should show download (zip) or tile results
      await expect(
        page
          .getByRole("link", { name: /download/i })
          .first()
          .or(page.getByText(/tiles|download/i).first()),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // BEAUTIFY (Screenshot Beautifier)
  // ========================================================================
  test.describe("Beautify", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await expect(page.getByText("Beautify").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows Quick Presets section with preset buttons", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByText("Quick Presets")).toBeVisible();
      await expect(page.getByText("Purple Haze")).toBeVisible();
      await expect(page.getByText("Flamingo")).toBeVisible();
      await expect(page.getByText("Ocean")).toBeVisible();
      await expect(page.getByText("Midnight")).toBeVisible();
      await expect(page.getByText("Mint")).toBeVisible();
      await expect(page.getByText("Sunset")).toBeVisible();
    });

    test("shows Background section with tabs", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByText("Background").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Gradient" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Solid" })).toBeVisible();
      // exact: the uploaded file's list button ("test-image.png ...") also
      // contains "image" as a substring.
      await expect(page.getByRole("button", { name: "Image", exact: true })).toBeVisible();
      // "None" also names the Device Frame and Shadow chips; scope to the first (Background tab).
      await expect(page.getByRole("button", { name: "None" }).first()).toBeVisible();
    });

    test("shows Device Frame section with frame types", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByText("Device Frame")).toBeVisible();
      await expect(page.getByRole("button", { name: "macOS" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Windows" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Browser" })).toBeVisible();
      await expect(page.getByRole("button", { name: "iPhone" })).toBeVisible();
    });

    test("frame type shows Light/Dark theme toggle", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      // macOS is default frame, so it should show the theme toggle
      await expect(page.getByRole("button", { name: "Light" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Dark" }).first()).toBeVisible();
    });

    test("shows Spacing section with padding and border radius sliders", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByText("Spacing")).toBeVisible();
      await expect(page.locator("#beautify-padding")).toBeVisible();
      await expect(page.locator("#beautify-border-radius")).toBeVisible();
    });

    test("shows Shadow section with preset chips", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByText("Shadow").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Subtle" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Medium" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Dramatic" })).toBeVisible();
    });

    test("custom shadow shows blur/offset/color controls", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await page.getByRole("button", { name: "Custom" }).first().click();
      await expect(page.locator("#beautify-shadow-blur")).toBeVisible();
      await expect(page.locator("#beautify-shadow-x")).toBeVisible();
      await expect(page.locator("#beautify-shadow-y")).toBeVisible();
      await expect(page.locator("#beautify-shadow-color")).toBeVisible();
      await expect(page.locator("#beautify-shadow-opacity")).toBeVisible();
    });

    test("shows collapsible Export Size section with social presets", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByText("Export Size")).toBeVisible();
      await page.getByText("Export Size").click();
      await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
      await expect(page.getByRole("button", { name: "X/Twitter" })).toBeVisible();
      await expect(page.getByRole("button", { name: "LinkedIn" })).toBeVisible();
    });

    test("shows collapsible Watermark section", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await expect(page.getByText("Watermark").first()).toBeVisible();
      await page.getByText("Watermark").first().click();
      await expect(page.locator("#beautify-watermark-text")).toBeVisible();
      await expect(page.locator("#beautify-watermark-position")).toBeVisible();
      await expect(page.locator("#beautify-watermark-opacity")).toBeVisible();
    });

    test("submit button disabled without file, enabled with file", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/image/beautify");

      // Settings (and the submit button) only render after a file is uploaded.
      await expect(page.getByTestId("beautify-submit")).toHaveCount(0);

      await uploadTestImage(page);
      await expect(page.getByTestId("beautify-submit")).toBeEnabled();
    });

    test("processes beautify and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/image/beautify");
      await uploadTestImage(page);

      await page.getByTestId("beautify-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("beautify-download")).toBeVisible({ timeout: 15_000 });
    });
  });
});
