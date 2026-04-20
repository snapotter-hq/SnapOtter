import { expect, test } from "@playwright/test";

async function uploadOcrFile(page: import("@playwright/test").Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(500);
}

async function submitOcr(page: import("@playwright/test").Page) {
  const submit = page.getByTestId("ocr-submit");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Extracted Text")).toBeVisible({ timeout: 300_000 });
}

test.describe("OCR / Text Extraction", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ocr");
    await page.waitForLoadState("networkidle");
  });

  test("renders quality selector with three options", async ({ page }) => {
    const buttons = page.locator("button").filter({ hasText: /^(Fast|Balanced|Best)$/ });
    await expect(buttons).toHaveCount(3);

    // Balanced should be selected by default
    const balanced = page.locator("button").filter({ hasText: "Balanced" });
    await expect(balanced).toHaveClass(/border-primary/);
  });

  test("renders enhance checkbox defaulting to unchecked", async ({ page }) => {
    const checkbox = page.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();
  });

  test("enhance defaults to unchecked when Best is selected", async ({ page }) => {
    await page.locator("button").filter({ hasText: "Best" }).click();
    const checkbox = page.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();
  });

  test("language section is collapsed by default showing auto-detect", async ({ page }) => {
    await expect(page.getByText("auto-detect", { exact: false })).toBeVisible();
    await expect(page.locator("select")).not.toBeVisible();
  });

  test("language section expands to show dropdown", async ({ page }) => {
    await page.getByText("Language").click();
    await expect(page.locator("select")).toBeVisible();

    const options = page.locator("select option");
    await expect(options).toHaveCount(8);
  });

  test("extract text button is disabled without a file", async ({ page }) => {
    const button = page.getByTestId("ocr-submit");
    await expect(button).toBeDisabled();
  });

  test("uploads image and OCR processing completes", async ({ page }) => {
    await uploadOcrFile(page, "tests/fixtures/test-portrait.jpg");
    await submitOcr(page);

    // OCR completed — shows either extracted text or "no text" message
    const hasText = await page.getByTestId("ocr-result-text").isVisible();
    const hasNoText = await page.getByText("No text detected").isVisible();
    expect(hasText || hasNoText).toBe(true);
  });

  test("copy button is visible after OCR completes", async ({ page }) => {
    await uploadOcrFile(page, "tests/fixtures/test-portrait.jpg");
    await submitOcr(page);

    await expect(page.getByText("Copy")).toBeVisible();
  });

  test("shows 'no text detected' for blank image", async ({ page }) => {
    await uploadOcrFile(page, "tests/fixtures/test-blank.png");
    await submitOcr(page);

    await expect(page.getByText("No text detected")).toBeVisible();
  });
});
