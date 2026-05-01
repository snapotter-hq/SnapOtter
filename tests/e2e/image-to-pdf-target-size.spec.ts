import { expect, test } from "@playwright/test";
import { getTestImagePath, waitForProcessing } from "./helpers";

async function uploadViaButton(page: import("@playwright/test").Page) {
  const testImagePath = getTestImagePath();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /upload from computer/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(testImagePath);
  await page.waitForTimeout(500);
}

test.describe("Image to PDF - Target File Size", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/image-to-pdf");
    await page.waitForLoadState("networkidle");
  });

  test("target size controls are visible", async ({ page }) => {
    const valueInput = page.getByTestId("image-to-pdf-target-size-value");
    const unitSelect = page.getByTestId("image-to-pdf-target-size-unit");

    await expect(valueInput).toBeVisible();
    await expect(unitSelect).toBeVisible();
    await expect(unitSelect).toHaveValue("MB");
  });

  test("creates PDF with target size and shows success result", async ({ page }) => {
    await uploadViaButton(page);

    const valueInput = page.getByTestId("image-to-pdf-target-size-value");
    await valueInput.fill("2");

    const unitSelect = page.getByTestId("image-to-pdf-target-size-unit");
    await expect(unitSelect).toHaveValue("MB");

    const submitBtn = page.getByTestId("image-to-pdf-submit");
    await submitBtn.click();

    await waitForProcessing(page, 60_000);

    const downloadLink = page.getByTestId("image-to-pdf-download");
    await expect(downloadLink).toBeVisible({ timeout: 30_000 });

    const compressionResult = page.getByTestId("image-to-pdf-compression-result");
    await expect(compressionResult).toBeVisible();
    await expect(compressionResult).toContainText("Target met");
    await expect(compressionResult).toContainText("JPEG quality");
  });

  test("creates PDF with KB unit and shows success result", async ({ page }) => {
    await uploadViaButton(page);

    const valueInput = page.getByTestId("image-to-pdf-target-size-value");
    await valueInput.fill("500");

    const unitSelect = page.getByTestId("image-to-pdf-target-size-unit");
    await unitSelect.selectOption("KB");

    const submitBtn = page.getByTestId("image-to-pdf-submit");
    await submitBtn.click();

    await waitForProcessing(page, 60_000);

    const downloadLink = page.getByTestId("image-to-pdf-download");
    await expect(downloadLink).toBeVisible({ timeout: 30_000 });

    const compressionResult = page.getByTestId("image-to-pdf-compression-result");
    await expect(compressionResult).toBeVisible();
    await expect(compressionResult).toContainText("Target met");
  });

  test("shows warning when target cannot be met", async ({ page }) => {
    await uploadViaButton(page);

    const valueInput = page.getByTestId("image-to-pdf-target-size-value");
    await valueInput.fill("51");

    const unitSelect = page.getByTestId("image-to-pdf-target-size-unit");
    await unitSelect.selectOption("KB");

    const submitBtn = page.getByTestId("image-to-pdf-submit");
    await submitBtn.click();

    await waitForProcessing(page, 60_000);

    const downloadLink = page.getByTestId("image-to-pdf-download");
    await expect(downloadLink).toBeVisible({ timeout: 30_000 });

    const compressionResult = page.getByTestId("image-to-pdf-compression-result");
    await expect(compressionResult).toBeVisible();
  });

  test("creates PDF without target size (backwards compatible)", async ({ page }) => {
    await uploadViaButton(page);

    const submitBtn = page.getByTestId("image-to-pdf-submit");
    await submitBtn.click();

    await waitForProcessing(page, 60_000);

    const downloadLink = page.getByTestId("image-to-pdf-download");
    await expect(downloadLink).toBeVisible({ timeout: 30_000 });

    const compressionResult = page.getByTestId("image-to-pdf-compression-result");
    await expect(compressionResult).not.toBeVisible();
  });

  test("can switch between KB and MB units", async ({ page }) => {
    const unitSelect = page.getByTestId("image-to-pdf-target-size-unit");

    await expect(unitSelect).toHaveValue("MB");
    await unitSelect.selectOption("KB");
    await expect(unitSelect).toHaveValue("KB");
    await unitSelect.selectOption("MB");
    await expect(unitSelect).toHaveValue("MB");
  });

  test("target size input accepts decimal values", async ({ page }) => {
    const valueInput = page.getByTestId("image-to-pdf-target-size-value");
    await valueInput.fill("1.5");
    await expect(valueInput).toHaveValue("1.5");
  });
});
