// @vitest-environment jsdom

/**
 * After a pixel tool's 1px capture probe passes, the full-document read and the
 * stroke's toDataURL can still fail on a canvas that is alive but huge. The
 * mouse handler used to throw out of the event with no toast, leave the stroke
 * half-started, or add an invisible object (src "data:,") and an undo entry for
 * it (#2141).
 */

import { renderHook } from "@testing-library/react";
import type Konva from "konva";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
// sonner only resolves from apps/web, so a bare "sonner" here would mock a
// different module than the one stage-capture imports.
vi.mock("../../../apps/web/node_modules/sonner", () => ({ toast: { error: toastError } }));

const DOC = { width: 200, height: 200 };
const DOC_AREA = DOC.width * DOC.height;

// A 2D context that reads back zeros but refuses a whole-document read while
// `bigReadsFail` is set, the way a huge canvas does.
const state = {
  bigReadsFail: false,
  dataUrl: "data:image/png;base64,AAAA",
  pointer: { x: 50, y: 50 },
  fills: 0,
};
function fakeContext() {
  return {
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      if (state.bigReadsFail && w * h >= DOC_AREA) {
        throw new RangeError("Cannot allocate a buffer of this size");
      }
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    }),
    createImageData: vi.fn((w: number, h: number) => {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    }),
    putImageData: vi.fn(),
    fillRect: vi.fn(() => {
      state.fills++;
    }),
    globalAlpha: 1,
    fillStyle: "",
    canvas: { toDataURL: () => state.dataUrl },
  };
}

const captureDocumentContextSpy = vi.hoisted(() =>
  vi.fn(() => ({ ok: true as const, ctx: fakeContext() })),
);

vi.mock("@/components/editor/stage-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/editor/stage-capture")>()),
  captureDocumentContext: captureDocumentContextSpy,
}));

import { useCloneStampTool } from "@/components/editor/tools/clone-stamp-tool";
import { useDodgeBurnTool } from "@/components/editor/tools/dodge-burn-tool";
import { useFillTool } from "@/components/editor/tools/fill-tool";
import { usePixelBrushTool } from "@/components/editor/tools/pixel-brush-tool";
import { useEditorStore } from "@/stores/editor-store";

const stage = { getPointerPosition: () => state.pointer, getStage: () => stage };
const stageRef = { current: stage as unknown as Konva.Stage };
const event = {
  target: stage,
  evt: { altKey: false },
} as unknown as Konva.KonvaEventObject<MouseEvent>;

const objects = () => useEditorStore.getState().objects;

beforeEach(() => {
  state.bigReadsFail = false;
  state.dataUrl = "data:image/png;base64,AAAA";
  state.pointer = { x: 50, y: 50 };
  state.fills = 0;
  toastError.mockClear();
  captureDocumentContextSpy.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => fakeContext() as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => state.dataUrl);
  useEditorStore.setState({
    objects: [],
    canvasSize: DOC,
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    brushSize: 4,
    cloneSource: { x: 10, y: 10, aligned: false },
    cloneAligned: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectOneMemoryToast() {
  expect(toastError).toHaveBeenCalledTimes(1);
  expect(toastError.mock.calls[0][1]).toEqual({ id: "editor-capture-no-context" });
}

describe("a document too big to read back after the probe passed", () => {
  it.each([
    ["blur-brush", usePixelBrushTool],
    ["clone-stamp", useCloneStampTool],
    ["fill", useFillTool],
  ] as const)("%s reports it instead of throwing out of the mouse handler", (tool, useTool) => {
    useEditorStore.setState({ activeTool: tool });
    const { result } = renderHook(() => useTool(stageRef));
    state.bigReadsFail = true;

    expect(() => result.current.handleMouseDown(event)).not.toThrow();

    expectOneMemoryToast();
    expect(objects()).toHaveLength(0);
  });
});

describe("a stroke canvas too big to encode (toDataURL gives back data:,)", () => {
  it.each([
    ["blur-brush", usePixelBrushTool],
    ["dodge", useDodgeBurnTool],
    ["clone-stamp", useCloneStampTool],
    ["fill", useFillTool],
  ] as const)("%s adds no invisible object and reports it", (tool, useTool) => {
    useEditorStore.setState({ activeTool: tool });
    const { result } = renderHook(() => useTool(stageRef));
    state.dataUrl = "data:,";

    result.current.handleMouseDown(event);

    expectOneMemoryToast();
    expect(objects()).toHaveLength(0);
  });
});

describe("clone stamp: an aborted first click", () => {
  it("does not keep its aligned offset for the next click", () => {
    useEditorStore.setState({
      activeTool: "clone-stamp",
      cloneAligned: true,
      cloneSource: { x: 100, y: 100, aligned: true },
    });
    const { result } = renderHook(() => useCloneStampTool(stageRef));

    // Aligned offset from this click would be (-90, -90): a source off the document.
    state.pointer = { x: 190, y: 190 };
    state.dataUrl = "data:,";
    result.current.handleMouseDown(event);
    expect(objects()).toHaveLength(0);

    // The next click sets its own offset, (50, 50), and clones from inside the document.
    state.pointer = { x: 50, y: 50 };
    state.dataUrl = "data:image/png;base64,AAAA";
    state.fills = 0;
    result.current.handleMouseDown(event);
    expect(objects()).toHaveLength(1);
    expect(state.fills).toBeGreaterThan(0);
  });
});

describe("clone stamp: out-of-bounds clicks in the viewport margin (#2988)", () => {
  const outOfBoundsCoords = [
    ["left of canvas", { x: -1, y: 50 }],
    ["sub-pixel left of canvas", { x: -0.1, y: 50 }],
    ["above canvas", { x: 50, y: -1 }],
    ["sub-pixel above canvas", { x: 50, y: -0.1 }],
    ["right of canvas", { x: DOC.width, y: 50 }],
    ["below canvas", { x: 50, y: DOC.height }],
  ] as const;

  it.each(outOfBoundsCoords)(
    "ignores Alt+click (%s) without updating cloneSource or resetting aligned offset",
    (_label, pos) => {
      const initialSource = { x: 25, y: 35, aligned: true };
      useEditorStore.setState({
        activeTool: "clone-stamp",
        cloneAligned: true,
        cloneSource: initialSource,
      });
      const { result } = renderHook(() => useCloneStampTool(stageRef));

      // First valid click at (50, 50) latches aligned offset (-25, -15).
      state.pointer = { x: 50, y: 50 };
      result.current.handleMouseDown(event);
      result.current.handleMouseUp();
      expect(objects()).toHaveLength(1);

      // Out-of-bounds Alt+click in the margin must be ignored completely.
      state.pointer = pos;
      captureDocumentContextSpy.mockClear();
      result.current.handleMouseDown({
        target: stage,
        evt: { altKey: true },
      } as unknown as Konva.KonvaEventObject<MouseEvent>);

      expect(useEditorStore.getState().cloneSource).toEqual(initialSource);
      expect(captureDocumentContextSpy).not.toHaveBeenCalled();

      // Next valid click at (10, 10): with preserved aligned offset (-25, -15),
      // source is (-15, -5) outside DOC (0 fills), whereas a reset offset would
      // recompute (25 - 10, 35 - 10) = (15, 25) and sample (25, 35) inside DOC (>0 fills).
      state.pointer = { x: 10, y: 10 };
      state.fills = 0;
      result.current.handleMouseDown(event);
      expect(state.fills).toBe(0);
    },
  );

  it.each(outOfBoundsCoords)(
    "ignores normal click (%s) without capturing, adding an object, or toasting",
    (_label, pos) => {
      useEditorStore.setState({
        activeTool: "clone-stamp",
        cloneAligned: true,
        cloneSource: { x: 100, y: 100, aligned: true },
      });
      const { result } = renderHook(() => useCloneStampTool(stageRef));
      state.pointer = pos;
      state.bigReadsFail = true;

      result.current.handleMouseDown(event);
      state.pointer = { x: 50, y: 50 };
      result.current.handleMouseMove(event);
      result.current.handleMouseUp();

      expect(captureDocumentContextSpy).not.toHaveBeenCalled();
      expect(toastError).not.toHaveBeenCalled();
      expect(objects()).toHaveLength(0);
    },
  );

  it("ignores clicks in the panned/zoomed margin without latching aligned offset", () => {
    useEditorStore.setState({
      activeTool: "clone-stamp",
      zoom: 2,
      panOffset: { x: 10, y: 20 },
      cloneAligned: true,
      cloneSource: { x: 100, y: 100, aligned: true },
    });
    const { result } = renderHook(() => useCloneStampTool(stageRef));

    // Pointer at (9, 19) with pan (10, 20) and zoom 2 => canvas (-0.5, -0.5), floor (-1, -1).
    state.pointer = { x: 9, y: 19 };
    result.current.handleMouseDown(event);
    expect(captureDocumentContextSpy).not.toHaveBeenCalled();
    expect(objects()).toHaveLength(0);

    // Subsequent in-bounds click at pointer (110, 120) => canvas (50, 50)
    // sets aligned offset (50, 50) and clones from (100, 100).
    state.pointer = { x: 110, y: 120 };
    state.fills = 0;
    result.current.handleMouseDown(event);
    expect(objects()).toHaveLength(1);
    expect(state.fills).toBeGreaterThan(0);
  });

  it("accepts clicks on the final bottom-right pixel (DOC.width - 1, DOC.height - 1)", () => {
    useEditorStore.setState({
      activeTool: "clone-stamp",
      cloneAligned: true,
      cloneSource: null,
    });
    const { result } = renderHook(() => useCloneStampTool(stageRef));

    // Sub-pixel coordinates inside the bottom-right pixel floor to (199, 199).
    state.pointer = { x: DOC.width - 0.01, y: DOC.height - 0.01 };
    result.current.handleMouseDown({
      target: stage,
      evt: { altKey: true },
    } as unknown as Konva.KonvaEventObject<MouseEvent>);

    expect(useEditorStore.getState().cloneSource).toEqual({
      x: DOC.width - 1,
      y: DOC.height - 1,
      aligned: true,
    });

    state.fills = 0;
    result.current.handleMouseDown(event);
    expect(objects()).toHaveLength(1);
    expect(state.fills).toBeGreaterThan(0);
  });
});

describe("a stroke that can't be encoded when the mouse is released", () => {
  it("cuts the live canvas loose before removing an object it can't encode", () => {
    useEditorStore.setState({ activeTool: "blur-brush" });
    const { result } = renderHook(() => usePixelBrushTool(stageRef));
    result.current.handleMouseDown(event);
    result.current.handleMouseMove(event);
    const { updateObject, removeObjects } = useEditorStore.getState();
    const calls: string[] = [];
    useEditorStore.setState({
      updateObject: (id, attrs) => {
        calls.push(`update:${JSON.stringify(Object.keys(attrs))}`);
        updateObject(id, attrs);
      },
      removeObjects: (ids) => {
        calls.push("remove");
        removeObjects(ids);
      },
    });

    state.dataUrl = "data:,";
    result.current.handleMouseUp();

    // An undo of the delete would otherwise restore the whole stroke, still tied to
    // the canvas that could not be encoded.
    expect(calls).toEqual(['update:["image"]', "remove"]);
  });

  it.each([
    ["blur-brush", usePixelBrushTool],
    ["dodge", useDodgeBurnTool],
    ["clone-stamp", useCloneStampTool],
  ] as const)("%s drops the object rather than leaving an invisible one", (tool, useTool) => {
    useEditorStore.setState({ activeTool: tool });
    const { result } = renderHook(() => useTool(stageRef));
    result.current.handleMouseDown(event);
    expect(objects()).toHaveLength(1);

    state.dataUrl = "data:,";
    result.current.handleMouseUp();

    expectOneMemoryToast();
    expect(objects()).toHaveLength(0);
  });
});
