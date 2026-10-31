// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en, type FeatureBundleState } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));

import { BarcodeReadSettings, resetBarcodeResults } from "@/components/tools/barcode-read-settings";
import { EraseObjectSettings } from "@/components/tools/erase-object-settings";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { OcrSettings, resetOcrResult } from "@/components/tools/ocr-settings";
import { resetRunProgress } from "@/lib/run-progress";
import { useFeaturesStore } from "@/stores/features-store";
import { type FileEntry, useFileStore } from "@/stores/file-store";

class FakeEventSource {
  static OPEN = 1;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  emit(data: unknown) {
    act(() => {
      this.onmessage?.({ data: JSON.stringify(data) });
    });
  }

  close() {
    this.readyState = 2;
  }
}

class FakeXhr {
  static instances: FakeXhr[] = [];

  timeout = 0;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  aborted = false;
  done = false;

  constructor() {
    FakeXhr.instances.push(this);
  }

  abort() {
    this.aborted = true;
    if (!this.done) this.onabort?.();
  }

  open() {}
  setRequestHeader() {}
  send() {}

  uploadProgress(loaded: number, total: number) {
    act(() => {
      this.upload.onprogress?.(
        new ProgressEvent("progress", { loaded, total, lengthComputable: true }),
      );
    });
  }

  uploadFinished() {
    act(() => {
      this.upload.onload?.();
    });
  }

  respond(status: number, body: unknown) {
    act(() => {
      this.done = true;
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    });
  }
}

function ocrBundle(): FeatureBundleState {
  return {
    id: "ocr",
    name: "OCR",
    description: "Accurate local OCR",
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "300 MB",
    downloadBytes: 1,
    missingDownloadBytes: 1,
    compatibility: "compatible",
    compatibilityReason: "descriptor-missing",
    selectedTarget: "linux-amd64-cpu-py312",
    healthyGeneration: null,
    availableQualities: ["fast"],
    enablesTools: ["ocr", "ocr-pdf"],
    progress: null,
    error: null,
  };
}

function image(name: string): File {
  return new File(["png"], name, { type: "image/png" });
}

function fakeEraser(): EraserCanvasRef {
  const mask = () => new Blob(["mask"], { type: "image/png" });
  return {
    exportMask: async () => mask(),
    exportAllMasks: async () =>
      new Map(useFileStore.getState().entries.map((e: FileEntry) => [e.blobUrl, mask()] as const)),
    getMaskCenter: () => null,
    clear: vi.fn(),
    clearAll: vi.fn(),
    undo: vi.fn(),
  };
}

function renderErasePanel(maskedFileCount = 1, eraser = fakeEraser()) {
  return render(
    <EraseObjectSettings
      eraserRef={{ current: eraser }}
      hasStrokes
      brushSize={30}
      onBrushSizeChange={vi.fn()}
      mode="brush"
      onModeChange={vi.fn()}
      maskedFileCount={maskedFileCount}
    />,
  );
}

let blobCount = 0;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  blobCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  FakeXhr.instances = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ canceled: true }))),
  );
  useFeaturesStore.setState({ bundles: [ocrBundle()], loaded: true, loadError: false });
  useFileStore.getState().reset();
  resetRunProgress();
  resetOcrResult();
  resetBarcodeResults();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  resetRunProgress();
  resetOcrResult();
  resetBarcodeResults();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("remounting Erase Object, OCR, and barcode panels mid-run (#2315)", () => {
  it("preserves phase, percent, stage, and elapsed time across multiple remounts and StrictMode in Erase Object batch", async () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const firstMount = renderErasePanel(2);

    fireEvent.click(screen.getByTestId("erase-object-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    // Advance 3s and emit 40% on the first file (overall 20%)
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    FakeEventSource.instances[0].emit({ type: "single", phase: "processing", percent: 40 });

    expect(screen.getByRole("status")).toHaveTextContent("Erasing 1/2");
    expect(screen.getByRole("status")).toHaveTextContent("20%");
    expect(screen.getByRole("status")).toHaveTextContent("3s");

    // Remount across the 768px breakpoint inside StrictMode
    firstMount.unmount();
    const secondMount = render(
      <StrictMode>
        <EraseObjectSettings
          eraserRef={{ current: fakeEraser() }}
          hasStrokes
          brushSize={30}
          onBrushSizeChange={vi.fn()}
          mode="brush"
          onModeChange={vi.fn()}
          maskedFileCount={2}
        />
      </StrictMode>,
    );

    const card = screen.getByRole("status");
    expect(card).toHaveTextContent("Erasing 1/2");
    expect(card).toHaveTextContent("20%");
    expect(card).toHaveTextContent("3s");
    expect(card.querySelector(".animate-spin")).not.toBeNull();

    // Ongoing progress and elapsed timer continue updating the remounted StrictMode panel
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    FakeEventSource.instances[0].emit({ type: "single", phase: "processing", percent: 80 });

    expect(screen.getByRole("status")).toHaveTextContent("40%");
    expect(screen.getByRole("status")).toHaveTextContent("5s");

    // Remount a second time (desktop -> mobile) and finish the batch
    secondMount.unmount();
    renderErasePanel(2);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("40%");
    expect(screen.getByRole("status")).toHaveTextContent("6s");

    FakeXhr.instances[0].respond(200, {
      downloadUrl: "/api/v1/download/job-1/one.png",
      originalSize: 100,
      processedSize: 90,
    });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, {
      downloadUrl: "/api/v1/download/job-2/two.png",
      originalSize: 100,
      processedSize: 90,
    });
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("preserves phase, percent, and elapsed time when Erase Object single-file run remounts during uploading and processing", async () => {
    useFileStore.getState().setFiles([image("one.png")]);
    const firstMount = renderErasePanel(1);

    fireEvent.click(screen.getByTestId("erase-object-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Remount while still in the initial uploading phase at 0%
    firstMount.unmount();
    const secondMount = renderErasePanel(1);

    const uploadingCard = screen.getByRole("status");
    expect(uploadingCard).toHaveTextContent("0%");
    expect(uploadingCard).toHaveTextContent("2s");
    expect(uploadingCard.querySelector(".animate-spin")).toBeNull();

    FakeXhr.instances[0].uploadFinished();
    FakeXhr.instances[0].respond(202, { jobId: "job-1", async: true });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    FakeEventSource.instances[0].emit({ type: "single", phase: "processing", percent: 50 });

    // 15 + 50 * 0.85 = 57.5 -> 58%
    expect(screen.getByRole("status")).toHaveTextContent("58%");
    expect(screen.getByRole("status")).toHaveTextContent("4s");

    secondMount.unmount();
    renderErasePanel(1);

    const card = screen.getByRole("status");
    expect(card).toHaveTextContent("58%");
    expect(card).toHaveTextContent("4s");
    expect(card.querySelector(".animate-spin")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    FakeEventSource.instances[0].emit({ type: "single", phase: "processing", percent: 100 });
    expect(screen.getByRole("status")).toHaveTextContent("100%");
    expect(screen.getByRole("status")).toHaveTextContent("5s");
  });

  it("starts ticking elapsed on a remounted Erase Object panel when exportMask resolves after the remount", async () => {
    useFileStore.getState().setFiles([image("one.png")]);
    let resolveMask: (blob: Blob) => void = () => {};
    const eraser = fakeEraser();
    eraser.exportMask = () =>
      new Promise<Blob | null>((resolve) => {
        resolveMask = resolve;
      });

    const firstMount = renderErasePanel(1, eraser);
    fireEvent.click(screen.getByTestId("erase-object-submit"));

    // Remount while exportMask is still in flight
    firstMount.unmount();
    renderErasePanel(1);

    await act(async () => {
      resolveMask(new Blob(["mask"], { type: "image/png" }));
    });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("3s");
  });

  it("preserves phase, percent, stage, and elapsed time when OCR remounts mid-run", async () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const firstMount = render(<OcrSettings />);

    fireEvent.click(screen.getByTestId("ocr-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    FakeXhr.instances[0].respond(202, { jobId: "ocr-1", async: true });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    FakeEventSource.instances[0].emit({
      type: "single",
      phase: "processing",
      percent: 60,
      stage: "Recognizing text",
    });

    // file 1 of 2: fileBase=0, fileShare=50 -> 50 * 0.15 + 0.6 * 50 * 0.85 = 7.5 + 25.5 = 33%
    expect(screen.getByRole("status")).toHaveTextContent("[1/2] Recognizing text · 2s");
    expect(screen.getByRole("status")).toHaveTextContent("33%");

    firstMount.unmount();
    render(<OcrSettings />);

    const card = screen.getByRole("status");
    expect(card).toHaveTextContent("[1/2] Recognizing text · 2s");
    expect(card).toHaveTextContent("33%");
    expect(card.querySelector(".animate-spin")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("[1/2] Recognizing text · 5s");
  });

  it("preserves phase, percent, stage, and elapsed time when Barcode Reader remounts mid-run", async () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const firstMount = render(<BarcodeReadSettings />);

    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    FakeXhr.instances[0].uploadProgress(80, 100);

    // file 1 of 2: fileBase=0, fileShare=50 -> 0.8 * 50 * 0.5 = 20%
    expect(screen.getByRole("status")).toHaveTextContent("[1/2] Scanning one.png... · 2s");
    expect(screen.getByRole("status")).toHaveTextContent("20%");

    firstMount.unmount();
    render(<BarcodeReadSettings />);

    expect(screen.getByRole("status")).toHaveTextContent("[1/2] Scanning one.png... · 2s");
    expect(screen.getByRole("status")).toHaveTextContent("20%");

    // First file lands -> advances to 50% and starts second file
    FakeXhr.instances[0].respond(200, {
      filename: "one.png",
      barcodes: [],
      annotatedUrl: null,
    });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("[2/2] Scanning two.png... · 3s");
    expect(screen.getByRole("status")).toHaveTextContent("50%");
  });

  it("does not clobber a new run's progress or elapsed timer when a stopped scan's microtask drains on the same panel (#1994, #2315)", async () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    render(<BarcodeReadSettings />);

    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    // Stop the first scan via setFiles and start a new scan on the same mounted panel
    // before the stopped scan's rejected await drains.
    act(() => {
      useFileStore.getState().setFiles([image("fresh.png")]);
    });
    // Late uploadProgress on the stopped XHR is ignored
    FakeXhr.instances[0].uploadProgress(90, 100);

    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].uploadProgress(50, 100);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    const card = screen.getByRole("status");
    expect(card).toHaveTextContent("Scanning fresh.png... · 3s");
    expect(card).toHaveTextContent("25%");
  });

  it("preserves extracted text, savedLibraryFileId notice, and entry editing when OCR remounts mid-run or after completion (#2889)", async () => {
    useFileStore.getState().setFiles([image("receipt.png")]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-source-1" });

    const firstMount = render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("ocr-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].respond(202, { jobId: "ocr-2889", async: true });

    // Remount across 768px while the OCR job is still in flight
    firstMount.unmount();
    const secondMount = render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();

    // Finish the OCR job while the remounted panel is mounted
    FakeEventSource.instances[0].emit({
      type: "single",
      phase: "complete",
      result: { text: "Hello from OCR", savedFileId: "lib-saved-2889" },
    });

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("ocr-result-text")).toHaveValue("Hello from OCR");
    expect(screen.getByText(en.toolPage.savedToFiles)).toBeInTheDocument();

    // Remount again after completion (e.g. rotating back across 768px)
    secondMount.unmount();
    const thirdMount = render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("ocr-result-text")).toHaveValue("Hello from OCR");
    expect(screen.getByText(en.toolPage.savedToFiles)).toBeInTheDocument();

    // Clearing the textarea sets processedUrl to null and renders the no-text notice,
    // which also survives a subsequent remount.
    fireEvent.change(screen.getByTestId("ocr-result-text"), { target: { value: "" } });
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(screen.getByText(en.toolSettings.ocr.noTextDetected)).toBeInTheDocument();

    thirdMount.unmount();
    render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );
    expect(screen.getByText(en.toolSettings.ocr.noTextDetected)).toBeInTheDocument();
  });

  it("preserves edited OCR text and captured resultEntryId across remounts, falls back if that entry is removed, and resets when files are replaced (#2889)", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const firstFile = image("first.png");
    const secondFile = image("second.png");
    useFileStore.getState().setFiles([firstFile, secondFile]);
    useFileStore.getState().setSelectedIndex(1);

    const firstMount = render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("ocr-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].respond(200, { text: "Page 1" });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, { text: "Page 2" });
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(screen.getByTestId("ocr-result-text")).toHaveValue(
      "--- first.png ---\nPage 1\n\n--- second.png ---\nPage 2",
    );
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().entries[1].processedUrl).not.toBeNull();

    // Remount after completion, download to claim entries[1], then edit text on entries[1]
    firstMount.unmount();
    const secondMount = render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: en.common.download }));
    expect(useFileStore.getState().entries[1].claimed).toBe(true);

    fireEvent.change(screen.getByTestId("ocr-result-text"), {
      target: { value: "Edited after remount" },
    });
    expect(useFileStore.getState().entries[1].claimed).toBe(false);

    // Remount again, verify edited text persists, and copy to claim entries[1]
    secondMount.unmount();
    render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("ocr-result-text")).toHaveValue("Edited after remount");
    fireEvent.click(screen.getByRole("button", { name: en.common.copy }));
    await waitFor(() => {
      expect(useFileStore.getState().entries[1].claimed).toBe(true);
    });

    // Removing the captured entry (index 1) while index 0 remains falls back to entries[0] on subsequent edits
    act(() => {
      useFileStore.getState().removeFile(1);
    });
    fireEvent.change(screen.getByTestId("ocr-result-text"), {
      target: { value: "Fallback to remaining entry" },
    });
    expect(useFileStore.getState().entries[0].processedUrl).not.toBeNull();

    // Replacing files even with the same File reference mints new entry IDs and clears the OCR result
    act(() => {
      useFileStore.getState().setFiles([firstFile]);
    });
    expect(screen.queryByTestId("ocr-result-text")).not.toBeInTheDocument();
  });

  it("preserves decoded barcode results and row-copy claim progress when BarcodeReadSettings remounts mid-run or after completion (#2889)", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const firstMount = render(<BarcodeReadSettings />);

    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    // First file completes before remount
    FakeXhr.instances[0].respond(200, {
      filename: "one.png",
      barcodes: [
        {
          type: "QRCode",
          text: "https://snapotter.com",
          position: {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 10, y: 0 },
            bottomLeft: { x: 0, y: 10 },
            bottomRight: { x: 10, y: 10 },
          },
        },
      ],
      annotatedUrl: "/api/v1/download/job-1/annotated-one.png",
    });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));

    // Remount across 768px while second file is in flight
    firstMount.unmount();
    const secondMount = render(<BarcodeReadSettings />);

    // Second file completes while remounted panel is mounted
    FakeXhr.instances[1].respond(200, {
      filename: "two.png",
      barcodes: [
        {
          type: "Code128",
          text: "OTTER-128",
          position: {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 10, y: 0 },
            bottomLeft: { x: 0, y: 10 },
            bottomRight: { x: 10, y: 10 },
          },
        },
      ],
      annotatedUrl: "/api/v1/download/job-2/annotated-two.png",
    });

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(screen.getByText("https://snapotter.com")).toBeInTheDocument();
    expect(screen.getByText("OTTER-128")).toBeInTheDocument();

    // Copy the first barcode row before remounting again
    const copyButtonsBefore = screen.getAllByTitle(en.toolSettings["barcode-read"].copyValue);
    fireEvent.click(copyButtonsBefore[0]);
    await act(async () => {});
    expect(useFileStore.getState().entries[0].claimed).toBe(false);

    // Remount after completion (e.g. rotating back across 768px)
    secondMount.unmount();
    render(<BarcodeReadSettings />);

    expect(screen.getByText("https://snapotter.com")).toBeInTheDocument();
    expect(screen.getByText("OTTER-128")).toBeInTheDocument();

    // Copying the second barcode row on the remounted panel completes the set and claims both entries
    const copyButtonsAfter = screen.getAllByTitle(en.toolSettings["barcode-read"].copyValue);
    fireEvent.click(copyButtonsAfter[1]);
    await waitFor(() => {
      expect(useFileStore.getState().entries[0].claimed).toBe(true);
      expect(useFileStore.getState().entries[1].claimed).toBe(true);
    });

    // undoProcessing() ("Adjust settings" in ReviewPanel on multi-file runs) clears barcode results
    act(() => {
      useFileStore.getState().undoProcessing();
    });
    expect(screen.queryByText("https://snapotter.com")).not.toBeInTheDocument();
    expect(screen.queryByText("OTTER-128")).not.toBeInTheDocument();
  });
});
