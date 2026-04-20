import path from "node:path";
import { expect, test } from "./helpers";

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

test.describe("Smart Crop tool", () => {
  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");

    // Mode tabs
    await expect(page.getByRole("button", { name: "Subject Focus" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Face Focus" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Auto Trim" })).toBeVisible();

    // Submit button disabled with no file
    await expect(page.getByTestId("smart-crop-submit")).toBeDisabled();
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");

    await expect(page.getByTestId("smart-crop-submit")).toBeDisabled();
  });

  test("submit button enables after file upload", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await expect(page.getByTestId("smart-crop-submit")).toBeEnabled();
  });

  test("subject mode shows strategy and padding controls", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");

    // Subject Focus is default
    await expect(page.getByText("Detection Strategy")).toBeVisible();
    await expect(page.getByRole("button", { name: "Attention" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entropy" })).toBeVisible();
    await expect(page.getByText("Padding")).toBeVisible();
    await expect(page.getByText("Width (px)")).toBeVisible();
    await expect(page.getByText("Height (px)")).toBeVisible();
  });

  test("face mode shows framing and sensitivity controls", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");

    await page.getByRole("button", { name: "Face Focus" }).click();

    await expect(page.getByText("Framing")).toBeVisible();
    await expect(page.getByText("Detection Sensitivity")).toBeVisible();
    await expect(page.getByText("Face Padding")).toBeVisible();
  });

  test("trim mode shows tolerance controls", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");

    await page.getByRole("button", { name: "Auto Trim" }).click();

    await expect(page.getByText("Tolerance")).toBeVisible();
    await expect(page.getByText("Pad to square")).toBeVisible();
  });

  test("aspect ratio presets update dimensions", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");

    // Click 16:9 preset
    await page.getByRole("button", { name: "16:9" }).click();

    const widthInput = page.locator("#sc-width");
    const heightInput = page.locator("#sc-height");

    await expect(widthInput).toHaveValue("1920");
    await expect(heightInput).toHaveValue("1080");

    // Click 4:5 preset
    await page.getByRole("button", { name: "4:5" }).click();

    await expect(widthInput).toHaveValue("1080");
    await expect(heightInput).toHaveValue("1350");
  });

  test("JPG - subject focus crops and shows result", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");
    await uploadFile(page, fixturePath("test-100x100.jpg"));

    // Use default subject mode with attention strategy
    await page.getByTestId("smart-crop-submit").click();

    // Wait for the processed image preview to appear
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 300_000,
    });

    // No error shown
    await expect(page.getByText("Network error")).not.toBeVisible();
  });

  test("HEIC input processes without error", async ({ loggedInPage: page }) => {
    await page.goto("/smart-crop");
    await uploadFile(page, fixturePath("test-200x150.heic"));

    await page.getByTestId("smart-crop-submit").click();

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 300_000,
    });

    await expect(page.locator("text=cannot identify image")).not.toBeVisible();
  });
});
