import { readFileSync } from "node:fs";
import { createNewDocument, expect, test } from "./helpers";

// Width and height from a PNG's IHDR chunk, which always follows the 8-byte signature.
function pngSize(file: string): [number, number] {
  const png = readFileSync(file);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

test.describe("Editor Export", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
  });

  // The unit tests stand a fake canvas in for jsdom; this checks that a real browser
  // writes a file of exactly the typed size with the lock off, which used to come
  // out at the width's aspect (#2174).
  test("exports at the typed width and height with the lock off", async ({ editorPage: page }) => {
    await page.keyboard.press("Control+Shift+s");
    await expect(page.getByText("Export Image")).toBeVisible();

    await page.getByRole("button", { name: "Unlock aspect ratio" }).click();
    // Scoped to the dialog's Dimensions block: the status bar's zoom box and the
    // tool options bar are number inputs too, and come first on the page.
    const boxes = page.getByText("Dimensions").locator("..").locator('input[type="number"]');
    await expect(boxes).toHaveCount(2);
    const width = boxes.nth(0);
    const height = boxes.nth(1);
    await width.fill("300");
    await height.fill("100");
    await expect(width).toHaveValue("300");
    await expect(height).toHaveValue("100");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const file = await (await download).path();
    expect(file).toBeTruthy();
    expect(pngSize(file as string)).toEqual([300, 100]);
  });

  test("export dialog opens via Ctrl+Shift+S", async ({ editorPage: page }) => {
    await page.keyboard.press("Control+Shift+s");
    await page.waitForTimeout(500);

    // Export dialog should appear with "Export Image" heading
    await expect(page.getByText("Export Image")).toBeVisible();
  });

  test("export dialog has format options PNG, JPEG, WebP", async ({ editorPage: page }) => {
    await page.keyboard.press("Control+Shift+s");
    await page.waitForTimeout(500);

    await expect(page.getByText("PNG", { exact: true })).toBeVisible();
    await expect(page.getByText("JPEG", { exact: true })).toBeVisible();
    await expect(page.getByText("WebP", { exact: true })).toBeVisible();
  });

  test("export dialog has dimension inputs and aspect lock", async ({ editorPage: page }) => {
    await page.keyboard.press("Control+Shift+s");
    await page.waitForTimeout(500);

    await expect(page.getByText("Dimensions")).toBeVisible();
    await expect(page.getByText("Width")).toBeVisible();
    await expect(page.getByText("Height")).toBeVisible();

    // Aspect lock button
    const lockBtn = page.locator(
      "button[aria-label='Unlock aspect ratio'], button[aria-label='Lock aspect ratio']",
    );
    await expect(lockBtn).toBeVisible();
  });

  test("export dialog has export, copy, save, and load buttons", async ({ editorPage: page }) => {
    await page.keyboard.press("Control+Shift+s");
    await page.waitForTimeout(500);

    await expect(page.getByText("Export", { exact: true })).toBeVisible();
    await expect(page.getByText("Copy", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Save Project")).toBeVisible();
    await expect(page.getByText("Load Project")).toBeVisible();
  });
});
