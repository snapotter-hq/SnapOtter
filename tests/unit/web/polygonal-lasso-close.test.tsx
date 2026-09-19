// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

// Bypass the persist middleware so the editor store starts clean per test.
vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

// Only the hook is under test; jsdom has no canvas, so Konva renders nothing.
vi.mock("react-konva", () => new Proxy({}, { get: () => () => null }));

// The shortcut hook reaches the stage through this module; the stage is not needed.
vi.mock("@/components/editor/editor-canvas", () => ({
  editorStageRefHolder: { current: null },
}));

import {
  polygonalLassoRefHolder,
  useSelectionTool,
} from "@/components/editor/tools/selection-tool";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { useEditorStore } from "@/stores/editor-store";

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

  it("measures the close tolerance in screen pixels, not canvas pixels", () => {
    // Zoomed out 4x: 20 canvas px is 5 screen px, inside the 8 px target.
    const far = setup(0.25);
    far.drawTriangle();
    far.click(30, 10);
    expect(selection()?.points).toEqual(TRIANGLE);

    // Zoomed in 4x: 3 canvas px is 12 screen px, outside it, so a vertex is added.
    const near = setup(4);
    near.drawTriangle();
    near.click(13, 10);
    expect(selection()).toBeNull();
    expect(near.result.current.currentPoints).toEqual([...TRIANGLE, 13, 10]);
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

  it("closes on Enter, which reaches the tool through the shared holder", () => {
    const { drawTriangle } = setup();
    renderHook(() => useEditorShortcuts());
    drawTriangle();
    fireEvent.keyDown(document.body, { key: "Enter", code: "Enter" });
    expect(selection()?.points).toEqual(TRIANGLE);
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
    const applyCrop = vi.fn();
    const cropState = { x: 0, y: 0, width: 4, height: 4, aspectRatio: null };
    useEditorStore.setState({ ...INITIAL_STATE, isCropping: true, cropState, applyCrop }, true);
    polygonalLassoRefHolder.current = { close: () => true };
    renderHook(() => useEditorShortcuts());
    fireEvent.keyDown(document.body, { key: "Enter", code: "Enter" });
    expect(applyCrop).not.toHaveBeenCalled();
  });
});
