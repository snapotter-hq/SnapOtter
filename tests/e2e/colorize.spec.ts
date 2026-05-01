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

async function colorizeAndWait(page: import("@playwright/test").Page) {
  await page.getByTestId("colorize-submit").click();
  await expect(page.getByTestId("colorize-download")).toBeVisible({ timeout: 300_000 });
}

test.describe("Colorize tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/colorize");
    try {
      await page.getByTestId("colorize-submit").waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "object-eraser-colorize feature bundle not installed");
    }
    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }
  }

  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Model buttons
    await expect(page.getByRole("button", { name: /^Fast/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Balanced/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Best/ })).toBeVisible();

    // Color intensity slider
    await expect(page.getByText("Color Intensity")).toBeVisible();

    // Submit button disabled with no file
    await expect(page.getByTestId("colorize-submit")).toBeDisabled();
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await expect(page.getByTestId("colorize-submit")).toBeDisabled();
  });

  test("submit button enables after file upload", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.png"));
    await expect(page.getByTestId("colorize-submit")).toBeEnabled();
  });

  test("color intensity slider is interactive", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const slider = page.locator("input[type='range'][min='10'][max='100']");
    await expect(slider).toBeVisible();

    await slider.fill("50");
    await expect(page.getByText("50%")).toBeVisible();

    await slider.fill("10");
    await expect(page.getByText("10%")).toBeVisible();
  });

  test("JPG - colorizes and shows download", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-100x100.jpg"));

    await colorizeAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Colorize failed")).not.toBeVisible();
  });

  test("HEIC input processes without error", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.heic"));

    await colorizeAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Colorize failed")).not.toBeVisible();
  });
});
