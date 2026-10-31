// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigatorPanel } from "@/components/editor/panels/navigator-panel";
import { useEditorStore } from "@/stores/editor-store";

class FakeImage {
  static instances: FakeImage[] = [];

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  src = "";

  constructor() {
    FakeImage.instances.push(this);
  }
}

const INITIAL = useEditorStore.getState();

describe("NavigatorPanel thumbnail loading (#2941)", () => {
  const drawImage = vi.fn();
  const clearRect = vi.fn();
  const fillRect = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    FakeImage.instances = [];
    drawImage.mockClear();
    clearRect.mockClear();
    fillRect.mockClear();
    vi.stubGlobal("Image", FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      clearRect,
      fillRect,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);
    useEditorStore.setState({ ...INITIAL }, true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears the previous document thumbnail and does not redraw it when a new sourceImageUrl fails to load", () => {
    act(() => {
      useEditorStore.getState().loadImage("blob:first-doc", 200, 150);
    });

    render(<NavigatorPanel />);

    expect(FakeImage.instances).toHaveLength(1);
    const firstImg = FakeImage.instances[0];
    expect(firstImg.crossOrigin).toBe("anonymous");
    expect(firstImg.src).toBe("blob:first-doc");

    act(() => {
      firstImg.onload?.();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenLastCalledWith(firstImg, 0, 0, 107, 80);

    drawImage.mockClear();
    clearRect.mockClear();

    // Load a second document whose sourceImageUrl fails its CORS or network load
    // at a new aspect ratio (400x400 -> 80x80 thumbnail).
    act(() => {
      useEditorStore.getState().loadImage("https://blocked.example.test/no-cors.png", 400, 400);
    });

    // The previous thumbnail is cleared synchronously on URL change, before
    // the new image settles or the 500ms throttle window elapses.
    expect(clearRect).toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    clearRect.mockClear();

    expect(FakeImage.instances).toHaveLength(2);
    const secondImg = FakeImage.instances[1];
    expect(secondImg.crossOrigin).toBe("anonymous");
    expect(secondImg.src).toBe("https://blocked.example.test/no-cors.png");

    act(() => {
      secondImg.onerror?.();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(drawImage).not.toHaveBeenCalled();
  });

  it("clears the canvas when a new sourceImageUrl fails at the same aspect ratio", () => {
    act(() => {
      useEditorStore.getState().loadImage("blob:first-doc", 200, 150);
    });

    render(<NavigatorPanel />);

    const firstImg = FakeImage.instances[0];
    act(() => {
      firstImg.onload?.();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(drawImage).toHaveBeenCalledTimes(1);
    drawImage.mockClear();
    clearRect.mockClear();

    act(() => {
      useEditorStore.getState().loadImage("https://blocked.example.test/same-aspect.png", 200, 150);
    });

    // Synchronous clear before onerror or the 500ms throttle timer fires.
    expect(clearRect).toHaveBeenCalledWith(0, 0, 107, 80);
    expect(drawImage).not.toHaveBeenCalled();

    const secondImg = FakeImage.instances[1];
    act(() => {
      secondImg.onerror?.();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(drawImage).not.toHaveBeenCalled();
  });

  it("cancels a pending throttled draw when sourceImageUrl changes before the 500ms timer fires", () => {
    act(() => {
      useEditorStore.getState().loadImage("blob:first-doc", 200, 150);
    });

    render(<NavigatorPanel />);

    const firstImg = FakeImage.instances[0];
    act(() => {
      firstImg.onload?.();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(drawImage).not.toHaveBeenCalled();
    clearRect.mockClear();

    // Switch URLs while the 500ms redraw timer for firstImg is still pending.
    act(() => {
      useEditorStore.getState().loadImage("https://blocked.example.test/no-cors.png", 400, 400);
    });

    expect(clearRect).toHaveBeenCalled();

    const secondImg = FakeImage.instances[1];
    act(() => {
      secondImg.onerror?.();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(drawImage).not.toHaveBeenCalled();
  });

  it("ignores a stale onload from the previous sourceImageUrl after switching to a new URL", () => {
    act(() => {
      useEditorStore.getState().loadImage("https://slow.example.test/first.png", 200, 150);
    });

    render(<NavigatorPanel />);

    const firstImg = FakeImage.instances[0];

    // Switch to a second URL before the first image finishes loading.
    act(() => {
      useEditorStore.getState().loadImage("https://blocked.example.test/second.png", 400, 400);
    });

    const secondImg = FakeImage.instances[1];
    act(() => {
      secondImg.onerror?.();
      firstImg.onload?.();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(drawImage).not.toHaveBeenCalled();
  });

  it("ignores a stale onerror from the previous sourceImageUrl after a new URL has loaded", () => {
    act(() => {
      useEditorStore.getState().loadImage("https://slow.example.test/first.png", 200, 150);
    });

    render(<NavigatorPanel />);

    const firstImg = FakeImage.instances[0];

    act(() => {
      useEditorStore.getState().loadImage("blob:second-doc", 400, 400);
    });

    const secondImg = FakeImage.instances[1];
    act(() => {
      secondImg.onload?.();
      firstImg.onerror?.();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenLastCalledWith(secondImg, 0, 0, 80, 80);
  });

  it("renders the empty state when sourceImageUrl becomes null", () => {
    act(() => {
      useEditorStore.getState().loadImage("blob:first-doc", 200, 150);
    });

    render(<NavigatorPanel />);

    act(() => {
      FakeImage.instances[0].onload?.();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(drawImage).toHaveBeenCalledTimes(1);

    act(() => {
      useEditorStore.setState({ sourceImageUrl: null });
    });

    expect(screen.getByText(en.editor.panels.navigator.noImageLoaded)).toBeInTheDocument();
  });
});
