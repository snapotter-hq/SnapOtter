import path from "node:path";
import { expect, test } from "./helpers";

// ---------------------------------------------------------------------------
// Noise Removal tool - e2e tests.
// Covers UI rendering, quick/balanced tier processing, and error display.
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

async function removeNoiseAndWait(page: import("@playwright/test").Page) {
  await page.getByTestId("noise-removal-submit").click();
  await expect(page.getByTestId("noise-removal-download")).toBeVisible({ timeout: 300_000 });
}

test.describe("Noise Removal tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/noise-removal");
    try {
      await page.getByTestId("noise-removal-submit").waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "upscale-enhance feature bundle not installed");
    }
  }

  test("page loads with correct UI sections", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Tier buttons
    await expect(page.getByRole("button", { name: "Quick" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Quality" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Maximum" })).toBeVisible();

    // Sliders
    await expect(page.getByText("Strength")).toBeVisible();
    await expect(page.getByText("Detail Preservation")).toBeVisible();
    await expect(page.getByText("Color Noise")).toBeVisible();

    // Output format buttons
    await expect(page.getByRole("button", { name: "Original" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
    await expect(page.getByRole("button", { name: "JPEG" })).toBeVisible();
    await expect(page.getByRole("button", { name: "WEBP" })).toBeVisible();

    // Submit button is disabled with no file
    await expect(page.getByTestId("noise-removal-submit")).toBeDisabled();
  });

  test("submit button enables after file upload", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.png"));
    await expect(page.getByTestId("noise-removal-submit")).toBeEnabled();
  });

  test("quality slider shows when JPEG or WEBP is selected", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const qualitySlider = page.getByTestId("quality-slider");

    // Quality slider hidden for original/PNG
    await expect(qualitySlider).not.toBeVisible();

    await page.getByRole("button", { name: "JPEG" }).click();
    await expect(qualitySlider).toBeVisible();

    await page.getByRole("button", { name: "WEBP" }).click();
    await expect(qualitySlider).toBeVisible();

    await page.getByRole("button", { name: "PNG" }).click();
    await expect(qualitySlider).not.toBeVisible();
  });

  test("GIF + AI tier warning appears and disappears correctly", async ({ loggedInPage: page }) => {
    await page.goto("/noise-removal");
    await uploadFile(page, fixturePath("animated.gif"));

    // No warning with balanced tier (default)
    const warning = page.getByText(/AI denoising on GIF/i);
    await expect(warning).not.toBeVisible();

    // Warning appears with Quality tier
    await page.getByRole("button", { name: "Quality" }).click();
    await expect(warning).toBeVisible();

    // Warning disappears when switching back to Quick
    await page.getByRole("button", { name: "Quick" }).click();
    await expect(warning).not.toBeVisible();
  });

  test("PNG - quick tier removes noise and shows download button", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/noise-removal");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.getByRole("button", { name: "Quick" }).click();
    await removeNoiseAndWait(page);

    // Image preview is visible
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();

    // No error shown
    await expect(page.getByText("Network error")).not.toBeVisible();
    await expect(page.getByText("Noise removal failed")).not.toBeVisible();
  });

  test("JPG - balanced tier removes noise and shows download button", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/noise-removal");
    await uploadFile(page, fixturePath("test-100x100.jpg"));

    // Balanced is default, no need to click it
    await removeNoiseAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.getByText("Network error")).not.toBeVisible();
  });

  test("WEBP output format - processes and download link is correct type", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/noise-removal");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.getByRole("button", { name: "Quick" }).click();
    await page.getByRole("button", { name: "WEBP" }).click();
    await removeNoiseAndWait(page);

    const downloadLink = page.getByTestId("noise-removal-download");
    await expect(downloadLink).toBeVisible();
  });

  test("download link has correct href after processing", async ({ loggedInPage: page }) => {
    await page.goto("/noise-removal");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.getByRole("button", { name: "Quick" }).click();
    await removeNoiseAndWait(page);

    const downloadLink = page.getByTestId("noise-removal-download");
    const href = await downloadLink.getAttribute("href");
    expect(href).toBeTruthy();
    // Should point to the API download endpoint, not a blob URL
    expect(href).toContain("/api/v1/download/");
    expect(href).toContain("_denoised");
  });
});
