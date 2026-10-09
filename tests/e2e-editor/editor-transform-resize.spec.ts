import type { Page } from "@playwright/test";
import { createNewDocument, expect, loadTestImage, selectTool, test } from "./helpers";

type StageView = {
  Konva?: {
    stages: Array<{
      find(selector: string): Array<{
        id(): string;
        image(): CanvasImageSource | undefined;
        width(): number;
        height(): number;
      }>;
    }>;
  };
};

// One pixel of the source image's own bitmap, drawn at the size the editor shows it.
// The source node is the one Konva Image without a store id. Answers null until the
// node has a bitmap, so callers poll: the store swaps the image in after it commits.
function readSourcePixel(page: Page, x: number, y: number): Promise<number[] | null> {
  return page.evaluate(
    ({ x, y }) => {
      const stage = (window as unknown as StageView).Konva?.stages[0];
      const node = stage?.find("Image").find((n) => !n.id() && n.image());
      const source = node?.image();
      if (!node || !source) return null;
      const scratch = document.createElement("canvas");
      scratch.width = node.width();
      scratch.height = node.height();
      const ctx = scratch.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0, node.width(), node.height());
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    },
    { x, y },
  );
}

// The unit tests stand a fake canvas in for jsdom. This is the real-browser check that
// the fill lands under the image and nowhere else, and that the hex field only ever
// commits a color the picker can hold (#2068). The fixture is a flat rgb(255,100,50)
// 200x150 image; grown to 400x150 centered it sits at x 100..299.
test.describe("Canvas Size background color in a real browser (#2068)", () => {
  test("growing the canvas paints the color into the added room only", async ({
    editorPage: page,
  }) => {
    await loadTestImage(page);
    const dims = page.locator('[data-testid="status-dimensions"]');
    await expect(dims).toHaveText(/^200 x 150 px$/, { timeout: 15_000 });

    await page.click('[data-testid="menu-image"]');
    await page.click('[data-testid="menu-item-canvas-size"]');
    await expect(page.locator("#canvas-w")).toBeVisible();

    const hex = page.getByTestId("canvas-fill-hex");
    await hex.fill("112233");
    await expect(page.locator("#canvas-fill")).toHaveValue("#112233");
    await hex.fill("red");
    await hex.blur();
    await expect(hex).toHaveValue("#112233");

    await page.locator("#canvas-w").fill("400");
    await page.locator("button").filter({ hasText: "Apply" }).click();
    await expect(dims).toHaveText(/^400 x 150 px$/);
    await expect(page.locator("#canvas-w")).toHaveCount(0);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);

    await expect
      .poll(() => readSourcePixel(page, 10, 75), { timeout: 15_000 })
      .toEqual([17, 34, 51, 255]);
    expect(await readSourcePixel(page, 389, 75)).toEqual([17, 34, 51, 255]);
    expect(await readSourcePixel(page, 150, 75)).toEqual([255, 100, 50, 255]);
    expect(await readSourcePixel(page, 299, 75)).toEqual([255, 100, 50, 255]);
  });
});

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
