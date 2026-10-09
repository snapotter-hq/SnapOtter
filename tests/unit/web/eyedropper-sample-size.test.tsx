// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type Konva from "konva";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Sample size dropdown kept its choice in the options bar's own state while
// the canvas passed the eyedropper a literal 1, so every size sampled one pixel
// (#2300). The choice now lives in the editor store and the tool reads it there.
const getImageData = vi.hoisted(() => vi.fn());
vi.mock("@/components/editor/stage-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/editor/stage-capture")>()),
  captureDocumentContext: () => ({
    ok: true,
    ctx: { canvas: { width: 20, height: 10 }, getImageData },
  }),
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
});
