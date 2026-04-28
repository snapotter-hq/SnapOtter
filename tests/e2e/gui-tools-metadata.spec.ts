import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Metadata Tools (strip-metadata, edit-metadata, info)
// Covers settings UI, control interactions, processing flow, and download.
// ---------------------------------------------------------------------------

test.describe("GUI Metadata Tools", () => {
  // ========================================================================
  // STRIP METADATA
  // ========================================================================
  test.describe("Strip Metadata", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/strip-metadata");
      await expect(page.getByText("Remove Metadata").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows strip options after upload", async ({ loggedInPage: page }) => {
      await page.goto("/strip-metadata");
      await uploadTestImage(page);

      // Remove All checkbox is checked by default
      await expect(page.getByText("Remove All Metadata")).toBeVisible();
      // Individual options
      await expect(page.getByText("Strip EXIF")).toBeVisible();
      await expect(page.getByText("Strip GPS")).toBeVisible();
      await expect(page.getByText("Strip ICC")).toBeVisible();
      await expect(page.getByText("Strip XMP")).toBeVisible();
    });

    test("individual strip options disabled when Remove All is checked", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/strip-metadata");
      await uploadTestImage(page);

      // With Remove All checked, individual checkboxes should be disabled
      const exifCheckbox = page
        .locator("label")
        .filter({ hasText: "Strip EXIF" })
        .locator("input[type='checkbox']");
      await expect(exifCheckbox).toBeDisabled();
    });

    test("unchecking Remove All enables individual options", async ({ loggedInPage: page }) => {
      await page.goto("/strip-metadata");
      await uploadTestImage(page);

      // Uncheck Remove All
      const removeAllCheckbox = page
        .locator("label")
        .filter({ hasText: "Remove All Metadata" })
        .locator("input[type='checkbox']");
      await removeAllCheckbox.uncheck();

      // Individual checkboxes should now be enabled
      const exifCheckbox = page
        .locator("label")
        .filter({ hasText: "Strip EXIF" })
        .locator("input[type='checkbox']");
      await expect(exifCheckbox).toBeEnabled();
    });

    test("auto-inspects metadata on upload", async ({ loggedInPage: page }) => {
      await page.goto("/strip-metadata");
      await uploadTestImage(page);

      // Should show "Current Metadata" heading or "Reading metadata..." or "No metadata found"
      await expect(
        page
          .getByText("Current Metadata")
          .or(page.getByText("Reading metadata..."))
          .or(page.getByText("No metadata found"))
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("processes strip and shows download", async ({ loggedInPage: page }) => {
      await page.goto("/strip-metadata");
      await uploadTestImage(page);

      await page.getByTestId("strip-metadata-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("strip-metadata-download")).toBeVisible({ timeout: 15_000 });
    });
  });

  // ========================================================================
  // EDIT METADATA
  // ========================================================================
  test.describe("Edit Metadata", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/edit-metadata");
      await expect(page.getByText("Edit Metadata").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows form fields after upload and inspection", async ({ loggedInPage: page }) => {
      await page.goto("/edit-metadata");
      await uploadTestImage(page);

      // Wait for inspection to complete
      await page.waitForSelector('[id="em-artist"]', { timeout: 10_000 });

      // Basic Info section fields
      await expect(page.locator("#em-artist")).toBeVisible();
      await expect(page.locator("#em-copyright")).toBeVisible();
      await expect(page.locator("#em-description")).toBeVisible();
      await expect(page.locator("#em-software")).toBeVisible();
    });

    test("shows collapsible sections", async ({ loggedInPage: page }) => {
      await page.goto("/edit-metadata");
      await uploadTestImage(page);
      await page.waitForSelector('[id="em-artist"]', { timeout: 10_000 });

      await expect(page.getByText("Basic Info").first()).toBeVisible();
      await expect(page.getByText("Date & Time").first()).toBeVisible();
      await expect(page.getByText("Location (GPS)").first()).toBeVisible();
      await expect(page.getByText("Keywords").first()).toBeVisible();
    });

    test("date mode toggle between Edit and Shift", async ({ loggedInPage: page }) => {
      await page.goto("/edit-metadata");
      await uploadTestImage(page);
      await page.waitForSelector('[id="em-artist"]', { timeout: 10_000 });

      // Open Date & Time section
      await page.getByText("Date & Time").first().click();
      await expect(page.getByRole("button", { name: "Edit Dates" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Shift All Dates" })).toBeVisible();
    });

    test("GPS section shows clear GPS checkbox", async ({ loggedInPage: page }) => {
      await page.goto("/edit-metadata");
      await uploadTestImage(page);
      await page.waitForSelector('[id="em-artist"]', { timeout: 10_000 });

      // Open GPS section
      await page.getByText("Location (GPS)").first().click();
      await expect(page.getByText("Remove all GPS data")).toBeVisible();
      await expect(page.locator("#em-gps-lat")).toBeVisible();
      await expect(page.locator("#em-gps-lon")).toBeVisible();
    });

    test("edits artist field and processes", async ({ loggedInPage: page }) => {
      await page.goto("/edit-metadata");
      await uploadTestImage(page);
      await page.waitForSelector('[id="em-artist"]', { timeout: 10_000 });

      await page.fill('[id="em-artist"]', "E2E Test Artist");
      await page.getByTestId("edit-metadata-submit").click();
      await waitForProcessing(page);

      await expect(page.getByTestId("edit-metadata-download")).toBeVisible({ timeout: 15_000 });
    });

    test("shows changes summary when fields are modified", async ({ loggedInPage: page }) => {
      await page.goto("/edit-metadata");
      await uploadTestImage(page);
      await page.waitForSelector('[id="em-artist"]', { timeout: 10_000 });

      await page.fill('[id="em-artist"]', "Modified Artist");
      await expect(page.getByText(/\d+ changes:/)).toBeVisible();
    });
  });

  // ========================================================================
  // IMAGE INFO
  // ========================================================================
  test.describe("Image Info", () => {
    test("renders tool page with dropzone", async ({ loggedInPage: page }) => {
      await page.goto("/info");
      await expect(page.getByText("Image Info").first()).toBeVisible();
      await expect(page.getByText("Upload from computer")).toBeVisible();
    });

    test("shows Read Info button after upload", async ({ loggedInPage: page }) => {
      await page.goto("/info");
      await uploadTestImage(page);

      await expect(page.getByTestId("info-submit")).toBeVisible();
      await expect(page.getByTestId("info-submit")).toHaveText(/Read Info/);
    });

    test("displays image metadata after Read Info", async ({ loggedInPage: page }) => {
      await page.goto("/info");
      await uploadTestImage(page);

      await page.getByTestId("info-submit").click();
      await waitForProcessing(page);

      // Verify metadata grid appears
      await expect(page.getByText("Dimensions").first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Format").first()).toBeVisible();
      await expect(page.getByText("File Size").first()).toBeVisible();
      await expect(page.getByText("Channels").first()).toBeVisible();
      await expect(page.getByText("Color Space").first()).toBeVisible();
    });

    test("shows channel stats histogram after Read Info", async ({ loggedInPage: page }) => {
      await page.goto("/info");
      await uploadTestImage(page);

      await page.getByTestId("info-submit").click();
      await waitForProcessing(page);

      await expect(page.getByText("Channel Stats")).toBeVisible({ timeout: 15_000 });
    });

    test("no download link for info tool (read-only)", async ({ loggedInPage: page }) => {
      await page.goto("/info");
      await uploadTestImage(page);

      await page.getByTestId("info-submit").click();
      await waitForProcessing(page);

      // Info tool does not produce a downloadable result
      await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
    });
  });
});
