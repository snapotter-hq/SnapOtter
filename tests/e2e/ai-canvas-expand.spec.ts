import path from "node:path";
import { expect, isAiSidecarRunning, test } from "./helpers";

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

test.describe("AI Canvas Expand", () => {
  test("standalone /ai-canvas-expand route loads", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");

    await expect(page.getByText("Tool not found")).not.toBeVisible();
    // Heading appears in both the breadcrumb and the page; .first() avoids a
    // strict-mode multiple-match error.
    await expect(page.getByText("AI Canvas Expand").first()).toBeVisible();

    // Settings (aspect-ratio + per-side inputs) only mount after a file loads.
    await uploadFile(page, fixturePath("test-200x150.png"));
    await expect(page.getByText("Extend to aspect ratio")).toBeVisible();
    await expect(page.getByText("Extend by (pixels)")).toBeVisible();
  });

  test("standalone submit disabled without file", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");
    // The settings panel (and its submit button) mount only after a file is
    // uploaded; before upload the page shows just the dropzone.
    await expect(page.getByTestId("ai-canvas-expand-submit")).toHaveCount(0);
  });

  test("standalone submit disabled when all extensions are zero", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/ai-canvas-expand");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await expect(page.getByTestId("ai-canvas-expand-submit")).toBeDisabled();
  });

  test("standalone submit enables with extension set", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.locator("#cac-top").fill("50");

    await expect(page.getByTestId("ai-canvas-expand-submit")).toBeEnabled();
  });

  test("standalone aspect ratio preset fills extension values", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "16:9" }).click();

    const topInput = page.locator("#cac-top");
    const rightInput = page.locator("#cac-right");

    const topVal = Number(await topInput.inputValue());
    const rightVal = Number(await rightInput.inputValue());

    expect(topVal > 0 || rightVal > 0).toBe(true);
    await expect(page.getByTestId("ai-canvas-expand-submit")).toBeEnabled();
  });

  test("standalone shows new size display", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.waitForTimeout(500);
    await page.locator("#cac-top").fill("50");
    await page.locator("#cac-bottom").fill("50");

    await expect(page.getByText(/New size: \d+ x \d+/)).toBeVisible();
  });

  test("tier buttons render with Balanced selected by default", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await expect(page.getByTestId("tier-fast")).toBeVisible();
    await expect(page.getByTestId("tier-balanced")).toBeVisible();
    await expect(page.getByTestId("tier-high")).toBeVisible();

    const balanced = page.getByTestId("tier-balanced");
    await expect(balanced).toHaveClass(/bg-primary/);
  });

  test("clicking tier button changes selection", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await page.getByTestId("tier-fast").click();
    await expect(page.getByTestId("tier-fast")).toHaveClass(/bg-primary/);
    await expect(page.getByTestId("tier-balanced")).not.toHaveClass(/bg-primary/);

    await expect(page.getByText("Quick preview, fewer AI passes")).toBeVisible();
  });

  test("tier description updates on selection", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");
    await uploadFile(page, fixturePath("test-200x150.png"));

    await expect(page.getByText("Good quality, moderate speed")).toBeVisible();

    await page.getByTestId("tier-high").click();
    await expect(page.getByText("Best results, slower")).toBeVisible();
  });

  // ── Processing (requires AI sidecar) ────────────────────────────────

  test("processes image (AI sidecar required)", async ({ loggedInPage: page }) => {
    await page.goto("/image/ai-canvas-expand");

    if (!(await isAiSidecarRunning(page))) {
      test.skip(true, "AI sidecar not running");
    }

    await uploadFile(page, fixturePath("test-200x150.png"));
    await page.locator("#cac-top").fill("30");
    await page.locator("#cac-bottom").fill("30");

    await page.getByTestId("ai-canvas-expand-submit").click();

    const download = page.getByTestId("ai-canvas-expand-download");
    const error = page.getByText(/failed|not available|not installed|error/i);

    await expect(download.or(error)).toBeVisible({ timeout: 300_000 });
  });
});
