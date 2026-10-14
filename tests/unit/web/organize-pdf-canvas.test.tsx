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
