import type { Page } from "@playwright/test";
import { expect, loadTestImage, selectTool, test } from "./helpers";

// Issue #1040: the pixel tools capture the document, read its pixels, and used
// to give up without a word when that wasn't possible. Two causes:
//   - the canvas refused to hand out a 2D context (browser memory ceiling), and
//   - a cross-origin source image tainted the canvas, so every getImageData threw
//     a SecurityError out of the mouse handler.
// A refused capture now shows a toast, and a cross-origin image that sends CORS
// headers loads untainted so the tool just works.

const FIXTURE = "tests/fixtures/image/valid/test-200x150.png";
const CROSS_ORIGIN_URL = "https://images.example.test/photo.png";

type StageView = {
  Konva?: {
    stages: Array<{
      find(selector: string): Array<{ id(): string; image(): CanvasImageSource | undefined }>;
      x(): number;
      y(): number;
      scaleX(): number;
    }>;
  };
};

// Image *objects* carry their store id; the source image node has none.
function countImageObjects(page: Page): Promise<number> {
  return page.evaluate(() => {
    const konva = (window as unknown as StageView).Konva;
    if (!konva?.stages?.length) return 0;
    return konva.stages[0].find("Image").filter((node) => node.id()).length;
  });
}

async function waitForSourceImage(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const stage = (window as unknown as StageView).Konva?.stages[0];
          return Boolean(stage?.find("Image").some((node) => !node.id() && node.image()));
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

async function documentPoint(page: Page, docX: number, docY: number) {
  const canvas = page.locator('[data-testid="editor-canvas"] canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("editor canvas has no bounding box");
  const view = await page.evaluate(() => {
    const stage = (window as unknown as StageView).Konva?.stages[0];
    return stage ? { x: stage.x(), y: stage.y(), zoom: stage.scaleX() } : null;
  });
  if (!view) throw new Error("Konva stage not found");
  return {
    x: box.x + view.x + (docX + 0.5) * view.zoom,
    y: box.y + view.y + (docY + 0.5) * view.zoom,
  };
}

test.describe("Editor pixel tools: cross-origin source image (issue #1040)", () => {
  test("a blur stroke lands on an image from another origin that sends CORS headers", async ({
    editorPage: page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.route(`${new URL(CROSS_ORIGIN_URL).origin}/**`, (route) =>
      route.fulfill({
        path: FIXTURE,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
      }),
    );

    await page.goto(`/editor?url=${encodeURIComponent(CROSS_ORIGIN_URL)}`);
    await waitForSourceImage(page);
    await selectTool(page, "blur-brush");
    const at = await documentPoint(page, 100, 75);
    await page.mouse.click(at.x, at.y);

    await expect.poll(() => countImageObjects(page), { timeout: 10_000 }).toBe(1);
    expect(pageErrors.filter((m) => m.includes("SecurityError"))).toEqual([]);
  });
});

test.describe("Editor pixel tools: refused capture (issue #1040)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await loadTestImage(page);
    await waitForSourceImage(page);
  });

  // Stand in for a browser that is out of canvas memory: from here on, any canvas
  // the size of the document gets no 2D context.
  async function refuseDocumentSizedContexts(page: Page): Promise<void> {
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
        if (this.width === 200 && this.height === 150) return null;
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as typeof original;
    });
  }

  for (const tool of ["fill", "blur-brush", "dodge", "clone-stamp"] as const) {
    test(`${tool} says so when the document can't be captured`, async ({ editorPage: page }) => {
      await selectTool(page, tool);
      if (tool === "clone-stamp") {
        const source = await documentPoint(page, 40, 40);
        await page.keyboard.down("Alt");
        await page.mouse.click(source.x, source.y);
        await page.keyboard.up("Alt");
      }
      await refuseDocumentSizedContexts(page);

      const at = await documentPoint(page, 100, 75);
      await page.mouse.click(at.x, at.y);

      await expect(page.locator("[data-sonner-toast]")).toContainText(/too big/i, {
        timeout: 10_000,
      });
      expect(await countImageObjects(page)).toBe(0);
    });
  }
});
