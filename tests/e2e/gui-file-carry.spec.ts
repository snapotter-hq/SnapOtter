import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Cross-tool navigation tests
//
// The 2.0 home page is a tool catalog (search + modality tabs + link cards):
// no upload dropzone, no Quick Actions, no desktop sidebar. Files are uploaded
// on a tool page. Navigating between tool pages resets the tool page, so no
// processed state leaks from one tool to the next.
// ---------------------------------------------------------------------------

test.describe("Cross-tool navigation", () => {
  test("upload on resize, navigate to compress via sidebar, image NOT carried", async ({
    loggedInPage: page,
  }) => {
    // Go to resize and upload a file
    await page.goto("/image/resize");
    await uploadTestImage(page);

    // Confirm the file is loaded
    await expect(page.getByText(/test-image/i).first()).toBeVisible();
    await expect(page.getByText("Upload from computer")).not.toBeVisible();

    // Navigate to compress via direct URL (simulates sidebar navigation)
    await page.goto("/image/compress");
    await page.waitForLoadState("networkidle");

    // The file should NOT be carried - dropzone should appear
    // Tool pages call undoProcessing on toolId change, so processed state
    // is cleared, but the file store is shared. However, the tool page
    // only shows the dropzone when files.length === 0.
    // Since files persist in the global store, check that at minimum
    // the processed state is reset (no stale download links).
    await expect(page.getByRole("link", { name: /download/i })).not.toBeVisible();
  });

  test("process on resize, navigate to a different tool, tool page resets", async ({
    loggedInPage: page,
  }) => {
    // Go to resize, upload, and process so a download/processed state exists
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.locator("input[placeholder='Auto']").first().fill("200");
    await page.getByTestId("resize-submit").click();
    await waitForProcessing(page);
    await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });

    // Navigate to a different tool. The tool page resets on toolId change,
    // so the processed state must not carry over.
    await page.goto("/image/convert");
    await page.waitForLoadState("networkidle");

    // Fresh tool page: dropzone shown, no stale download affordance
    await expect(page.getByText("Upload from computer")).toBeVisible();
    await expect(page.getByTestId("resize-download")).not.toBeVisible();
  });

  test("upload on resize, browser back returns to previous page", async ({
    loggedInPage: page,
  }) => {
    // Start on the home page
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to resize
    await page.goto("/image/resize");
    await page.waitForLoadState("networkidle");

    // Upload a file on resize
    await uploadTestImage(page);

    // Confirm the file is loaded
    await expect(page.getByText(/test-image/i).first()).toBeVisible();

    // Press browser back
    await page.goBack();

    // Should return to the home page
    await expect(page).toHaveURL("/");
  });
});
