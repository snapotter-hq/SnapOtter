// @vitest-environment jsdom

/**
 * The Analysis block's issue chips and score labels used to be hardcoded
 * English, so every locale showed them untranslated (#4870).
 */

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, render, screen } from "@testing-library/react";
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

vi.mock("@/contexts/i18n-context", () => ({
  useTranslation: () => ({ t: de, locale: "de", dir: "ltr" }),
}));

import { ImageEnhancementControls } from "@/components/tools/image-enhancement-settings";
import { useFileStore } from "@/stores/file-store";

const copy = de.toolSettings.imageEnhancement;

function stubAnalysis(issues: string[]) {
  const analysis = {
    scores: {
      exposure: 20,
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
    },
    issues,
    suggestedMode: "auto",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(analysis)))),
  );
}

beforeEach(() => {
  useFileStore.setState({ files: [new File(["x"], "in.png", { type: "image/png" })] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useFileStore.setState({ files: [] });
});

describe("image-enhancement analysis labels", () => {
  it("renders every issue chip in the active locale", async () => {
    stubAnalysis([
      "underexposed",
      "overexposed",
      "low-contrast",
      "color-cast",
      "desaturated",
      "soft-focus",
      "noisy",
    ]);
    render(<ImageEnhancementControls />);
    for (const label of [
      copy.issueUnderexposed,
      copy.issueOverexposed,
      copy.issueLowContrast,
      copy.issueColorCast,
      copy.issueDesaturated,
      copy.issueSoftFocus,
      copy.issueNoisy,
    ]) {
      expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText("Low Exposure")).not.toBeInTheDocument();
  });

  it("falls back to the raw key for an issue it has no label for", async () => {
    stubAnalysis(["backlit"]);
    render(<ImageEnhancementControls />);
    expect(await screen.findByRole("button", { name: "backlit" })).toBeInTheDocument();
  });

  it("renders the score labels in the active locale", async () => {
    stubAnalysis([]);
    render(<ImageEnhancementControls />);
    for (const label of [
      copy.scoreExposure,
      copy.scoreContrast,
      copy.scoreWhiteBalance,
      copy.scoreSaturation,
      copy.scoreSharpness,
      copy.scoreNoise,
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("White Bal")).not.toBeInTheDocument();
  });
});
