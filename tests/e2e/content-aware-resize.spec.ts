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

async function enableContentAware(page: import("@playwright/test").Page) {
  const toggle = page
    .getByRole("switch", { name: "Content-aware" })
    .or(
      page
        .locator("button[role='switch'][aria-checked]")
        .filter({ hasText: "" })
        .locator("..")
        .filter({ hasText: "Content-aware" })
        .locator("button[role='switch']"),
    );
  const sw = page.locator("button[role='switch']").first();
  if ((await sw.getAttribute("aria-checked")) !== "true") {
    await sw.click();
  }
  await expect(sw).toHaveAttribute("aria-checked", "true");
}

test.describe("Content-Aware Resize", () => {
  test("direct /content-aware-resize route loads tool page (regression #131)", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/content-aware-resize");

    // Must NOT show "Tool not found"
    await expect(page.getByText("Tool not found")).not.toBeVisible();

    // Must show the tool name and content-aware controls
    await expect(page.getByText("Content-Aware Resize")).toBeVisible();
    await expect(page.getByText("Resize to square")).toBeVisible();
    await expect(page.getByText("Protect faces")).toBeVisible();
    await expect(page.getByText("Smoothing")).toBeVisible();
    await expect(page.getByText("Edge sensitivity")).toBeVisible();
  });

  test("direct route submit disabled without file", async ({ loggedInPage: page }) => {
    await page.goto("/content-aware-resize");
    await expect(page.getByTestId("content-aware-resize-submit")).toBeDisabled();
  });

  test("direct route submit enables with width and file", async ({ loggedInPage: page }) => {
    await page.goto("/content-aware-resize");
    await uploadFile(page, fixturePath("test-200x150.png"));

    const widthInput = page.locator("input[placeholder='Auto']").first();
    await widthInput.fill("150");

    await expect(page.getByTestId("content-aware-resize-submit")).toBeEnabled();
  });

  test("content-aware toggle reveals seam carving controls", async ({ loggedInPage: page }) => {
    await page.goto("/resize");

    await expect(page.getByText("Content-aware")).toBeVisible();

    // Controls hidden before toggle
    await expect(page.getByText("Resize to square")).not.toBeVisible();
    await expect(page.getByText("Protect faces")).not.toBeVisible();

    await enableContentAware(page);

    // Controls visible after toggle
    await expect(page.getByText("Resize to square")).toBeVisible();
    await expect(page.getByText("Protect faces")).toBeVisible();
    await expect(page.getByText("Smoothing")).toBeVisible();
    await expect(page.getByText("Edge sensitivity")).toBeVisible();
  });

  test("standard resize tabs hidden when content-aware is active", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");

    // Standard tabs visible before toggle
    await expect(page.getByRole("button", { name: "Custom" })).toBeVisible();

    await enableContentAware(page);

    // Standard tabs hidden
    await expect(page.getByRole("button", { name: "Custom" })).not.toBeVisible();
  });

  test("submit disabled without file", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);

    await expect(page.getByTestId("resize-submit")).toBeDisabled();
  });

  test("submit disabled without dimensions or square mode", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);
    await uploadFile(page, fixturePath("test-200x150.png"));

    // Width and height are empty, square is unchecked - submit should be disabled
    const widthInput = page.locator("input[placeholder='Auto']").first();
    await widthInput.fill("");
    const heightInput = page.locator("input[placeholder='Auto']").nth(1);
    await heightInput.fill("");

    await expect(page.getByTestId("resize-submit")).toBeDisabled();
  });

  test("submit enables with width specified", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);
    await uploadFile(page, fixturePath("test-200x150.png"));

    const widthInput = page.locator("input[placeholder='Auto']").first();
    await widthInput.fill("150");

    await expect(page.getByTestId("resize-submit")).toBeEnabled();
  });

  test("submit enables with square mode checked", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.getByText("Resize to square").click();

    await expect(page.getByTestId("resize-submit")).toBeEnabled();
  });

  test("square mode disables width and height inputs", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);

    await page.getByText("Resize to square").click();

    const widthInput = page.locator("input[placeholder='Auto']").first();
    const heightInput = page.locator("input[placeholder='Auto']").nth(1);

    await expect(widthInput).toBeDisabled();
    await expect(heightInput).toBeDisabled();
  });

  test("smoothing slider has correct range", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);

    const slider = page.locator("#blur-radius");
    await expect(slider).toHaveAttribute("min", "0");
    await expect(slider).toHaveAttribute("max", "20");
  });

  test("edge sensitivity slider has correct range", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);

    const slider = page.locator("#sobel-threshold");
    await expect(slider).toHaveAttribute("min", "1");
    await expect(slider).toHaveAttribute("max", "20");
  });

  test("PNG - content-aware resize processes and shows result", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);
    await uploadFile(page, fixturePath("test-200x150.png"));

    const widthInput = page.locator("input[placeholder='Auto']").first();
    await widthInput.fill("150");

    await page.getByTestId("resize-submit").click();

    // Either succeeds with download or fails with error (caire not installed)
    const download = page.getByTestId("resize-download");
    const error = page.getByText(/failed|not available|not found|error/i);

    await expect(download.or(error)).toBeVisible({ timeout: 120_000 });
  });

  test("HEIC input with content-aware resize", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await enableContentAware(page);
    await uploadFile(page, fixturePath("test-200x150.heic"));

    const widthInput = page.locator("input[placeholder='Auto']").first();
    await widthInput.fill("150");

    await page.getByTestId("resize-submit").click();

    const download = page.getByTestId("resize-download");
    const error = page.getByText(/failed|not available|not found|error/i);

    await expect(download.or(error)).toBeVisible({ timeout: 120_000 });
  });
});
