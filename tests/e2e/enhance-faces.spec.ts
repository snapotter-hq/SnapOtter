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

async function enhanceFacesAndWait(page: import("@playwright/test").Page) {
  await page.getByTestId("enhance-faces-submit").click();
  await expect(page.getByTestId("enhance-faces-download")).toBeVisible({ timeout: 300_000 });
}

test.describe("Enhance Faces tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/enhance-faces");
    try {
      await page.getByTestId("enhance-faces-submit").waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "upscale-enhance feature bundle not installed");
    }
    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }
  }

  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Quality buttons
    await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Best" })).toBeVisible();

    // Strength slider
    await expect(page.getByText("Enhancement Strength")).toBeVisible();

    // Detection sensitivity slider
    await expect(page.getByText("Detection Sensitivity")).toBeVisible();

    // Submit button disabled with no file
    await expect(page.getByTestId("enhance-faces-submit")).toBeDisabled();
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await expect(page.getByTestId("enhance-faces-submit")).toBeDisabled();
  });

  test("submit button enables after file upload", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));
    await expect(page.getByTestId("enhance-faces-submit")).toBeEnabled();
  });

  test("enhancement strength slider is interactive", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const slider = page.locator("#enhance-faces-strength");
    await expect(slider).toBeVisible();

    await slider.fill("50");
    await expect(page.getByText("50%").first()).toBeVisible();

    await slider.fill("100");
    await expect(page.getByText("100%").first()).toBeVisible();
  });

  test("JPG portrait - processes and shows download", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await enhanceFacesAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Face enhancement failed")).not.toBeVisible();
  });

  test("HEIC input processes without error", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.heic"));

    await enhanceFacesAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Face enhancement failed")).not.toBeVisible();
  });
});
