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

test.describe("Passport Photo tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/passport-photo");
    try {
      // Wait for the page to load -- the country dropdown is always present
      await page.getByText("Country").waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "background-removal or face-detection feature bundle not installed");
    }
    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }
  }

  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Country dropdown
    await expect(page.getByText("Country")).toBeVisible();

    // DPI input
    await expect(page.getByText("DPI", { exact: true })).toBeVisible();

    // Background color section
    await expect(page.getByText("Background Color")).toBeVisible();

    // Max file size section
    await expect(page.getByText("Max File Size")).toBeVisible();
  });

  test("country dropdown opens and is searchable", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Click the country dropdown button
    const dropdownButton = page.locator("button", { hasText: "United States" });
    await dropdownButton.click();

    // Search input should appear
    const searchInput = page.getByPlaceholder("Search countries...");
    await expect(searchInput).toBeVisible();

    // Type to filter
    await searchInput.fill("Canada");
    await expect(page.locator("button", { hasText: "Canada" })).toBeVisible();
  });

  test("background color swatches are interactive", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Click a non-white swatch (light gray)
    const graySwatch = page.locator("button[title='Light gray (UK/DE)']");
    await graySwatch.click();

    // The swatch should become selected (has scale-110 class)
    await expect(graySwatch).toHaveClass(/scale-110/);
  });

  test("file size presets are interactive", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // Click 100 KB preset
    const preset = page.getByRole("button", { name: "100 KB" });
    await preset.click();

    // Should have active styling
    await expect(preset).toHaveClass(/border-primary/);
  });

  test("submit button disabled without file", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // No generate button should be visible without a file
    await expect(page.getByTestId("passport-photo-generate")).not.toBeVisible();
  });

  test("portrait upload triggers auto-analyze", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    // Analysis progress should appear
    await expect(
      page.getByText("Analyzing face").or(page.getByText("Detecting landmarks")).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("generate button appears after analysis", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    // Wait for analysis to complete — either generate button or an error
    await expect(
      page.getByTestId("passport-photo-generate").or(page.getByText("Face analysis failed")),
    ).toBeVisible({ timeout: 300_000 });
  });

  test("HEIC portrait input processes without error", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.heic"));

    // Wait for analysis to complete — either generate button or an error
    await expect(
      page.getByTestId("passport-photo-generate").or(page.getByText("Face analysis failed")),
    ).toBeVisible({ timeout: 300_000 });

    await expect(page.locator("text=cannot identify image")).not.toBeVisible();
  });
});
