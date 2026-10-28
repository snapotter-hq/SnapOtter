// @vitest-environment jsdom

/**
 * Optimize for Web settings and live preview tests:
 * - Max width/height inputs clamp to MAX_RESIZE_OUTPUT_DIMENSION (#1185, #2059).
 * - Live previews feed ToolPage's BeforeAfterSlider via onComparisonPreview
 *   without marking store entries completed or triggering the navigation guard (#1112, #1114).
 */

import "@testing-library/jest-dom/vitest";
import { MAX_RESIZE_OUTPUT_DIMENSION } from "@snapotter/shared";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processFiles = vi.hoisted(() => vi.fn());
const processAllFiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles,
    processAllFiles,
    processing: false,
    error: null,
    downloadUrl: useFileStore((s) => s.processedUrl),
    progress: { phase: "idle", percent: 0, elapsed: 0 },
    resultPayload: null,
  }),
}));

import { OptimizeForWebSettings } from "@/components/tools/optimize-for-web-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { useWorkInFlight } from "@/hooks/use-work-in-flight";
import { captureHandledError } from "@/lib/analytics";
import { ToolPage } from "@/pages/tool-page";
import { useFileStore } from "@/stores/file-store";

const copy = en.toolSettings["optimize-for-web"];
const ROUTE = "/image/optimize-for-web";

function guardWork(route = ROUTE) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );
  return renderHook(() => useWorkInFlight(), { wrapper }).result.current;
}

beforeEach(() => {
  processFiles.mockReset();
  processAllFiles.mockReset();
  vi.mocked(captureHandledError).mockClear();
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
  // The live preview posts the same settings; keep it off the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
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
  vi.unstubAllGlobals();
});

function open() {
  render(
    <I18nProvider>
      <OptimizeForWebSettings />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText(copy.maxDimensions));
  return {
    width: screen.getByLabelText(copy.maxWidth) as HTMLInputElement,
    height: screen.getByLabelText(copy.maxHeight) as HTMLInputElement,
  };
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: copy.submit }));
  return processFiles.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe("Optimize for Web max dimensions stay within what the API accepts (#2059)", () => {
  it("holds the shared resize ceiling at 16383", () => {
    expect(MAX_RESIZE_OUTPUT_DIMENSION).toBe(16383);
  });

  it.each([
    ["width", "maxWidth"],
    ["height", "maxHeight"],
  ] as const)("clamps a typed max %s to the ceiling before it is sent", (which, key) => {
    const inputs = open();
    fireEvent.change(inputs[which], { target: { value: "20000" } });
    expect(inputs[which].value).toBe(String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(submit()[key]).toBe(MAX_RESIZE_OUTPUT_DIMENSION);
  });

  it("tells the browser the ceiling too", () => {
    const { width, height } = open();
    expect(width).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));
  });

  it("leaves a value at or under the ceiling alone", () => {
    const { width, height } = open();
    fireEvent.change(width, { target: { value: String(MAX_RESIZE_OUTPUT_DIMENSION) } });
    fireEvent.change(height, { target: { value: "800" } });
    expect(width.value).toBe(String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height.value).toBe("800");
    const settings = submit();
    expect(settings.maxWidth).toBe(MAX_RESIZE_OUTPUT_DIMENSION);
    expect(settings.maxHeight).toBe(800);
  });

  // With the section collapsed the inputs unmount, so the browser's own step check
  // can't stop a decimal: it would go out and come back 400.
  it("sends whole pixels when the section is collapsed over a decimal", () => {
    const { width, height } = open();
    fireEvent.change(width, { target: { value: "800.5" } });
    fireEvent.change(height, { target: { value: "0.5" } });
    fireEvent.click(screen.getByText(copy.maxDimensions));
    const settings = submit();
    expect(settings.maxWidth).toBe(800);
    // Under one whole pixel is no limit at all, not a request for 0.
    expect(settings).not.toHaveProperty("maxHeight");
  });

  it("lets the box be cleared and sends no limit then", () => {
    const { width } = open();
    fireEvent.change(width, { target: { value: "20000" } });
    fireEvent.change(width, { target: { value: "" } });
    expect(width.value).toBe("");
    expect(submit()).not.toHaveProperty("maxWidth");
  });

  it("delivers the live preview for the entry it was requested for after a reorder without dirtying the file store (#1114, #1112)", async () => {
    vi.useFakeTimers();
    try {
      useFileStore
        .getState()
        .setFiles([
          new File(["a"], "first.png", { type: "image/png" }),
          new File(["b"], "second.png", { type: "image/png" }),
        ]);
      const onComparisonPreview = vi.fn();
      let resolvePreview: ((res: Response) => void) | undefined;
      let previewCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) => {
          if (!String(input).includes("/optimize-for-web/preview")) {
            return Promise.resolve(new Response("{}", { status: 200 }));
          }
          previewCalls++;
          return new Promise<Response>((resolve) => {
            resolvePreview = resolve;
          });
        }),
      );

      render(
        <I18nProvider>
          <OptimizeForWebSettings onComparisonPreview={onComparisonPreview} />
        </I18nProvider>,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(resolvePreview).toBeDefined();
      expect(previewCalls).toBe(1);

      // Reorder [first.png, second.png] -> [second.png, first.png] while the preview is in flight.
      act(() => {
        useFileStore.getState().reorderFiles(0, 1);
      });
      // Reordering keeps the same entry selected, so no second preview fetch is started.
      expect(previewCalls).toBe(1);

      await act(async () => {
        resolvePreview?.({
          ok: true,
          status: 200,
          headers: new Headers({ "X-Original-Size": "100", "X-Processed-Size": "50" }),
          blob: () => Promise.resolve(new Blob(["preview"])),
        } as Response);
      });
      await vi.waitFor(() => {
        expect(onComparisonPreview).toHaveBeenCalledWith({
          entryId: useFileStore.getState().entries[1].id,
          url: "blob:fake",
          originalSize: 100,
          processedSize: 50,
          supersedesResult: false,
        });
      });

      const { entries } = useFileStore.getState();
      expect(entries[1].file.name).toBe("first.png");
      expect(entries[1].processedUrl).toBeNull();
      expect(entries[1].status).toBe("pending");
      expect(entries[0].file.name).toBe("second.png");
      expect(entries[0].processedUrl).toBeNull();
      expect(entries[0].status).toBe("pending");
      expect(guardWork()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Optimize for Web live preview does not masquerade as a completed result (#1112)", () => {
  it("renders the before/after preview on ToolPage when the quality slider moves, while leaving the store pending and the navigation guard quiet", async () => {
    vi.useFakeTimers();
    try {
      let previewCount = 0;
      let blobCount = 0;
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: () => `blob:preview-${++blobCount}`,
        revokeObjectURL: vi.fn(),
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          if (String(input).includes("/optimize-for-web/preview")) {
            previewCount++;
            return new Response("webp-preview", {
              status: 200,
              headers: {
                "X-Original-Size": "1000",
                "X-Processed-Size": previewCount === 1 ? "600" : "420",
              },
            });
          }
          return new Response(JSON.stringify({ authEnabled: false }), { status: 200 });
        }),
      );

      useFileStore
        .getState()
        .setFiles([new File(["original-bytes"], "photo.png", { type: "image/png" })]);
      await act(async () => {
        render(
          <I18nProvider>
            <MemoryRouter initialEntries={[{ pathname: ROUTE, state: { fromLibrary: true } }]}>
              <Routes>
                <Route path="/:section/:toolId" element={<ToolPage />} />
              </Routes>
            </MemoryRouter>
          </I18nProvider>,
        );
      });

      const slider = screen.getByLabelText(copy.quality) as HTMLInputElement;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(screen.getByRole("slider", { name: en.a11y.beforeAfterSlider })).toBeInTheDocument();
      expect(screen.getByAltText(en.comparison.processed)).toHaveAttribute(
        "src",
        `blob:preview-${blobCount}`,
      );

      // Drag the quality slider to trigger a new preview
      fireEvent.change(slider, { target: { value: "55" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(previewCount).toBe(2);
      expect(screen.getByAltText(en.comparison.processed)).toHaveAttribute(
        "src",
        `blob:preview-${blobCount}`,
      );

      // The entry in useFileStore is still pending with no processedUrl, no ReviewPanel,
      // no download link, and useWorkInFlight reports nothing to lose.
      const entry = useFileStore.getState().entries[0];
      expect(entry.processedUrl).toBeNull();
      expect(entry.status).toBe("pending");
      expect(entry.claimed).toBe(false);
      expect(screen.queryByText(en.toolPage.conversionComplete)).not.toBeInTheDocument();
      expect(document.querySelector("[data-download-button]")).toBeNull();
      expect(guardWork()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a claimed result claimed and preserves an unclaimed result URL when the slider moves after a run, and restores the preview on undo", async () => {
    vi.useFakeTimers();
    try {
      let previewCount = 0;
      let blobCount = 0;
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: () => `blob:preview-${++blobCount}`,
        revokeObjectURL: vi.fn(),
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          if (String(input).includes("/optimize-for-web/preview")) {
            previewCount++;
            return new Response("webp-preview", {
              status: 200,
              headers: { "X-Original-Size": "1000", "X-Processed-Size": "350" },
            });
          }
          return new Response(JSON.stringify({ authEnabled: false }), { status: 200 });
        }),
      );

      useFileStore
        .getState()
        .setFiles([new File(["original-bytes"], "photo.png", { type: "image/png" })]);
      await act(async () => {
        render(
          <I18nProvider>
            <MemoryRouter initialEntries={[{ pathname: ROUTE, state: { fromLibrary: true } }]}>
              <Routes>
                <Route path="/:section/:toolId" element={<ToolPage />} />
              </Routes>
            </MemoryRouter>
          </I18nProvider>,
        );
      });

      const slider = screen.getByLabelText(copy.quality) as HTMLInputElement;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(screen.getByRole("slider", { name: en.a11y.beforeAfterSlider })).toBeInTheDocument();

      // Submitting resets supersedesResult to false so the committed result takes over the slider.
      fireEvent.click(screen.getByRole("button", { name: copy.submit }));
      expect(processFiles).toHaveBeenCalledTimes(1);

      const RESULT_URL = "/api/v1/download/job-opt-1/photo.webp";
      act(() => {
        useFileStore.getState().updateEntry(0, {
          processedUrl: RESULT_URL,
          processedFilename: "photo.webp",
          status: "completed",
          originalSize: 1000,
          processedSize: 500,
        });
      });

      expect(screen.getByAltText(en.comparison.processed)).toHaveAttribute("src", RESULT_URL);
      expect(screen.getByText(/500 B/)).toBeInTheDocument();
      expect(guardWork()).toEqual({
        kind: "unsaved",
        downloads: [{ kind: "result", index: 0, url: RESULT_URL, filename: "photo.webp" }],
      });

      // Moving the slider while unclaimed updates the visual preview (supersedesResult: true)
      // and the slider's size badge while keeping the committed result URL in the guard.
      fireEvent.change(slider, { target: { value: "40" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(previewCount).toBe(2);
      const previewAfterRunUrl = `blob:preview-${blobCount}`;
      expect(screen.getByAltText(en.comparison.processed)).toHaveAttribute(
        "src",
        previewAfterRunUrl,
      );
      expect(screen.getAllByText(/350 B/).length).toBeGreaterThanOrEqual(2);
      expect(guardWork()).toEqual({
        kind: "unsaved",
        downloads: [{ kind: "result", index: 0, url: RESULT_URL, filename: "photo.webp" }],
      });

      // Once the user claims (downloads) the committed result, moving the slider again must NOT unclaim it.
      act(() => {
        useFileStore.getState().markClaimed(0);
      });
      expect(guardWork()).toBeNull();

      fireEvent.change(slider, { target: { value: "25" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(previewCount).toBe(3);
      expect(useFileStore.getState().entries[0].claimed).toBe(true);
      expect(useFileStore.getState().entries[0].processedUrl).toBe(RESULT_URL);
      expect(guardWork()).toBeNull();

      // Clicking "Adjust settings" (onUndo) clears the committed result and keeps the live preview slider visible.
      fireEvent.click(screen.getByRole("button", { name: en.toolPage.adjustSettings }));
      expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
      expect(useFileStore.getState().entries[0].status).toBe("pending");
      expect(screen.getByAltText(en.comparison.processed)).toHaveAttribute(
        "src",
        `blob:preview-${blobCount}`,
      );
      expect(guardWork()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the comparison preview when switching files or clearing all files, and ignores stale in-flight preview responses", async () => {
    vi.useFakeTimers();
    try {
      const revokeObjectURL = vi.fn();
      let blobCount = 0;
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: () => `blob:preview-${++blobCount}`,
        revokeObjectURL,
      });

      const resolvers: Array<(res: Response) => void> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) => {
          if (!String(input).includes("/optimize-for-web/preview")) {
            return Promise.resolve(new Response("{}", { status: 200 }));
          }
          return new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          });
        }),
      );

      useFileStore
        .getState()
        .setFiles([
          new File(["a"], "first.png", { type: "image/png" }),
          new File(["b"], "second.png", { type: "image/png" }),
        ]);
      const onComparisonPreview = vi.fn();

      render(
        <I18nProvider>
          <OptimizeForWebSettings onComparisonPreview={onComparisonPreview} />
        </I18nProvider>,
      );

      // Start first.png preview
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(resolvers).toHaveLength(1);

      // Switch to second.png while first.png's preview is still in flight
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(onComparisonPreview).toHaveBeenLastCalledWith(null);
      expect(resolvers).toHaveLength(2);

      // Even if first.png's response resolves late, it is ignored because entryId no longer matches
      await act(async () => {
        resolvers[0](
          new Response("stale-first", {
            status: 200,
            headers: { "X-Original-Size": "100", "X-Processed-Size": "50" },
          }),
        );
      });
      expect(onComparisonPreview).toHaveBeenCalledTimes(1);

      // Resolve second.png's preview
      await act(async () => {
        resolvers[1](
          new Response("fresh-second", {
            status: 200,
            headers: { "X-Original-Size": "200", "X-Processed-Size": "80" },
          }),
        );
      });
      const secondId = useFileStore.getState().entries[1].id;
      await vi.waitFor(() => {
        expect(onComparisonPreview).toHaveBeenLastCalledWith({
          entryId: secondId,
          url: `blob:preview-${blobCount}`,
          originalSize: 200,
          processedSize: 80,
          supersedesResult: false,
        });
      });

      // Submitting a batch calls processAllFiles
      fireEvent.click(
        screen.getByRole("button", {
          name: copy.submitBatch.replace("{count}", "2"),
        }),
      );
      expect(processAllFiles).toHaveBeenCalledTimes(1);

      // Clearing all files revokes the preview URL and resets comparisonPreview to null
      act(() => {
        useFileStore.getState().reset();
      });
      expect(onComparisonPreview).toHaveBeenLastCalledWith(null);
      expect(revokeObjectURL).toHaveBeenCalledWith(`blob:preview-${blobCount}`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps each batch entry's committed result visible when switching files after a batch run unless settings are edited, and handles JXL and failed previews cleanly", async () => {
    vi.useFakeTimers();
    try {
      let blobCount = 0;
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: () => `blob:preview-${++blobCount}`,
        revokeObjectURL: vi.fn(),
      });
      let failNextPreview = false;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          if (String(input).includes("/optimize-for-web/preview")) {
            if (failNextPreview) {
              return new Response(JSON.stringify({ error: "Preview failed" }), { status: 422 });
            }
            return new Response("preview-bytes", {
              status: 200,
              headers: { "X-Original-Size": "1000", "X-Processed-Size": "300" },
            });
          }
          return new Response(JSON.stringify({ authEnabled: false }), { status: 200 });
        }),
      );

      useFileStore
        .getState()
        .setFiles([
          new File(["a"], "first.png", { type: "image/png" }),
          new File(["b"], "second.png", { type: "image/png" }),
        ]);
      await act(async () => {
        render(
          <I18nProvider>
            <MemoryRouter initialEntries={[{ pathname: ROUTE, state: { fromLibrary: true } }]}>
              <Routes>
                <Route path="/:section/:toolId" element={<ToolPage />} />
              </Routes>
            </MemoryRouter>
          </I18nProvider>,
        );
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      // Land completed batch results on both entries (without editing settings after the run).
      act(() => {
        useFileStore.getState().updateEntry(0, {
          processedUrl: "blob:batch-first",
          processedFilename: "first.webp",
          status: "completed",
          originalSize: 1000,
          processedSize: 450,
        });
        useFileStore.getState().updateEntry(1, {
          processedUrl: "blob:batch-second",
          processedFilename: "second.webp",
          status: "completed",
          originalSize: 2000,
          processedSize: 850,
        });
      });

      // Switching to the second file in the batch fetches its size preview with supersedesResult: false,
      // so the committed batch result (blob:batch-second) stays in BeforeAfterSlider.
      await act(async () => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(screen.getByAltText(en.comparison.processed)).toHaveAttribute(
        "src",
        "blob:batch-second",
      );

      // Suppose the second entry was a non-previewable JXL result showing the conversion complete card.
      act(() => {
        useFileStore.getState().updateEntry(1, {
          processedUrl: "/api/v1/download/job-jxl/second.jxl",
          processedFilename: "second.jxl",
          processedPreviewUrl: null,
          status: "completed",
          originalSize: 2000,
          processedSize: 700,
        });
      });
      expect(
        screen.getByText(en.toolPage.conversionComplete, { selector: "p" }),
      ).toBeInTheDocument();

      // Selecting JXL format for live preview keeps the conversion complete card (does not pass unrenderable JXL blob to BeforeAfterSlider).
      fireEvent.click(screen.getByRole("button", { name: "JXL" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(
        screen.getByText(en.toolPage.conversionComplete, { selector: "p" }),
      ).toBeInTheDocument();

      // Switching back to WebP after the JXL run sets liveComparisonOverride (supersedesResult: true),
      // replacing the conversion complete card with BeforeAfterSlider.
      fireEvent.click(screen.getByRole("button", { name: "WebP" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(
        screen.queryByText(en.toolPage.conversionComplete, { selector: "p" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("slider", { name: en.a11y.beforeAfterSlider })).toBeInTheDocument();

      // If the next preview fails (422), the stale comparisonPreview and sizes are cleared.
      failNextPreview = true;
      fireEvent.click(screen.getByRole("button", { name: "JPEG" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(
        screen.getByText(en.toolPage.conversionComplete, { selector: "p" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(copy.sizeComparison)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a pending or in-flight preview when submitting so the loading spinner never hangs", async () => {
    vi.useFakeTimers();
    try {
      let resolveInFlight: ((res: Response) => void) | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) => {
          if (!String(input).includes("/optimize-for-web/preview")) {
            return Promise.resolve(new Response("{}", { status: 200 }));
          }
          return new Promise<Response>((resolve) => {
            resolveInFlight = resolve;
          });
        }),
      );

      const onComparisonPreview = vi.fn();
      render(
        <I18nProvider>
          <OptimizeForWebSettings onComparisonPreview={onComparisonPreview} />
        </I18nProvider>,
      );

      // Advance past debounce so the preview request is in flight (loading: true)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(resolveInFlight).toBeDefined();
      expect(screen.getByText(copy.sizeComparison)).toBeInTheDocument();

      // Clicking submit while the preview is in flight aborts it and clears loading
      fireEvent.click(screen.getByRole("button", { name: copy.submit }));
      expect(processFiles).toHaveBeenCalledTimes(1);
      expect(onComparisonPreview).toHaveBeenLastCalledWith(null);
      expect(screen.queryByText(copy.sizeComparison)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Optimize for Web live preview failures are visible (#2185)", () => {
  function stubPreviewFetch(fail: () => Response) {
    let failing = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).includes("/optimize-for-web/preview")) {
          return new Response(JSON.stringify({ authEnabled: false }), { status: 200 });
        }
        if (failing) return fail();
        return new Response("preview-bytes", {
          status: 200,
          headers: { "X-Original-Size": "1000", "X-Processed-Size": "400" },
        });
      }),
    );
    return {
      failNext: () => {
        failing = true;
      },
      recover: () => {
        failing = false;
      },
    };
  }

  async function showFirstPreview() {
    render(
      <I18nProvider>
        <OptimizeForWebSettings />
      </I18nProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.getByText("60.0% smaller")).toBeInTheDocument();
  }

  async function changeQuality(value = "55") {
    fireEvent.change(screen.getByLabelText(copy.quality), { target: { value } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
  }

  it("shows the API's reason, drops the stale savings, and reports the failure", async () => {
    vi.useFakeTimers();
    try {
      const reason = "Invalid settings: maxWidth: Expected integer, received float";
      const previewFetch = stubPreviewFetch(
        () =>
          new Response(JSON.stringify({ error: reason, details: reason }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
      );

      await showFirstPreview();
      previewFetch.failNext();
      await changeQuality();

      expect(screen.getByRole("alert")).toHaveTextContent(reason);
      expect(screen.queryByText("60.0% smaller")).not.toBeInTheDocument();
      expect(screen.queryByText(copy.sizeComparison)).not.toBeInTheDocument();
      expect(captureHandledError).toHaveBeenCalledTimes(1);
      expect(captureHandledError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
        expect.objectContaining({ error_class: "operational", tool_id: "optimize-for-web" }),
      );
      // The server's reason is for the panel, not for Sentry.
      const reported = vi.mocked(captureHandledError).mock.calls[0][0] as Error;
      expect(reported.message).not.toContain(reason);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the generic preview copy for a dropped connection without reporting it", async () => {
    vi.useFakeTimers();
    try {
      let previewCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          if (!String(input).includes("/optimize-for-web/preview")) {
            return new Response("{}", { status: 200 });
          }
          previewCount++;
          if (previewCount === 2) throw new TypeError("Failed to fetch");
          return new Response("preview-bytes", {
            status: 200,
            headers: { "X-Original-Size": "1000", "X-Processed-Size": "400" },
          });
        }),
      );

      await showFirstPreview();
      await changeQuality();

      expect(screen.getByRole("alert")).toHaveTextContent(en.toolPage.previewFailed);
      expect(screen.queryByText("60.0% smaller")).not.toBeInTheDocument();
      // Sentry drops a bare "Failed to fetch" through IGNORE_ERRORS; wrapping
      // it in a SafeError would push it past that filter.
      expect(captureHandledError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the fallback for an unreadable 5xx body and reports its status", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const previewFetch = stubPreviewFetch(
        () => new Response("<html>Bad Gateway</html>", { status: 500 }),
      );
      await showFirstPreview();
      previewFetch.failNext();
      await changeQuality();

      expect(screen.getByRole("alert")).toHaveTextContent(en.toolPage.previewFailed);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("status: 500"), expect.anything());
      expect(captureHandledError).toHaveBeenCalledTimes(1);
      expect(captureHandledError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
        expect.objectContaining({ tool_id: "optimize-for-web" }),
      );
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not report a 422 decode failure", async () => {
    vi.useFakeTimers();
    try {
      const previewFetch = stubPreviewFetch(
        () =>
          new Response(JSON.stringify({ error: "Could not decode image" }), {
            status: 422,
            headers: { "Content-Type": "application/json" },
          }),
      );
      await showFirstPreview();
      previewFetch.failNext();
      await changeQuality();

      expect(screen.getByRole("alert")).toHaveTextContent("Could not decode image");
      expect(captureHandledError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the file-too-large copy for a 413 without reporting it", async () => {
    vi.useFakeTimers();
    try {
      const previewFetch = stubPreviewFetch(() => new Response("too large", { status: 413 }));
      await showFirstPreview();
      previewFetch.failNext();
      await changeQuality();

      expect(screen.getByRole("alert")).toHaveTextContent(en.errors.fileTooLarge);
      expect(screen.queryByText("60.0% smaller")).not.toBeInTheDocument();
      expect(captureHandledError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the error when a later preview succeeds, and when a run starts", async () => {
    vi.useFakeTimers();
    try {
      const previewFetch = stubPreviewFetch(
        () => new Response(JSON.stringify({ error: "Invalid settings" }), { status: 400 }),
      );
      await showFirstPreview();
      previewFetch.failNext();
      await changeQuality();
      expect(screen.getByRole("alert")).toBeInTheDocument();

      previewFetch.recover();
      await changeQuality("45");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText("60.0% smaller")).toBeInTheDocument();

      previewFetch.failNext();
      await changeQuality("35");
      expect(screen.getByRole("alert")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: copy.submit }));
      expect(processFiles).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not show an error for a preview abandoned by switching files", async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<(res: Response) => void> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
          if (!String(input).includes("/optimize-for-web/preview")) {
            return Promise.resolve(new Response("{}", { status: 200 }));
          }
          return new Promise<Response>((resolve, reject) => {
            requests.push(resolve);
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          });
        }),
      );

      useFileStore
        .getState()
        .setFiles([
          new File(["a"], "first.png", { type: "image/png" }),
          new File(["b"], "second.png", { type: "image/png" }),
        ]);
      const onComparisonPreview = vi.fn();
      render(
        <I18nProvider>
          <OptimizeForWebSettings onComparisonPreview={onComparisonPreview} />
        </I18nProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(requests).toHaveLength(1);

      await act(async () => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(requests).toHaveLength(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(captureHandledError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
