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
const state = { bigReadsFail: false, dataUrl: "data:image/png;base64,AAAA" };
function fakeContext() {
  return {
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      if (state.bigReadsFail && w * h >= DOC_AREA) {
        throw new RangeError("Cannot allocate a buffer of this size");
      }
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    }),
    putImageData: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 1,
    fillStyle: "",
    canvas: { toDataURL: () => state.dataUrl },
  };
}

vi.mock("@/components/editor/stage-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/editor/stage-capture")>()),
  captureDocumentContext: () => ({ ok: true, ctx: fakeContext() }),
}));

import { useCloneStampTool } from "@/components/editor/tools/clone-stamp-tool";
import { useDodgeBurnTool } from "@/components/editor/tools/dodge-burn-tool";
import { useFillTool } from "@/components/editor/tools/fill-tool";
import { usePixelBrushTool } from "@/components/editor/tools/pixel-brush-tool";
import { useEditorStore } from "@/stores/editor-store";

const stage = { getPointerPosition: () => ({ x: 50, y: 50 }), getStage: () => stage };
const stageRef = { current: stage as unknown as Konva.Stage };
const event = {
  target: stage,
  evt: { altKey: false },
} as unknown as Konva.KonvaEventObject<MouseEvent>;

const objects = () => useEditorStore.getState().objects;

beforeEach(() => {
  state.bigReadsFail = false;
  state.dataUrl = "data:image/png;base64,AAAA";
  toastError.mockClear();
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

describe("pixel brush: running out of memory partway through a stroke", () => {
  it("ends the stroke cleanly and keeps what was drawn", () => {
    useEditorStore.setState({ activeTool: "blur-brush" });
    const { result } = renderHook(() => usePixelBrushTool(stageRef));
    result.current.handleMouseDown(event);
    // A good move first, so the object points at the live canvas.
    result.current.handleMouseMove(event);
    const attrsOf = () => objects()[0].attrs as unknown as { src: string; image?: unknown };
    expect(attrsOf().image).toBeDefined();

    state.bigReadsFail = true;
    state.dataUrl = "data:image/png;base64,FINAL";
    expect(() => result.current.handleMouseMove(event)).not.toThrow();

    expectOneMemoryToast();
    // The stroke is saved as it stood: encoded, and no longer the live canvas.
    expect(attrsOf().src).toBe("data:image/png;base64,FINAL");
    expect(attrsOf().image).toBeUndefined();

    // And it is over: a later move changes nothing about the object.
    state.bigReadsFail = false;
    state.dataUrl = "data:image/png;base64,LATER";
    result.current.handleMouseMove(event);
    result.current.handleMouseUp();
    expect(attrsOf().src).toBe("data:image/png;base64,FINAL");
    expect(attrsOf().image).toBeUndefined();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

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

  it("drops the object when the finished stroke can't be encoded", () => {
    useEditorStore.setState({ activeTool: "blur-brush" });
    const { result } = renderHook(() => usePixelBrushTool(stageRef));
    result.current.handleMouseDown(event);

    state.bigReadsFail = true;
    state.dataUrl = "data:,";
    result.current.handleMouseMove(event);

    expectOneMemoryToast();
    expect(objects()).toHaveLength(0);
  });
});

describe("a stroke that can't be encoded when the mouse is released", () => {
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
