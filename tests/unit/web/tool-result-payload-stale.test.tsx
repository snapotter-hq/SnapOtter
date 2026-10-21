// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  formatHeaders: () => new Map<string, string>(),
  parseApiError: () => "error",
}));

import { BlurFacesSettings } from "@/components/tools/blur-faces-settings";
import { HistogramSettings } from "@/components/tools/histogram-settings";
import { LqipPlaceholderSettings } from "@/components/tools/lqip-placeholder-settings";
import { SpriteSheetSettings } from "@/components/tools/sprite-sheet-settings";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  status: number;
  responseText: string;
  response?: unknown;
  timeout: number;
  upload: { onprogress?: unknown; onload?: (() => void) | null };
  onload?: () => void;
  getResponseHeader: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
}

let xhrs: MockXhr[];

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  useFileStore.getState().reset();
  xhrs = [];
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "XMLHttpRequest",
    vi.fn(() => {
      const xhr: MockXhr = {
        status: 0,
        responseText: "",
        timeout: 0,
        upload: {},
        getResponseHeader: vi.fn(() => null),
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        abort: vi.fn(),
      };
      xhrs.push(xhr);
      return xhr;
    }),
  );
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
});

function png(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

function respond200(body: Record<string, unknown>, index = xhrs.length - 1) {
  act(() => {
    xhrs[index].status = 200;
    xhrs[index].responseText = JSON.stringify(body);
    xhrs[index].onload?.();
  });
}

function respond202AndCompleteSse(body: Record<string, unknown>, index = xhrs.length - 1) {
  act(() => {
    xhrs[index].status = 202;
    xhrs[index].responseText = JSON.stringify({ jobId: body.jobId, async: true });
    xhrs[index].onload?.();
  });
  act(() => {
    const es = MockEventSource.instances[MockEventSource.instances.length - 1];
    es.onmessage?.({
      data: JSON.stringify({
        type: "single",
        phase: "complete",
        percent: 100,
        result: body,
      }),
    } as MessageEvent);
  });
}

const HISTOGRAM_RESULT = {
  jobId: "11111111-1111-4111-8111-111111111111",
  downloadUrl: "/api/v1/download/11111111-1111-4111-8111-111111111111/a.png",
  originalSize: 100,
  processedSize: 100,
  bins: {
    r: Array.from({ length: 256 }, () => 5),
    g: Array.from({ length: 256 }, () => 10),
    b: Array.from({ length: 256 }, () => 15),
    lum: Array.from({ length: 256 }, () => 8),
  },
  stats: {
    r: { mean: 10, median: 10, stdev: 2 },
    g: { mean: 20, median: 20, stdev: 3 },
    b: { mean: 30, median: 30, stdev: 4 },
    lum: { mean: 15, median: 15, stdev: 2 },
  },
};

const LQIP_RESULT = {
  jobId: "22222222-2222-4222-8222-222222222222",
  downloadUrl: "/api/v1/download/22222222-2222-4222-8222-222222222222/a.webp",
  originalSize: 1000,
  processedSize: 42,
  dataUri: "data:image/webp;base64,UklGRg==",
  width: 16,
  height: 12,
  bytes: 42,
  html: '<img src="data:image/webp;base64,UklGRg==" />',
  css: ".lqip { background-image: url(data:image/webp;base64,UklGRg==); }",
};

const SPRITE_RESULT = {
  jobId: "33333333-3333-4333-8333-333333333333",
  downloadUrl: "/api/v1/download/33333333-3333-4333-8333-333333333333/sprite.png",
  originalSize: 200,
  processedSize: 180,
  frames: [{ index: 0, left: 0, top: 0, width: 32, height: 32 }],
  cols: 1,
  rows: 1,
  cellWidth: 32,
  cellHeight: 32,
  canvasWidth: 32,
  canvasHeight: 32,
};

const BLUR_FACES_RESULT = {
  jobId: "44444444-4444-4444-8444-444444444444",
  downloadUrl: "/api/v1/download/44444444-4444-4444-8444-444444444444/a.png",
  originalSize: 2048,
  processedSize: 2048,
  warning: "No faces detected in image",
};

describe("tool settings panels clear resultPayload and warning on Undo or file swap (#2794)", () => {
  describe("HistogramSettings", () => {
    it("hides the histogram chart and stats after Undo, file swap, or removeFile", () => {
      useFileStore.getState().setFiles([png("a.png")]);
      render(<HistogramSettings />);

      fireEvent.click(screen.getByTestId("histogram-submit"));
      respond200(HISTOGRAM_RESULT);

      expect(screen.getByTestId("histogram-chart")).toBeInTheDocument();
      expect(screen.getByTestId("histogram-stats")).toBeInTheDocument();
      expect(screen.getByTestId("histogram-download")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().undoProcessing();
      });

      expect(screen.queryByTestId("histogram-download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("histogram-chart")).not.toBeInTheDocument();
      expect(screen.queryByTestId("histogram-stats")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("histogram-submit"));
      respond200(HISTOGRAM_RESULT);
      expect(screen.getByTestId("histogram-chart")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().setFiles([png("b.png")]);
      });

      expect(screen.queryByTestId("histogram-download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("histogram-chart")).not.toBeInTheDocument();
      expect(screen.queryByTestId("histogram-stats")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("histogram-submit"));
      respond200(HISTOGRAM_RESULT);
      expect(screen.getByTestId("histogram-chart")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().addFiles([png("c.png")]);
        useFileStore.getState().removeFile(0);
      });

      expect(screen.queryByTestId("histogram-download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("histogram-chart")).not.toBeInTheDocument();
    });

    it("hides the histogram chart when selecting another file in the strip and restores it on return", () => {
      useFileStore.getState().setFiles([png("a.png")]);
      render(<HistogramSettings />);

      fireEvent.click(screen.getByTestId("histogram-submit"));
      respond200(HISTOGRAM_RESULT);
      expect(screen.getByTestId("histogram-chart")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().addFiles([png("b.png")]);
        useFileStore.getState().setSelectedIndex(1);
      });

      expect(screen.queryByTestId("histogram-download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("histogram-chart")).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });

      expect(screen.getByTestId("histogram-download")).toBeInTheDocument();
      expect(screen.getByTestId("histogram-chart")).toBeInTheDocument();
    });
  });

  describe("LqipPlaceholderSettings", () => {
    const previewAlt = en.toolSettings["lqip-placeholder"].previewAlt;

    it("hides the LQIP preview and copy blocks after Undo, file swap, or strip selection change", () => {
      useFileStore.getState().setFiles([png("a.png")]);
      render(<LqipPlaceholderSettings />);

      fireEvent.click(screen.getByTestId("lqip-placeholder-submit"));
      respond200(LQIP_RESULT);

      expect(screen.getByAltText(previewAlt)).toBeInTheDocument();
      expect(screen.getByText("16 x 12 px")).toBeInTheDocument();
      expect(screen.getByTestId("lqip-placeholder-download")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().addFiles([png("b.png")]);
        useFileStore.getState().setSelectedIndex(1);
      });

      expect(screen.queryByTestId("lqip-placeholder-download")).not.toBeInTheDocument();
      expect(screen.queryByAltText(previewAlt)).not.toBeInTheDocument();
      expect(screen.queryByText("16 x 12 px")).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });

      expect(screen.getByAltText(previewAlt)).toBeInTheDocument();

      act(() => {
        useFileStore.getState().undoProcessing();
      });

      expect(screen.queryByTestId("lqip-placeholder-download")).not.toBeInTheDocument();
      expect(screen.queryByAltText(previewAlt)).not.toBeInTheDocument();
      expect(screen.queryByText("16 x 12 px")).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setFiles([png("a.png")]);
      });
      fireEvent.click(screen.getByTestId("lqip-placeholder-submit"));
      respond200(LQIP_RESULT);
      expect(screen.getByAltText(previewAlt)).toBeInTheDocument();

      act(() => {
        useFileStore.getState().setFiles([png("b.png")]);
      });

      expect(screen.queryByTestId("lqip-placeholder-download")).not.toBeInTheDocument();
      expect(screen.queryByAltText(previewAlt)).not.toBeInTheDocument();
      expect(screen.queryByText("16 x 12 px")).not.toBeInTheDocument();
    });
  });

  describe("SpriteSheetSettings", () => {
    it("hides the coordinate map output after Undo, file swap, or selecting another entry", () => {
      useFileStore.getState().setFiles([png("a.png")]);
      render(<SpriteSheetSettings />);

      fireEvent.click(screen.getByTestId("sprite-sheet-submit"));
      respond200(SPRITE_RESULT);

      expect(screen.getByTestId("sprite-sheet-output")).toBeInTheDocument();
      expect(screen.getByTestId("sprite-sheet-download")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().addFiles([png("b.png")]);
        useFileStore.getState().setSelectedIndex(1);
      });

      expect(screen.queryByTestId("sprite-sheet-download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sprite-sheet-output")).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });

      expect(screen.getByTestId("sprite-sheet-output")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().undoProcessing();
      });

      expect(screen.queryByTestId("sprite-sheet-download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sprite-sheet-output")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("sprite-sheet-submit"));
      respond200(SPRITE_RESULT);
      expect(screen.getByTestId("sprite-sheet-output")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().setFiles([png("b.png")]);
      });

      expect(screen.queryByTestId("sprite-sheet-download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sprite-sheet-output")).not.toBeInTheDocument();
    });
  });

  describe("BlurFacesSettings", () => {
    it("hides the warning after Undo or file swap on both sync 200 and async 202 + SSE completions", () => {
      useFileStore.getState().setFiles([png("a.png")]);
      render(<BlurFacesSettings />);

      fireEvent.click(screen.getByTestId("blur-faces-submit"));
      respond202AndCompleteSse(BLUR_FACES_RESULT);

      expect(screen.getByText("No faces detected in image")).toBeInTheDocument();
      expect(screen.getByTestId("blur-faces-download")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().undoProcessing();
      });

      expect(screen.queryByTestId("blur-faces-download")).not.toBeInTheDocument();
      expect(screen.queryByText("No faces detected in image")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("blur-faces-submit"));
      respond200(BLUR_FACES_RESULT);
      expect(screen.getByText("No faces detected in image")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().setFiles([png("b.png")]);
      });

      expect(screen.queryByTestId("blur-faces-download")).not.toBeInTheDocument();
      expect(screen.queryByText("No faces detected in image")).not.toBeInTheDocument();
    });

    it("hides the processed size readout when a second single-file run starts or fails (#2813)", () => {
      useFileStore.getState().setFiles([png("a.png")]);
      render(<BlurFacesSettings />);

      fireEvent.click(screen.getByTestId("blur-faces-submit"));
      respond200(BLUR_FACES_RESULT);

      expect(screen.getByText("Processed: 2.0 KB")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("blur-faces-submit"));

      expect(screen.queryByText("Processed: 2.0 KB")).not.toBeInTheDocument();
      expect(useFileStore.getState().entries[0]?.processedSize).toBeNull();
      expect(useFileStore.getState().processedSize).toBeNull();

      act(() => {
        const xhr = xhrs[xhrs.length - 1];
        xhr.status = 500;
        xhr.responseText = JSON.stringify({ error: "boom" });
        xhr.onload?.();
      });

      expect(screen.queryByText("Processed: 2.0 KB")).not.toBeInTheDocument();
      expect(useFileStore.getState().entries[0]?.processedSize).toBeNull();
      expect(useFileStore.getState().processedSize).toBeNull();
    });
  });

  describe("useToolProcessor hook state", () => {
    it("scopes resultPayload and warning to the entry that produced them across Undo, file swap, and strip selection", () => {
      const a = png("a.png");
      const b = png("b.png");
      useFileStore.getState().setFiles([a, b]);
      // Give entry 1 its own processedUrl so selecting it still has a non-null downloadUrl.
      useFileStore.getState().updateEntry(1, {
        processedUrl: "/api/v1/download/other/b.png",
        status: "completed",
      });

      const { result, unmount } = renderHook(() => useToolProcessor("blur-faces"));

      act(() => {
        result.current.processFiles([a], {});
      });
      respond202AndCompleteSse(BLUR_FACES_RESULT);

      expect(result.current.warning).toBe("No faces detected in image");
      expect(result.current.resultPayload).toMatchObject(BLUR_FACES_RESULT);

      // Selecting entry 1 (which has its own processedUrl) must not expose entry 0's payload or warning.
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(result.current.downloadUrl).toBe("/api/v1/download/other/b.png");
      expect(result.current.warning).toBeNull();
      expect(result.current.resultPayload).toBeNull();

      // Returning to entry 0 restores its payload and warning.
      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });
      expect(result.current.warning).toBe("No faces detected in image");
      expect(result.current.resultPayload).toMatchObject(BLUR_FACES_RESULT);

      // Undo clears both on the hook.
      act(() => {
        useFileStore.getState().undoProcessing();
      });
      expect(result.current.warning).toBeNull();
      expect(result.current.resultPayload).toBeNull();

      unmount();
    });

    it("clears a single run's warning when a subsequent batch run starts", () => {
      const a = png("a.png");
      useFileStore.getState().setFiles([a]);
      const { result, unmount } = renderHook(() => useToolProcessor("blur-faces"));

      act(() => {
        result.current.processFiles([a], {});
      });
      respond200(BLUR_FACES_RESULT);
      expect(result.current.warning).toBe("No faces detected in image");

      const b = png("b.png");
      const c = png("c.png");
      act(() => {
        useFileStore.getState().addFiles([b, c]);
      });
      act(() => {
        void result.current.processAllFiles([b, c], {});
      });

      expect(result.current.warning).toBeNull();
      expect(result.current.resultPayload).toBeNull();
      unmount();
    });
  });
});
