// @vitest-environment jsdom

/**
 * The live preview has to mirror the server's maths or it lies (#4842). The
 * server applies exposure as a power curve (Sharp gamma), so the preview uses
 * an SVG gamma transfer instead of the linear CSS brightness() it used to.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processAllFiles: vi.fn(),
    processing: false,
    error: null,
    downloadUrl: null,
    originalSize: null,
    processedSize: null,
    progress: { phase: "idle", percent: 0, elapsed: 0 },
    resultPayload: null,
  }),
}));

import { ImageEnhancementControls } from "@/components/tools/image-enhancement-settings";
import { useFileStore } from "@/stores/file-store";

function analysisWith(corrections: Record<string, number>) {
  return {
    scores: {
      exposure: 50,
      contrast: 50,
      whiteBalance: 50,
      saturation: 50,
      sharpness: 50,
      noise: 50,
    },
    corrections: {
      brightness: 0,
      contrast: 0,
      temperature: 0,
      saturation: 0,
      sharpness: 0,
      denoise: 0,
      ...corrections,
    },
    issues: [],
    suggestedMode: "auto",
  };
}

function stubAnalysis(corrections: Record<string, number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(analysisWith(corrections))))),
  );
}

async function renderPreview() {
  const onPreviewFilter = vi.fn();
  const view = render(<ImageEnhancementControls onPreviewFilter={onPreviewFilter} />);
  await waitFor(() =>
    expect(onPreviewFilter).toHaveBeenLastCalledWith(expect.stringContaining("url(")),
  );
  return { filter: onPreviewFilter.mock.lastCall?.[0] as string, container: view.container };
}

function exposureExponent(container: HTMLElement): number {
  const func = container.querySelector("#snapotter-enhance-exposure-filter feFuncR");
  return Number(func?.getAttribute("exponent"));
}

beforeEach(() => {
  useFileStore.setState({ files: [new File(["x"], "in.png", { type: "image/png" })] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useFileStore.setState({ files: [] });
});

describe("image-enhancement exposure preview", () => {
  it("lifts with an SVG gamma of 1/g, not CSS brightness()", async () => {
    stubAnalysis({ brightness: 30 });
    const { filter, container } = await renderPreview();
    expect(filter).toContain("url(#snapotter-enhance-exposure-filter)");
    expect(filter).not.toContain("brightness(");
    // auto at intensity 50: adj 30 -> g = 1.3 -> exponent 1 / 1.3.
    expect(exposureExponent(container)).toBeCloseTo(1 / 1.3, 6);
  });

  it("darkens with an exponent of g for a negative correction", async () => {
    stubAnalysis({ brightness: -30 });
    const { container } = await renderPreview();
    expect(exposureExponent(container)).toBeCloseTo(1.3, 6);
  });

  it("puts the exposure curve before contrast, the order the server applies them", async () => {
    stubAnalysis({ brightness: 30, contrast: 20 });
    const { filter } = await renderPreview();
    expect(filter.indexOf("snapotter-enhance-exposure-filter")).toBeLessThan(
      filter.indexOf("contrast("),
    );
  });
});
