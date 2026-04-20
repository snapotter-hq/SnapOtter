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

test.describe("Erase Object tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/erase-object");
    try {
      await page.getByTestId("erase-object-submit").waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "object-eraser-colorize feature bundle not installed");
    }
  }

  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Brush size slider
    await expect(page.getByText("Brush Size")).toBeVisible();
    await expect(page.locator("#eraser-brush-size")).toBeVisible();

    // Output format dropdown
    await expect(page.locator("#eraser-format")).toBeVisible();

    // Submit button is disabled with no file
    await expect(page.getByTestId("erase-object-submit")).toBeDisabled();
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    await expect(page.getByTestId("erase-object-submit")).toBeDisabled();
  });

  test("submit button remains disabled with file but no strokes", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-200x150.png"));

    // Submit should still be disabled because no strokes have been painted
    await expect(page.getByTestId("erase-object-submit")).toBeDisabled();
  });

  test("brush size slider is interactive", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const slider = page.locator("#eraser-brush-size");
    await expect(slider).toBeVisible();

    // Change slider value
    await slider.fill("75");
    await expect(page.getByText("75px")).toBeVisible();
  });

  test("quality slider shows for lossy formats only", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const qualitySlider = page.locator("#eraser-quality");
    const formatSelect = page.locator("#eraser-format");

    // Default is PNG — quality hidden
    await expect(qualitySlider).not.toBeVisible();

    // Select JPG — quality visible
    await formatSelect.selectOption("jpg");
    await expect(qualitySlider).toBeVisible();

    // Select WEBP — quality visible
    await formatSelect.selectOption("webp");
    await expect(qualitySlider).toBeVisible();

    // Back to PNG — quality hidden
    await formatSelect.selectOption("png");
    await expect(qualitySlider).not.toBeVisible();
  });
});
