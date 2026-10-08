import type { Page } from "@playwright/test";
import { expect, loadTestImage, selectTool, test } from "./helpers";

// Issue #1041: Konva binds mouseup on its content element only, so releasing the
// button over the toolbar, the right panel or outside the window never reached the
// stroke tools. The stroke stayed live and kept painting on every mouse move, with
// no button held, until the next click. A release anywhere now ends the stroke.

type KonvaNode = {
  id(): string;
  image?(): CanvasImageSource | undefined;
  width(): number;
  height(): number;
  points?(): number[];
  getAttr(name: string): unknown;
};

type StageView = {
  Konva?: {
    stages: Array<{
      x(): number;
      y(): number;
      scaleX(): number;
      find(selector: string | ((node: KonvaNode) => boolean)): KonvaNode[];
    }>;
  };
};

async function waitForSourceImage(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const stage = (window as unknown as StageView).Konva?.stages[0];
          return Boolean(stage?.find("Image").some((node) => !node.id() && node.image?.()));
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

// Alpha of one document pixel in the newest image object's own bitmap.
function strokeAlphaAt(page: Page, x: number, y: number): Promise<number | null> {
  return page.evaluate(
    ({ x, y }) => {
      const stage = (window as unknown as StageView).Konva?.stages[0];
      const nodes = stage?.find("Image").filter((node) => node.id()) ?? [];
      const node = nodes[nodes.length - 1];
      const source = node?.image?.();
      if (!node || !source) return null;
      const scratch = document.createElement("canvas");
      scratch.width = node.width();
      scratch.height = node.height();
      const ctx = scratch.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0);
      return ctx.getImageData(x, y, 1, 1).data[3];
    },
    { x, y },
  );
}

// Number of points in the newest line object (brush and pencil strokes are lines).
function newestLinePointCount(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const stage = (window as unknown as StageView).Konva?.stages[0];
    const lines = stage?.find("Line").filter((node) => node.id()) ?? [];
    const line = lines[lines.length - 1];
    return line?.points ? line.points().length : null;
  });
}

// The orange dashed outline a marquee or lasso draws while it is being dragged
// (ActiveSelectionPreview). A committed selection is drawn black and white instead.
const DRAG_PREVIEW_STROKE = "#E07832";

function dragPreviewCount(page: Page): Promise<number> {
  return page.evaluate((stroke) => {
    const stage = (window as unknown as StageView).Konva?.stages[0];
    return stage?.find((node) => node.getAttr("stroke") === stroke).length ?? 0;
  }, DRAG_PREVIEW_STROKE);
}

// Nodes of one Konva class that carry a stroke of the given colour.
function strokedCount(page: Page, className: string, stroke: string): Promise<number> {
  return page.evaluate(
    ({ className, stroke }) => {
      const stage = (window as unknown as StageView).Konva?.stages[0];
      return (
        stage?.find(
          (node) =>
            (node as unknown as { className: string }).className === className &&
            node.getAttr("stroke") === stroke,
        ).length ?? 0
      );
    },
    { className, stroke },
  );
}

// Width of the newest shape object (a Rect that carries an object id).
function newestRectWidth(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const stage = (window as unknown as StageView).Konva?.stages[0];
    const rects = stage?.find("Rect").filter((node) => node.id()) ?? [];
    const rect = rects[rects.length - 1];
    return rect ? rect.width() : null;
  });
}

// Image objects the user has drawn (the source image has no id).
function imageObjectCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const stage = (window as unknown as StageView).Konva?.stages[0];
    return stage?.find("Image").filter((node) => node.id()).length ?? 0;
  });
}

// A spot over the right-hand panel, well clear of the canvas.
const OVER_THE_PANEL = { x: 1420, y: 450 };

test.describe("A stroke ends when the button is released off the canvas (issue #1041)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await loadTestImage(page);
    await waitForSourceImage(page);
  });

  for (const tool of ["blur-brush", "dodge", "clone-stamp"] as const) {
    test(`${tool} stops painting after a release over the panel`, async ({ editorPage: page }) => {
      await selectTool(page, tool);
      if (tool === "clone-stamp") {
        const source = await documentPoint(page, 40, 40);
        await page.keyboard.down("Alt");
        await page.mouse.click(source.x, source.y);
        await page.keyboard.up("Alt");
      }

      const start = await documentPoint(page, 60, 75);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 30, start.y, { steps: 4 });
      await page.mouse.move(OVER_THE_PANEL.x, OVER_THE_PANEL.y, { steps: 6 });
      await page.mouse.up();

      // Back over the canvas with no button held.
      const back = await documentPoint(page, 150, 75);
      await page.mouse.move(back.x, back.y, { steps: 6 });
      await page.mouse.move(back.x + 10, back.y, { steps: 3 });

      // The stroke began at x=60, so the first dab is opaque there.
      await expect.poll(() => strokeAlphaAt(page, 60, 75), { timeout: 10_000 }).toBe(255);
      // Nothing may have been painted since the release.
      expect(await strokeAlphaAt(page, 150, 75)).toBe(0);
    });
  }

  test("brush stops adding points after a release over the panel", async ({ editorPage: page }) => {
    await selectTool(page, "brush");
    const start = await documentPoint(page, 60, 75);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 30, start.y, { steps: 4 });
    await page.mouse.move(OVER_THE_PANEL.x, OVER_THE_PANEL.y, { steps: 6 });
    await page.mouse.up();

    const atRelease = await newestLinePointCount(page);
    expect(atRelease).not.toBeNull();

    const back = await documentPoint(page, 150, 75);
    await page.mouse.move(back.x, back.y, { steps: 6 });
    await page.mouse.move(back.x + 10, back.y, { steps: 3 });

    expect(await newestLinePointCount(page)).toBe(atRelease);
  });
});

test.describe("A stroke still ends when the release never reaches the canvas (issue #1041)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await loadTestImage(page);
    await waitForSourceImage(page);
  });

  test("a tool shortcut pressed mid-drag doesn't leave the brush stroke open", async ({
    editorPage: page,
  }) => {
    await selectTool(page, "brush");
    const start = await documentPoint(page, 60, 75);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 30, start.y, { steps: 4 });

    // Switch to the eraser with the button still held, then let go over the canvas.
    await page.keyboard.press("e");
    await page.mouse.up();
    const atRelease = await newestLinePointCount(page);
    expect(atRelease).not.toBeNull();

    // Back to the brush, nothing held: it must not pick the old stroke back up.
    await page.keyboard.press("b");
    const back = await documentPoint(page, 150, 75);
    await page.mouse.move(back.x, back.y, { steps: 6 });
    await page.mouse.move(back.x + 10, back.y, { steps: 3 });

    expect(await newestLinePointCount(page)).toBe(atRelease);
  });

  test("losing the window mid-drag ends the stroke", async ({ editorPage: page }) => {
    await selectTool(page, "dodge");
    const start = await documentPoint(page, 60, 75);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 30, start.y, { steps: 4 });

    // Alt-tab away: the page gets a blur and never sees the button come up.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));

    const back = await documentPoint(page, 150, 75);
    await page.mouse.move(back.x, back.y, { steps: 6 });
    await page.mouse.move(back.x + 10, back.y, { steps: 3 });
    await page.mouse.up();

    await expect.poll(() => strokeAlphaAt(page, 60, 75), { timeout: 10_000 }).toBe(255);
    expect(await strokeAlphaAt(page, 150, 75)).toBe(0);
  });
});

// Issue #2154: the same release over the panel left shape, gradient and selection
// drags live, because their handlers were not among the tools #1041 armed.
test.describe("A drag ends when the button is released off the canvas (issue #2154)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await loadTestImage(page);
    await waitForSourceImage(page);
  });

  // Press on the image, drag past the canvas edge and release over the panel.
  async function dragOutAndRelease(page: Page): Promise<void> {
    const start = await documentPoint(page, 60, 75);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 20, { steps: 4 });
    await page.mouse.move(OVER_THE_PANEL.x, OVER_THE_PANEL.y, { steps: 6 });
    await page.mouse.up();
  }

  // Back over the canvas with no button held.
  async function wanderBack(page: Page): Promise<void> {
    const back = await documentPoint(page, 150, 120);
    await page.mouse.move(back.x, back.y, { steps: 6 });
    await page.mouse.move(back.x + 10, back.y + 5, { steps: 3 });
  }

  test("a rectangle stops resizing after a release over the panel", async ({
    editorPage: page,
  }) => {
    await selectTool(page, "shape-rect");
    await dragOutAndRelease(page);

    const atRelease = await newestRectWidth(page);
    expect(atRelease).not.toBeNull();

    await wanderBack(page);

    expect(await newestRectWidth(page)).toBe(atRelease);
  });

  for (const tool of ["marquee-rect", "marquee-ellipse"] as const) {
    test(`${tool} commits at the release and stops rubber-banding`, async ({
      editorPage: page,
    }) => {
      // The ellipse sits behind the rectangle in the toolbar; "m" cycles to it.
      await selectTool(page, "marquee-rect");
      if (tool === "marquee-ellipse") await page.keyboard.press("m");
      await dragOutAndRelease(page);

      // The drag ended: no orange outline left, and the selection is drawn.
      await expect.poll(() => dragPreviewCount(page), { timeout: 5_000 }).toBe(0);
      const shape = tool === "marquee-rect" ? "Rect" : "Ellipse";
      expect(await strokedCount(page, shape, "#000000")).toBeGreaterThan(0);

      await wanderBack(page);
      expect(await dragPreviewCount(page)).toBe(0);
    });
  }

  test("a freehand lasso commits at the release and stops rubber-banding", async ({
    editorPage: page,
  }) => {
    await selectTool(page, "lasso-free");
    const start = await documentPoint(page, 60, 75);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y, { steps: 3 });
    await page.mouse.move(start.x + 40, start.y + 30, { steps: 3 });
    await page.mouse.move(OVER_THE_PANEL.x, OVER_THE_PANEL.y, { steps: 6 });
    await page.mouse.up();

    await expect.poll(() => dragPreviewCount(page), { timeout: 5_000 }).toBe(0);
    expect(await strokedCount(page, "Line", "#000000")).toBeGreaterThan(0);

    await wanderBack(page);
    expect(await dragPreviewCount(page)).toBe(0);
  });

  test("a gradient commits at the release, not at the next click", async ({ editorPage: page }) => {
    await selectTool(page, "gradient");
    const before = await imageObjectCount(page);

    await dragOutAndRelease(page);

    await expect.poll(() => imageObjectCount(page), { timeout: 5_000 }).toBe(before + 1);

    // Wandering back without pressing must not add or change anything.
    await wanderBack(page);
    expect(await imageObjectCount(page)).toBe(before + 1);
  });
});
