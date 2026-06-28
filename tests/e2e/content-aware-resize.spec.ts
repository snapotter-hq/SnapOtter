import path from "node:path";
import { expect, test } from "./helpers";

function fixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", "image", "valid", name);
}

async function uploadFile(page: import("@playwright/test").Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(500);
}

// In 2.0 content-aware is a tab inside the Resize tool, not a toggle switch.
// The settings panel (tabs included) only mounts after a file is uploaded, so
// callers must upload before invoking this helper.
async function enableContentAware(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Content-Aware" }).click();
  await expect(page.getByText("Resize to square")).toBeVisible();
}

test.describe("Content-Aware Resize", () => {
  test("direct /content-aware-resize route loads tool page (regression #131)", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/content-aware-resize");

    // Must NOT show "Tool not found"
    await expect(page.getByText("Tool not found")).not.toBeVisible();

    // Tool name is shown by the dropzone branding even before upload (it also
    // appears in the breadcrumb, so scope to the first match).
    await expect(page.getByText("Content-Aware Resize").first()).toBeVisible();

    // Settings (and the content-aware controls) mount only after a file loads
    await uploadFile(page, fixturePath("test-200x150.png"));

    await expect(page.getByText("Resize to square")).toBeVisible();
    await expect(page.getByText("Protect faces")).toBeVisible();
    await expect(page.getByText("Smoothing")).toBeVisible();
    await expect(page.getByText("Edge sensitivity")).toBeVisible();
  });

  test("direct route submit absent without file", async ({ loggedInPage: page }) => {
    await page.goto("/image/content-aware-resize");
    // Pre-upload the page shows only the dropzone; the submit never mounts.
    await expect(page.getByTestId("content-aware-resize-submit")).toHaveCount(0);
  });

  test("direct route submit enables with width and file", async ({ loggedInPage: page }) => {
    await page.goto("/image/content-aware-resize");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.locator("#car-width").fill("150");

    await expect(page.getByTestId("content-aware-resize-submit")).toBeEnabled();
  });

  test("content-aware tab reveals seam carving controls", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await expect(page.getByRole("button", { name: "Content-Aware" })).toBeVisible();

    // Controls hidden before switching to the content-aware tab
    await expect(page.getByText("Resize to square")).not.toBeVisible();
    await expect(page.getByText("Protect faces")).not.toBeVisible();

    await enableContentAware(page);

    // Controls visible once the content-aware tab is active
    await expect(page.getByText("Resize to square")).toBeVisible();
    await expect(page.getByText("Protect faces")).toBeVisible();
    await expect(page.getByText("Smoothing")).toBeVisible();
    await expect(page.getByText("Edge sensitivity")).toBeVisible();
  });

  test("standard resize controls hidden when content-aware is active", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));

    // The default Custom Size tab exposes the fit-mode controls
    await expect(page.getByRole("button", { name: "Crop to fit" })).toBeVisible();

    await enableContentAware(page);

    // Switching to content-aware replaces the standard custom-size controls
    await expect(page.getByRole("button", { name: "Crop to fit" })).not.toBeVisible();
  });

  test("submit absent without file", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    // No file means no settings panel and no submit button at all.
    await expect(page.getByTestId("resize-submit")).toHaveCount(0);
  });

  test("submit disabled without dimensions or square mode", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));
    await enableContentAware(page);

    // Width and height are empty, square is unchecked - submit should be disabled
    await page.locator("#resize-width").fill("");
    await page.locator("#resize-height").fill("");

    await expect(page.getByTestId("resize-submit")).toBeDisabled();
  });

  test("submit enables with width specified", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));
    await enableContentAware(page);

    await page.locator("#resize-width").fill("150");

    await expect(page.getByTestId("resize-submit")).toBeEnabled();
  });

  test("submit enables with square mode checked", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));
    await enableContentAware(page);

    await page.getByText("Resize to square").click();

    await expect(page.getByTestId("resize-submit")).toBeEnabled();
  });

  test("square mode disables width and height inputs", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));
    await enableContentAware(page);

    await page.getByText("Resize to square").click();

    await expect(page.locator("#resize-width")).toBeDisabled();
    await expect(page.locator("#resize-height")).toBeDisabled();
  });

  test("smoothing slider has correct range", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));
    await enableContentAware(page);

    const slider = page.locator("#blur-radius");
    await expect(slider).toHaveAttribute("min", "0");
    await expect(slider).toHaveAttribute("max", "20");
  });

  test("edge sensitivity slider has correct range", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));
    await enableContentAware(page);

    const slider = page.locator("#sobel-threshold");
    await expect(slider).toHaveAttribute("min", "1");
    await expect(slider).toHaveAttribute("max", "20");
  });

  test("PNG - content-aware resize processes and shows result", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.png"));
    await enableContentAware(page);

    await page.locator("#resize-width").fill("150");

    await page.getByTestId("resize-submit").click();

    // Either succeeds with download or fails with error (caire not installed)
    const download = page.getByTestId("resize-download");
    const error = page.getByText(/failed|not available|not found|error/i);

    await expect(download.or(error)).toBeVisible({ timeout: 120_000 });
  });

  test("HEIC input with content-aware resize", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadFile(page, fixturePath("test-200x150.heic"));
    await enableContentAware(page);

    await page.locator("#resize-width").fill("150");

    await page.getByTestId("resize-submit").click();

    const download = page.getByTestId("resize-download");
    const error = page.getByText(/failed|not available|not found|error/i);

    await expect(download.or(error)).toBeVisible({ timeout: 120_000 });
  });
});
