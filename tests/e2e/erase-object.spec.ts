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
    await page.goto("/image/erase-object");
    // Guard against route rot: a wrong/404 route must fail loudly, not silently skip
    // (skipping on a missing submit button previously masked the route being broken).
    await expect(page.getByRole("heading", { name: "404" })).toHaveCount(0);
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
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

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

  test("strokes persist when switching between files", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Upload first file
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    // Paint a stroke on the first file
    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible", timeout: 5_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
    await page.mouse.up();

    // Undo/Clear buttons should appear
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();

    // Upload second file via the "+ Add more" button
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Add more/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixturePath("image/valid/test-200x150.png"));
    await page.waitForTimeout(500);

    // Switch to second file (click thumbnail or file entry)
    // The file list shows buttons with the filename - click the second one
    const fileEntries = page.locator("button").filter({ hasText: "test-200x150.png" });
    const count = await fileEntries.count();
    if (count >= 2) {
      await fileEntries.nth(1).click();
      await page.waitForTimeout(300);

      // Switch back to first file
      await fileEntries.first().click();
      await page.waitForTimeout(300);

      // Undo button should still be visible (strokes were preserved)
      await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    }
  });

  test("shows Erase All button when multiple files have masks", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Upload first file
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    // Paint on first file
    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible", timeout: 5_000 });
    let box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 3 + 20, box.y + box.height / 3);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Button should say "Erase Object" (only one file has mask)
    await expect(page.getByTestId("erase-object-submit")).toHaveText("Erase Object");

    // Upload second file
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Add more/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixturePath("image/valid/test-200x150.png"));
    await page.waitForTimeout(500);

    // Switch to second file and paint
    const fileEntries = page.locator("button").filter({ hasText: "test-200x150.png" });
    const count = await fileEntries.count();
    if (count >= 2) {
      await fileEntries.nth(1).click();
      await page.waitForTimeout(500);

      const canvas2 = page.locator("canvas");
      await canvas2.waitFor({ state: "visible", timeout: 5_000 });
      box = await canvas2.boundingBox();
      if (!box) throw new Error("Canvas not found");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Now button should say "Erase All (2)"
      await expect(page.getByTestId("erase-object-submit")).toHaveText("Erase All (2)");
    }
  });
});
