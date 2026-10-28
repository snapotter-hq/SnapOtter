// @vitest-environment jsdom

/**
 * Tool panels stop a size the API would reject (#2186).
 *
 * Every resize-style route caps a side at MAX_RESIZE_OUTPUT_DIMENSION and
 * smart-crop also caps output area at MAX_RESIZE_OUTPUT_PIXELS. A typed value
 * over a ceiling used to go out untouched and come back a generic 400
 * "Invalid settings". The panels now flag it inline and block submit instead
 * of silently clamping, because the typed size is what the user asked for.
 */

import "@testing-library/jest-dom/vitest";
import { MAX_RESIZE_OUTPUT_DIMENSION, MAX_RESIZE_OUTPUT_PIXELS } from "@snapotter/shared";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processFiles = vi.hoisted(() => vi.fn());
const processAllFiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles,
    processAllFiles,
    processing: false,
    error: null,
    downloadUrl: null,
    progress: { phase: "idle", percent: 0, elapsed: 0 },
  }),
}));

vi.mock("@/hooks/use-gif-info", () => ({
  useGifInfo: () => ({
    info: {
      width: 800,
      height: 600,
      pages: 4,
      delay: [100, 100, 100, 100],
      loop: 0,
      fileSize: 4096,
      duration: 400,
    },
    loading: false,
  }),
}));

import { ContentAwareResizeSettings } from "@/components/tools/content-aware-resize-settings";
import { GifToolsSettings } from "@/components/tools/gif-tools-settings";
import { ResizeSettings } from "@/components/tools/resize-settings";
import { SmartCropSettings } from "@/components/tools/smart-crop-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

const resizeCopy = en.toolSettings.resize;
const gifCopy = en.toolSettings["gif-tools"];
const smartCropCopy = en.toolSettings["smart-crop"];
const contentAwareCopy = en.toolSettings["content-aware-resize"];

const resizeMessage = format(resizeCopy.maxDimensionExceeded, {
  max: MAX_RESIZE_OUTPUT_DIMENSION,
});
const gifMessage = format(gifCopy.maxDimensionExceeded, { max: MAX_RESIZE_OUTPUT_DIMENSION });
const smartCropMessage = format(smartCropCopy.maxDimensionExceeded, {
  max: MAX_RESIZE_OUTPUT_DIMENSION,
});
const smartCropAreaMessage = format(smartCropCopy.cropAreaExceeded, {
  max: MAX_RESIZE_OUTPUT_PIXELS,
});
const contentAwareMessage = format(contentAwareCopy.maxDimensionExceeded, {
  max: MAX_RESIZE_OUTPUT_DIMENSION,
});

function open(ui: ReactNode) {
  render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  processFiles.mockReset();
  processAllFiles.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([new File(["a"], "photo.png", { type: "image/png" })]);
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("Resize panel dimension cap (#2186)", () => {
  it("flags a typed width over the ceiling and blocks submit instead of clamping it", () => {
    open(<ResizeSettings />);
    const width = screen.getByLabelText(resizeCopy.widthPx) as HTMLInputElement;
    const height = screen.getByLabelText(resizeCopy.heightPx) as HTMLInputElement;

    expect(width).toHaveAttribute("min", "1");
    expect(width).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));

    fireEvent.change(width, { target: { value: "20000" } });
    // The value stays exactly what was typed; only the run is blocked.
    expect(width.value).toBe("20000");
    expect(screen.getByText(resizeMessage)).toBeInTheDocument();
    expect(screen.getByTestId("resize-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("resize-submit"));
    expect(processFiles).not.toHaveBeenCalled();

    fireEvent.change(width, { target: { value: "16000" } });
    expect(screen.queryByText(resizeMessage)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("resize-submit"));
    expect(processFiles).toHaveBeenCalledTimes(1);
    expect(processFiles.mock.calls[0][1]).toMatchObject({ width: 16000 });
  });

  it("flags an over-ceiling size on the Content-Aware tab too", () => {
    open(<ResizeSettings />);
    fireEvent.click(screen.getByRole("button", { name: resizeCopy.contentAware }));
    const width = screen.getByLabelText(resizeCopy.widthPx) as HTMLInputElement;

    fireEvent.change(width, { target: { value: "20000" } });
    expect(screen.getByText(resizeMessage)).toBeInTheDocument();
    expect(screen.getByTestId("resize-submit")).toBeDisabled();
  });

  it("blocks a zero or negative size the route also rejects", () => {
    open(<ResizeSettings />);
    const width = screen.getByLabelText(resizeCopy.widthPx) as HTMLInputElement;

    fireEvent.change(width, { target: { value: "-4" } });
    expect(screen.getByText(resizeMessage)).toBeInTheDocument();
    expect(screen.getByTestId("resize-submit")).toBeDisabled();
  });
});

describe("GIF Tools panel dimension cap (#2186)", () => {
  it("flags a typed width over the ceiling and blocks submit", () => {
    open(<GifToolsSettings />);
    const width = screen.getByLabelText(gifCopy.widthPx) as HTMLInputElement;
    const height = screen.getByLabelText(gifCopy.heightPx) as HTMLInputElement;

    expect(width).toHaveAttribute("min", "1");
    expect(width).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));

    fireEvent.change(width, { target: { value: "20000" } });
    expect(width.value).toBe("20000");
    expect(screen.getByText(gifMessage)).toBeInTheDocument();
    expect(screen.getByTestId("gif-tools-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("gif-tools-submit"));
    expect(processFiles).not.toHaveBeenCalled();

    fireEvent.change(width, { target: { value: "1200" } });
    expect(screen.queryByText(gifMessage)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("gif-tools-submit"));
    expect(processFiles).toHaveBeenCalledTimes(1);
    expect(processFiles.mock.calls[0][1]).toMatchObject({ width: 1200 });
  });
});

describe("Smart Crop panel dimension cap (#2186)", () => {
  it("flags a typed crop side over the ceiling and blocks submit", () => {
    open(<SmartCropSettings />);
    const width = screen.getByLabelText(smartCropCopy.widthPx) as HTMLInputElement;
    const height = screen.getByLabelText(smartCropCopy.heightPx) as HTMLInputElement;

    expect(width).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));

    fireEvent.change(width, { target: { value: "20000" } });
    expect(width.value).toBe("20000");
    expect(screen.getByText(smartCropMessage)).toBeInTheDocument();
    expect(screen.getByTestId("smart-crop-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("smart-crop-submit"));
    expect(processFiles).not.toHaveBeenCalled();
  });

  it("flags a crop whose sides are each valid but whose area is over the pixel budget", () => {
    open(<SmartCropSettings />);
    const width = screen.getByLabelText(smartCropCopy.widthPx) as HTMLInputElement;
    const height = screen.getByLabelText(smartCropCopy.heightPx) as HTMLInputElement;

    fireEvent.change(width, { target: { value: String(MAX_RESIZE_OUTPUT_DIMENSION) } });
    fireEvent.change(height, { target: { value: String(MAX_RESIZE_OUTPUT_DIMENSION) } });
    expect(width.value).toBe(String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height.value).toBe(String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(screen.getByText(smartCropAreaMessage)).toBeInTheDocument();
    expect(screen.getByTestId("smart-crop-submit")).toBeDisabled();
  });

  it("flags an over-ceiling trim target size and omits a cleared one", () => {
    open(<SmartCropSettings />);
    fireEvent.click(screen.getByRole("button", { name: smartCropCopy.autoTrim }));
    fireEvent.click(screen.getByLabelText(smartCropCopy.padToSquare));

    const targetSize = screen.getByLabelText(smartCropCopy.targetSizePx) as HTMLInputElement;
    expect(targetSize).toHaveAttribute("max", "8192");

    fireEvent.change(targetSize, { target: { value: "9000" } });
    expect(
      screen.getByText(format(smartCropCopy.maxDimensionExceeded, { max: 8192 })),
    ).toBeInTheDocument();
    expect(screen.getByTestId("smart-crop-submit")).toBeDisabled();

    // Clearing the box means "size the square from the trimmed image", so the
    // payload leaves targetSize out rather than sending the 0 that 400s.
    fireEvent.change(targetSize, { target: { value: "" } });
    expect(
      screen.queryByText(format(smartCropCopy.maxDimensionExceeded, { max: 8192 })),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("smart-crop-submit"));
    expect(processFiles).toHaveBeenCalledTimes(1);
    expect(processFiles.mock.calls[0][1]).not.toHaveProperty("targetSize");
  });
});

describe("Content-Aware Resize panel dimension cap (#2186)", () => {
  it("flags a typed width over the ceiling and blocks submit", () => {
    open(<ContentAwareResizeSettings />);
    const width = screen.getByLabelText(contentAwareCopy.widthPx) as HTMLInputElement;
    const height = screen.getByLabelText(contentAwareCopy.heightPx) as HTMLInputElement;

    expect(width).toHaveAttribute("min", "1");
    expect(width).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));

    fireEvent.change(width, { target: { value: "20000" } });
    expect(width.value).toBe("20000");
    expect(screen.getByText(contentAwareMessage)).toBeInTheDocument();
    expect(screen.getByTestId("content-aware-resize-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("content-aware-resize-submit"));
    expect(processFiles).not.toHaveBeenCalled();
  });
});
