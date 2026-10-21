// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/editor/editor-canvas", () => ({
  editorStageRefHolder: { current: null as unknown },
}));

import {
  composeChannelLuts,
  curveLut,
  defaultCurvesState,
  defaultLevelsState,
} from "@/components/editor/adjustment-lut";
import { AdjustmentsPanel } from "@/components/editor/panels/adjustments-panel";
import {
  createDefaultAdjustments,
  createDefaultFilters,
  createDefaultLayers,
  useEditorStore,
} from "@/stores/editor-store";

const INITIAL = useEditorStore.getState();

function mockCanvas2dContext() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe("curveLut duplicate-x handling (#2677)", () => {
  it("deduplicates same-x points in natural cubic spline interpolation instead of returning NaN", () => {
    const withDuplicateX = [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 200 },
      { x: 255, y: 255 },
    ];
    const lut = curveLut(withDuplicateX);

    expect(lut).toHaveLength(256);
    for (let i = 0; i < 256; i++) {
      expect(Number.isInteger(lut[i])).toBe(true);
      expect(lut[i]).toBeGreaterThanOrEqual(0);
      expect(lut[i]).toBeLessThanOrEqual(255);
    }

    // Keeping the later point at x = 100 matches normalizeCurvePoints in editor-store,
    // including when duplicate-x points arrive unsorted and non-adjacent.
    expect(lut).toEqual(
      curveLut([
        { x: 0, y: 0 },
        { x: 100, y: 200 },
        { x: 255, y: 255 },
      ]),
    );
    expect(
      curveLut([
        { x: 255, y: 255 },
        { x: 100, y: 50 },
        { x: 0, y: 0 },
        { x: 100, y: 200 },
      ]),
    ).toEqual(lut);
    expect(lut[100]).toBe(200);
  });

  it("reduces 3 points with a duplicate x to 2-point linear interpolation", () => {
    const lut = curveLut([
      { x: 20, y: 10 },
      { x: 20, y: 80 },
      { x: 200, y: 220 },
    ]);

    expect(lut).toEqual(
      curveLut([
        { x: 20, y: 80 },
        { x: 200, y: 220 },
      ]),
    );
    expect(lut[0]).toBe(80);
    expect(lut[20]).toBe(80);
    expect(lut[200]).toBe(220);
    expect(lut[255]).toBe(220);
  });

  it("falls back to the identity ramp when fewer than 2 distinct x coordinates remain", () => {
    const expectedIdentity = Array.from({ length: 256 }, (_, i) => i);

    expect(curveLut([])).toEqual(expectedIdentity);
    expect(curveLut([{ x: 100, y: 50 }])).toEqual(expectedIdentity);

    expect(
      curveLut([
        { x: 100, y: 50 },
        { x: 100, y: 200 },
      ]),
    ).toEqual(expectedIdentity);

    expect(
      curveLut([
        { x: 100, y: 50 },
        { x: 100, y: 120 },
        { x: 100, y: 200 },
      ]),
    ).toEqual(expectedIdentity);

    expect(
      curveLut([
        { x: Number.NaN, y: 0 },
        { x: 100, y: 200 },
      ]),
    ).toEqual(expectedIdentity);

    expect(
      curveLut([
        { x: 0, y: Number.NaN },
        { x: 100, y: Number.POSITIVE_INFINITY },
      ]),
    ).toEqual(expectedIdentity);

    // Non-finite points are filtered out while remaining valid points still interpolate.
    expect(
      curveLut([
        { x: 0, y: 0 },
        { x: 100, y: Number.NaN },
        { x: 128, y: 200 },
        { x: 255, y: 255 },
      ]),
    ).toEqual(
      curveLut([
        { x: 0, y: 0 },
        { x: 128, y: 200 },
        { x: 255, y: 255 },
      ]),
    );
  });

  it("produces finite channel LUTs through composeChannelLuts when a channel has duplicate x points", () => {
    const levels = defaultLevelsState();
    const curves = {
      ...defaultCurvesState(),
      rgb: [
        { x: 0, y: 0 },
        { x: 120, y: 40 },
        { x: 120, y: 210 },
        { x: 255, y: 255 },
      ],
    };

    const composed = composeChannelLuts(levels, curves);
    for (const ch of [composed.r, composed.g, composed.b]) {
      expect(ch).toHaveLength(256);
      expect(ch.every((v: number) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
    }
  });
});

describe("CurvesSection control point dragging (#2677)", () => {
  let contexts: Array<ReturnType<typeof mockCanvas2dContext>> = [];

  beforeEach(() => {
    contexts = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      const ctx = mockCanvas2dContext();
      contexts.push(ctx);
      return ctx;
    });
    useEditorStore.setState(
      {
        ...INITIAL,
        layers: createDefaultLayers(),
        adjustments: createDefaultAdjustments(),
        filters: createDefaultFilters(),
        levels: defaultLevelsState(),
        curves: defaultCurvesState(),
      },
      true,
    );
    useEditorStore.temporal.getState().clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function getCurvesCanvas(container: HTMLElement): HTMLCanvasElement {
    const canvases = Array.from(container.querySelectorAll("canvas"));
    const curvesCanvas = canvases.find((c) => c.width === 200 && c.height === 200);
    if (!curvesCanvas) throw new Error("Curves 200x200 canvas not found");
    vi.spyOn(curvesCanvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 255,
      height: 255,
      right: 255,
      bottom: 255,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    return curvesCanvas;
  }

  it("keeps draggingIndex aligned with the store when clicking at an existing point's x coordinate", () => {
    act(() => {
      useEditorStore.getState().setCurves("rgb", [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
        { x: 255, y: 255 },
      ]);
    });

    const { container } = render(<AdjustmentsPanel />);
    const canvas = getCurvesCanvas(container);

    // Click at (x: 100, y: 200) -> clientX = 100, clientY = 255 - 200 = 55.
    // Far from (100, 50), so findNearPoint returns -1 and replaces the x=100 point.
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 55 });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 200 },
      { x: 255, y: 255 },
    ]);

    // Subsequent drag to (x: 120, y: 180) -> clientX = 120, clientY = 255 - 180 = 75
    // must move the middle point rather than overwriting the (255, 255) endpoint.
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 75 });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 180 },
      { x: 255, y: 255 },
    ]);
  });

  it("clamps a dragged control point between its neighbors instead of colliding at the same x", () => {
    act(() => {
      useEditorStore.getState().setCurves("rgb", [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 180, y: 200 },
        { x: 255, y: 255 },
      ]);
    });

    const { container } = render(<AdjustmentsPanel />);
    const canvas = getCurvesCanvas(container);

    // Grab point 1 at (100, 100) -> clientX = 100, clientY = 255 - 100 = 155.
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 155 });

    // Drag right onto (180, 200) -> clientX = 180, clientY = 255 - 200 = 55.
    // Point 1's x must clamp to 179 (180 - 1) so all 4 points remain distinct
    // and draggingIndex stays on point 1.
    fireEvent.mouseMove(canvas, { clientX: 180, clientY: 55 });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 179, y: 200 },
      { x: 180, y: 200 },
      { x: 255, y: 255 },
    ]);

    // Continue dragging left past 0 -> clientX = 0, clientY = 255 - 90 = 165.
    // Point 1's x clamps to 1 (0 + 1), still moving point 1 rather than point 2.
    fireEvent.mouseMove(canvas, { clientX: 0, clientY: 165 });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 90 },
      { x: 180, y: 200 },
      { x: 255, y: 255 },
    ]);
    fireEvent.mouseUp(canvas);
  });

  it("clamps a 2-point curve's endpoints so dragging one onto the other's x does not reset to identity", () => {
    const { container } = render(<AdjustmentsPanel />);
    const canvas = getCurvesCanvas(container);

    // Grab point 0 at (0, 0) -> clientX = 0, clientY = 255.
    fireEvent.mouseDown(canvas, { clientX: 0, clientY: 255 });

    // Drag point 0 all the way to (255, 120) -> clientX = 255, clientY = 255 - 120 = 135.
    // Point 0 clamps at x = 254 instead of colliding with (255, 255) and resetting to IDENTITY_CURVE.
    fireEvent.mouseMove(canvas, { clientX: 255, clientY: 135 });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 254, y: 120 },
      { x: 255, y: 255 },
    ]);
    fireEvent.mouseUp(canvas);

    // Reset to identity and drag the right endpoint (index 1 at (255, 255)) left to x = 0.
    act(() => {
      useEditorStore.getState().resetCurves();
    });
    fireEvent.mouseDown(canvas, { clientX: 255, clientY: 0 });
    fireEvent.mouseMove(canvas, { clientX: 0, clientY: 100 });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 155 },
    ]);
  });

  it("draws finite curve coordinates on the canvas and ignores stale draggingIndex if points shrink mid-drag", () => {
    act(() => {
      useEditorStore.setState({
        curves: {
          ...defaultCurvesState(),
          rgb: [
            { x: 0, y: 0 },
            { x: 100, y: 50 },
            { x: 100, y: 200 },
            { x: 255, y: 255 },
          ],
        },
      });
    });

    const { container } = render(<AdjustmentsPanel />);
    const canvas = getCurvesCanvas(container);

    const lineToCalls = contexts.flatMap((c) =>
      (c.lineTo as ReturnType<typeof vi.fn>).mock.calls.map((args) => args as [number, number]),
    );
    expect(lineToCalls.length).toBeGreaterThanOrEqual(255);
    for (const [x, y] of lineToCalls) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }

    // Start dragging index 3 ((255, 255)), then shrink curves.rgb to 2 points mid-drag.
    fireEvent.mouseDown(canvas, { clientX: 255, clientY: 0 });
    act(() => {
      useEditorStore.getState().resetCurves();
    });
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 120 });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
  });

  it("syncs the Curves preset dropdown when dragging an existing preset point, switching channels, resetting, or undoing (#3177)", () => {
    const { container, getByText } = render(<AdjustmentsPanel />);
    const canvas = getCurvesCanvas(container);
    const selects = Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];
    // Levels has 1 channel select; Curves has channel select + preset select.
    const presetSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "darken"),
    );
    const curvesChannelSelect = selects.find(
      (s) => s !== presetSelect && s.parentElement === presetSelect?.parentElement,
    );
    if (!presetSelect || !curvesChannelSelect) {
      throw new Error("Curves channel or preset select not found");
    }

    expect(presetSelect.value).toBe("linear");

    // 1. Select the Darken preset: [(0, 0), (128, 96), (255, 220)].
    fireEvent.change(presetSelect, { target: { value: "darken" } });
    expect(presetSelect.value).toBe("darken");
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 128, y: 96 },
      { x: 255, y: 220 },
    ]);

    // 2. Drag the existing midpoint at (128, 96) -> clientX = 128, clientY = 255 - 96 = 159.
    fireEvent.mouseDown(canvas, { clientX: 128, clientY: 159 });
    fireEvent.mouseMove(canvas, { clientX: 140, clientY: 105 });
    fireEvent.mouseUp(canvas);
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 140, y: 150 },
      { x: 255, y: 220 },
    ]);

    // Preset dropdown must switch to "Custom" so Darken can be re-selected.
    expect(presetSelect.value).toBe("Custom");

    // Re-selecting Darken restores the preset points.
    fireEvent.change(presetSelect, { target: { value: "darken" } });
    expect(presetSelect.value).toBe("darken");
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 128, y: 96 },
      { x: 255, y: 220 },
    ]);

    // 3. Switching channels reflects the target channel's curve preset ("linear" on red).
    fireEvent.change(curvesChannelSelect, { target: { value: "red" } });
    expect(curvesChannelSelect.value).toBe("red");
    expect(presetSelect.value).toBe("linear");

    // Switch back to rgb: preset reflects "darken" again.
    fireEvent.change(curvesChannelSelect, { target: { value: "rgb" } });
    expect(presetSelect.value).toBe("darken");

    // 4. Undo/redo and Reset All keep the preset select in sync with curves[channel].
    act(() => {
      useEditorStore.temporal.getState().undo();
    });
    expect(presetSelect.value).toBe("Custom");

    act(() => {
      useEditorStore.temporal.getState().redo();
    });
    expect(presetSelect.value).toBe("darken");

    fireEvent.click(getByText("Reset All"));
    expect(presetSelect.value).toBe("linear");

    // 5. Adding a midpoint on canvas switches preset to "Custom", and double-clicking
    // that midpoint removes it and restores the "linear" preset automatically.
    fireEvent.mouseDown(canvas, { clientX: 128, clientY: 159 });
    fireEvent.mouseUp(canvas);
    expect(presetSelect.value).toBe("Custom");

    // Choosing "Custom" directly is a no-op that preserves the hand-edited points.
    fireEvent.change(presetSelect, { target: { value: "Custom" } });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 128, y: 96 },
      { x: 255, y: 255 },
    ]);

    fireEvent.doubleClick(canvas, { clientX: 128, clientY: 159 });
    expect(useEditorStore.getState().curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
    expect(presetSelect.value).toBe("linear");
  });
});
