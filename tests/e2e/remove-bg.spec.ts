import path from "node:path";
import { expect, isAiSidecarRunning, test } from "./helpers";

// ---------------------------------------------------------------------------
// Remove Background tool - comprehensive e2e tests.
// Tests HEIC/JPG support, all background types, blur, shadow, and batch.
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
  await page.waitForTimeout(1000);
}

/** Phase 1 helper: remove bg, wait for download button */
async function removeBgAndWait(page: import("@playwright/test").Page) {
  await page.getByTestId("remove-background-submit").click();
  // After Phase 1, either download or download-effects button appears
  await expect(
    page
      .getByTestId("remove-background-download")
      .or(page.getByTestId("remove-background-download-effects")),
  ).toBeVisible({ timeout: 300_000 });
}

test.describe("Remove Background tool", () => {
  async function skipIfFeatureNotInstalled(page: import("@playwright/test").Page) {
    await page.goto("/remove-background");
    try {
      await page
        .getByTestId("remove-background-submit")
        .waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "background-removal feature bundle not installed");
    }
    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }
  }

  test("page loads with correct UI sections", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    await expect(page.getByText("People")).toBeVisible();
    await expect(page.getByText("Products")).toBeVisible();
    await expect(page.getByText("General")).toBeVisible();
    await expect(page.getByText("Fast")).toBeVisible();
    await expect(page.getByText("HD")).toBeVisible();
    await expect(page.getByText("Max")).toBeVisible();

    // Passport checkbox visible and checked by default
    const passportCheckbox = page.locator("input[type='checkbox']").first();
    await expect(passportCheckbox).toBeChecked();

    // Background type buttons
    await expect(page.getByText("Transparent")).toBeVisible();
    await expect(page.getByText("Color")).toBeVisible();
    await expect(page.getByText("Gradient")).toBeVisible();
    await expect(page.getByRole("button", { name: "Image" })).toBeVisible();

    // Effects section
    await expect(page.getByText("Effects")).toBeVisible();
  });

  test("passport checkbox defaults ON for people, OFF for other subjects", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);

    const passportCheckbox = page.locator("input[type='checkbox']").first();
    await expect(passportCheckbox).toBeChecked();

    await page.getByText("Products").click();
    await expect(page.getByText("Passport / ID photo")).not.toBeVisible();

    await page.getByText("People").click();
    await expect(page.getByText("Passport / ID photo")).toBeVisible();
    await expect(passportCheckbox).toBeChecked();
  });

  test("background type controls show/hide sub-options", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    await page.getByRole("button", { name: "Color" }).click();
    await expect(page.locator("input[type='color']").first()).toBeVisible();

    await page.getByRole("button", { name: "Gradient" }).click();
    await expect(page.getByText("Direction")).toBeVisible();

    await page.getByRole("button", { name: "Image" }).click();
    await expect(page.getByText("Choose background image")).toBeVisible();

    await page.getByRole("button", { name: "Transparent" }).click();
  });

  test("effects section expands with blur and shadow controls", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    await page.getByText("Effects").click();
    await expect(page.getByText("Blur Background")).toBeVisible();
    await expect(page.getByText("Add Shadow")).toBeVisible();

    await page.getByText("Blur Background").click();
    await expect(page.getByText("Intensity")).toBeVisible();

    await page.getByText("Add Shadow").click();
    await expect(page.getByText("Opacity")).toBeVisible();
  });

  test("JPG portrait - transparent background removal", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await removeBgAndWait(page);
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
  });

  test("Ultra quality visible for People, hidden for Products", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    // People is default - Ultra should be visible
    await expect(page.getByRole("button", { name: "Ultra" })).toBeVisible();

    // Switch to Products - Ultra should disappear
    await page.getByText("Products").click();
    await expect(page.getByRole("button", { name: "Ultra" })).not.toBeVisible();

    // Switch back to People - Ultra returns
    await page.getByText("People").click();
    await expect(page.getByRole("button", { name: "Ultra" })).toBeVisible();
  });

  test("Ultra quality processes JPG portrait", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    // Select Ultra quality
    await page.getByRole("button", { name: "Ultra" }).click();

    await removeBgAndWait(page);
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();
    await expect(page.locator("text=Background removal failed")).not.toBeVisible();
  });

  test("HEIC portrait - processes without error", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.heic"));

    await removeBgAndWait(page);
    await expect(page.locator("text=Background removal failed")).not.toBeVisible();
  });

  test("two-phase: remove bg then download with color background", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    // Phase 1
    await removeBgAndWait(page);

    // Phase 2: Select color background
    await page.getByRole("button", { name: "Color" }).click();

    // Download button should switch to effects mode
    const dlBtn = page.getByTestId("remove-background-download-effects");
    await expect(dlBtn).toBeVisible();
    await dlBtn.click();

    // Button should show "Rendering..." briefly then return to "Download"
    await expect(dlBtn).not.toHaveText("Rendering...", { timeout: 30_000 });
  });

  test("two-phase: remove bg then download with gradient", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await removeBgAndWait(page);

    await page.getByRole("button", { name: "Gradient" }).click();

    const dlBtn = page.getByTestId("remove-background-download-effects");
    await expect(dlBtn).toBeVisible();
    await dlBtn.click();
    await expect(dlBtn).not.toHaveText("Rendering...", { timeout: 30_000 });
  });

  test("two-phase: remove bg then download with blur", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await removeBgAndWait(page);

    // Enable blur
    await page.getByText("Effects").click();
    await page.getByText("Blur Background").click();

    // Preview should show blurred original background
    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();

    const dlBtn = page.getByTestId("remove-background-download-effects");
    await expect(dlBtn).toBeVisible();
    await dlBtn.click();
    await expect(dlBtn).not.toHaveText("Rendering...", { timeout: 30_000 });
  });

  test("two-phase: remove bg then download with shadow", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await removeBgAndWait(page);

    await page.getByText("Effects").click();
    await page.getByText("Add Shadow").click();

    const dlBtn = page.getByTestId("remove-background-download-effects");
    await expect(dlBtn).toBeVisible();
    await dlBtn.click();
    await expect(dlBtn).not.toHaveText("Rendering...", { timeout: 30_000 });
  });

  test("two-phase: remove bg then download with blur + shadow", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await removeBgAndWait(page);

    await page.getByText("Effects").click();
    await page.getByText("Blur Background").click();
    await page.getByText("Add Shadow").click();

    const dlBtn = page.getByTestId("remove-background-download-effects");
    await expect(dlBtn).toBeVisible();
    await dlBtn.click();
    await expect(dlBtn).not.toHaveText("Rendering...", { timeout: 30_000 });
  });

  test("two-phase: custom bg image + blur shows uploaded bg", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await page.getByRole("button", { name: "Image" }).click();
    const bgFileInput = page.locator("input[type='file'][accept*='image']");
    await bgFileInput.setInputFiles(fixturePath("test-200x150.png"));

    await page.getByText("Effects").click();
    await page.getByText("Blur Background").click();
    const blurSlider = page.locator("input[type='range']").first();
    await blurSlider.fill("100");

    await removeBgAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();

    const dlBtn = page.getByTestId("remove-background-download-effects");
    await expect(dlBtn).toBeVisible();
    await dlBtn.click();
    await expect(dlBtn).not.toHaveText("Rendering...", { timeout: 30_000 });
  });

  test("two-phase: HEIC background image works for preview and download", async ({
    loggedInPage: page,
  }) => {
    await skipIfFeatureNotInstalled(page);
    await uploadFile(page, fixturePath("test-portrait.jpg"));

    await page.getByRole("button", { name: "Image" }).click();
    const bgFileInput = page.locator("input[type='file'][accept*='image']");
    await bgFileInput.setInputFiles(fixturePath("test-portrait.heic"));
    await page.waitForTimeout(3000);

    await removeBgAndWait(page);

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible();

    const dlBtn = page.getByTestId("remove-background-download-effects");
    await expect(dlBtn).toBeVisible();
    await dlBtn.click();
    await expect(dlBtn).not.toHaveText("Rendering...", { timeout: 30_000 });
  });

  test("batch - JPG + HEIC processes both", async ({ loggedInPage: page }) => {
    await skipIfFeatureNotInstalled(page);

    const files = [fixturePath("test-portrait.jpg"), fixturePath("test-portrait.heic")];
    const fileChooserPromise = page.waitForEvent("filechooser");
    const dropzone = page.locator("[class*='border-dashed']").first();
    await dropzone.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(files);
    await page.waitForTimeout(2000);

    await expect(page.getByText("Files (2)")).toBeVisible();
    await expect(page.getByText(/remove background.*2 files/i)).toBeVisible();

    await page.getByTestId("remove-background-submit").click();

    await expect(page.getByRole("button", { name: /download all/i })).toBeVisible({
      timeout: 300_000,
    });

    await expect(page.locator("section[aria-label='Image area'] img").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
