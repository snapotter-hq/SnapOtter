// @vitest-environment jsdom
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type Konva from "konva";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());

// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

const stageProps = vi.hoisted(() => ({
  onMouseMove: undefined as ((e: Konva.KonvaEventObject<MouseEvent>) => void) | undefined,
  onMouseDown: undefined as ((e: Konva.KonvaEventObject<MouseEvent>) => void) | undefined,
}));

// By path: react-konva is installed in apps/web/node_modules (#1235).
vi.mock("../../../apps/web/node_modules/react-konva", () => ({
  Stage: (props: {
    children?: React.ReactNode;
    onMouseMove?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
    onMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  }) => {
    stageProps.onMouseMove = props.onMouseMove;
    stageProps.onMouseDown = props.onMouseDown;
    return <div data-testid="mock-stage">{props.children}</div>;
  },
  Layer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Group: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Rect: () => null,
  Ellipse: () => null,
  Line: () => null,
  Arrow: () => null,
  RegularPolygon: () => null,
  Star: () => null,
  Text: () => null,
  Shape: () => null,
  Circle: () => null,
  Image: () => null,
  Transformer: () => null,
}));

const useImageMock = vi.hoisted(() =>
  vi.fn<(url: string, crossOrigin?: string) => [HTMLImageElement | null, string]>(() => [
    null,
    "loading",
  ]),
);

vi.mock("../../../apps/web/node_modules/use-image", () => ({
  default: useImageMock,
}));

import { EditorCanvas } from "@/components/editor/editor-canvas";
import { useSelectionTool } from "@/components/editor/tools/selection-tool";
import { useEditorStore } from "@/stores/editor-store";

const INITIAL_STATE = useEditorStore.getState();

// 2x2 document where (0, 0) is red, (1, 1) is green, and (1, 0) / (0, 1) are blue.
function makeFourQuadrantContext() {
  return {
    canvas: { width: 2, height: 2 },
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      if (w === 1 && h === 1) {
        return { data: new Uint8ClampedArray([255, 0, 255, 255]), width: 1, height: 1 };
      }
      const data = new Uint8ClampedArray([
        255,
        0,
        0,
        255, // (0, 0) red
        0,
        0,
        255,
        255, // (1, 0) blue
        0,
        0,
        255,
        255, // (0, 1) blue
        0,
        255,
        0,
        255, // (1, 1) green
      ]);
      return { data, width: w, height: h };
    }),
    putImageData: vi.fn(),
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
}

function makeFakeStage(pointer = { x: 0, y: 0 }) {
  const ctx = makeFourQuadrantContext();
  const stage = {
    width: () => 2,
    height: () => 2,
    scaleX: () => 1,
    scaleY: () => 1,
    x: () => 0,
    y: () => 0,
    size: vi.fn(),
    scale: vi.fn(),
    position: vi.fn(),
    draw: vi.fn(),
    getPointerPosition: () => pointer,
    toCanvas: vi.fn(() => ({ getContext: () => ctx, width: 2, height: 2 })),
  };
  return stage as unknown as Konva.Stage;
}

function stageMouseEvent(stage: Konva.Stage) {
  return {
    target: { getStage: () => stage },
    evt: { detail: 1, altKey: false },
  } as unknown as Konva.KonvaEventObject<MouseEvent>;
}

beforeEach(() => {
  stageProps.onMouseMove = undefined;
  stageProps.onMouseDown = undefined;
  toastError.mockClear();
  useImageMock.mockReset();
  useImageMock.mockImplementation(() => [null, "loading"]);
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  useEditorStore.setState(
    {
      ...INITIAL_STATE,
      canvasSize: { width: 2, height: 2 },
      zoom: 1,
      panOffset: { x: 0, y: 0 },
      selection: null,
      cursorPosition: { x: 0, y: 0 },
    },
    true,
  );
});

afterEach(() => {
  cleanup();
});

describe("magic wand coordinate flooring (#2431)", () => {
  it("selects the pixel under the pointer's floor instead of rounding into the neighbour", () => {
    const stage = makeFakeStage();
    const { result } = renderHook(() => useSelectionTool());

    // Clicking at (0.75, 0.75) is inside pixel (0, 0) (red).
    // Math.round(0.75) would round to (1, 1) (green) and select bounds { x: 1, y: 1, width: 1, height: 1 }.
    act(() => result.current.magicWandSelect(stage, 0.75, 0.75, 0, true));

    expect(useEditorStore.getState().selection?.bounds).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it("selects the final row and column when clicking their right or bottom half", () => {
    const stage = makeFakeStage();
    const { result } = renderHook(() => useSelectionTool());

    // Clicking at (1.75, 1.75) on a 2x2 canvas is inside pixel (1, 1) (green).
    // Math.round(1.75) yields 2, which fails sx >= width / sy >= height and selects nothing.
    act(() => result.current.magicWandSelect(stage, 1.75, 1.75, 0, true));

    expect(useEditorStore.getState().selection?.bounds).toEqual({
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });
  });

  it("rejects negative sub-pixel coordinates just outside the top-left edge", () => {
    const stage = makeFakeStage();
    const { result } = renderHook(() => useSelectionTool());

    // (-0.25, -0.25) is outside the canvas. Math.round(-0.25) is -0, passing sx < 0.
    act(() => result.current.magicWandSelect(stage, -0.25, -0.25, 0, true));

    expect(useEditorStore.getState().selection).toBeNull();
  });
});

describe("editor canvas cursor position flooring (#2431)", () => {
  it("floors zoomed sub-pixel pointer coordinates instead of rounding to the next pixel", () => {
    useEditorStore.setState({ zoom: 4, panOffset: { x: 0, y: 0 } });
    render(<EditorCanvas />);

    // Pointer at (23, 7) with zoom 4 => canvas (5.75, 1.75) => pixel (5, 1).
    const stage = makeFakeStage({ x: 23, y: 7 });
    act(() => stageProps.onMouseMove?.(stageMouseEvent(stage)));

    expect(useEditorStore.getState().cursorPosition).toEqual({ x: 5, y: 1 });
  });

  it("floors coordinates when panned and just outside the top-left edge", () => {
    useEditorStore.setState({ zoom: 2, panOffset: { x: 10, y: 20 } });
    render(<EditorCanvas />);

    // Pointer at (9, 19) with pan (10, 20) and zoom 2 => (-0.5, -0.5) => floor is (-1, -1).
    const stage = makeFakeStage({ x: 9, y: 19 });
    act(() => stageProps.onMouseMove?.(stageMouseEvent(stage)));

    expect(useEditorStore.getState().cursorPosition).toEqual({ x: -1, y: -1 });
  });
});

describe("editor canvas cross-origin image loading (#2133)", () => {
  it("loads both the source image and image objects with crossOrigin 'anonymous'", () => {
    const layerId = useEditorStore.getState().layers[0]?.id ?? "layer-1";
    useEditorStore.setState({
      sourceImageUrl: "https://images.example.test/photo.png",
      objects: [
        {
          id: "img-obj-1",
          type: "image",
          layerId,
          attrs: {
            src: "https://images.example.test/overlay.png",
            x: 0,
            y: 0,
            width: 50,
            height: 50,
            rotation: 0,
            opacity: 1,
          },
        },
      ],
    });

    render(<EditorCanvas />);

    expect(useImageMock).toHaveBeenCalledWith("https://images.example.test/photo.png", "anonymous");
    expect(useImageMock).toHaveBeenCalledWith(
      "https://images.example.test/overlay.png",
      "anonymous",
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows a toast when the source image or an image object fails its CORS or network load", () => {
    useImageMock.mockImplementation(() => [null, "failed"]);
    const layerId = useEditorStore.getState().layers[0]?.id ?? "layer-1";
    useEditorStore.setState({
      sourceImageUrl: "https://images.example.test/blocked-source.png",
      objects: [
        {
          id: "img-obj-blocked",
          type: "image",
          layerId,
          attrs: {
            src: "https://images.example.test/blocked-overlay.png",
            x: 0,
            y: 0,
            width: 50,
            height: 50,
            rotation: 0,
            opacity: 1,
          },
        },
      ],
    });

    render(<EditorCanvas />);

    expect(toastError).toHaveBeenCalledWith(en.editor.ui.captureFailure.sourceImageFailed, {
      id: "editor-source-image-failed",
    });
  });
});
