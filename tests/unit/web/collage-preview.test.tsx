// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { CollagePreview } from "@/components/tools/collage-preview";
import { CollageSettings } from "@/components/tools/collage-settings";
import { useCollageStore } from "@/stores/collage-store";

function imageFile(name: string) {
  return new File([new ArrayBuffer(64)], name, { type: "image/png" });
}

function mockRect(el: HTMLElement, left: number, top = 0, width = 180, height = 180) {
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

function touchInit(x: number, y: number, identifier = 0) {
  const point = { identifier, clientX: x, clientY: y, pageX: x, pageY: y };
  return {
    touches: [point],
    targetTouches: [point],
    changedTouches: [point],
  };
}

describe("CollagePreview touch and mouse cell reordering (#2596)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:collage-img"),
        revokeObjectURL: vi.fn(),
      }),
    );
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    useCollageStore.getState().reset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderSelectedCellGrid() {
    useCollageStore.getState().addImages([imageFile("first.png"), imageFile("second.png")]);
    useCollageStore.getState().setSelectedCell(0);
    render(<CollagePreview />);

    const cell1 = screen.getByRole("button", { name: "Collage cell 1" });
    const cell2 = screen.getByRole("button", { name: "Collage cell 2" });
    const grip = screen.getByRole("button", { name: "Drag to reorder" });
    // DragOverlay mounts dynamically on drag start; give unmocked elements (including
    // the overlay node) a non-zero initial rect at the grip position so rectIntersection
    // has positive area in jsdom.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 150,
      y: 10,
      left: 150,
      top: 10,
      right: 174,
      bottom: 34,
      width: 24,
      height: 24,
      toJSON: () => ({}),
    });
    mockRect(cell1, 0, 0, 180, 180);
    mockRect(cell2, 200, 0, 180, 180);
    mockRect(grip, 150, 10, 24, 24);
    return { cell1, cell2, grip };
  }

  it("swaps cells on a touch press-and-hold across pointerdown and pointercancel without panning the cell image", async () => {
    const { grip } = renderSelectedCellGrid();
    expect(useCollageStore.getState().cellAssignments).toEqual([0, 1]);

    act(() => {
      fireEvent.pointerDown(grip, {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: 160,
        clientY: 20,
      });
      fireEvent.touchStart(grip, touchInit(160, 20));
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    act(() => {
      fireEvent.pointerMove(window, {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        buttons: 1,
        clientX: 280,
        clientY: 90,
      });
      fireEvent.pointerCancel(grip, { pointerId: 1, pointerType: "touch", isPrimary: true });
      fireEvent.touchMove(grip, touchInit(280, 90));
    });

    await act(async () => {
      fireEvent.touchEnd(grip, {
        touches: [],
        targetTouches: [],
        changedTouches: [{ identifier: 0, clientX: 280, clientY: 90 }],
      });
    });

    await waitFor(() => {
      expect(useCollageStore.getState().cellAssignments).toEqual([1, 0]);
    });
    expect(useCollageStore.getState().selectedCell).toBe(1);
    expect(useCollageStore.getState().cellTransforms[0]).toBeUndefined();
    expect(useCollageStore.getState().cellTransforms[1]).toBeUndefined();
    expect(Object.keys(useCollageStore.getState().cellTransforms)).toHaveLength(0);
    expect(grip.className).toContain("select-none");
    expect(grip.className).toContain("[-webkit-touch-callout:none]");
  });

  it("cancels touch drag on an immediate swipe before the 300ms hold delay", async () => {
    const { grip } = renderSelectedCellGrid();

    act(() => {
      fireEvent.touchStart(grip, touchInit(160, 20));
      fireEvent.touchMove(grip, touchInit(160, 80));
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
      fireEvent.touchMove(grip, touchInit(280, 90));
      fireEvent.touchEnd(grip, {
        touches: [],
        targetTouches: [],
        changedTouches: [{ identifier: 0, clientX: 280, clientY: 90 }],
      });
    });

    expect(useCollageStore.getState().cellAssignments).toEqual([0, 1]);
    expect(useCollageStore.getState().cellTransforms[0]).toBeUndefined();
  });

  it("swaps cells on a desktop mouse drag without panning the cell image", async () => {
    const { grip } = renderSelectedCellGrid();

    act(() => {
      fireEvent.pointerDown(grip, {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: 160,
        clientY: 20,
      });
      fireEvent.mouseDown(grip, { button: 0, clientX: 160, clientY: 20 });
      fireEvent.mouseMove(document, { clientX: 170, clientY: 20 });
    });

    act(() => {
      fireEvent.pointerMove(window, {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        buttons: 1,
        clientX: 280,
        clientY: 90,
      });
      fireEvent.mouseMove(document, { clientX: 280, clientY: 90 });
    });

    await act(async () => {
      fireEvent.mouseUp(document, { clientX: 280, clientY: 90 });
    });

    await waitFor(() => {
      expect(useCollageStore.getState().cellAssignments).toEqual([1, 0]);
    });
    expect(useCollageStore.getState().selectedCell).toBe(1);
    expect(useCollageStore.getState().cellTransforms[0]).toBeUndefined();
  });

  it("moves a populated cell with its transform and selection into an empty cell when dragged (#3700)", async () => {
    const { cell1, cell2, grip } = renderSelectedCellGrid();
    act(() => {
      useCollageStore.getState().setCellTransform(1, { zoom: 3, objectFit: "contain" });
      useCollageStore.getState().setCellAssignment(1, -1);
      useCollageStore
        .getState()
        .setCellTransform(0, { zoom: 2.2, panX: 15, panY: -10, objectFit: "contain" });
    });
    expect(useCollageStore.getState().cellAssignments).toEqual([0, -1]);
    expect(cell2.style.backgroundColor).toBe("");

    act(() => {
      fireEvent.pointerDown(grip, {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: 160,
        clientY: 20,
      });
      fireEvent.touchStart(grip, touchInit(160, 20));
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    act(() => {
      fireEvent.pointerCancel(grip, { pointerId: 1, pointerType: "touch", isPrimary: true });
      fireEvent.touchMove(grip, touchInit(280, 90));
    });

    await act(async () => {
      fireEvent.touchEnd(grip, {
        touches: [],
        targetTouches: [],
        changedTouches: [{ identifier: 0, clientX: 280, clientY: 90 }],
      });
    });

    await waitFor(() => {
      expect(useCollageStore.getState().cellAssignments).toEqual([-1, 0]);
    });
    const state = useCollageStore.getState();
    expect(state.selectedCell).toBe(1);
    expect(state.cellTransforms[0]).toBeUndefined();
    expect(Object.hasOwn(state.cellTransforms, 0)).toBe(false);
    expect(cell1.style.backgroundColor).toBe("");
    expect(state.cellTransforms[1]).toEqual({
      zoom: 2.2,
      panX: 15,
      panY: -10,
      objectFit: "contain",
    });
  });

  it("ignores drag-end when the source cell becomes empty mid-drag", async () => {
    const { grip } = renderSelectedCellGrid();
    act(() => {
      useCollageStore.getState().setCellTransform(1, { zoom: 1.8 });
    });

    act(() => {
      fireEvent.pointerDown(grip, {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: 160,
        clientY: 20,
      });
      fireEvent.touchStart(grip, touchInit(160, 20));
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    act(() => {
      fireEvent.pointerCancel(grip, { pointerId: 1, pointerType: "touch", isPrimary: true });
      fireEvent.touchMove(grip, touchInit(280, 90));
      useCollageStore.getState().setCellAssignment(0, -1);
    });

    await act(async () => {
      fireEvent.touchEnd(grip, {
        touches: [],
        targetTouches: [],
        changedTouches: [{ identifier: 0, clientX: 280, clientY: 90 }],
      });
    });

    const state = useCollageStore.getState();
    expect(state.cellAssignments).toEqual([-1, 1]);
    expect(state.cellTransforms[1]?.zoom).toBe(1.8);
    expect(state.selectedCell).toBeNull();
  });

  it("still pans the image when dragging the selected cell body outside the toolbar", () => {
    const { cell1 } = renderSelectedCellGrid();

    act(() => {
      fireEvent.touchStart(cell1, touchInit(50, 90));
      fireEvent.touchMove(cell1, touchInit(86, 90));
      fireEvent.touchEnd(cell1, {
        touches: [],
        targetTouches: [],
        changedTouches: [{ identifier: 0, clientX: 86, clientY: 90 }],
      });
    });

    expect(useCollageStore.getState().cellTransforms[0]?.panX).toBeGreaterThan(0);
    expect(useCollageStore.getState().cellAssignments).toEqual([0, 1]);
  });

  it("clears source cell dimming when an active touch drag is cancelled and does not pan from the zoom toolbar", async () => {
    const { cell1, grip } = renderSelectedCellGrid();

    act(() => {
      fireEvent.touchStart(grip, touchInit(160, 20));
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(cell1.className).toContain("opacity-50");

    await act(async () => {
      fireEvent.touchCancel(grip, {
        touches: [],
        targetTouches: [],
        changedTouches: [{ identifier: 0, clientX: 160, clientY: 20 }],
      });
    });

    await waitFor(() => {
      expect(cell1.className).not.toContain("opacity-50");
    });

    // Touching and moving the bottom zoom slider must not pan the cell image
    const slider = screen.getByRole("slider");
    act(() => {
      fireEvent.pointerDown(slider, {
        pointerId: 2,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: 40,
        clientY: 170,
      });
      fireEvent.touchStart(slider, touchInit(40, 170, 1));
      fireEvent.touchMove(slider, touchInit(120, 170, 1));
      fireEvent.touchEnd(slider, {
        touches: [],
        targetTouches: [],
        changedTouches: [{ identifier: 1, clientX: 120, clientY: 170 }],
      });
    });
    expect(useCollageStore.getState().cellTransforms[0]).toBeUndefined();

    // Pressing Escape on the grip button deselects the cell
    fireEvent.keyDown(grip, { key: "Escape", code: "Escape" });
    expect(useCollageStore.getState().selectedCell).toBeNull();
  });

  it("does not select an empty placeholder cell or set touchAction: none when clicked or activated via keyboard (#3799)", () => {
    useCollageStore.getState().addImages([imageFile("first.png"), imageFile("second.png")]);
    useCollageStore.getState().setTemplateId("3-h-equal");
    render(<CollagePreview />);

    const cell1 = screen.getByRole("button", { name: "Collage cell 1" });
    const cell3 = screen.getByRole("button", { name: "Collage cell 3" });

    expect(useCollageStore.getState().cellAssignments).toEqual([0, 1, -1]);
    expect(useCollageStore.getState().selectedCell).toBeNull();
    expect(cell3.style.touchAction).toBe("auto");

    // Clicking empty cell 3 when nothing is selected leaves selectedCell null and touchAction auto
    fireEvent.click(cell3);
    expect(useCollageStore.getState().selectedCell).toBeNull();
    expect(cell3.className).not.toContain("ring-offset-1");
    expect(cell3.style.touchAction).toBe("auto");

    // Keyboard activation (Enter and Space) on empty cell 3 also does not select it
    fireEvent.keyDown(cell3, { key: "Enter", code: "Enter" });
    expect(useCollageStore.getState().selectedCell).toBeNull();
    fireEvent.keyDown(cell3, { key: " ", code: "Space" });
    expect(useCollageStore.getState().selectedCell).toBeNull();

    // Selecting populated cell 1, then clicking empty cell 3 preserves cell 1's selection
    fireEvent.click(cell1);
    expect(useCollageStore.getState().selectedCell).toBe(0);
    expect(cell1.className).toContain("ring-offset-1");
    expect(cell1.style.touchAction).toBe("none");

    fireEvent.click(cell3);
    expect(useCollageStore.getState().selectedCell).toBe(0);
    expect(cell3.className).not.toContain("ring-offset-1");
    expect(cell3.style.touchAction).toBe("auto");

    // Keyboard activation (Enter and Space) on a populated cell still selects it
    const cell2 = screen.getByRole("button", { name: "Collage cell 2" });
    fireEvent.keyDown(cell2, { key: "Enter", code: "Enter" });
    expect(useCollageStore.getState().selectedCell).toBe(1);
    expect(cell2.className).toContain("ring-offset-1");
    expect(cell2.style.touchAction).toBe("none");

    fireEvent.keyDown(cell1, { key: " ", code: "Space" });
    expect(useCollageStore.getState().selectedCell).toBe(0);

    // Even if selectedCell is set directly to an empty cell index, CollageCanvas does not mark it selected
    act(() => {
      useCollageStore.getState().setSelectedCell(2);
    });
    expect(cell3.className).not.toContain("ring-offset-1");
    expect(cell3.style.touchAction).toBe("auto");

    // Out-of-bounds positive cellAssignments also resolve img to null and do not mark the cell selected
    act(() => {
      useCollageStore.getState().setCellAssignment(2, 99);
      useCollageStore.getState().setSelectedCell(2);
    });
    expect(cell3.className).not.toContain("ring-offset-1");
    expect(cell3.style.touchAction).toBe("auto");
  });

  it("submits cells with imageIndex -1 for empty slots and sequential upload indices for populated slots (#3796)", () => {
    const first = imageFile("first.png");
    const second = imageFile("second.png");
    useCollageStore.getState().addImages([first, second]);
    useCollageStore.getState().setTemplateId("3-h-equal");
    // Initial assignments for 2 images in 3-h-equal: [0, 1, -1].
    // Swap cell 0 onto empty cell 2 so assignments become [-1, 1, 0].
    useCollageStore.getState().swapCells(0, 2);
    useCollageStore
      .getState()
      .setCellTransform(2, { zoom: 2, panX: 15, panY: -10, objectFit: "contain" });

    let sentFormData: FormData | null = null;
    class FakeXhr {
      upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      status = 200;
      responseText = "";
      open = vi.fn();
      setRequestHeader = vi.fn();
      abort = vi.fn();
      send = vi.fn((body: FormData) => {
        sentFormData = body;
      });
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);

    render(<CollageSettings />);
    fireEvent.click(screen.getByTestId("collage-submit"));

    if (!sentFormData) {
      throw new Error("Expected CollageSettings to send FormData");
    }
    const files = (sentFormData as FormData).getAll("file");
    expect(files).toEqual([second, first]);

    const settings = JSON.parse((sentFormData as FormData).get("settings") as string);
    expect(settings.templateId).toBe("3-h-equal");
    expect(settings.cells).toEqual([
      { imageIndex: -1, panX: 0, panY: 0, zoom: 1, objectFit: "cover" },
      { imageIndex: 0, panX: 0, panY: 0, zoom: 1, objectFit: "cover" },
      { imageIndex: 1, panX: 15, panY: -10, zoom: 2, objectFit: "contain" },
    ]);
  });
});
