import { expect, test } from "@playwright/test";

test.describe("HTML to Image", () => {
  test("navigates to the tool page", async ({ page }) => {
    await page.goto("/image/html-to-image");
    await expect(page.locator("input[type='url']")).toBeVisible();
  });

  test("shows capture button disabled when URL is empty", async ({ page }) => {
    await page.goto("/image/html-to-image");
    const button = page.locator("button[type='submit']");
    await expect(button).toBeDisabled();
  });

  test("enables capture button when URL is entered", async ({ page }) => {
    await page.goto("/image/html-to-image");
    await page.locator("input[type='url']").fill("https://snapotter.com");
    const button = page.locator("button[type='submit']");
    await expect(button).toBeEnabled();
  });

  test("captures a webpage and shows the result", async ({ page }) => {
    await page.goto("/image/html-to-image");
    await page.locator("input[type='url']").fill("https://snapotter.com");
    await page.locator("button[type='submit']").click();

    const resultImg = page.locator("img[alt='Captured screenshot']");
    await expect(resultImg).toBeVisible({ timeout: 45_000 });
  });

  test("shows download button after capture", async ({ page }) => {
    await page.goto("/image/html-to-image");
    await page.locator("input[type='url']").fill("https://snapotter.com");
    await page.locator("button[type='submit']").click();

    const downloadBtn = page.getByRole("button", { name: /download/i });
    await expect(downloadBtn).toBeVisible({ timeout: 45_000 });
  });

  test("device preset selector works", async ({ page }) => {
    await page.goto("/image/html-to-image");
    const preset = page.locator("select").nth(1);
    await preset.selectOption("mobile");
    await expect(preset).toHaveValue("mobile");
  });

  test("shows viewport fields when custom preset selected", async ({ page }) => {
    await page.goto("/image/html-to-image");
    const preset = page.locator("select").nth(1);
    await preset.selectOption("custom");

    const widthInput = page.locator("input[type='number']").first();
    await expect(widthInput).toBeVisible();
  });
});
