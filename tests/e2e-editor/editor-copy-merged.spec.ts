import type { BrowserContext, Page } from "@playwright/test";
import { expect, loadTestImage, test } from "./helpers";

// #1944: Copy Merged said nothing when the copy failed, and the Edit menu row
// ran plain Copy instead of copying the flattened image.
// #1979: WebKit drops the user gesture if navigator.clipboard.write is called
// after awaiting the export, and a rejected write left nothing in the console.

const COPY_FAILED = "Copy failed";

async function openCopyMerged(page: Page) {
  await page.click('[data-testid="menu-edit"]');
  await page.click('[data-testid="menu-item-copy-merged"]');
}

async function pageModKey(page: Page): Promise<"Meta" | "Control"> {
  const isMac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent));
  return isMac ? "Meta" : "Control";
}

/**
 * Prepare the page so the test can read back the PNG written to the clipboard.
 * Chromium supports clipboard-read/clipboard-write permissions and
 * navigator.clipboard.read(). WebKit has neither permission in Playwright and
 * blocks headless clipboard.read() behind a native paste callout, so we wrap
 * navigator.clipboard.write: the real WebKit write still runs first (and throws
 * NotAllowedError if the user gesture was lost), and the items it accepts are
 * saved for inspection.
 */
async function prepareImageClipboard(
  page: Page,
  context: BrowserContext,
  browserName: string,
): Promise<void> {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText("before-copy"));
    return;
  }
  await page.evaluate(() => {
    const win = window as unknown as { __copiedItems?: ClipboardItem[] };
    win.__copiedItems = [];
    const clip = navigator.clipboard;
    const origWrite = clip.write.bind(clip);
    clip.write = async (items: ClipboardItems) => {
      await origWrite(items);
      win.__copiedItems = [...items];
    };
  });
}

async function waitForClipboardPng(page: Page, browserName: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (isChromium) => {
        const items = isChromium
          ? await navigator.clipboard.read()
          : ((window as unknown as { __copiedItems?: ClipboardItem[] }).__copiedItems ?? []);
        return items.flatMap((item) => [...item.types]);
      }, browserName === "chromium"),
    )
    .toContain("image/png");
}

async function readClipboardPng(page: Page, browserName: string) {
  return page.evaluate(async (isChromium) => {
    const items = isChromium
      ? await navigator.clipboard.read()
      : ((window as unknown as { __copiedItems?: ClipboardItem[] }).__copiedItems ?? []);
    const [item] = items;
    const bitmap = await createImageBitmap(await item.getType("image/png"));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: [at(0, 0), at(199, 0), at(0, 149), at(199, 149), at(100, 75)],
    };
  }, browserName === "chromium");
}

test.describe("Copy Merged", () => {
  test("Edit > Copy Merged puts the image on the clipboard", async ({
    editorPage: page,
    context,
    browserName,
  }) => {
    await loadTestImage(page);
    await page.locator("canvas").first().waitFor({ state: "visible" });
    await prepareImageClipboard(page, context, browserName);

    await openCopyMerged(page);

    await waitForClipboardPng(page, browserName);
    // The fixture loadTestImage serves is 200x150; the copy is the document, not the workspace.
    const copy = await readClipboardPng(page, browserName);
    expect({ width: copy.width, height: copy.height }).toEqual({ width: 200, height: 150 });
    await expect(page.getByText(COPY_FAILED)).toHaveCount(0);
  });

  test("copies the whole document, not the zoomed and panned view (#1978)", async ({
    editorPage: page,
    context,
    browserName,
  }) => {
    await loadTestImage(page);
    await page.locator("canvas").first().click();
    const mod = await pageModKey(page);
    // Zoom in so the stage's own transform is far from identity. Fit-to-screen
    // has already centred the image with a pan offset.
    await page.keyboard.press(`${mod}+Equal`);
    await page.keyboard.press(`${mod}+Equal`);
    await prepareImageClipboard(page, context, browserName);

    await page.keyboard.press(`${mod}+Shift+C`);

    // The fixture is a solid (255, 100, 50) 200x150 PNG, so every pixel of the
    // copy, corners included, has to be that colour. A viewport copy has the
    // image shifted and scaled, leaving transparent workspace in the corners.
    await waitForClipboardPng(page, browserName);
    const copy = await readClipboardPng(page, browserName);
    expect(copy.width).toBe(200);
    expect(copy.height).toBe(150);
    for (const pixel of copy.pixels) expect(pixel).toEqual([255, 100, 50, 255]);
  });

  test("File > Export As > Copy puts the image on the clipboard (#1979)", async ({
    editorPage: page,
    context,
    browserName,
  }) => {
    await loadTestImage(page);
    await page.locator("canvas").first().click();
    const mod = await pageModKey(page);
    await page.keyboard.press(`${mod}+Shift+S`);
    await expect(page.getByText("Export Image")).toBeVisible();
    await prepareImageClipboard(page, context, browserName);

    await page.getByRole("button", { name: "Copy", exact: true }).click();

    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
    await waitForClipboardPng(page, browserName);
    const copy = await readClipboardPng(page, browserName);
    expect({ width: copy.width, height: copy.height }).toEqual({ width: 200, height: 150 });
  });

  test("logs the rejection when navigator.clipboard.write refuses the copy (#1979)", async ({
    editorPage: page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await loadTestImage(page);
    await page.locator("canvas").first().waitFor({ state: "visible" });
    await page.evaluate(() => {
      navigator.clipboard.write = async () => {
        throw new DOMException("The request is not allowed", "NotAllowedError");
      };
    });

    await openCopyMerged(page);
    await expect(page.locator("[data-sonner-toast]").getByText(COPY_FAILED)).toBeVisible();
    expect(
      consoleErrors.some(
        (line) =>
          line.includes("Failed to copy image to clipboard:") && line.includes("NotAllowedError"),
      ),
    ).toBe(true);
  });

  test("says so when the browser has no image clipboard", async ({ editorPage: page }) => {
    // A plain-http install has no ClipboardItem; copyImageToClipboard can't copy there.
    await page.addInitScript(() => {
      // biome-ignore lint/suspicious/noExplicitAny: removing a global the page would otherwise see
      delete (window as any).ClipboardItem;
    });
    await loadTestImage(page);
    await page.locator("canvas").first().waitFor({ state: "visible" });

    await openCopyMerged(page);
    await expect(page.locator("[data-sonner-toast]").getByText(COPY_FAILED)).toBeVisible();
  });

  // The app reads `mod` from navigator.userAgent. Pinning a Windows UA and a
  // macOS UA tests both Ctrl+Shift+C and Cmd+Shift+C across Chromium and WebKit
  // (#2149).
  test.describe("with a Windows user agent", () => {
    test.use({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });

    test("Ctrl+Shift+C says so too", async ({ editorPage: page }) => {
      await page.addInitScript(() => {
        // biome-ignore lint/suspicious/noExplicitAny: removing a global the page would otherwise see
        delete (window as any).ClipboardItem;
      });
      await loadTestImage(page);
      await page.locator("canvas").first().click();

      await page.keyboard.press("Control+Shift+C");
      await expect(page.locator("[data-sonner-toast]").getByText(COPY_FAILED)).toBeVisible();
    });
  });

  test.describe("with a macOS user agent", () => {
    test.use({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });

    test("Cmd+Shift+C says so too", async ({ editorPage: page }) => {
      await page.addInitScript(() => {
        // biome-ignore lint/suspicious/noExplicitAny: removing a global the page would otherwise see
        delete (window as any).ClipboardItem;
      });
      await loadTestImage(page);
      await page.locator("canvas").first().click();

      await page.keyboard.press("Meta+Shift+C");
      await expect(page.locator("[data-sonner-toast]").getByText(COPY_FAILED)).toBeVisible();
    });
  });
});
