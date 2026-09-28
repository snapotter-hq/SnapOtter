// @vitest-environment jsdom

/**
 * When Deep Enhance was requested and the API returned the standard pass
 * instead, the panel says so and why (#950). The API reports the reason as
 * `resultPayload.deepEnhanceSkipped`; see image-enhancement-deep-enhance.test.ts
 * for the server half.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processor = vi.hoisted(() => ({
  state: {
    processing: false,
    downloadUrl: "/api/v1/download/job/out.png" as string | null,
    resultPayload: null as Record<string, unknown> | null,
  },
}));

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processAllFiles: vi.fn(),
    processing: processor.state.processing,
    error: null,
    downloadUrl: processor.state.downloadUrl,
    originalSize: 2048,
    processedSize: 1024,
    progress: { phase: "idle", percent: 0, elapsed: 0 },
    resultPayload: processor.state.resultPayload,
  }),
}));

import { ImageEnhancementSettings } from "@/components/tools/image-enhancement-settings";
import { useFileStore } from "@/stores/file-store";

function setFiles(count: number) {
  useFileStore.setState({
    files: Array.from(
      { length: count },
      (_, i) => new File(["x"], `in-${i}.png`, { type: "image/png" }),
    ),
  });
}

beforeEach(() => {
  // The panel analyses the selected file on mount; keep that off the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  processor.state = {
    processing: false,
    downloadUrl: "/api/v1/download/job/out.png",
    resultPayload: null,
  };
  setFiles(1);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useFileStore.setState({ files: [] });
});

describe("Deep Enhance skipped notice", () => {
  const copy = en.toolSettings.imageEnhancement;

  it.each([
    ["failed", copy.deepEnhanceSkippedFailed],
    ["unavailable", copy.deepEnhanceSkippedUnavailable],
    ["animated", copy.deepEnhanceSkippedAnimated],
  ])("explains a '%s' skip", (reason, text) => {
    processor.state.resultPayload = { deepEnhanceSkipped: reason };

    render(<ImageEnhancementSettings />);

    const notice = screen.getByTestId("image-enhancement-deep-skipped");
    expect(notice).toHaveTextContent(text);
    expect(notice).toHaveAttribute("role", "status");
  });

  it("shows nothing when the deep pass ran", () => {
    processor.state.resultPayload = { jobId: "j", downloadUrl: "/x" };

    render(<ImageEnhancementSettings />);

    expect(screen.queryByTestId("image-enhancement-deep-skipped")).not.toBeInTheDocument();
  });

  it("ignores an unknown reason rather than showing an empty notice", () => {
    processor.state.resultPayload = { deepEnhanceSkipped: "something-new" };

    render(<ImageEnhancementSettings />);

    expect(screen.queryByTestId("image-enhancement-deep-skipped")).not.toBeInTheDocument();
  });

  it("hides the notice while a new run is in progress", () => {
    processor.state.processing = true;
    processor.state.resultPayload = { deepEnhanceSkipped: "failed" };

    render(<ImageEnhancementSettings />);

    expect(screen.queryByTestId("image-enhancement-deep-skipped")).not.toBeInTheDocument();
  });

  it("drops the notice once the file it described is swapped out", () => {
    // resultPayload survives a file swap; the entry's downloadUrl does not.
    processor.state.downloadUrl = null;
    processor.state.resultPayload = { deepEnhanceSkipped: "animated" };

    render(<ImageEnhancementSettings />);

    expect(screen.queryByTestId("image-enhancement-deep-skipped")).not.toBeInTheDocument();
  });

  it("stays out of batch runs, which carry no per-file reason", () => {
    setFiles(3);
    processor.state.resultPayload = { deepEnhanceSkipped: "failed" };

    render(<ImageEnhancementSettings />);

    expect(screen.queryByTestId("image-enhancement-deep-skipped")).not.toBeInTheDocument();
  });
});
