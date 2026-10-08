// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

const toastError = vi.hoisted(() => vi.fn());
// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({ toast: { error: toastError } }));

// The shortcut hook reaches the stage through this module; the stage is not needed.
vi.mock("@/components/editor/editor-canvas", () => ({
  editorStageRefHolder: { current: null },
}));

// Only the hook is under test. react-konva is imported for the preview components
// but never rendered here, so the real module loads fine under jsdom.
import {
  polygonalLassoRefHolder,
  useSelectionTool,
} from "@/components/editor/tools/selection-tool";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { useEditorStore } from "@/stores/editor-store";

// Every test replaces the whole store from this snapshot, so nothing leaks between them.
const INITIAL_STATE = useEditorStore.getState();
const TRIANGLE = [10, 10, 110, 10, 60, 90];

const selection = () => useEditorStore.getState().selection;

function setup(zoom = 1) {
  useEditorStore.setState({ ...INITIAL_STATE, activeTool: "lasso-poly", zoom }, true);
  const { result } = renderHook(() => useSelectionTool());
  act(() => result.current.setSelectionType("lasso"));
  const click = (x: number, y: number) => act(() => result.current.onMouseDown({ x, y }));
  // A real double-click is two presses at one spot; the browser reports the
  // second with MouseEvent.detail === 2.
  const dblclick = (x: number, y: number) => {
    click(x, y);
    act(() => result.current.onMouseDown({ x, y }, undefined, 2));
  };
  const drawTriangle = () => {
    for (let i = 0; i < TRIANGLE.length; i += 2) click(TRIANGLE[i], TRIANGLE[i + 1]);
  };
  return { result, click, dblclick, drawTriangle };
}

function setupCropOnEnter(applyImpl: () => Promise<void> = () => Promise.resolve()) {
  // The store's applyCrop returns a promise (#2070); the shortcut handles its failure.
  const applyCrop = vi.fn(applyImpl);
  const cropState = { x: 0, y: 0, width: 4, height: 4, aspectRatio: null };
  useEditorStore.setState({ ...INITIAL_STATE, isCropping: true, cropState, applyCrop }, true);
  renderHook(() => useEditorShortcuts());
  const pressEnter = () => fireEvent.keyDown(document.body, { key: "Enter", code: "Enter" });
  return { applyCrop, pressEnter };
}

afterEach(() => {
  cleanup();
  polygonalLassoRefHolder.current = null;
});

describe("polygonal lasso close gestures (#1059)", () => {
  it("closes when the first vertex is clicked, once three vertices exist", () => {
    const { result, click } = setup();
    click(10, 10);
    click(110, 10);
    click(12, 12); // near the start, but a polygon needs a third vertex first
    expect(selection()).toBeNull();
    expect(result.current.currentPoints).toEqual([10, 10, 110, 10, 12, 12]);

    click(60, 90);
    click(11, 9);
    expect(selection()).toMatchObject({ points: [10, 10, 110, 10, 12, 12, 60, 90] });
  });

  it("shows the close target once three vertices exist, lit if the pointer is already on it", () => {
    const { result, click } = setup();
    click(10, 10);
    click(110, 10);
    expect(result.current.polygonCloseTarget).toBeNull();

    click(12, 12); // the third vertex lands inside the target
    expect(result.current.polygonCloseTarget).toEqual({ x: 10, y: 10, active: true });

    act(() => result.current.onMouseMove({ x: 60, y: 90 }));
    expect(result.current.polygonCloseTarget).toEqual({ x: 10, y: 10, active: false });
  });

  it("closes from 20 canvas px away when zoomed out 4x (5 screen px, inside the target)", () => {
    const { click, drawTriangle } = setup(0.25);
    drawTriangle();
    click(30, 10);
    expect(selection()?.points).toEqual(TRIANGLE);
  });

  it("adds a vertex 3 canvas px away when zoomed in 4x (12 screen px, outside the target)", () => {
    const { result, click, drawTriangle } = setup(4);
    drawTriangle();
    click(13, 10);
    expect(selection()).toBeNull();
    expect(result.current.currentPoints).toEqual([...TRIANGLE, 13, 10]);
  });

  it("still closes on double-click, with no duplicate vertex and no stub left behind", () => {
    const { result, click, dblclick } = setup();
    click(10, 10);
    click(110, 10);
    dblclick(60, 90);
    expect(selection()?.points).toEqual(TRIANGLE);
    expect(result.current.currentPoints).toEqual([]);
  });

  it("treats quick single clicks at different spots as vertices, not a double-click", () => {
    // Konva would call the second of these a dblclick (same 400 ms window); the
    // browser's click count says 1 for each, and that is what the tool trusts.
    const { result, drawTriangle } = setup();
    drawTriangle();
    expect(result.current.currentPoints).toEqual(TRIANGLE);
    expect(selection()).toBeNull();
  });

  it("never starts a polygon from the second press of a double-click", () => {
    const { result } = setup();
    act(() => result.current.onMouseDown({ x: 10, y: 10 }, undefined, 2));
    expect(result.current.currentPoints).toEqual([]);
    expect(selection()).toBeNull();
  });

  it("closes on Enter, which reaches the tool through the shared holder", () => {
    const { drawTriangle } = setup();
    renderHook(() => useEditorShortcuts());
    drawTriangle();
    fireEvent.keyDown(document.body, { key: "Enter", code: "Enter" });
    expect(selection()?.points).toEqual(TRIANGLE);
  });

  it("discards an in-progress polygon when the tool changes", () => {
    const { result, drawTriangle } = setup();
    drawTriangle();
    act(() => useEditorStore.setState({ activeTool: "brush" }));
    expect(result.current.currentPoints).toEqual([]);
    expect(polygonalLassoRefHolder.current?.close()).toBe(false);
    expect(selection()).toBeNull();
  });

  it("leaves the freehand lasso closing on mouse-up", () => {
    useEditorStore.setState({ ...INITIAL_STATE, activeTool: "lasso-free" }, true);
    const { result } = renderHook(() => useSelectionTool());
    act(() => result.current.setSelectionType("lasso"));
    act(() => result.current.onMouseDown({ x: 10, y: 10 }));
    act(() => result.current.onMouseMove({ x: 110, y: 10 }));
    act(() => result.current.onMouseMove({ x: 60, y: 90 }));
    expect(polygonalLassoRefHolder.current?.close()).toBe(false);
    act(() => result.current.onMouseUp());
    expect(selection()?.points).toEqual(TRIANGLE);
  });

  it("gives the polygon priority over the Enter crop binding", () => {
    const { applyCrop, pressEnter } = setupCropOnEnter();
    polygonalLassoRefHolder.current = { close: () => true, cancel: () => false };
    pressEnter();
    expect(applyCrop).not.toHaveBeenCalled();
  });

  it("still applies the crop on Enter when no polygon is in progress", () => {
    const { applyCrop, pressEnter } = setupCropOnEnter();
    polygonalLassoRefHolder.current = { close: () => false, cancel: () => false };
    pressEnter();
    expect(applyCrop).toHaveBeenCalledTimes(1);
  });

  it("tells the user when the crop on Enter cannot be applied", async () => {
    const { applyCrop, pressEnter } = setupCropOnEnter(() =>
      Promise.reject(new Error("tainted canvas")),
    );
    polygonalLassoRefHolder.current = null;
    pressEnter();
    expect(applyCrop).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
  });

  it("still applies the crop on Enter when the lasso tool is not mounted", () => {
    const { applyCrop, pressEnter } = setupCropOnEnter();
    polygonalLassoRefHolder.current = null;
    pressEnter();
    expect(applyCrop).toHaveBeenCalledTimes(1);
  });

  it("discards an in-progress polygon on Escape, leaving an existing selection intact", () => {
    const existingSelection = {
      type: "lasso" as const,
      points: [0, 0, 100, 0, 100, 100],
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    };
    const { result, drawTriangle } = setup();
    act(() => {
      useEditorStore.setState({ selection: existingSelection });
    });
    renderHook(() => useEditorShortcuts());

    drawTriangle();
    expect(result.current.currentPoints).toEqual(TRIANGLE);
    expect(result.current.polygonCloseTarget).toEqual({ x: 10, y: 10, active: false });

    act(() => {
      fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    });

    expect(result.current.currentPoints).toEqual([]);
    expect(result.current.polygonCloseTarget).toBeNull();
    expect(polygonalLassoRefHolder.current?.cancel()).toBe(false);
    expect(polygonalLassoRefHolder.current?.close()).toBe(false);
    expect(selection()).toEqual(existingSelection);
  });

  it("discards a polygon with fewer than three vertices on Escape", () => {
    const { result, click } = setup();
    renderHook(() => useEditorShortcuts());
    click(10, 10);
    click(110, 10);
    expect(result.current.currentPoints).toEqual([10, 10, 110, 10]);

    act(() => {
      fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    });

    expect(result.current.currentPoints).toEqual([]);
    expect(polygonalLassoRefHolder.current?.cancel()).toBe(false);
  });

  it("gives the polygon priority over Escape deselect and crop cancellation", () => {
    const cropState = { x: 0, y: 0, width: 4, height: 4, aspectRatio: null };
    const existingSelection = {
      type: "lasso" as const,
      points: [0, 0, 100, 0, 100, 100],
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    };
    useEditorStore.setState(
      {
        ...INITIAL_STATE,
        isCropping: true,
        cropState,
        selection: existingSelection,
        selectedObjectIds: ["obj1"],
      },
      true,
    );
    renderHook(() => useEditorShortcuts());
    polygonalLassoRefHolder.current = { close: () => false, cancel: () => true };

    act(() => {
      fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    });

    expect(useEditorStore.getState().cropState).toEqual(cropState);
    expect(useEditorStore.getState().selection).toEqual(existingSelection);
    expect(useEditorStore.getState().selectedObjectIds).toEqual(["obj1"]);
  });

  it("clears selection, selected objects, and crop state on Escape when no polygon is in progress", () => {
    const cropState = { x: 0, y: 0, width: 4, height: 4, aspectRatio: null };
    const existingSelection = {
      type: "lasso" as const,
      points: [0, 0, 100, 0, 100, 100],
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    };
    useEditorStore.setState(
      {
        ...INITIAL_STATE,
        isCropping: true,
        cropState,
        selection: existingSelection,
        selectedObjectIds: ["obj1"],
      },
      true,
    );
    renderHook(() => useEditorShortcuts());
    polygonalLassoRefHolder.current = { close: () => false, cancel: () => false };

    act(() => {
      fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    });

    expect(useEditorStore.getState().cropState).toBeNull();
    expect(useEditorStore.getState().selection).toBeNull();
    expect(useEditorStore.getState().selectedObjectIds).toEqual([]);
  });
});
