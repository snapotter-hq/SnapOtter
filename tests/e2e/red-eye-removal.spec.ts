import path from "node:path";
import { expect, isAiSidecarRunning, test } from "./helpers";

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

test.describe("Red Eye Removal tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/red-eye-removal");
    try {
      await page
        .getByTestId("red-eye-removal-submit")
        .waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "face-detection feature bundle not installed");
    }
    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }
  }

  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Sensitivity slider
    await expect(page.getByText("Sensitivity")).toBeVisible();

    // Correction Strength slider
    await expect(page.getByText("Correction Strength")).toBeVisible();

    // Output format buttons
    await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
    await expect(page.getByRole("button", { name: "JPEG" })).toBeVisible();
    await expect(page.getByRole("button", { name: "WEBP" })).toBeVisible();

    // Submit button disabled with no file
    await expect(page.getByTestId("red-eye-removal-submit")).toBeDisabled();
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    await expect(page.getByTestId("red-eye-removal-submit")).toBeDisabled();
  });

  test("submit button enables after file upload", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.png"));

    await expect(page.getByTestId("red-eye-removal-submit")).toBeEnabled();
  });

  test("quality slider shows for lossy formats only", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const qualityText = page.locator("p", { hasText: "Quality" }).last();

    // Original — quality hidden
    await expect(qualityText).not.toBeVisible();

    // JPEG — quality visible
    await page.getByRole("button", { name: "JPEG" }).click();
    await expect(qualityText).toBeVisible();

    // WEBP — quality visible
    await page.getByRole("button", { name: "WEBP" }).click();
    await expect(qualityText).toBeVisible();

    // PNG — quality hidden
    await page.getByRole("button", { name: "PNG" }).click();
    await expect(qualityText).not.toBeVisible();
  });

  test("JPG - processes and shows download", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await page.getByTestId("red-eye-removal-submit").click();

    // Wait for download button or "No red eyes detected" message
    await expect(
      page
        .getByTestId("red-eye-removal-download")
        .or(page.getByText(/no red/i))
        .first(),
    ).toBeVisible({ timeout: 300_000 });

    // No network errors
    await expect(page.getByText("Network error")).not.toBeVisible();
  });

  test("HEIC input processes without error", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.heic"));

    await page.getByTestId("red-eye-removal-submit").click();

    await expect(
      page
        .getByTestId("red-eye-removal-download")
        .or(page.getByText(/no red/i))
        .first(),
    ).toBeVisible({ timeout: 300_000 });

    await expect(page.locator("text=cannot identify image")).not.toBeVisible();
  });
});
