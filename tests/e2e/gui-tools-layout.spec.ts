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
      await page.goto("/collage");
      await expect(page.getByText("Collage").first()).toBeVisible();

      // Collage uses custom upload UI, not standard dropzone
      await expect(page.getByText(/upload/i).first()).toBeVisible();
    });

    test("shows aspect ratio options in Canvas section", async ({ loggedInPage: page }) => {
      await page.goto("/collage");

      // Canvas section is collapsed by default -- expand it
      await page.getByText("Canvas").click();

      await expect(page.getByRole("button", { name: "Free" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "1:1" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "4:3" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "16:9" }).first()).toBeVisible();
    });

    test("shows output format selector in Output section", async ({ loggedInPage: page }) => {
      await page.goto("/collage");

      // Output section is collapsed by default -- expand it
      await page.getByText("Output").click();

      await expect(page.getByRole("button", { name: "PNG" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "JPEG" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "WebP" }).first()).toBeVisible();
    });

    test("shows background color in Spacing section", async ({ loggedInPage: page }) => {
      await page.goto("/collage");

      // Spacing & Style section is open by default
      await expect(page.getByText(/background/i).first()).toBeVisible();
    });
  });

  // ========================================================================
  // STITCH
  // ========================================================================
  test.describe("Stitch", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/stitch");
      await expect(page.getByText("Stitch").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows direction options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/stitch");
      await uploadTestImage(page);

      // Direction buttons: horizontal, vertical, grid
      await expect(page.getByText(/horizontal/i).first()).toBeVisible();
      await expect(page.getByText(/vertical/i).first()).toBeVisible();
      await expect(page.getByText(/grid/i).first()).toBeVisible();
    });

    test("shows resize mode options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/stitch");
      await uploadTestImage(page);

      await expect(page.getByText(/resize mode|fit|original/i).first()).toBeVisible();
    });

    test("shows alignment options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/stitch");
      await uploadTestImage(page);

      await expect(page.getByText(/alignment|align/i).first()).toBeVisible();
    });
  });

  // ========================================================================
  // SPLIT
  // ========================================================================
  test.describe("Split", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/split");
      await expect(page.getByText("Image Splitting").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows mode selector (Grid / Tile Size) after upload", async ({ loggedInPage: page }) => {
      await page.goto("/split");
      await uploadTestImage(page);

      await expect(page.getByRole("button", { name: "Grid" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Tile Size" }).first()).toBeVisible();
    });

    test("shows grid presets after upload", async ({ loggedInPage: page }) => {
      await page.goto("/split");
      await uploadTestImage(page);

      // Grid presets from split-settings.tsx
      await expect(page.getByRole("button", { name: "2x2" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "3x3" }).first()).toBeVisible();
    });

    test("shows output format selector after upload", async ({ loggedInPage: page }) => {
      await page.goto("/split");
      await uploadTestImage(page);

      // Output format options
      await expect(page.getByText(/output format|format/i).first()).toBeVisible();
    });

    test("processes split and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/split");
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
});
