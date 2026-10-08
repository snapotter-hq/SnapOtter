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
};

type StageView = {
  Konva?: {
    stages: Array<{
      x(): number;
      y(): number;
      scaleX(): number;
      find(selector: string): KonvaNode[];
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
