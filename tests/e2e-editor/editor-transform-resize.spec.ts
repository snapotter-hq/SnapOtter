import { createNewDocument, expect, selectTool, test } from "./helpers";

test.describe("Editor Transform and Resize", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
  });

  test("resize canvas dialog opens and works", async ({ editorPage: page }) => {
    // Right-click on the canvas to open the context menu
    const canvas = page.locator("canvas").first();
    await canvas.click({ button: "right" });
    await page.waitForTimeout(300);

    // Click "Canvas Size..." in the context menu
    const canvasSizeBtn = page.locator("button").filter({ hasText: "Canvas Size..." });
    await expect(canvasSizeBtn).toBeVisible();
    await canvasSizeBtn.click();
    await page.waitForTimeout(300);

    // The Canvas Size dialog should appear
    const dialogTitle = page.getByText("Canvas Size", { exact: true });
    await expect(dialogTitle).toBeVisible();

    // Width and Height inputs should be visible
    const widthInput = page.locator("#canvas-w");
    const heightInput = page.locator("#canvas-h");
    await expect(widthInput).toBeVisible();
    await expect(heightInput).toBeVisible();

    // Anchor buttons should be present (9-point grid)
    const anchorButtons = page.locator("button[aria-label^='Anchor']");
    await expect(anchorButtons).toHaveCount(9);

    // Background color input should be visible
    const bgColorInput = page.locator("#canvas-fill");
    await expect(bgColorInput).toBeVisible();

    // Apply and Cancel buttons should be present
    await expect(page.locator("button").filter({ hasText: "Apply" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Cancel" })).toBeVisible();

    // Cancel should close the dialog
    await page.locator("button").filter({ hasText: "Cancel" }).click();
    await page.waitForTimeout(300);

    // Dialog should be gone
    await expect(dialogTitle).not.toBeVisible();
  });

  test("resize image dialog opens and works", async ({ editorPage: page }) => {
    // Right-click on the canvas to open the context menu
    const canvas = page.locator("canvas").first();
    await canvas.click({ button: "right" });
    await page.waitForTimeout(300);

    // Click "Image Size..." in the context menu
    const imageSizeBtn = page.locator("button").filter({ hasText: "Image Size..." });
    await expect(imageSizeBtn).toBeVisible();
    await imageSizeBtn.click();
    await page.waitForTimeout(300);

    // The Image Size dialog should appear
    const dialogTitle = page.getByText("Image Size", { exact: true });
    await expect(dialogTitle).toBeVisible();

    // Width and Height inputs should be visible
    const widthInput = page.locator("#img-w");
    const heightInput = page.locator("#img-h");
    await expect(widthInput).toBeVisible();
    await expect(heightInput).toBeVisible();

    // Aspect ratio lock button should be visible
    const lockBtn = page.locator("button[aria-label*='aspect ratio']");
    await expect(lockBtn).toBeVisible();

    // Cancel should close the dialog
    await page.locator("button").filter({ hasText: "Cancel" }).click();
    await page.waitForTimeout(300);
    await expect(dialogTitle).not.toBeVisible();
  });

  // Paint-fill the canvas, select the resulting image object, and open the
  // transform tool. Returns the canvas centre for follow-up clicks.
  async function fillAndSelectObject(page: import("@playwright/test").Page) {
    await selectTool(page, "fill");
    const box = await page.locator("canvas").first().boundingBox();
    if (!box) throw new Error("Canvas not found");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);
    // Select the fill object with the move tool, then switch to transform.
    await selectTool(page, "move");
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);
    await selectTool(page, "transform");
    await page.waitForTimeout(300);
  }

  // True when some image object on the stage is mirrored along the given axis.
  function anyImageMirrored(page: import("@playwright/test").Page, axis: "x" | "y") {
    return page.evaluate((flipAxis) => {
      const konva = (
        window as unknown as {
          Konva?: {
            stages: Array<{ find(s: string): Array<{ scaleX(): number; scaleY(): number }> }>;
          };
        }
      ).Konva;
      if (!konva?.stages?.length) return false;
      return konva.stages[0]
        .find("Image")
        .some((node) => (flipAxis === "x" ? node.scaleX() : node.scaleY()) < 0);
    }, axis);
  }

  test("flip horizontal mirrors the selected object", async ({ editorPage: page }) => {
    test.slow();
    await fillAndSelectObject(page);

    expect(await anyImageMirrored(page, "x")).toBe(false);
    await page.locator("button[aria-label='Flip horizontal']").click();
    await page.waitForTimeout(400);
    expect(await anyImageMirrored(page, "x")).toBe(true);
  });

  test("flip vertical mirrors the selected object", async ({ editorPage: page }) => {
    test.slow();
    await fillAndSelectObject(page);

    expect(await anyImageMirrored(page, "y")).toBe(false);
    await page.locator("button[aria-label='Flip vertical']").click();
    await page.waitForTimeout(400);
    expect(await anyImageMirrored(page, "y")).toBe(true);
  });
});
