// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

import { BarcodeReadSettings, resetBarcodeResults } from "@/components/tools/barcode-read-settings";
import { EraseObjectSettings } from "@/components/tools/erase-object-settings";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { FaviconSettings } from "@/components/tools/favicon-settings";
import { FindDuplicatesSettings } from "@/components/tools/find-duplicates-settings";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
import { OcrSettings, ocrOneFile, resetOcrResult } from "@/components/tools/ocr-settings";
import type { SignCanvasRef, SignPlacement } from "@/components/tools/sign-canvas";
import { SignPdfSettings } from "@/components/tools/sign-pdf-settings";
import { apiUploadUserFiles } from "@/lib/api";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  sendHeartbeat() {
    this.onmessage?.({ data: JSON.stringify({ type: "heartbeat" }) });
  }
}

class FakeXhr {
  static instances: FakeXhr[] = [];

  timeout = 0;
  status = 0;
  responseType = "";
  response: unknown = null;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: ((event?: ProgressEvent) => void) | null = null;
  onabort: (() => void) | null = null;
  upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  aborted = false;
  abort = vi.fn(() => {
    this.aborted = true;
    // Real browsers dispatch `abort` synchronously when abort() is called on an in-flight XHR.
    this.onabort?.();
  });

  constructor() {
    FakeXhr.instances.push(this);
  }

  open() {}

  setRequestHeader() {}

  send() {}

  fireProgress(loaded: number, total = 100, lengthComputable = true) {
    this.upload.onprogress?.(
      new ProgressEvent("progress", {
        lengthComputable,
        loaded,
        total: lengthComputable ? total : 0,
      }),
    );
  }

  fireUploadLoad() {
    this.upload.onload?.();
  }

  respond(status: number, body: unknown) {
    if (this.aborted) return;
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }

  respondBlob(status: number, blob: Blob) {
    if (this.aborted) return;
    this.status = status;
    this.response = blob;
    this.onload?.();
  }
}

function image(name: string): File {
  return new File(["png-bytes"], name, { type: "image/png" });
}

function pdf(name: string): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function fakeEraser(): EraserCanvasRef {
  const mask = () => new Blob(["mask"], { type: "image/png" });
  return {
    exportMask: async () => mask(),
    exportAllMasks: async () =>
      new Map(useFileStore.getState().entries.map((e) => [e.blobUrl, mask()] as const)),
    getMaskCenter: () => null,
    clear: vi.fn(),
    clearAll: vi.fn(),
    undo: vi.fn(),
  };
}

const PLACEMENT: SignPlacement = { sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 };

function fakeSignCanvas(): SignCanvasRef {
  return {
    addSignature: vi.fn(),
    deleteSelected: vi.fn(),
    hasPlacements: () => true,
    exportPlacements: async () => ({
      pngs: [new Blob(["png"], { type: "image/png" })],
      placements: [PLACEMENT],
    }),
  };
}

let blobCount = 0;

beforeEach(() => {
  vi.useFakeTimers();
  blobCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
  URL.revokeObjectURL = vi.fn();
  FakeXhr.instances = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ canceled: true }))),
  );
  useDuplicateStore.getState().reset();
  useFileStore.getState().reset();
  resetBarcodeResults();
  resetOcrResult();
});

afterEach(() => {
  cleanup();
  useDuplicateStore.getState().reset();
  useFileStore.getState().reset();
  resetBarcodeResults();
  resetOcrResult();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("custom-XHR upload stall and post-upload response watchdog (#3870)", () => {
  it("apiUploadUserFiles keeps advancing uploads alive past 120s, aborts after a 120s upload stall, and enforces a 120s post-upload response timeout", async () => {
    const progress: number[] = [];
    const slowUpload = apiUploadUserFiles([image("a.png")], (pct) => progress.push(pct));
    const xhr = FakeXhr.instances[0];
    expect(xhr.timeout).toBe(0);

    for (const loaded of [20, 40, 60, 80]) {
      vi.advanceTimersByTime(60_000);
      xhr.fireProgress(loaded, 100);
    }
    expect(xhr.aborted).toBe(false);
    expect(progress).toEqual([20, 40, 60, 80]);

    xhr.fireProgress(100, 100);
    vi.advanceTimersByTime(60_000);
    expect(xhr.aborted).toBe(false);

    xhr.respond(200, {
      files: [{ id: "f1", originalName: "a.png", size: 9, version: 1 }],
    });
    await expect(slowUpload).resolves.toEqual({
      files: [{ id: "f1", originalName: "a.png", size: 9, version: 1 }],
    });

    // Stalled upload (including non-advancing progress events) aborts at 120s
    const stalledUpload = apiUploadUserFiles([image("b.png")]);
    const stalledXhr = FakeXhr.instances[1];
    vi.advanceTimersByTime(60_000);
    stalledXhr.fireProgress(25, 100);
    vi.advanceTimersByTime(60_000);
    stalledXhr.fireProgress(25, 100);
    expect(stalledXhr.aborted).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(stalledXhr.abort).toHaveBeenCalledOnce();
    await expect(stalledUpload).rejects.toThrow("Upload timed out");

    // Post-upload response timeout fires 120s after body finishes uploading
    const slowResponse = apiUploadUserFiles([image("c.png")]);
    const respXhr = FakeXhr.instances[2];
    vi.advanceTimersByTime(80_000);
    respXhr.fireProgress(50, 100);
    vi.advanceTimersByTime(80_000);
    respXhr.fireProgress(100, 100);
    vi.advanceTimersByTime(119_999);
    expect(respXhr.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(respXhr.abort).toHaveBeenCalledOnce();
    await expect(slowResponse).rejects.toThrow("Upload timed out");
  });

  it("FaviconSettings keeps advancing uploads alive past 300s, aborts on a 120s upload stall, and enforces a 300s post-upload response timeout", () => {
    useFileStore.getState().setFiles([image("logo.png")]);
    render(<FaviconSettings />);

    fireEvent.click(screen.getByTestId("favicon-submit"));
    const xhr = FakeXhr.instances[0];
    expect(xhr.timeout).toBe(0);

    act(() => {
      for (const loaded of [15, 30, 45, 60, 75, 90]) {
        vi.advanceTimersByTime(60_000);
        xhr.fireProgress(loaded, 100);
      }
    });
    expect(xhr.aborted).toBe(false);
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      xhr.fireUploadLoad();
      vi.advanceTimersByTime(200_000);
    });
    expect(xhr.aborted).toBe(false);

    act(() => {
      xhr.respondBlob(200, new Blob(["zip"], { type: "application/zip" }));
    });
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0].status).toBe("completed");

    // Upload stall at 120s
    fireEvent.click(screen.getByTestId("favicon-submit"));
    const stalledXhr = FakeXhr.instances[1];
    act(() => {
      vi.advanceTimersByTime(60_000);
      stalledXhr.fireProgress(20, 100);
      vi.advanceTimersByTime(119_999);
    });
    expect(stalledXhr.aborted).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(stalledXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(en.toolSettings.favicon.timeout);
    expect(useFileStore.getState().processing).toBe(false);

    // Post-upload response window (300s)
    fireEvent.click(screen.getByTestId("favicon-submit"));
    const respXhr = FakeXhr.instances[2];
    act(() => {
      respXhr.fireUploadLoad();
      vi.advanceTimersByTime(299_999);
    });
    expect(respXhr.aborted).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(respXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(en.toolSettings.favicon.timeout);
  });

  it("BarcodeReadSettings keeps advancing uploads alive past 300s, aborts on a 120s upload stall, and enforces a 300s post-upload response timeout", async () => {
    useFileStore.getState().setFiles([image("code.png")]);
    render(<BarcodeReadSettings />);

    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    const xhr = FakeXhr.instances[0];
    expect(xhr.timeout).toBe(0);

    await act(async () => {
      for (const loaded of [15, 30, 45, 60, 75, 90]) {
        vi.advanceTimersByTime(60_000);
        xhr.fireProgress(loaded, 100);
      }
      xhr.fireUploadLoad();
      vi.advanceTimersByTime(200_000);
      xhr.respond(200, {
        filename: "code.png",
        barcodes: [{ type: "QRCode", text: "https://snapotter.com" }],
        annotatedUrl: null,
      });
    });
    expect(xhr.aborted).toBe(false);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();

    // Upload stall at 120s
    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    const stalledXhr = FakeXhr.instances[1];
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(stalledXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(`code.png: ${en.errors.requestTimedOut}`);

    // Post-upload response window (300s)
    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    const respXhr = FakeXhr.instances[2];
    await act(async () => {
      respXhr.fireProgress(100, 100);
      vi.advanceTimersByTime(299_999);
    });
    expect(respXhr.aborted).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(respXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(`code.png: ${en.errors.requestTimedOut}`);
  });

  it("FindDuplicatesSettings keeps advancing uploads alive past 300s, aborts on a 120s upload stall, and enforces a 300s post-upload response timeout", () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    render(<FindDuplicatesSettings />);

    fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    const xhr = FakeXhr.instances[0];
    expect(xhr.timeout).toBe(0);

    act(() => {
      for (const loaded of [15, 30, 45, 60, 75, 90]) {
        vi.advanceTimersByTime(60_000);
        xhr.fireProgress(loaded, 100);
      }
      xhr.fireUploadLoad();
      vi.advanceTimersByTime(200_000);
      xhr.respond(200, {
        totalImages: 2,
        uniqueImages: 2,
        spaceSaveable: 0,
        duplicateGroups: [],
      });
    });
    expect(xhr.aborted).toBe(false);
    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(useDuplicateStore.getState().error).toBeNull();

    // Clear results so the submit button is shown again for the stall check
    act(() => {
      useDuplicateStore.getState().setResults(null);
    });
    fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    const stalledXhr = FakeXhr.instances[1];
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(stalledXhr.abort).toHaveBeenCalledOnce();
    expect(useDuplicateStore.getState().error).toBe(
      en.toolSettings["find-duplicates"].requestTimedOut,
    );
    expect(useDuplicateStore.getState().scanning).toBe(false);

    // Post-upload response window (300s)
    fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    const respXhr = FakeXhr.instances[2];
    act(() => {
      respXhr.fireProgress(100, 100);
      vi.advanceTimersByTime(299_999);
    });
    expect(respXhr.aborted).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(respXhr.abort).toHaveBeenCalledOnce();
    expect(useDuplicateStore.getState().error).toBe(
      en.toolSettings["find-duplicates"].requestTimedOut,
    );
  });

  it("ImageToPdfSettings keeps advancing uploads alive past 300s, aborts on a 120s upload stall, and enforces a 300s post-upload response timeout", () => {
    useFileStore.getState().setFiles([image("page1.png")]);
    render(<ImageToPdfSettings />);

    fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    const xhr = FakeXhr.instances[0];
    expect(xhr.timeout).toBe(0);

    act(() => {
      for (const loaded of [15, 30, 45, 60, 75, 90]) {
        vi.advanceTimersByTime(60_000);
        xhr.fireProgress(loaded, 100);
      }
      xhr.fireUploadLoad();
      vi.advanceTimersByTime(200_000);
      xhr.respond(200, { downloadUrl: "/api/v1/download/job/out.pdf" });
    });
    expect(xhr.aborted).toBe(false);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0].status).toBe("completed");

    // Upload stall at 120s
    fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    const stalledXhr = FakeXhr.instances[1];
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(stalledXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(en.toolSettings["image-to-pdf"].requestTimedOut);
    expect(useFileStore.getState().processing).toBe(false);

    // Post-upload response window (300s)
    fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    const respXhr = FakeXhr.instances[2];
    act(() => {
      respXhr.fireUploadLoad();
      vi.advanceTimersByTime(299_999);
    });
    expect(respXhr.aborted).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(respXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(en.toolSettings["image-to-pdf"].requestTimedOut);
  });

  it("EraseObjectSettings single-file and batch requests keep advancing uploads alive past 600s, abort on a 120s upload stall, and enforce a 600s post-upload response timeout", async () => {
    useFileStore.getState().setFiles([image("photo1.png"), image("photo2.png")]);
    const { rerender } = render(
      <EraseObjectSettings
        eraserRef={{ current: fakeEraser() }}
        hasStrokes
        brushSize={30}
        onBrushSizeChange={vi.fn()}
        mode="brush"
        onModeChange={vi.fn()}
        maskedFileCount={1}
      />,
    );

    // 1. Single-file advancing upload past 600s then completing
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    const singleXhr = FakeXhr.instances[0];
    expect(singleXhr.timeout).toBe(0);

    await act(async () => {
      for (let i = 1; i <= 11; i++) {
        vi.advanceTimersByTime(60_000);
        singleXhr.fireProgress(i * 8, 100);
      }
      singleXhr.fireUploadLoad();
      // Keep SSE stall timer alive with heartbeats while waiting 400s for HTTP response
      vi.advanceTimersByTime(200_000);
      FakeEventSource.instances[0].sendHeartbeat();
      vi.advanceTimersByTime(200_000);
      FakeEventSource.instances[0].sendHeartbeat();
      singleXhr.respond(200, {
        downloadUrl: "/api/v1/download/job/erased.png",
        originalSize: 100,
        processedSize: 90,
      });
    });
    expect(singleXhr.aborted).toBe(false);
    expect(useFileStore.getState().entries[0].status).toBe("completed");

    // 2. Single-file upload stall at 120s
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    const stalledSingleXhr = FakeXhr.instances[1];
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(stalledSingleXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(en.toolSettings["erase-object"].timeoutOverloaded);

    // 3. Batch (processOneFile): first file stalls at 120s, second file uploads over 660s then times out at 600s post-upload
    rerender(
      <EraseObjectSettings
        eraserRef={{ current: fakeEraser() }}
        hasStrokes
        brushSize={30}
        onBrushSizeChange={vi.fn()}
        mode="brush"
        onModeChange={vi.fn()}
        maskedFileCount={2}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    const batchXhr1 = FakeXhr.instances[2];
    expect(batchXhr1.timeout).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(batchXhr1.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: en.errors.requestTimedOut,
      errorCategory: "timeout",
    });

    const batchXhr2 = FakeXhr.instances[3];
    expect(batchXhr2.timeout).toBe(0);
    await act(async () => {
      for (let i = 1; i <= 11; i++) {
        vi.advanceTimersByTime(60_000);
        batchXhr2.fireProgress(i * 8, 100);
      }
      batchXhr2.fireProgress(100, 100);
      vi.advanceTimersByTime(200_000);
      FakeEventSource.instances.at(-1)?.sendHeartbeat();
      vi.advanceTimersByTime(200_000);
      FakeEventSource.instances.at(-1)?.sendHeartbeat();
      vi.advanceTimersByTime(199_999);
    });
    expect(batchXhr2.aborted).toBe(false);
    await act(async () => {
      FakeEventSource.instances.at(-1)?.sendHeartbeat();
      vi.advanceTimersByTime(1);
    });
    expect(batchXhr2.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().entries[1]).toMatchObject({
      status: "failed",
      error: en.errors.requestTimedOut,
      errorCategory: "timeout",
    });
  });

  it("SignPdfSettings keeps advancing uploads alive past 600s, aborts on a 120s upload stall, and enforces a 600s post-upload response timeout", async () => {
    useFileStore.getState().setFiles([pdf("contract.pdf")]);
    render(
      <SignPdfSettings
        signProps={{
          canvasRef: { current: fakeSignCanvas() },
          hasSelection: false,
          placementCount: 1,
        }}
      />,
    );

    const applyBtn = () => screen.getByRole("button", { name: /apply & download/i });
    await act(async () => {
      fireEvent.click(applyBtn());
    });
    const xhr = FakeXhr.instances[0];
    expect(xhr.timeout).toBe(0);

    await act(async () => {
      for (let i = 1; i <= 11; i++) {
        vi.advanceTimersByTime(60_000);
        xhr.fireProgress(i * 8, 100);
      }
      xhr.fireUploadLoad();
      vi.advanceTimersByTime(200_000);
      FakeEventSource.instances[0].sendHeartbeat();
      vi.advanceTimersByTime(200_000);
      FakeEventSource.instances[0].sendHeartbeat();
      xhr.respond(200, { downloadUrl: "/api/v1/download/job/contract_signed.pdf" });
    });
    expect(xhr.aborted).toBe(false);
    expect(useFileStore.getState().entries[0].status).toBe("completed");

    // Load a fresh PDF entry to test upload stall at 120s
    act(() => {
      useFileStore.getState().setFiles([pdf("contract2.pdf")]);
    });
    await act(async () => {
      fireEvent.click(applyBtn());
    });
    const stalledXhr = FakeXhr.instances[1];
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(stalledXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: en.toolSettings["sign-pdf"].timeout,
      errorCategory: "timeout",
    });

    // Post-upload response window (600s)
    await act(async () => {
      fireEvent.click(applyBtn());
    });
    const respXhr = FakeXhr.instances[2];
    await act(async () => {
      respXhr.fireUploadLoad();
      vi.advanceTimersByTime(200_000);
      FakeEventSource.instances[2].sendHeartbeat();
      vi.advanceTimersByTime(200_000);
      FakeEventSource.instances[2].sendHeartbeat();
      vi.advanceTimersByTime(199_999);
    });
    expect(respXhr.aborted).toBe(false);
    await act(async () => {
      FakeEventSource.instances[2].sendHeartbeat();
      vi.advanceTimersByTime(1);
    });
    expect(respXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: en.toolSettings["sign-pdf"].timeout,
      errorCategory: "timeout",
    });
  });

  it("ocrOneFile keeps advancing uploads alive past 600s, aborts with timeout (not onabort) on a 120s upload stall, enforces a 600s response timeout, and disarms on 202", async () => {
    const callbacks = {
      onUploadProgress: vi.fn(),
      onProcessingProgress: vi.fn(),
    };
    const messages = {
      timeout: "Custom OCR timeout",
      networkError: "Custom network error",
      processingFailed: "Custom processing failed",
      t: en,
    };

    // 1. Slow upload > 600s succeeds
    const slowPromise = ocrOneFile(
      image("scan1.png"),
      { quality: "fast", language: "en", enhance: false },
      callbacks,
      messages,
    );
    const xhr1 = FakeXhr.instances[0];
    expect(xhr1.timeout).toBe(0);

    for (let i = 1; i <= 11; i++) {
      vi.advanceTimersByTime(60_000);
      xhr1.fireProgress(i * 8, 100);
    }
    xhr1.fireUploadLoad();
    xhr1.respond(200, { text: "hello world" });
    await expect(slowPromise).resolves.toEqual({ text: "hello world", savedFileId: undefined });

    // 2. Upload stall at 120s rejects with timeout message, not onabort's processingFailed
    const stalledPromise = ocrOneFile(
      image("scan2.png"),
      { quality: "fast", language: "en", enhance: false },
      callbacks,
      messages,
    );
    const xhr2 = FakeXhr.instances[1];
    vi.advanceTimersByTime(120_000);
    expect(xhr2.abort).toHaveBeenCalledOnce();
    await expect(stalledPromise).rejects.toThrow("Custom OCR timeout");

    // 3. 202 response disarms the XHR response timer so async SSE is not aborted at 600s
    useFeaturesStore.setState({ loaded: true, loadError: false, bundles: [] });
    const asyncPromise = ocrOneFile(
      image("scan3.png"),
      { quality: "fast", language: "en", enhance: false },
      callbacks,
      messages,
    );
    const xhr3 = FakeXhr.instances[2];
    const es3 = FakeEventSource.instances[2];
    xhr3.fireUploadLoad();
    xhr3.respond(202, { jobId: "j3", async: true });
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(200_000);
      es3.sendHeartbeat();
    }
    expect(xhr3.aborted).toBe(false);
    es3.onmessage?.({
      data: JSON.stringify({
        type: "single",
        phase: "complete",
        result: { text: "async ocr text" },
      }),
    });
    await expect(asyncPromise).resolves.toEqual({
      text: "async ocr text",
      savedFileId: undefined,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pauses the watchdog timer on BarcodeReadSettings/OcrSettings unmount, resumes it on remount, and disarms if xhr.send throws synchronously", async () => {
    useFileStore.getState().setFiles([image("code.png")]);
    const firstBarcode = render(<BarcodeReadSettings />);
    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    const barcodeXhr = FakeXhr.instances[0];

    firstBarcode.unmount();
    expect(vi.getTimerCount()).toBe(0);
    // Late upload progress while unmounted updates state without re-arming a timer
    act(() => {
      barcodeXhr.fireProgress(40, 100);
    });
    expect(vi.getTimerCount()).toBe(0);

    const secondBarcode = render(<BarcodeReadSettings />);
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(barcodeXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(`code.png: ${en.errors.requestTimedOut}`);
    secondBarcode.unmount();

    // OcrSettings remount after upload finished resumes the 600s response window,
    // and repeated upload.onload / SSE progress events do not reset the 600s window
    useFeaturesStore.setState({ loaded: true, loadError: false, bundles: [] });
    useFileStore.getState().setFiles([image("scan.png")]);
    const firstOcr = render(<OcrSettings />);
    fireEvent.click(screen.getByTestId("ocr-submit"));
    const ocrXhr = FakeXhr.instances[1];
    act(() => {
      ocrXhr.fireProgress(100, 100);
    });
    firstOcr.unmount();
    expect(vi.getTimerCount()).toBe(0);

    const secondOcr = render(<OcrSettings />);
    await act(async () => {
      vi.advanceTimersByTime(300_000);
      // Late upload.onload (Firefox) does not restart the 600s post-upload window
      ocrXhr.fireUploadLoad();
      vi.advanceTimersByTime(299_999);
    });
    expect(ocrXhr.aborted).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(ocrXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().error).toBe(`scan.png: ${en.errors.timeout}`);
    secondOcr.unmount();

    // Synchronous send() throw disarms the watchdog timer immediately
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw new Error("sync send failure");
    });
    await expect(apiUploadUserFiles([image("fail.png")])).rejects.toThrow("sync send failure");
    expect(vi.getTimerCount()).toBe(0);
  });
});
