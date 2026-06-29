// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

vi.stubGlobal("URL", {
  ...globalThis.URL,
  revokeObjectURL: vi.fn(),
});

import { dashStyleToArray, hexToRgba, useEditorStore } from "@/stores/editor-store";
import type { CanvasObject, SelectionState } from "@/types/editor";

const INITIAL_STATE = useEditorStore.getState();

function state() {
  return useEditorStore.getState();
}

function makeRect(id: string, attrs: Record<string, number | string> = {}): CanvasObject {
  return {
    id,
    type: "rect",
    layerId: state().activeLayerId,
    attrs: {
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      strokeWidth: 2,
      rotation: 0,
      ...attrs,
    },
  } as CanvasObject;
}

function makeLine(id: string, points = [0, 0, 10, 10]): CanvasObject {
  return {
    id,
    type: "line",
    layerId: state().activeLayerId,
    attrs: {
      points,
      strokeWidth: 2,
      rotation: 0,
    },
  } as CanvasObject;
}

function makeEllipse(id: string): CanvasObject {
  return {
    id,
    type: "ellipse",
    layerId: state().activeLayerId,
    attrs: {
      x: 30,
      y: 40,
      radiusX: 10,
      radiusY: 20,
      rotation: 0,
    },
  } as CanvasObject;
}

describe("editor store branch helpers", () => {
  beforeEach(() => {
    useEditorStore.setState({ ...INITIAL_STATE }, true);
  });

  it("converts hex colors to rgba strings", () => {
    expect(hexToRgba("#336699", 0.5)).toBe("rgba(51, 102, 153, 0.5)");
  });

  it("converts dash styles to canvas dash arrays", () => {
    expect(dashStyleToArray("dashed", 3)).toEqual([12, 6]);
    expect(dashStyleToArray("dotted", 3)).toEqual([3, 6]);
    expect(dashStyleToArray("solid", 3)).toBeUndefined();
  });

  it("initializes crop bounds when entering crop mode and clears them when leaving", () => {
    state().setTool("crop");

    expect(state().cropState).toEqual({
      x: 192,
      y: 108,
      width: 1536,
      height: 864,
      aspectRatio: null,
    });
    expect(state().isCropping).toBe(true);

    state().setTool("move");

    expect(state().cropState).toBeNull();
    expect(state().isCropping).toBe(false);
  });

  it("resizes canvas from a bottom-right anchor by offsetting objects", () => {
    state().addObject(makeRect("rect"));
    state().addObject(makeLine("line"));

    state().resizeCanvas(2000, 1100, "bottom-right", "#abcdef");

    expect(state().canvasBackground).toBe("#abcdef");
    expect(state().objects[0].attrs).toMatchObject({ x: 90, y: 40 });
    expect((state().objects[1].attrs as { points: number[] }).points).toEqual([80, 20, 90, 30]);
  });

  it("rotates point and center-based objects for 90 and 270 degrees", () => {
    useEditorStore.setState({
      canvasSize: { width: 100, height: 50 },
      objects: [makeLine("line"), makeEllipse("ellipse")],
    });

    state().rotateCanvas(90);
    expect((state().objects[0].attrs as { points: number[] }).points).toEqual([50, 0, 40, 10]);
    expect(state().objects[1].attrs).toMatchObject({
      x: 10,
      y: 30,
      radiusX: 20,
      radiusY: 10,
      rotation: 90,
    });

    state().rotateCanvas(270);
    expect((state().objects[0].attrs as { points: number[] }).points).toEqual([0, 0, 10, 10]);
    expect(state().objects[1].attrs).toMatchObject({
      x: 30,
      y: 40,
      radiusX: 10,
      radiusY: 20,
      rotation: 0,
    });
  });

  it("flips point and center-based objects horizontally and vertically", () => {
    useEditorStore.setState({
      canvasSize: { width: 100, height: 80 },
      objects: [makeLine("line"), makeEllipse("ellipse")],
    });

    state().flipCanvasHorizontal();
    expect((state().objects[0].attrs as { points: number[] }).points).toEqual([100, 0, 90, 10]);
    expect(state().objects[1].attrs).toMatchObject({ x: 70, rotation: 0 });

    state().flipCanvasVertical();
    expect((state().objects[0].attrs as { points: number[] }).points).toEqual([100, 80, 90, 70]);
    expect(state().objects[1].attrs).toMatchObject({ y: 40, rotation: 0 });
  });

  it("inverts geometric selections and masked selections", () => {
    useEditorStore.setState({ canvasSize: { width: 4, height: 3 } });
    const geometricSelection: SelectionState = {
      type: "rect",
      bounds: { x: 1, y: 1, width: 2, height: 1 },
    };

    state().setSelection(geometricSelection);
    state().invertSelection();

    expect(state().selection?.bounds).toEqual({ x: 0, y: 0, width: 4, height: 3 });
    expect(Array.from(state().selection?.mask ?? [])).toEqual([1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1]);

    const maskedSelection: SelectionState = {
      type: "wand",
      bounds: { x: 1, y: 0, width: 2, height: 2 },
      mask: new Uint8Array([1, 0, 0, 1]),
    };
    state().setSelection(maskedSelection);
    state().invertSelection();

    expect(Array.from(state().selection?.mask ?? [])).toEqual([1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1]);
  });

  it("ignores crop and clipboard operations when there is no state to apply", () => {
    state().applyCrop();
    state().cutObjects();
    state().pasteObjects();
    state().pasteInPlace();

    expect(state().canvasSize).toEqual({ width: 1920, height: 1080 });
    expect(state().objects).toEqual([]);
    expect(state().clipboard).toBeNull();
  });

  it("pastes copied objects offset or in place onto the active layer", () => {
    state().addObject(makeRect("rect"));
    state().setSelectedObjects(["rect"]);
    state().copyObjects();

    state().pasteObjects();
    const offsetPaste = state().objects[1];
    expect(offsetPaste.id).not.toBe("rect");
    expect(offsetPaste.layerId).toBe(state().activeLayerId);
    expect(offsetPaste.attrs).toMatchObject({ x: 20, y: 30 });
    expect(state().selectedObjectIds).toEqual([offsetPaste.id]);

    state().pasteInPlace();
    const inPlacePaste = state().objects[2];
    expect(inPlacePaste.id).not.toBe("rect");
    expect(inPlacePaste.attrs).toMatchObject({ x: 10, y: 20 });
    expect(state().selectedObjectIds).toEqual([inPlacePaste.id]);
  });

  it("batch nudges positioned and point-based objects in one history entry", () => {
    state().addObject(makeRect("rect"));
    state().addObject(makeLine("line"));
    const version = state()._historyVersion;

    state().batchNudge(["rect", "line"], 5, -3);

    expect(state().objects[0].attrs).toMatchObject({ x: 15, y: 17 });
    expect((state().objects[1].attrs as { points: number[] }).points).toEqual([5, -3, 15, 7]);
    expect(state().lastAction).toBe("Nudge");
    expect(state()._historyVersion).toBe(version + 1);
  });

  it("clamps editor control ranges at their documented limits", () => {
    state().setBrushSize(0);
    state().setBrushOpacity(2);
    state().setBrushHardness(-1);
    state().setBrushFlow(2);
    state().setShapeFillOpacity(-1);
    state().setShapeStrokeOpacity(2);
    state().setFillTolerance(999);
    state().setGradientOpacity(-1);
    state().setPixelBrushStrength(0);

    expect(state()).toMatchObject({
      brushSize: 1,
      brushOpacity: 1,
      brushHardness: 0,
      brushFlow: 1,
      shapeFillOpacity: 0,
      shapeStrokeOpacity: 1,
      fillTolerance: 255,
      gradientOpacity: 0,
      pixelBrushStrength: 1,
    });
  });
});
