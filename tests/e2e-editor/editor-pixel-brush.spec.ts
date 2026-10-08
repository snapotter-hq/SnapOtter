import type { Page } from "@playwright/test";
import { expect, loadTestImage, selectTool, test } from "./helpers";

// Regression coverage for issue #829: the blur brush (and sharpen and smudge,
// which share the same pixel-brush hook) snapshotted the whole document and
// added that snapshot as a new full-size image object. A single click stacked
// an opaque copy of the entire image on top of the original, and dragging it
// with the move tool revealed the "duplicate" underneath. A stroke object must
// carry only the pixels the brush touched and stay transparent everywhere else.
//
// The fixture is a flat, fully opaque rgb(255,100,50) 200x150 image, so the
// blur leaves colours untouched and alpha is what tells a brushed pixel from an
// untouched one.

const ORANGE = { r: 255, g: 100, b: 50, a: 255 };

type Rgba = { r: number; g: number; b: number; a: number };

type StageView = {
  Konva?: {
    stages: Array<{
      x(): number;
      y(): number;
      scaleX(): number;
      find(selector: string): Array<{
        id(): string;
        image(): CanvasImageSource | undefined;
        width(): number;
        height(): number;
      }>;
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

// The brush captures the document on mouse down, so the source image must have
// its bitmap before the first click.
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

// Read one document pixel from the newest image object's own bitmap.
function readStrokeObjectPixel(page: Page, x: number, y: number): Promise<Rgba | null> {
  return page.evaluate(
    ({ x, y }) => {
      const konva = (window as unknown as StageView).Konva;
      if (!konva?.stages?.length) return null;
      const objects = konva.stages[0].find("Image").filter((node) => node.id());
      const node = objects[objects.length - 1];
      const source = node?.image();
      if (!node || !source) return null;
      const scratch = document.createElement("canvas");
      scratch.width = node.width();
      scratch.height = node.height();
      const ctx = scratch.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    },
    { x, y },
  );
}

// Screen position of a document pixel: the stage carries the editor's pan as
// its position and the zoom as its scale.
async function screenPointForDocumentPixel(page: Page, docX: number, docY: number) {
  const canvas = page.locator('[data-testid="editor-canvas"] canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("editor canvas has no bounding box");
  const view = await page.evaluate(() => {
    const stage = (window as unknown as StageView).Konva?.stages[0];
    if (!stage) return null;
    return { x: stage.x(), y: stage.y(), zoom: stage.scaleX() };
  });
  if (!view) throw new Error("Konva stage not found");
  return {
    x: box.x + view.x + (docX + 0.5) * view.zoom,
    y: box.y + view.y + (docY + 0.5) * view.zoom,
  };
}

test.describe("Editor pixel brushes (issue #829)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await loadTestImage(page);
    await waitForSourceImage(page);
    await selectTool(page, "blur-brush");
  });

  test("a blur brush click adds only the brushed pixels, not a copy of the whole image", async ({
    editorPage: page,
  }) => {
    const center = await screenPointForDocumentPixel(page, 100, 75);
    await page.mouse.click(center.x, center.y);

    // One click adds exactly one stroke object.
    await expect.poll(() => countImageObjects(page), { timeout: 10_000 }).toBe(1);

    // Under the click the stroke carries the (blurred) image pixel, opaque.
    await expect
      .poll(() => readStrokeObjectPixel(page, 100, 75), { timeout: 10_000 })
      .toEqual(ORANGE);

    // Far from the click the stroke object must be transparent. Before the fix
    // it was an opaque copy of the entire document.
    const corner = await readStrokeObjectPixel(page, 2, 2);
    expect(corner).not.toBeNull();
    expect(corner?.a).toBe(0);

    // The default brush is 10px wide, so the dab's bounding square runs to
    // (105,80). That pixel sits outside the brush circle and must stay
    // transparent too: copying the whole square would leave it opaque.
    const outsideCircle = await readStrokeObjectPixel(page, 105, 80);
    expect(outsideCircle?.a).toBe(0);
  });

  test("a blur brush drag keeps the image pixels along the whole stroke", async ({
    editorPage: page,
  }) => {
    const start = await screenPointForDocumentPixel(page, 60, 75);
    const end = await screenPointForDocumentPixel(page, 140, 75);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => countImageObjects(page), { timeout: 10_000 }).toBe(1);

    // Later dabs read from the working buffer. Reading from the stroke canvas
    // instead would blend transparent black into the far end of the stroke.
    await expect
      .poll(() => readStrokeObjectPixel(page, 140, 75), { timeout: 10_000 })
      .toEqual(ORANGE);

    const corner = await readStrokeObjectPixel(page, 2, 2);
    expect(corner).not.toBeNull();
    expect(corner?.a).toBe(0);
  });
});

// Same defect in the dodge, burn and sponge brushes (issue #1038): their hook
// seeded the stroke canvas with the whole document snapshot too. Each of them
// changes the colour under the brush on this fixture (or leaves it alone, for a
// sponge on an already saturated colour), so only alpha is asserted here.
for (const tool of ["dodge", "burn", "sponge"] as const) {
  test.describe(`Editor ${tool} brush (issue #1038)`, () => {
    test.beforeEach(async ({ editorPage: page }) => {
      await loadTestImage(page);
      await waitForSourceImage(page);
      await selectTool(page, tool);
    });

    test(`a ${tool} click adds only the brushed pixels, not a copy of the whole image`, async ({
      editorPage: page,
    }) => {
      const center = await screenPointForDocumentPixel(page, 100, 75);
      await page.mouse.click(center.x, center.y);

      await expect.poll(() => countImageObjects(page), { timeout: 10_000 }).toBe(1);

      await expect
        .poll(async () => (await readStrokeObjectPixel(page, 100, 75))?.a, { timeout: 10_000 })
        .toBe(255);

      const corner = await readStrokeObjectPixel(page, 2, 2);
      expect(corner).not.toBeNull();
      expect(corner?.a).toBe(0);

      // (105,80) is inside the dab's bounding square but outside the circle.
      const outsideCircle = await readStrokeObjectPixel(page, 105, 80);
      expect(outsideCircle?.a).toBe(0);
    });

    test(`a ${tool} drag keeps the brushed pixels along the whole stroke`, async ({
      editorPage: page,
    }) => {
      const start = await screenPointForDocumentPixel(page, 60, 75);
      const end = await screenPointForDocumentPixel(page, 140, 75);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 8 });
      await page.mouse.up();

      await expect.poll(() => countImageObjects(page), { timeout: 10_000 }).toBe(1);
      await expect
        .poll(async () => (await readStrokeObjectPixel(page, 140, 75))?.a, { timeout: 10_000 })
        .toBe(255);

      const corner = await readStrokeObjectPixel(page, 2, 2);
      expect(corner?.a).toBe(0);
    });

    // A dab centred outside the document has no pixels to read. It used to throw
    // from getImageData and, further out, write transparent black into the
    // stroke (issue #2071). Dabs off the edge are skipped instead.
    test(`a ${tool} drag past the left edge and back does not throw or erase the stroke`, async ({
      editorPage: page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      const start = await screenPointForDocumentPixel(page, 30, 75);
      const beyondEdge = await screenPointForDocumentPixel(page, -50, 75);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(beyondEdge.x, beyondEdge.y, { steps: 40 });
      await page.mouse.move(start.x, start.y, { steps: 40 });
      await page.mouse.up();

      await expect.poll(() => countImageObjects(page), { timeout: 10_000 }).toBe(1);
      // The brush crossed x = 2 on the way out and back, so it stays painted.
      await expect
        .poll(async () => (await readStrokeObjectPixel(page, 2, 75))?.a, { timeout: 10_000 })
        .toBe(255);
      expect(pageErrors).toEqual([]);
    });
  });
}
