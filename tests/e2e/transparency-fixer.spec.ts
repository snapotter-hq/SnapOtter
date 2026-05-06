import path from "node:path";
import { expect, isAiSidecarRunning, test } from "./helpers";

// ---------------------------------------------------------------------------
// PNG Transparency Fixer tool - e2e tests.
// Covers UI rendering, advanced settings, processing flow, and result display.
// ---------------------------------------------------------------------------

function fixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", name);
}

async function uploadFile(page: import("@playwright/test").Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(500);
}

async function fixTransparencyAndWait(page: import("@playwright/test").Page) {
  await page.getByTestId("transparency-fixer-submit").click();
  // Wait for the before/after slider or result image to appear (AI processing can be slow)
  await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
    timeout: 300_000,
  });
  // Ensure the submit button re-appears (processing finished, ProgressCard gone)
  await expect(page.getByTestId("transparency-fixer-submit")).toBeVisible({ timeout: 10_000 });
}

test.describe("PNG Transparency Fixer tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/transparency-fixer");
    try {
      await page
        .getByTestId("transparency-fixer-submit")
        .waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "background-removal feature bundle not installed");
    }
    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }
  }

  test("page loads with correct title and description", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Tool title shown in the settings panel header
    await expect(page.getByText("PNG Transparency Fixer")).toBeVisible();

    // Description text from the settings component
    await expect(page.getByText("Upload a PNG with a fake transparent background")).toBeVisible();

    // Submit button disabled with no file
    await expect(page.getByTestId("transparency-fixer-submit")).toBeDisabled();
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await expect(page.getByTestId("transparency-fixer-submit")).toBeDisabled();
  });

  test("submit button enables after file upload", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-fake-transparency.png"));
    await expect(page.getByTestId("transparency-fixer-submit")).toBeEnabled();
  });

  test("advanced section is collapsed by default", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Advanced toggle button should be visible
    await expect(page.getByText("Advanced")).toBeVisible();

    // Defringe slider and output format should NOT be visible yet
    await expect(page.getByText("Defringe")).not.toBeVisible();
    await expect(page.getByText("Output Format")).not.toBeVisible();
  });

  test("advanced section toggles open and shows defringe slider and output format", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);

    // Open advanced section
    await page.getByText("Advanced").click();

    // Defringe slider visible
    await expect(page.getByText("Defringe")).toBeVisible();
    const defringeSlider = page.locator("input[type='range'][min='0'][max='100']");
    await expect(defringeSlider).toBeVisible();

    // Output format dropdown visible
    await expect(page.getByText("Output Format")).toBeVisible();
    const formatSelect = page.locator("select");
    await expect(formatSelect).toBeVisible();

    // Verify default values
    await expect(page.getByText("30")).toBeVisible(); // default defringe value
    await expect(formatSelect).toHaveValue("png");
  });

  test("defringe slider is interactive", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Open advanced section
    await page.getByText("Advanced").click();

    const defringeSlider = page.locator("input[type='range'][min='0'][max='100']");
    await expect(defringeSlider).toBeVisible();

    // Adjust slider value
    await defringeSlider.fill("75");
    await expect(page.getByText("75")).toBeVisible();

    await defringeSlider.fill("0");
    await expect(page.getByText("0")).toBeVisible();
  });

  test("output format dropdown switches to WebP", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Open advanced section
    await page.getByText("Advanced").click();

    const formatSelect = page.locator("select");
    await expect(formatSelect).toHaveValue("png");

    // Switch to WebP
    await formatSelect.selectOption("webp");
    await expect(formatSelect).toHaveValue("webp");

    // Switch back to PNG
    await formatSelect.selectOption("png");
    await expect(formatSelect).toHaveValue("png");
  });

  test("progress indicator appears during processing", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-fake-transparency.png"));

    // Click submit
    await page.getByTestId("transparency-fixer-submit").click();

    // ProgressCard should appear (contains an animated spinner)
    await expect(page.locator("[class*='animate-spin']")).toBeVisible({ timeout: 5_000 });

    // Wait for processing to complete
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 300_000,
    });
  });

  test("PNG - fixes transparency and shows before/after result", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-fake-transparency.png"));

    await fixTransparencyAndWait(page);

    // Before/after slider or result image should be visible
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();

    // No error shown
    await expect(page.getByText("Transparency fix failed")).not.toBeVisible();
    await expect(page.getByText("Network error")).not.toBeVisible();
  });

  test("result download is available after processing", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-fake-transparency.png"));

    await fixTransparencyAndWait(page);

    // ReviewPanel should show with Download button in the sidebar
    const downloadButton = page.getByRole("button", { name: /download/i });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
  });
});
