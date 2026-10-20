import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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
const FIXTURE_BYTES = readFileSync(FIXTURE);
const CROSS_ORIGIN_URL = "https://images.example.test/photo.png";

function pngSize(file: string): [number, number] {
  const png = readFileSync(file);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

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
    page.on("pageerror", (err) => pageErrors.push(`${err.name}: ${err.message}`));
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

  test("exports a ?url= image and a cross-origin image object from a second origin with CORS headers, and shows a toast without CORS headers (issue #2133)", async ({
    editorPage: page,
  }) => {
    let sendCors = true;
    const server: Server = createServer((_req, res) => {
      const headers: Record<string, string | number> = {
        "Content-Type": "image/png",
        "Content-Length": FIXTURE_BYTES.length,
        "Cache-Control": "no-store",
      };
      if (sendCors) {
        headers["Access-Control-Allow-Origin"] = "*";
      }
      res.writeHead(200, headers);
      res.end(FIXTURE_BYTES);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const secondOriginBase = `http://127.0.0.1:${port}`;

    try {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(`${err.name}: ${err.message}`));

      await page.goto(`/editor?url=${encodeURIComponent(`${secondOriginBase}/source.png`)}`);
      await waitForSourceImage(page);

      // Export the ?url= source image directly first to verify it doesn't taint the stage.
      await page.keyboard.press("Control+Shift+s");
      await expect(page.getByText("Export Image")).toBeVisible();
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      const firstDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const firstDownloadPath = await (await firstDownloadPromise).path();
      expect(firstDownloadPath).toBeTruthy();
      expect(pngSize(firstDownloadPath as string)).toEqual([200, 150]);

      // Load a project containing both a cross-origin source image and a cross-origin
      // image object to verify neither taints the stage before export.
      const chooserPromise = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Load Project" }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: "cross-origin.snapotter",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            version: 1,
            canvasSize: { width: 200, height: 150 },
            sourceImageUrl: `${secondOriginBase}/source-2.png`,
            sourceImageSize: { width: 200, height: 150 },
            objects: [
              {
                id: "overlay-cors",
                type: "image",
                layerId: "layer-1",
                attrs: {
                  src: `${secondOriginBase}/overlay.png`,
                  x: 0,
                  y: 0,
                  width: 50,
                  height: 50,
                  rotation: 0,
                  opacity: 1,
                },
              },
            ],
            layers: [
              {
                id: "layer-1",
                name: "Layer 1",
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: "normal",
                thumbnail: null,
              },
            ],
          }),
        ),
      });
      await expect(page.getByText("Export Image")).toBeHidden();
      await waitForSourceImage(page);
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const stage = (window as unknown as StageView).Konva?.stages[0];
              return Boolean(
                stage?.find("Image").some((node) => node.id() === "overlay-cors" && node.image()),
              );
            }),
          { timeout: 10_000 },
        )
        .toBe(true);

      await page.keyboard.press("Control+Shift+s");
      await expect(page.getByText("Export Image")).toBeVisible();
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const downloadPath = await (await downloadPromise).path();
      expect(downloadPath).toBeTruthy();
      expect(pngSize(downloadPath as string)).toEqual([200, 150]);
      expect(pageErrors.filter((m) => m.includes("SecurityError"))).toEqual([]);

      // Now serve without Access-Control-Allow-Origin and confirm opening shows the error toast.
      sendCors = false;
      await page.goto(`/editor?url=${encodeURIComponent(`${secondOriginBase}/no-cors.png`)}`);
      await expect(page.locator("[data-sonner-toast]")).toContainText(/couldn't load the image/i, {
        timeout: 10_000,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

test.describe("Editor pixel tools: refused capture (issue #1040)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await loadTestImage(page);
    await waitForSourceImage(page);
  });

  // Stand in for a browser past its canvas limit. Chromium and WebKit do not return
  // null there: they hand out a context that draws nothing and reads back zeros.
  // From here on, any canvas the size of the document gets such a context.
  async function makeDocumentSizedContextsDead(page: Page): Promise<void> {
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
        const ctx = (original as (...a: unknown[]) => unknown).apply(this, args);
        if (!ctx || this.width !== 200 || this.height !== 150) return ctx;
        const real = ctx as CanvasRenderingContext2D;
        return new Proxy(real, {
          get(target, prop) {
            if (prop === "getImageData") {
              return (_x: number, _y: number, w: number, h: number) => target.createImageData(w, h);
            }
            if (prop === "putImageData" || prop === "drawImage" || prop === "fillRect") {
              return () => undefined;
            }
            const value = Reflect.get(target, prop);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, prop, value) {
            Reflect.set(target, prop, value);
            return true;
          },
        });
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
      await makeDocumentSizedContextsDead(page);

      const at = await documentPoint(page, 100, 75);
      await page.mouse.click(at.x, at.y);

      await expect(page.locator("[data-sonner-toast]")).toContainText(/too big/i, {
        timeout: 10_000,
      });
      expect(await countImageObjects(page)).toBe(0);
    });
  }
});

test.describe("Editor layer-sized captures: refused encode (issue #2165)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await loadTestImage(page);
    await waitForSourceImage(page);
  });

  async function makeDocumentSizedCanvasFailToEncode(page: Page): Promise<void> {
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement, ...args) {
        if (this.width === 200 && this.height === 150) return "data:,";
        return (original as (...a: unknown[]) => string).apply(this, args);
      };
    });
  }

  test("gradient says so when the layer canvas can't be encoded", async ({ editorPage: page }) => {
    await selectTool(page, "gradient");
    await makeDocumentSizedCanvasFailToEncode(page);

    const from = await documentPoint(page, 10, 10);
    const to = await documentPoint(page, 100, 75);

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();

    await expect(page.locator("[data-sonner-toast]")).toContainText(/too big/i, {
      timeout: 10_000,
    });
    expect(await countImageObjects(page)).toBe(0);
  });

  test("fill dialog says so when the layer canvas can't be encoded", async ({
    editorPage: page,
  }) => {
    await makeDocumentSizedCanvasFailToEncode(page);

    await page.keyboard.press("Shift+Backspace");
    const dialog = page.locator("div[role='dialog'][aria-label='Fill']");
    await expect(dialog).toBeVisible();
    await dialog.locator("button").filter({ hasText: "OK" }).click();

    await expect(page.locator("[data-sonner-toast]")).toContainText(/too big/i, {
      timeout: 10_000,
    });
    expect(await countImageObjects(page)).toBe(0);
  });
});
