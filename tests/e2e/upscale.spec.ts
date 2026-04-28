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

async function upscaleAndWait(page: import("@playwright/test").Page) {
  await page.getByTestId("upscale-submit").click();
  await expect(page.getByTestId("upscale-download")).toBeVisible({ timeout: 300_000 });
}

test.describe("Upscale tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/upscale");
    try {
      await page.getByTestId("upscale-submit").waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "upscale-enhance feature bundle not installed");
    }
    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }
  }

  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Scale factor buttons
    await expect(page.getByRole("button", { name: "2x", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "4x", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "8x", exact: true })).toBeVisible();

    // Quality tier buttons
    await expect(page.getByRole("button", { name: "Fast" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Best" })).toBeVisible();

    // Output format dropdown
    await expect(page.locator("#upscale-format")).toBeVisible();

    // Submit button disabled with no file
    await expect(page.getByTestId("upscale-submit")).toBeDisabled();
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await expect(page.getByTestId("upscale-submit")).toBeDisabled();
  });

  test("submit button enables after file upload", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.png"));
    await expect(page.getByTestId("upscale-submit")).toBeEnabled();
  });

  test("scale factor buttons are interactive", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const btn4x = page.getByRole("button", { name: "4x", exact: true });
    await btn4x.click();
    await expect(btn4x).toHaveClass(/bg-primary/);

    const btn8x = page.getByRole("button", { name: "8x", exact: true });
    await btn8x.click();
    await expect(btn8x).toHaveClass(/bg-primary/);
  });

  test("quality tier buttons are interactive", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const fast = page.getByRole("button", { name: "Fast" });
    const balanced = page.getByRole("button", { name: "Balanced" });
    const best = page.getByRole("button", { name: "Best" });

    await fast.click();
    await expect(fast).toHaveClass(/bg-primary/);

    await balanced.click();
    await expect(balanced).toHaveClass(/bg-primary/);

    await best.click();
    await expect(best).toHaveClass(/bg-primary/);
  });

  test("face enhance checkbox visibility depends on quality tier", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);

    const faceCheckbox = page.getByText("Enhance faces");

    // Balanced (default) - visible
    await expect(faceCheckbox).toBeVisible();

    // Fast (lanczos) - hidden
    await page.getByRole("button", { name: "Fast" }).click();
    await expect(faceCheckbox).not.toBeVisible();

    // Best (realesrgan) - visible
    await page.getByRole("button", { name: "Best" }).click();
    await expect(faceCheckbox).toBeVisible();
  });

  test("quality slider shows only for lossy output formats", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const formatSelect = page.locator("#upscale-format");

    // PNG (default) - no quality slider
    await expect(page.getByText("Quality").nth(1)).not.toBeVisible();

    // JPG - quality slider visible
    await formatSelect.selectOption("jpg");
    await expect(page.locator("input[type='range'][min='1'][max='100']")).toBeVisible();

    // WEBP - quality slider visible
    await formatSelect.selectOption("webp");
    await expect(page.locator("input[type='range'][min='1'][max='100']")).toBeVisible();

    // PNG - quality slider hidden
    await formatSelect.selectOption("png");
    await expect(page.locator("input[type='range'][min='1'][max='100']")).not.toBeVisible();
  });

  test("JPG portrait - balanced tier upscales and shows download", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await upscaleAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Upscale failed")).not.toBeVisible();
  });

  test("HEIC input processes without error", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.heic"));

    await upscaleAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Upscale failed")).not.toBeVisible();
  });
});
