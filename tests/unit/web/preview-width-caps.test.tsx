// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ captureHandledError: vi.fn() }));

import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { ImageViewer } from "@/components/common/image-viewer";
import { SideBySideComparison } from "@/components/common/side-by-side-comparison";

// jsdom has no ResizeObserver; capture the slider's callback to fire it by hand.
let resizeCallback: (() => void) | null = null;
beforeEach(() => {
  resizeCallback = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resizeCallback = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setBox(img: HTMLElement, box: Record<string, number>) {
  for (const [key, value] of Object.entries(box)) {
    Object.defineProperty(img, key, { value, configurable: true });
  }
}

// A fixed max-w-* on a preview root caps it at 672-768 px however wide the pane
// is, which left most of a 2560 px window empty (#4822). Each view's height cap
// (70dvh, 56dvh, or the fit-to-container zoom) is what bounds the image.
function widthCaps(el: Element | null): string[] {
  if (!el) throw new Error("preview root not found");
  return [...el.classList].filter((c) => /^max-w-(?!full$)/.test(c));
}

describe("preview width caps (#4822)", () => {
  it("before/after slider wrapper has no fixed max width", () => {
    render(<BeforeAfterSlider beforeSrc="blob:before" afterSrc="blob:after" />);
    expect(widthCaps(screen.getByRole("slider").parentElement)).toEqual([]);
    expect(screen.getByAltText("Original").classList).toContain("max-h-[70dvh]");
  });

  it("before/after slider frame stops at the image's width at the height cap", () => {
    render(<BeforeAfterSlider beforeSrc="blob:before" afterSrc="blob:after" />);
    const slider = screen.getByRole("slider");
    expect(slider.style.maxWidth).toBe("");

    const before = screen.getByAltText("Original");
    setBox(before, { naturalWidth: 3000, naturalHeight: 2000 });
    fireEvent.load(before);

    // jsdom's cssstyle may fold calc(70dvh * 1.5) to calc(105dvh)
    expect(slider.style.maxWidth).toMatch(/^calc\((70dvh \* 1\.5|105dvh)\)$/);
  });

  it("before/after slider re-measures the after layer when the frame resizes", () => {
    render(<BeforeAfterSlider beforeSrc="blob:before" afterSrc="blob:after" />);
    const after = screen.getByAltText("Processed");
    setBox(after, {
      naturalWidth: 1000,
      naturalHeight: 1000,
      clientWidth: 1600,
      clientHeight: 800,
    });
    fireEvent.load(after);
    const layer = () => after.previousElementSibling as HTMLElement;
    expect(layer().style).toMatchObject({ left: "400px", width: "800px" });

    // The frame narrows once the before image's aspect cap applies
    setBox(after, { clientWidth: 800, clientHeight: 800 });
    act(() => resizeCallback?.());
    expect(layer().style).toMatchObject({ left: "0px", width: "800px" });
  });

  it("side-by-side comparison has no fixed max width", () => {
    render(<SideBySideComparison beforeSrc="blob:before" afterSrc="blob:after" />);
    expect(widthCaps(screen.getByRole("region"))).toEqual([]);
    expect(screen.getByAltText("Original").classList).toContain("max-h-[56dvh]");
  });

  it("single image viewer has no fixed max width", () => {
    const { container } = render(<ImageViewer src="blob:img" filename="a.png" fileSize={1} />);
    expect(widthCaps(container.firstElementChild)).toEqual([]);
  });
});
