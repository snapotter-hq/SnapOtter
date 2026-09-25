// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type Konva from "konva";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import { useEditorStore } from "@/stores/editor-store";

const INITIAL = useEditorStore.getState();

// Two touches `dist` pixels apart, centred on (100, 100). dist 0 means both
// fingers on the same pixel.
function pinchEvent(dist: number) {
  const touches = [
    { clientX: 100 - dist / 2, clientY: 100 },
    { clientX: 100 + dist / 2, clientY: 100 },
  ];
  return {
    evt: { touches, preventDefault: vi.fn() },
  } as unknown as Konva.KonvaEventObject<TouchEvent>;
}

function setup() {
  const { result } = renderHook(() => useCanvasZoom());
  const pinch = (dist: number) => act(() => result.current.handleTouchMove(pinchEvent(dist)));
  return { pinch };
}

const view = () => {
  const { zoom, panOffset } = useEditorStore.getState();
  return { zoom, panOffset };
};

beforeEach(() => {
  useEditorStore.setState({ ...INITIAL, zoom: 2, panOffset: { x: 10, y: 20 } }, true);
});

afterEach(() => {
  cleanup();
});

describe("useCanvasZoom pinch", () => {
  it("scales zoom by the change in finger distance", () => {
    const { pinch } = setup();
    pinch(100);
    pinch(200);
    expect(view().zoom).toBe(4);
  });

  it("leaves zoom and pan untouched when both fingers stay on one pixel (0 / 0)", () => {
    const { pinch } = setup();
    pinch(0);
    pinch(0);
    expect(view()).toEqual({ zoom: 2, panOffset: { x: 10, y: 20 } });
  });

  it("does not snap to max zoom when coincident fingers spread apart (n / 0)", () => {
    const { pinch } = setup();
    pinch(0);
    pinch(50);
    expect(view()).toEqual({ zoom: 2, panOffset: { x: 10, y: 20 } });
  });

  it("does not snap to min zoom when fingers close onto one pixel (0 / n)", () => {
    const { pinch } = setup();
    pinch(50);
    pinch(0);
    expect(view()).toEqual({ zoom: 2, panOffset: { x: 10, y: 20 } });
  });

  it("resumes pinch zoom from the next frame after a zero-distance frame", () => {
    const { pinch } = setup();
    pinch(0);
    pinch(0);
    pinch(100);
    pinch(150);
    expect(view().zoom).toBe(3);
    expect(Number.isFinite(view().panOffset.x)).toBe(true);
    expect(Number.isFinite(view().panOffset.y)).toBe(true);
  });
});
