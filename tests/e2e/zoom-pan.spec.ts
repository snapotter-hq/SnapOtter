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

test.describe("In-canvas zoom & pan", () => {
  test("split: toolbar, wheel zoom, and hand-tool drag pan", async ({ loggedInPage: page }) => {
    await page.goto("/image/split");
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    const viewport = page.getByTestId("zoom-viewport");
    const content = page.getByTestId("zoom-content");
    const percent = page.getByTestId("zoom-percent");
    await expect(page.getByTestId("zoom-toolbar")).toBeVisible();
    await content.waitFor({ state: "visible", timeout: 5_000 });

    const box = await viewport.boundingBox();
    if (!box) throw new Error("no viewport box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Wheel up over the canvas zooms toward the cursor (large delta -> near max zoom).
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(150);
    await expect(percent).not.toHaveText("100%");
    expect(await content.getAttribute("style")).toMatch(/scale\((?!1\))/); // scale != 1

    // Hand-tool toggle, then drag pans (deterministic; translate becomes non-zero).
    await page.getByTestId("zoom-pan").click();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy - 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    expect(await content.getAttribute("style")).toMatch(/translate\(\s*-?[1-9][0-9.]*px/);
  });

  test("eraser: zoom in, then draw a stroke while zoomed", async ({ loggedInPage: page }) => {
    await page.goto("/image/erase-object");
    // Skip if the AI bundle isn't installed (no masking canvas to draw on).
    try {
      await page.getByTestId("erase-object-submit").waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      test.skip(true, "object-eraser-colorize feature bundle not installed");
    }
    await uploadFile(page, fixturePath("image/valid/test-200x150.png"));

    const viewport = page.getByTestId("zoom-viewport");
    const content = page.getByTestId("zoom-content");
    await content.waitFor({ state: "visible", timeout: 5_000 });
    const box = await viewport.boundingBox();
    if (!box) throw new Error("no viewport box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Zoom in.
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -1200);
    await page.waitForTimeout(150);
    expect(await content.getAttribute("style")).toMatch(/scale\((?!1\))/);

    // Draw a stroke while zoomed (coordinate mapping must stay correct under the transform).
    await page.mouse.down();
    await page.mouse.move(cx + 20, cy + 10);
    await page.mouse.move(cx + 40, cy + 20);
    await page.mouse.up();

    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(page.getByTestId("erase-object-submit")).toBeEnabled();
  });
});
