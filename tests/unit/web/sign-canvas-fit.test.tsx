// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * On a phone the Sign PDF page was drawn at a fixed 1.5x, so an A4 page was 893px
 * wide in a 390px area. The canvas spilled over the "Process" peek bar and the
 * Settings button and the part left of the viewport couldn't be scrolled to (#2190).
 * Each page now fits the width of the area, capped at the old 1.5x, drawn with the
 * screen's pixel ratio so text stays readable, and the root scrolls instead of spilling.
 */
// Points: an A4 portrait page, then an A4 landscape page.
const PAGES = [
  { w: 595, h: 842 },
  { w: 842, h: 595 },
];

const renderSpy = vi.hoisted(() => vi.fn());

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      loadingTask: { destroy: vi.fn() },
      getPage: async (n: number) => {
        const { w, h } = PAGES[n - 1];
        return {
          getViewport: ({ scale }: { scale: number }) => ({ width: w * scale, height: h * scale }),
          render: (params: unknown) => {
            renderSpy(params);
            return { promise: Promise.resolve() };
          },
        };
      },
    }),
  }),
}));

// Konva needs a real canvas; the layout under test is plain DOM. konva resolves only
// from apps/web, so the mock is given its path (a bare "konva" would mock nothing).
vi.mock("../../../apps/web/node_modules/konva", () => {
  class Node {
    on() {}
    add() {}
    nodes() {
      return [];
    }
    width() {
      return 0;
    }
    height() {
      return 0;
    }
    getChildren() {
      return [];
    }
    batchDraw() {}
    destroy() {}
  }
  return {
    default: Object.assign(Node, { Stage: Node, Layer: Node, Transformer: Node, Image: Node }),
  };
});

import { SignCanvas } from "@/components/tools/sign-canvas";

function setContainerWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
}

beforeEach(() => {
  renderSpy.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The canvas starts at 300x150 with no width attribute; a draw sets one.
async function drawn(canvas: HTMLCanvasElement) {
  await waitFor(() => expect(canvas.getAttribute("width")).not.toBeNull());
  return canvas;
}

async function renderedCanvas() {
  render(<SignCanvas fileUrl="blob:doc" />);
  return drawn((await screen.findByTestId("sign-pdf-canvas")) as HTMLCanvasElement);
}

const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

describe("SignCanvas page size", () => {
  it("fits the page to the width of a phone-sized area", async () => {
    setContainerWidth(390);

    const canvas = await renderedCanvas();

    // 390px minus the root's 16px padding on each side (a canvas size is an integer).
    near(canvas.width, 358);
    near(canvas.height, (358 / PAGES[0].w) * PAGES[0].h);
  });

  it("keeps the old 1.5x on a wide area instead of blowing the page up", async () => {
    setContainerWidth(1600);

    near((await renderedCanvas()).width, PAGES[0].w * 1.5);
  });

  it("keeps the old 1.5x when the area has no width yet", async () => {
    setContainerWidth(0);

    near((await renderedCanvas()).width, PAGES[0].w * 1.5);
  });

  it("fits each page to the width, so a landscape page after a portrait one is not cut off", async () => {
    setContainerWidth(390);
    const canvas = await renderedCanvas();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => near(canvas.height, (358 / PAGES[1].w) * PAGES[1].h));

    near(canvas.width, 358);
  });

  it("draws a page again at the scale it was first drawn at", async () => {
    setContainerWidth(390);
    const canvas = await renderedCanvas();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(canvas.height).toBeLessThan(300));

    // The area is wider by the time the user comes back (a rotation, a panel): the
    // signatures placed on page 1 were positioned against its first size.
    setContainerWidth(1000);
    fireEvent.click(screen.getByRole("button", { name: /prev/i }));

    await waitFor(() => expect(canvas.height).toBeGreaterThan(300));
    near(canvas.width, 358);
  });
});

describe("SignCanvas bitmap", () => {
  it("draws the page with the screen's pixel ratio while keeping its CSS size", async () => {
    setContainerWidth(390);
    vi.stubGlobal("devicePixelRatio", 3);

    const canvas = await renderedCanvas();

    near(canvas.width, 358 * 3);
    near(Number.parseFloat(canvas.style.width), 358);
    expect(renderSpy.mock.calls[0][0].transform).toEqual([3, 0, 0, 3, 0, 0]);
  });

  it("leaves the transform alone at a pixel ratio of 1", async () => {
    setContainerWidth(390);

    await renderedCanvas();

    expect(renderSpy.mock.calls[0][0].transform).toBeUndefined();
  });

  it("caps the bitmap so a high-DPR screen can't ask for a canvas the browser refuses", async () => {
    setContainerWidth(1600);
    vi.stubGlobal("devicePixelRatio", 20);

    const canvas = await renderedCanvas();

    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_777_216);
  });
});

describe("SignCanvas root", () => {
  it("scrolls inside the preview area instead of spilling over its siblings", async () => {
    setContainerWidth(390);
    const canvas = await renderedCanvas();

    // The root is the page's scroll container: bounded by its parent, and its
    // content centres only when it fits, so a wide page isn't clipped on the left.
    const root = canvas.parentElement?.parentElement as HTMLElement;
    expect(root.className).toContain("overflow-auto");
    expect(root.className).toContain("max-h-full");
    expect(canvas.parentElement?.className).toContain("mx-auto");
  });
});
