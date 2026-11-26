// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextOverlayCanvas } from "@/components/tools/text-overlay-canvas";
import type { TextOverlayLayout } from "@/lib/text-overlay-placement";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const layout: TextOverlayLayout = {
  text: "Hi",
  fontSize: 40,
  color: "#ffffff",
  position: "custom",
  x: 50,
  y: 50,
  wrap: true,
  maxWidth: 90,
};

function renderCanvas(onPlace = vi.fn()) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 200,
    right: 400,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  render(<TextOverlayCanvas imageSrc="blob:x" layout={layout} onPlace={onPlace} />);
  const img = screen.getByAltText("Image preview");
  Object.defineProperty(img, "naturalWidth", { value: 1000 });
  Object.defineProperty(img, "naturalHeight", { value: 500 });
  fireEvent.load(img);
  const box = screen.getByTestId("text-overlay-box");
  box.setPointerCapture = vi.fn();
  return { box, onPlace };
}

describe("TextOverlayCanvas", () => {
  it("draws no box until the image has loaded", () => {
    render(<TextOverlayCanvas imageSrc="blob:x" layout={layout} onPlace={vi.fn()} />);
    expect(screen.queryByTestId("text-overlay-box")).toBeNull();
  });

  it("reports whole-percent x and y while the box is dragged, keeping the grab offset", () => {
    const { box, onPlace } = renderCanvas();
    // Box centre is at (200, 100) px; grab 20px right of it.
    fireEvent.pointerDown(box, { clientX: 220, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 120, clientY: 50, pointerId: 1 });
    expect(onPlace).toHaveBeenLastCalledWith({ x: 25, y: 25 });
  });

  it("clamps a drag past the edge so the box stays inside the image", () => {
    const { box, onPlace } = renderCanvas();
    fireEvent.pointerDown(box, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 5000, clientY: 5000, pointerId: 1 });
    const [{ x, y }] = onPlace.mock.calls.at(-1) as [{ x: number; y: number }];
    expect(x).toBeLessThan(100);
    expect(y).toBeLessThan(100);
    expect(x).toBeGreaterThan(50);
  });

  it("stops reporting after the pointer is released", () => {
    const { box, onPlace } = renderCanvas();
    fireEvent.pointerDown(box, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    onPlace.mockClear();
    fireEvent.pointerMove(box, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(onPlace).not.toHaveBeenCalled();
  });

  it("nudges with the arrow keys", () => {
    const { box, onPlace } = renderCanvas();
    fireEvent.keyDown(box, { key: "ArrowRight" });
    expect(onPlace).toHaveBeenLastCalledWith({ x: 51, y: 50 });
    fireEvent.keyDown(box, { key: "ArrowUp", shiftKey: true });
    expect(onPlace).toHaveBeenLastCalledWith({ x: 50, y: 40 });
  });
});
