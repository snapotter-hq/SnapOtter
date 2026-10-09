// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * On a phone the Sign PDF page was drawn at a fixed 1.5x, so an A4 page was 893px
 * wide in a 390px area. The canvas spilled over the "Process" peek bar and the
 * Settings button and the part left of the viewport couldn't be scrolled to (#2190).
 * The page now fits the width of the area, capped at the old 1.5x, and the root
 * scrolls instead of spilling.
 */
const PAGE_W = 595; // A4 in points
const PAGE_H = 842;

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      loadingTask: { destroy: vi.fn() },
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: PAGE_W * scale,
          height: PAGE_H * scale,
        }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

// Konva needs a real canvas; the layout under test is plain DOM.
vi.mock("konva", () => {
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
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderedCanvas() {
  render(<SignCanvas fileUrl="blob:doc" />);
  const canvas = (await screen.findByTestId("sign-pdf-canvas")) as HTMLCanvasElement;
  await waitFor(() => expect(canvas.width).toBeGreaterThan(0));
  return canvas;
}

describe("SignCanvas page size", () => {
  it("fits the page to the width of a phone-sized area", async () => {
    setContainerWidth(390);

    const canvas = await renderedCanvas();

    // 390px minus the root's 16px padding on each side (a canvas size is an integer).
    expect(Math.abs(canvas.width - 358)).toBeLessThanOrEqual(1);
    expect(Math.abs(canvas.height - (358 / PAGE_W) * PAGE_H)).toBeLessThanOrEqual(1);
  });

  it("keeps the old 1.5x on a wide area instead of blowing the page up", async () => {
    setContainerWidth(1600);

    const canvas = await renderedCanvas();

    expect(Math.abs(canvas.width - PAGE_W * 1.5)).toBeLessThanOrEqual(1);
  });

  it("keeps the old 1.5x when the area has no width yet", async () => {
    setContainerWidth(0);

    const canvas = await renderedCanvas();

    expect(Math.abs(canvas.width - PAGE_W * 1.5)).toBeLessThanOrEqual(1);
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
    expect(root.className).toContain("min-w-0");
    expect(canvas.parentElement?.className).toContain("mx-auto");
  });
});
