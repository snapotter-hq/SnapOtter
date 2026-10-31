// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDocument = vi.hoisted(() => vi.fn());
const captureHandledError = vi.hoisted(() => vi.fn());
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), captureHandledError }));
vi.mock("@/components/tools/document-view", () => ({
  DocumentView: () => <div data-testid="document-view-fallback">Document view</div>,
}));

import { OrganizePdfCanvas } from "@/components/tools/organize-pdf-canvas";
import { useFileStore } from "@/stores/file-store";
import { useOrganizeStore } from "@/stores/organize-store";

function pdfFile(name = "pages.pdf") {
  const f = new File(["%PDF-1.4"], name, { type: "application/pdf" });
  f.arrayBuffer = async () => new ArrayBuffer(8);
  return f;
}

function mockCardRect(el: HTMLElement, index: number) {
  const left = index * 150;
  const top = 0;
  const width = 140;
  const height = 200;
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  });
}

describe("OrganizePdfCanvas touch and mouse reordering (#2256)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: vi.fn(() => "blob:pdf"), revokeObjectURL: vi.fn() }),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,stub",
    );
    useFileStore.getState().reset();
    useOrganizeStore.getState().clear();
    captureHandledError.mockReset();
    getDocument.mockReset();
    getDocument.mockImplementation(() => ({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async () => ({
          getViewport: () => ({ width: 100, height: 140 }),
          render: () => ({ promise: Promise.resolve() }),
          cleanup: () => {},
        }),
      }),
      destroy: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderLoadedGrid() {
    const file = pdfFile();
    useFileStore.getState().setFiles([file]);
    render(<OrganizePdfCanvas />);
    const card1 = await screen.findByTestId("organize-page-1");
    const card2 = screen.getByTestId("organize-page-2");
    const card3 = screen.getByTestId("organize-page-3");
    mockCardRect(card1, 0);
    mockCardRect(card2, 1);
    mockCardRect(card3, 2);
    return { card1, card2, card3 };
  }

  it("reorders pages on a touch press-and-hold even when the browser fires pointerdown and pointercancel", async () => {
    const { card1 } = await renderLoadedGrid();
    expect(useOrganizeStore.getState().pageOrder).toEqual([1, 2, 3]);

    // On mobile browsers, a finger press dispatches pointerdown(touch) before touchstart.
    // Once the finger moves on a pan-enabled surface, the browser dispatches pointercancel.
    act(() => {
      fireEvent.pointerDown(card1, {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: 70,
        clientY: 100,
      });
      fireEvent.touchStart(card1, {
        touches: [{ identifier: 0, clientX: 70, clientY: 100 }],
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    act(() => {
      fireEvent.pointerCancel(card1, { pointerId: 1, pointerType: "touch", isPrimary: true });
      fireEvent.touchMove(card1, {
        touches: [{ identifier: 0, clientX: 220, clientY: 100 }],
      });
    });

    await act(async () => {
      fireEvent.touchEnd(card1, {
        changedTouches: [{ identifier: 0, clientX: 220, clientY: 100 }],
      });
    });

    await waitFor(() => {
      expect(useOrganizeStore.getState().pageOrder).toEqual([2, 1, 3]);
    });
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    expect(screen.getByTestId("organize-reset")).toBeEnabled();
    fireEvent.click(screen.getByTestId("organize-reset"));
    expect(useOrganizeStore.getState().pageOrder).toEqual([1, 2, 3]);
  });

  it("cancels touch drag on an immediate swipe so scrolling does not reorder pages", async () => {
    const { card1 } = await renderLoadedGrid();

    act(() => {
      fireEvent.touchStart(card1, {
        touches: [{ identifier: 0, clientX: 70, clientY: 100 }],
      });
      // Immediate swipe > 5px before the 200ms hold delay elapses
      fireEvent.touchMove(card1, {
        touches: [{ identifier: 0, clientX: 70, clientY: 150 }],
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
      fireEvent.touchMove(card1, {
        touches: [{ identifier: 0, clientX: 220, clientY: 100 }],
      });
      fireEvent.touchEnd(card1, {
        changedTouches: [{ identifier: 0, clientX: 220, clientY: 100 }],
      });
    });

    expect(useOrganizeStore.getState().pageOrder).toEqual([1, 2, 3]);
  });

  it("reorders pages on a desktop mouse drag", async () => {
    const { card1 } = await renderLoadedGrid();

    act(() => {
      fireEvent.mouseDown(card1, { button: 0, clientX: 70, clientY: 100 });
      fireEvent.mouseMove(document, { clientX: 80, clientY: 100 });
    });

    act(() => {
      fireEvent.mouseMove(document, { clientX: 370, clientY: 100 });
    });

    await act(async () => {
      fireEvent.mouseUp(document, { clientX: 370, clientY: 100 });
    });

    await waitFor(() => {
      expect(useOrganizeStore.getState().pageOrder).toEqual([2, 3, 1]);
    });
  });

  it("caps auto-scroll at the end of the grid instead of stretching scrollHeight with the dragged card (#2257)", async () => {
    const { card1, card2, card3 } = await renderLoadedGrid();
    const scroller = card1.closest(".overflow-auto") as HTMLElement;
    expect(scroller).not.toBeNull();
    scroller.style.overflow = "auto";

    // Vertically stacked rows inside a 300px-tall scroller with 600px base content height
    // (maxScroll = 300px). In Chromium/Firefox, a child's downward translate3d inside the
    // scroller expands scrollHeight past the base content height.
    const baseBottoms = new Map<HTMLElement, number>([
      [card1, 200],
      [card2, 400],
      [card3, 600],
    ]);
    for (const [card, bottom] of baseBottoms) {
      const top = bottom - 180;
      vi.spyOn(card, "getBoundingClientRect").mockImplementation(() => ({
        x: 16,
        y: top - scroller.scrollTop,
        left: 16,
        top: top - scroller.scrollTop,
        right: 156,
        bottom: bottom - scroller.scrollTop,
        width: 140,
        height: 180,
        toJSON: () => ({}),
      }));
    }

    const baseScrollHeight = 600;
    const clientHeight = 300;
    const parseTranslateY = (transform: string) => {
      const match = /translate3d\([^,]+,\s*(-?\d+(?:\.\d+)?)px/.exec(transform);
      return match ? Number(match[1]) : 0;
    };
    const computeScrollHeight = () => {
      let maxBottom = baseScrollHeight;
      for (const [card, baseBottom] of baseBottoms) {
        const ty = parseTranslateY(card.style.transform);
        maxBottom = Math.max(maxBottom, baseBottom + ty);
      }
      return maxBottom;
    };

    Object.defineProperty(scroller, "clientHeight", { value: clientHeight, configurable: true });
    Object.defineProperty(scroller, "clientWidth", { value: 500, configurable: true });
    Object.defineProperty(scroller, "scrollWidth", { value: 500, configurable: true });
    Object.defineProperty(scroller, "scrollHeight", {
      get: computeScrollHeight,
      configurable: true,
    });
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: clientHeight,
      width: 500,
      height: clientHeight,
      toJSON: () => ({}),
    });
    scroller.scrollBy = vi.fn((_x: number, y: number) => {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = Math.min(maxScroll, Math.max(0, scroller.scrollTop + y));
      fireEvent.scroll(scroller);
    }) as unknown as typeof scroller.scrollBy;

    // Start dragging page 1 and hold near the bottom edge of the 300px scroller (y = 290).
    act(() => {
      fireEvent.mouseDown(card1, { button: 0, clientX: 70, clientY: 100 });
      fireEvent.mouseMove(document, { clientX: 70, clientY: 110 });
    });
    act(() => {
      fireEvent.mouseMove(document, { clientX: 70, clientY: 290 });
    });

    for (let i = 0; i < 40; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(10);
      });
    }

    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBeLessThanOrEqual(baseScrollHeight - clientHeight);
    expect(scroller.scrollHeight).toBe(baseScrollHeight);
    expect(screen.getByTestId("organize-drag-overlay")).toBeInTheDocument();
    expect(card1.className).toContain("opacity-40");

    await act(async () => {
      fireEvent.mouseUp(document, { clientX: 70, clientY: 290 });
    });

    expect(screen.queryByTestId("organize-drag-overlay")).toBeNull();
    await waitFor(() => {
      expect(useOrganizeStore.getState().pageOrder).toEqual([2, 3, 1]);
    });
  });

  it("clears the drag overlay without reordering when a drag is cancelled with Escape (#2257)", async () => {
    const { card1 } = await renderLoadedGrid();
    act(() => {
      useOrganizeStore.getState().movePage(0, 2);
    });

    act(() => {
      fireEvent.mouseDown(card1, { button: 0, clientX: 370, clientY: 100 });
      fireEvent.mouseMove(document, { clientX: 220, clientY: 100 });
    });

    const overlay = screen.getByTestId("organize-drag-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent("3");
    expect(overlay).toHaveTextContent("← 1");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    });

    expect(screen.queryByTestId("organize-drag-overlay")).toBeNull();
    expect(useOrganizeStore.getState().pageOrder).toEqual([2, 3, 1]);
  });

  it("marks rendered thumbnail images non-draggable and suppresses iOS touch callout", async () => {
    const { card1 } = await renderLoadedGrid();

    await waitFor(() => {
      expect(card1.querySelector("img")).not.toBeNull();
    });
    expect(card1.className).toContain("select-none");
    expect(card1.className).toContain("[-webkit-touch-callout:none]");
    const img = card1.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("draggable", "false");
    expect(img.className).toContain("pointer-events-none");
    expect(img.className).toContain("select-none");
  });

  it("falls back to DocumentView when the PDF fails to open", async () => {
    getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error("corrupt pdf")),
      destroy: vi.fn(),
    }));
    const file = pdfFile();
    useFileStore.getState().setFiles([file]);
    render(<OrganizePdfCanvas />);

    expect(await screen.findByTestId("document-view-fallback")).toBeInTheDocument();
  });

  it("keeps numbered placeholders when page thumbnails fail and reports only the first failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getDocument.mockImplementation(() => ({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async (n: number) => {
          if (n <= 2) throw new Error(`page ${n} failed`);
          return {
            getViewport: () => ({ width: 100, height: 140 }),
            render: () => ({ promise: Promise.resolve() }),
            cleanup: () => {},
          };
        },
      }),
      destroy: vi.fn(),
    }));

    const { card1, card2, card3 } = await renderLoadedGrid();
    await waitFor(() => {
      expect(card3.querySelector("img")).not.toBeNull();
    });
    expect(card1.querySelector("img")).toBeNull();
    expect(card2.querySelector("img")).toBeNull();
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});
