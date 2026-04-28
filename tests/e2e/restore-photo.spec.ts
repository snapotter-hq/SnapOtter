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

async function restoreAndWait(page: import("@playwright/test").Page) {
  await page.getByTestId("restore-photo-submit").click();
  await expect(page.getByTestId("restore-photo-download")).toBeVisible({ timeout: 300_000 });
}

test.describe("Restore Photo tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/restore-photo");
    try {
      await page.getByTestId("restore-photo-submit").waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "photo-restoration feature bundle not installed");
    }
    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }
  }

  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Mode buttons
    await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Auto" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Heavy" })).toBeVisible();

    // Feature checkboxes
    await expect(page.getByText("Scratch Removal")).toBeVisible();
    await expect(page.getByText("Face Enhancement")).toBeVisible();
    await expect(page.getByText("Noise Reduction")).toBeVisible();
    await expect(page.getByText("Auto-Colorize")).toBeVisible();

    // Submit button disabled with no file
    await expect(page.getByTestId("restore-photo-submit")).toBeDisabled();
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await expect(page.getByTestId("restore-photo-submit")).toBeDisabled();
  });

  test("submit button enables after file upload", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));
    await expect(page.getByTestId("restore-photo-submit")).toBeEnabled();
  });

  test("face fidelity slider visible only when face enhancement enabled", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);

    const fidelityLabel = page.getByText("Face Fidelity");

    // Face enhancement is ON by default - fidelity visible
    await expect(fidelityLabel).toBeVisible();

    // Uncheck face enhancement - fidelity hidden
    await page.getByText("Face Enhancement").click();
    await expect(fidelityLabel).not.toBeVisible();

    // Re-enable face enhancement - fidelity visible again
    await page.getByText("Face Enhancement").click();
    await expect(fidelityLabel).toBeVisible();
  });

  test("denoise strength slider visible only when noise reduction enabled", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);

    const denoiseLabel = page.getByText("Denoise Strength");

    // Noise reduction is ON by default - strength visible
    await expect(denoiseLabel).toBeVisible();

    // Uncheck noise reduction - strength hidden
    await page.getByText("Noise Reduction").click();
    await expect(denoiseLabel).not.toBeVisible();

    // Re-enable noise reduction - strength visible again
    await page.getByText("Noise Reduction").click();
    await expect(denoiseLabel).toBeVisible();
  });

  test("JPG - auto mode restores and shows download", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await restoreAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Restoration failed")).not.toBeVisible();
  });

  test("HEIC input processes without error", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.heic"));

    await restoreAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Restoration failed")).not.toBeVisible();
  });
});
