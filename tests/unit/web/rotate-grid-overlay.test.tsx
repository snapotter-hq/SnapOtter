// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ captureHandledError: vi.fn() }));

import { ImageViewer } from "@/components/common/image-viewer";
import { type PreviewTransform, RotateControls } from "@/components/tools/rotate-settings";

afterEach(() => {
  cleanup();
});

function lastTransform(spy: ReturnType<typeof vi.fn>): PreviewTransform {
  return spy.mock.calls.at(-1)?.[0] as PreviewTransform;
}

describe("rotate gridline overlay (#732)", () => {
  it("asks for the grid while straightening, not for quarter turns", () => {
    const onPreviewTransform = vi.fn();
    render(<RotateControls onPreviewTransform={onPreviewTransform} />);

    expect(lastTransform(onPreviewTransform).showGrid).toBe(false);

    fireEvent.click(screen.getByTestId("rotate-right"));
    expect(lastTransform(onPreviewTransform)).toMatchObject({ rotate: 90, showGrid: false });

    fireEvent.change(screen.getByLabelText(/straighten/i), { target: { value: "2.5" } });
    expect(lastTransform(onPreviewTransform)).toMatchObject({ rotate: 92.5, showGrid: true });

    fireEvent.change(screen.getByLabelText(/straighten/i), { target: { value: "0" } });
    expect(lastTransform(onPreviewTransform)).toMatchObject({ rotate: 90, showGrid: false });
  });

  it("asks for the grid on a fine rotation from the 1 degree steps", () => {
    const onPreviewTransform = vi.fn();
    render(<RotateControls onPreviewTransform={onPreviewTransform} />);

    fireEvent.click(screen.getByTitle("Decrease 1°"));
    expect(lastTransform(onPreviewTransform)).toMatchObject({ rotate: -1, showGrid: true });
  });

  it("draws a non-interactive grid over the preview when asked", () => {
    render(<ImageViewer src="blob:in" filename="in.png" fileSize={5} cssRotate={3} gridOverlay />);

    const grid = screen.getByTestId("image-viewer-grid");
    expect(grid).toHaveAttribute("aria-hidden", "true");
    expect(grid).toHaveClass("pointer-events-none");
    // The grid stays level: it is not inside the rotated image
    expect(grid.style.transform).toBe("");
  });

  it("drops the grid when the image fails to load", () => {
    render(<ImageViewer src="blob:in" filename="in.png" fileSize={5} cssRotate={3} gridOverlay />);

    fireEvent.error(screen.getByAltText("in.png"));

    expect(screen.queryByTestId("image-viewer-grid")).not.toBeInTheDocument();
  });

  it("draws no grid by default", () => {
    render(<ImageViewer src="blob:in" filename="in.png" fileSize={5} cssRotate={90} />);

    expect(screen.queryByTestId("image-viewer-grid")).not.toBeInTheDocument();
  });
});
