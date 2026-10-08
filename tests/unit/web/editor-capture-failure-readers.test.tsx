// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type Konva from "konva";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The toast itself is sonner's; what matters here is which failure is reported.
const reportFailure = vi.hoisted(() => vi.fn());
vi.mock("@/components/editor/stage-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/editor/stage-capture")>()),
  reportCaptureFailure: reportFailure,
}));
// The real module pulls in the whole canvas; the histogram only needs the holder.
vi.mock("@/components/editor/editor-canvas", () => ({
  editorStageRefHolder: { current: null as unknown },
}));

import { en } from "@snapotter/shared";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import { useDocumentHistogram } from "@/components/editor/panels/use-document-histogram";
import { useEyedropperTool } from "@/components/editor/tools/eyedropper-tool";
import { useSelectionTool } from "@/components/editor/tools/selection-tool";
import { useEditorStore } from "@/stores/editor-store";

/**
 * #2139: the eyedropper, the magic wand and the histogram read the document the
 * same way the pixel tools do, and used to fail without a word when it couldn't
 * be read (a tainted canvas throws a SecurityError, a canvas the browser
 * couldn't allocate reads back zeros). They now ask captureDocumentContext and
 * tell the user, as the pixel tools do since #1040.
 */

const messages = en.editor.ui.captureFailure;
const tainted = () => new DOMException("The canvas has been tainted", "SecurityError");

// A 2D context over a flat colour. `alive: false` is what the browsers do past
// their canvas limits: a dead context takes the write and reads back zeros.
function fakeContext(
  options: { alive?: boolean; readThrows?: unknown; fullReadThrows?: unknown } = {},
) {
  const alive = options.alive ?? true;
  let first = [10, 20, 30, 255];
  return {
    canvas: { width: 2, height: 2 },
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      if (options.readThrows) throw options.readThrows;
      // The 1px probe reads fine; the whole document does not (a canvas the browser
      // backed but can't read back at full size).
      if (options.fullReadThrows && w * h > 1) throw options.fullReadThrows;
      const data = new Uint8ClampedArray(w * h * 4);
      if (alive) {
        for (let i = 0; i < w * h; i++) data.set(i === 0 ? first : [10, 20, 30, 255], i * 4);
      }
      return { data, width: w, height: h };
    }),
    putImageData: vi.fn((image: { data: Uint8ClampedArray }) => {
      if (alive) first = Array.from(image.data.slice(0, 4));
    }),
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
}

function fakeStage(ctx: unknown) {
  const toCanvas = vi.fn(() => ({ getContext: () => ctx, width: 2, height: 2 }));
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
    getPointerPosition: () => ({ x: 1, y: 1 }),
    toCanvas,
  };
  return { stage: stage as unknown as Konva.Stage, toCanvas };
}

function pointerEvent(stage: Konva.Stage) {
  return {
    target: { getStage: () => stage },
    evt: { altKey: false },
  } as unknown as Konva.KonvaEventObject<MouseEvent>;
}

beforeEach(() => {
  reportFailure.mockClear();
  useEditorStore.setState({ canvasSize: { width: 2, height: 2 }, zoom: 1, selection: null });
  useEditorStore.getState().setForegroundColor("#000000");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  editorStageRefHolder.current = null;
});

describe("eyedropper (#2139)", () => {
  function setup(ctx: unknown) {
    const { stage, toCanvas } = fakeStage(ctx);
    const hook = renderHook(() =>
      useEyedropperTool({ stageRef: { current: stage }, sampleSize: 1 }),
    );
    return { stage, toCanvas, hook };
  }

  it("samples the colour under the pointer when the document can be read", () => {
    const { stage, toCanvas, hook } = setup(fakeContext());

    act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));
    act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));

    expect(hook.result.current.sampledColor).toBe("#0a141e");
    // One capture serves every move until the next press.
    expect(toCanvas).toHaveBeenCalledTimes(1);
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("fails quietly on hover, and once, instead of throwing per move", () => {
    const { stage, toCanvas, hook } = setup(fakeContext({ readThrows: tainted() }));

    expect(() => {
      for (let i = 0; i < 5; i++) {
        act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));
      }
    }).not.toThrow();

    // A hover has no result to show, so it has nothing to apologise for either.
    expect(reportFailure).not.toHaveBeenCalled();
    // A failed capture stops the drag rather than retrying on every mousemove.
    expect(toCanvas).toHaveBeenCalledTimes(1);
    expect(hook.result.current.sampledColor).toBeNull();
  });

  it("tells the user, once, when a press finds the canvas tainted", () => {
    const { stage, toCanvas, hook } = setup(fakeContext({ readThrows: tainted() }));

    act(() => hook.result.current.handleEyedropperClick(pointerEvent(stage)));

    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith("tainted", messages);
    expect(toCanvas).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().foregroundColor).toBe("#000000");
  });

  it("says the document is too big when the browser couldn't back the canvas", () => {
    const { stage, hook } = setup(fakeContext({ alive: false }));

    act(() => hook.result.current.handleEyedropperClick(pointerEvent(stage)));

    expect(reportFailure).toHaveBeenCalledWith("no-context", messages);
    expect(useEditorStore.getState().foregroundColor).toBe("#000000");
    expect(hook.result.current.sampledColor).toBeNull();
  });

  it("tries again on the next press", () => {
    const { stage, toCanvas, hook } = setup(fakeContext({ readThrows: tainted() }));
    act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));
    act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));
    expect(toCanvas).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.handleEyedropperClick(pointerEvent(stage)));

    expect(toCanvas).toHaveBeenCalledTimes(2);
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });

  it("throws an unexpected capture error once per press, not once per mousemove", () => {
    const { stage, toCanvas, hook } = setup(fakeContext());
    toCanvas.mockImplementation(() => {
      throw new TypeError("konva broke");
    });

    expect(() => act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)))).toThrow(
      "konva broke",
    );
    for (let i = 0; i < 4; i++) {
      act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));
    }

    expect(toCanvas).toHaveBeenCalledTimes(1);
  });

  it("captures again after the canvas is resized or an edit is committed", () => {
    const { stage, toCanvas, hook } = setup(fakeContext());
    act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));
    expect(toCanvas).toHaveBeenCalledTimes(1);

    act(() => {
      useEditorStore.setState({ _historyVersion: useEditorStore.getState()._historyVersion + 1 });
    });
    act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));
    expect(toCanvas).toHaveBeenCalledTimes(2);

    act(() => {
      useEditorStore.setState({ canvasSize: { width: 3, height: 3 } });
    });
    act(() => hook.result.current.handleEyedropperMove(pointerEvent(stage)));
    expect(toCanvas).toHaveBeenCalledTimes(3);
  });
});

describe("magic wand (#2139)", () => {
  it("selects from the document pixels when it can be read", () => {
    const { stage } = fakeStage(fakeContext());
    const hook = renderHook(() => useSelectionTool());

    act(() => hook.result.current.magicWandSelect(stage, 0, 0, 32, true));

    expect(useEditorStore.getState().selection).not.toBeNull();
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("selects nothing and says why when the canvas is tainted", () => {
    const { stage } = fakeStage(fakeContext({ readThrows: tainted() }));
    const hook = renderHook(() => useSelectionTool());

    expect(() =>
      act(() => hook.result.current.magicWandSelect(stage, 0, 0, 32, true)),
    ).not.toThrow();

    expect(useEditorStore.getState().selection).toBeNull();
    expect(reportFailure).toHaveBeenCalledWith("tainted", messages);
  });

  it("selects nothing and says why when the whole document can't be read back", () => {
    const { stage } = fakeStage(fakeContext({ fullReadThrows: new RangeError("Out of memory") }));
    const hook = renderHook(() => useSelectionTool());

    expect(() =>
      act(() => hook.result.current.magicWandSelect(stage, 0, 0, 32, true)),
    ).not.toThrow();

    expect(useEditorStore.getState().selection).toBeNull();
    expect(reportFailure).toHaveBeenCalledWith("no-context", messages);
  });

  it("selects nothing, not the whole document, when the canvas is dead", () => {
    const { stage } = fakeStage(fakeContext({ alive: false }));
    const hook = renderHook(() => useSelectionTool());

    act(() => hook.result.current.magicWandSelect(stage, 0, 0, 32, true));

    expect(useEditorStore.getState().selection).toBeNull();
    expect(reportFailure).toHaveBeenCalledWith("no-context", messages);
  });
});

describe("histogram (#2139)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function setup(ctx: unknown) {
    const { stage, toCanvas } = fakeStage(ctx);
    editorStageRefHolder.current = stage;
    const hook = renderHook(() => useDocumentHistogram());
    return { toCanvas, hook };
  }

  it("hands back the document pixels once the stage can be read", () => {
    const { hook } = setup(fakeContext());

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(hook.result.current.imageData).not.toBeNull();
    expect(hook.result.current.unavailable).toBeNull();
  });

  it("says why, and keeps the previous histogram, when the canvas is tainted", () => {
    const readable = fakeContext();
    const { hook } = setup(readable);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const previous = hook.result.current.imageData;
    expect(previous).not.toBeNull();

    // The next edit makes the capture unreadable.
    const broken = fakeContext({ readThrows: tainted() });
    editorStageRefHolder.current = fakeStage(broken).stage;
    act(() => {
      useEditorStore.setState({ _historyVersion: useEditorStore.getState()._historyVersion + 1 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(hook.result.current.imageData).toBe(previous);
    expect(hook.result.current.unavailable).toBe("tainted");
    // A background recompute is not a user action: nothing is reported.
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it("reports a document too big to read back as no-context, not an uncaught error", () => {
    const { hook } = setup(fakeContext({ fullReadThrows: new RangeError("Out of memory") }));

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }).not.toThrow();

    expect(hook.result.current.unavailable).toBe("no-context");
    expect(hook.result.current.imageData).toBeNull();
  });

  it("reports a dead canvas as no-context", () => {
    const { hook } = setup(fakeContext({ alive: false }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(hook.result.current.unavailable).toBe("no-context");
    expect(hook.result.current.imageData).toBeNull();
  });

  it("clears the notice when a later capture works", () => {
    const { hook } = setup(fakeContext({ alive: false }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(hook.result.current.unavailable).toBe("no-context");

    editorStageRefHolder.current = fakeStage(fakeContext()).stage;
    act(() => {
      useEditorStore.setState({ _historyVersion: useEditorStore.getState()._historyVersion + 1 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(hook.result.current.unavailable).toBeNull();
    expect(hook.result.current.imageData).not.toBeNull();
  });

  it("lets an error that isn't about reading the canvas propagate", () => {
    const { stage } = fakeStage(fakeContext());
    (stage as unknown as { toCanvas: () => never }).toCanvas = () => {
      throw new Error("konva broke");
    };
    editorStageRefHolder.current = stage;
    renderHook(() => useDocumentHistogram());

    expect(() => vi.advanceTimersByTime(100)).toThrow("konva broke");
  });
});
