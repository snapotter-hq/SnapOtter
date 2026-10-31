// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type Konva from "konva";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Sample size dropdown kept its choice in the options bar's own state while
// the canvas passed the eyedropper a literal 1, so every size sampled one pixel
// (#2300). The choice now lives in the editor store and the tool reads it there.
const getImageData = vi.hoisted(() => vi.fn());
const captureDocumentContextMock = vi.hoisted(() =>
  vi.fn(() => ({
    ok: true as const,
    ctx: { canvas: { width: 20, height: 10 }, getImageData },
  })),
);
vi.mock("@/components/editor/stage-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/editor/stage-capture")>()),
  captureDocumentContext: captureDocumentContextMock,
}));

import { EditorOptionsBar } from "@/components/editor/editor-options-bar";
import { useEyedropperTool } from "@/components/editor/tools/eyedropper-tool";
import { useEditorStore } from "@/stores/editor-store";

function pointerEvent(x: number, y: number) {
  const stage = { getPointerPosition: () => ({ x, y }) } as unknown as Konva.Stage;
  return {
    target: { getStage: () => stage },
    evt: { altKey: false },
  } as unknown as Konva.KonvaEventObject<MouseEvent>;
}

beforeEach(() => {
  captureDocumentContextMock.mockClear();
  getImageData.mockReset();
  getImageData.mockImplementation((_x: number, _y: number, w: number, h: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([255, 100, 50, 255], i * 4);
    return { data, width: w, height: h };
  });
  useEditorStore.setState({
    canvasSize: { width: 20, height: 10 },
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    activeTool: "eyedropper",
    foregroundColor: "#000000",
    eyedropperSampledColor: null,
  });
  useEditorStore.getState().setEyedropperSampleSize(1);
});

afterEach(() => {
  cleanup();
});

describe("eyedropper sample size", () => {
  function setup() {
    const stage = {} as Konva.Stage;
    return renderHook(() => useEyedropperTool({ stageRef: { current: stage } }));
  }

  it("samples one pixel by default", () => {
    const hook = setup();

    act(() => hook.result.current.handleEyedropperClick(pointerEvent(10, 5)));

    expect(getImageData).toHaveBeenLastCalledWith(10, 5, 1, 1);
  });

  it.each([
    [3, [9, 4, 3, 3]],
    [5, [8, 3, 5, 5]],
  ] as const)("samples a square %i pixels wide once the store says so", (size, rect) => {
    const hook = setup();
    act(() => useEditorStore.getState().setEyedropperSampleSize(size));

    act(() => hook.result.current.handleEyedropperClick(pointerEvent(10, 5)));

    expect(getImageData).toHaveBeenLastCalledWith(...rect);
  });

  it("follows a change made while the tool stays mounted", () => {
    const hook = setup();

    act(() => useEditorStore.getState().setEyedropperSampleSize(5));
    act(() => hook.result.current.handleEyedropperClick(pointerEvent(10, 5)));
    expect(getImageData).toHaveBeenLastCalledWith(8, 3, 5, 5);

    act(() => useEditorStore.getState().setEyedropperSampleSize(1));
    act(() => hook.result.current.handleEyedropperClick(pointerEvent(10, 5)));
    expect(getImageData).toHaveBeenLastCalledWith(10, 5, 1, 1);
  });

  it("samples the correct pixel when zoomed in, reading the pixel's floor instead of rounding to nearest", () => {
    const hook = setup();

    act(() => useEditorStore.setState({ zoom: 4 }));

    // Zoom 4, click x = 4 * 5 + 3 = 23 (canvas x = 5.75).
    // The previous Math.round would sample 6. We expect 5.
    // y = 4 * 1 + 3 = 7 (canvas y = 1.75). Math.round would yield 2, we expect 1.
    act(() => hook.result.current.handleEyedropperClick(pointerEvent(23, 7)));
    expect(getImageData).toHaveBeenLastCalledWith(5, 1, 1, 1);

    // The right half of the very last pixel on the row.
    // Width is 20, so canvas x ranges 0..19.
    // x = 19 * 4 + 3 = 79 (canvas x = 19.75).
    // The previous Math.round would yield 20 and fail the bounds check (so getImageData wouldn't be called).
    getImageData.mockClear();
    act(() => hook.result.current.handleEyedropperClick(pointerEvent(79, 7)));
    expect(getImageData).toHaveBeenLastCalledWith(19, 1, 1, 1);
  });

  it("handles panning offsets correctly", () => {
    const hook = setup();

    act(() => useEditorStore.setState({ zoom: 2, panOffset: { x: -10, y: -20 } }));

    // x = 2 * 3 + (-10) + 1 = -3. (pointer - panOffset) / zoom = (-3 - (-10)) / 2 = 7 / 2 = 3.5. Floor is 3.
    // y = 2 * 4 + (-20) + 1 = -11. (pointer - panOffset) / zoom = (-11 - (-20)) / 2 = 9 / 2 = 4.5. Floor is 4.
    act(() => hook.result.current.handleEyedropperClick(pointerEvent(-3, -11)));
    expect(getImageData).toHaveBeenLastCalledWith(3, 4, 1, 1);
  });

  it("fails the bounds check for clicks just outside the top-left edge", () => {
    const hook = setup();

    act(() => useEditorStore.setState({ zoom: 4 }));

    getImageData.mockClear();
    captureDocumentContextMock.mockClear();
    // pointer x=-2, y=-2. canvas x = -2/4 = -0.5.
    // Math.round(-0.5) is 0, which would incorrectly pass the < 0 bounds check.
    // Math.floor(-0.5) is -1, which correctly fails before capturing the stage (#2987).
    act(() => hook.result.current.handleEyedropperClick(pointerEvent(-2, -2)));
    expect(captureDocumentContextMock).not.toHaveBeenCalled();
    expect(getImageData).not.toHaveBeenCalled();
  });
});

describe("eyedropper options bar", () => {
  it("writes the chosen sample size to the store", () => {
    render(<EditorOptionsBar />);

    fireEvent.click(screen.getByTestId("sample-size-dropdown"));
    fireEvent.click(screen.getByRole("button", { name: "5x5 Average" }));

    expect(useEditorStore.getState().eyedropperSampleSize).toBe(5);
  });

  it("shows the size the store holds", () => {
    useEditorStore.getState().setEyedropperSampleSize(3);

    render(<EditorOptionsBar />);

    expect(screen.getByTestId("sample-size-dropdown")).toHaveTextContent("3x3 Average");
  });

  it("shows the hovered color in the options bar without re-rendering the canvas host (#2155)", () => {
    getImageData.mockImplementation((x: number, _y: number, w: number, h: number) => {
      const color = x < 10 ? [255, 0, 0, 255] : [0, 128, 255, 255];
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) data.set(color, i * 4);
      return { data, width: w, height: h };
    });

    const stage = {} as Konva.Stage;
    const stageRef = { current: stage };
    let canvasRenders = 0;
    let api!: ReturnType<typeof useEyedropperTool>;

    function CanvasHost() {
      canvasRenders++;
      api = useEyedropperTool({ stageRef });
      return null;
    }

    render(
      <>
        <CanvasHost />
        <EditorOptionsBar />
      </>,
    );

    expect(canvasRenders).toBe(1);
    expect(screen.getByText("#000000")).toBeInTheDocument();

    act(() => api.handleEyedropperMove(pointerEvent(2, 2)));
    expect(screen.getByText("#ff0000")).toBeInTheDocument();
    expect(screen.getByTestId("eyedropper-sampled-color")).toHaveAttribute("title", "#ff0000");
    expect(useEditorStore.getState().foregroundColor).toBe("#000000");
    expect(canvasRenders).toBe(1);

    act(() => api.handleEyedropperMove(pointerEvent(15, 2)));
    expect(screen.getByText("#0080ff")).toBeInTheDocument();
    expect(canvasRenders).toBe(1);

    // Moving outside the document clears the hover preview back to foregroundColor.
    act(() => api.handleEyedropperMove(pointerEvent(25, 2)));
    expect(screen.getByText("#000000")).toBeInTheDocument();
    expect(canvasRenders).toBe(1);
  });
});

describe("eyedropper hover preview (#2155)", () => {
  it("clears the hover preview color when switching tools or replacing the document", () => {
    const stage = {} as Konva.Stage;
    const hook = renderHook(() => useEyedropperTool({ stageRef: { current: stage } }));

    act(() => hook.result.current.handleEyedropperMove(pointerEvent(5, 5)));
    expect(useEditorStore.getState().eyedropperSampledColor).toBe("#ff6432");

    // Re-selecting the already active tool keeps the hover preview intact.
    act(() => useEditorStore.getState().setTool("eyedropper"));
    expect(useEditorStore.getState().eyedropperSampledColor).toBe("#ff6432");

    act(() => useEditorStore.getState().setTool("move"));
    expect(useEditorStore.getState().eyedropperSampledColor).toBeNull();

    act(() => useEditorStore.getState().setTool("eyedropper"));
    act(() => hook.result.current.handleEyedropperMove(pointerEvent(5, 5)));
    expect(useEditorStore.getState().eyedropperSampledColor).toBe("#ff6432");

    act(() => useEditorStore.getState().loadImage("data:image/png;base64,iVBORw0KGgo=", 10, 10));
    expect(useEditorStore.getState().eyedropperSampledColor).toBeNull();

    act(() => hook.result.current.handleEyedropperMove(pointerEvent(5, 5)));
    expect(useEditorStore.getState().eyedropperSampledColor).toBe("#ff6432");

    // File > Close clears sourceImageUrl via setState; the store subscriber clears the preview too.
    act(() => useEditorStore.setState({ sourceImageUrl: null, sourceImageSize: null }));
    expect(useEditorStore.getState().eyedropperSampledColor).toBeNull();
  });

  it("clears the hover preview color when the stage, pointer, or pixel read is unavailable", () => {
    const stage = {} as Konva.Stage;
    const hook = renderHook(() => useEyedropperTool({ stageRef: { current: stage } }));

    act(() => hook.result.current.handleEyedropperMove(pointerEvent(5, 5)));
    expect(useEditorStore.getState().eyedropperSampledColor).toBe("#ff6432");

    const noPointerEvent = {
      target: { getStage: () => ({ getPointerPosition: () => null }) },
      evt: { altKey: false },
    } as unknown as Konva.KonvaEventObject<MouseEvent>;
    act(() => hook.result.current.handleEyedropperMove(noPointerEvent));
    expect(useEditorStore.getState().eyedropperSampledColor).toBeNull();

    act(() => hook.result.current.handleEyedropperMove(pointerEvent(5, 5)));
    expect(useEditorStore.getState().eyedropperSampledColor).toBe("#ff6432");

    const noStageEvent = {
      target: { getStage: () => null },
      evt: { altKey: false },
    } as unknown as Konva.KonvaEventObject<MouseEvent>;
    act(() => hook.result.current.handleEyedropperMove(noStageEvent));
    expect(useEditorStore.getState().eyedropperSampledColor).toBeNull();

    act(() => hook.result.current.handleEyedropperMove(pointerEvent(5, 5)));
    expect(useEditorStore.getState().eyedropperSampledColor).toBe("#ff6432");

    getImageData.mockImplementationOnce(() => {
      throw new DOMException("Tainted", "SecurityError");
    });
    act(() => hook.result.current.handleEyedropperMove(pointerEvent(5, 5)));
    expect(useEditorStore.getState().eyedropperSampledColor).toBeNull();
  });
});
