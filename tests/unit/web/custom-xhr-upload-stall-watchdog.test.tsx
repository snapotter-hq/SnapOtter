// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
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
import { CollageSettings } from "@/components/tools/collage-settings";
import { EraseObjectSettings } from "@/components/tools/erase-object-settings";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { FaviconSettings } from "@/components/tools/favicon-settings";
import { FindDuplicatesSettings } from "@/components/tools/find-duplicates-settings";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
import { OcrSettings, ocrOneFile, resetOcrResult } from "@/components/tools/ocr-settings";
import type { SignCanvasRef, SignPlacement } from "@/components/tools/sign-canvas";
import { SignPdfSettings } from "@/components/tools/sign-pdf-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { getDistinctId } from "@/lib/analytics";
import { apiUploadUserFiles } from "@/lib/api";
import { useCollageStore } from "@/stores/collage-store";
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

  respondRaw(status: number, body: string) {
    if (this.aborted) return;
    this.status = status;
    this.responseText = body;
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
  useCollageStore.getState().reset();
  useDuplicateStore.getState().reset();
  useFileStore.getState().reset();
  resetBarcodeResults();
  resetOcrResult();
});

afterEach(() => {
  cleanup();
  useCollageStore.getState().reset();
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

  it("StitchSettings keeps advancing uploads alive past 300s, aborts on a 120s upload stall, and enforces a 300s post-upload response timeout (#3876)", () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const view = render(<StitchSettings />);

    fireEvent.click(screen.getByTestId("stitch-submit"));
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
        jobId: "j-stitch",
        downloadUrl: "/api/v1/download/j-stitch/stitched.png",
        originalSize: 200,
        processedSize: 150,
      });
    });
    expect(xhr.aborted).toBe(false);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(vi.getTimerCount()).toBe(0);

    // Upload stall at 120s (including non-advancing progress events)
    fireEvent.click(screen.getByTestId("stitch-submit"));
    const stalledXhr = FakeXhr.instances[1];
    act(() => {
      vi.advanceTimersByTime(60_000);
      stalledXhr.fireProgress(20, 100);
      vi.advanceTimersByTime(60_000);
      stalledXhr.fireProgress(20, 100);
      vi.advanceTimersByTime(59_999);
    });
    expect(stalledXhr.aborted).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(stalledXhr.abort).toHaveBeenCalledOnce();
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: en.errors.requestTimedOut,
      errorCategory: "timeout",
    });
    expect(screen.getByText(en.errors.requestTimedOut)).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    // Post-upload response window (300s)
    fireEvent.click(screen.getByTestId("stitch-submit"));
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
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: en.errors.requestTimedOut,
      errorCategory: "timeout",
    });
    expect(vi.getTimerCount()).toBe(0);

    // Store reset while in flight disarms the watchdog and ignores a late ontimeout
    fireEvent.click(screen.getByTestId("stitch-submit"));
    const resetXhr = FakeXhr.instances[3];
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next1.png"), image("next2.png")]);
      useFileStore.getState().setProcessing(true);
    });
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      resetXhr.ontimeout?.();
    });
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().entries[0].status).toBe("pending");
    expect(useFileStore.getState().entries[0].error).toBeNull();
    act(() => {
      useFileStore.getState().setProcessing(false);
    });

    // Synchronous send() throw disarms the watchdog timer
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw new Error("stitch sync send failure");
    });
    fireEvent.click(screen.getByTestId("stitch-submit"));
    expect(vi.getTimerCount()).toBe(0);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "stitch sync send failure",
    });

    // Unmount while in flight disarms the watchdog timer
    fireEvent.click(screen.getByTestId("stitch-submit"));
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("CollageSettings keeps advancing uploads alive past 300s, aborts on a 120s upload stall, and enforces a 300s post-upload response timeout (#3876)", async () => {
    useCollageStore.getState().addImages([image("one.png"), image("two.png")]);
    const view = render(<CollageSettings />);

    fireEvent.click(screen.getByTestId("collage-submit"));
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
        jobId: "j-collage",
        downloadUrl: "/api/v1/download/j-collage/collage.png",
        originalSize: 200,
        processedSize: 150,
      });
    });
    expect(xhr.aborted).toBe(false);
    expect(useCollageStore.getState().phase).toBe("result");
    expect(useCollageStore.getState().resultUrl).toBe("/api/v1/download/j-collage/collage.png");
    expect(vi.getTimerCount()).toBe(0);

    // Upload stall at 120s
    fireEvent.click(screen.getByTestId("collage-submit"));
    const stalledXhr = FakeXhr.instances[1];
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      stalledXhr.fireProgress(25, 100);
      vi.advanceTimersByTime(119_999);
    });
    expect(stalledXhr.aborted).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(stalledXhr.abort).toHaveBeenCalledOnce();
    expect(useCollageStore.getState().phase).toBe("editing");
    expect(useCollageStore.getState().error).toBe(en.errors.requestTimedOut);
    expect(screen.getByText(en.errors.requestTimedOut)).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    // Post-upload response window (300s)
    fireEvent.click(screen.getByTestId("collage-submit"));
    const respXhr = FakeXhr.instances[2];
    await act(async () => {
      respXhr.fireUploadLoad();
      vi.advanceTimersByTime(299_999);
    });
    expect(respXhr.aborted).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(respXhr.abort).toHaveBeenCalledOnce();
    expect(useCollageStore.getState().phase).toBe("editing");
    expect(useCollageStore.getState().error).toBe(en.errors.requestTimedOut);
    expect(vi.getTimerCount()).toBe(0);

    // Canceling via setting mutation disarms the watchdog and ignores a late ontimeout
    fireEvent.click(screen.getByTestId("collage-submit"));
    const canceledXhr = FakeXhr.instances[3];
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => {
      useCollageStore.getState().setGap(16);
    });
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      canceledXhr.ontimeout?.();
    });
    expect(useCollageStore.getState().phase).toBe("editing");
    expect(useCollageStore.getState().error).toBeNull();

    // Synchronous send() throw disarms the watchdog timer
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw new Error("collage sync send failure");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("collage-submit"));
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(useCollageStore.getState().phase).toBe("editing");
    expect(useCollageStore.getState().error).toBe("collage sync send failure");

    // Unmount while in flight pauses the watchdog timer, and remounting resumes it
    fireEvent.click(screen.getByTestId("collage-submit"));
    const remountXhr = FakeXhr.instances[5];
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);

    const remountedView = render(<CollageSettings />);
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(remountXhr.abort).toHaveBeenCalledOnce();
    expect(useCollageStore.getState().phase).toBe("editing");
    expect(useCollageStore.getState().error).toBe(en.errors.requestTimedOut);
    expect(vi.getTimerCount()).toBe(0);
    remountedView.unmount();
  });

  it("closes SSE streams, clears timers, and settles processing/scanning state when xhr.open, setRequestHeader, or send throws synchronously (#3877)", async () => {
    vi.mocked(getDistinctId).mockReturnValue("dist-1");

    // 1. ocrOneFile + OcrSettings: synchronous open(), setRequestHeader(), and send() throws close EventSource, clear activeOcrWatchdog across remounts, and support non-Error fallbacks
    vi.spyOn(FakeXhr.prototype, "open").mockImplementationOnce(() => {
      throw new Error("ocr open boom");
    });
    await expect(
      ocrOneFile(
        image("scan.png"),
        { quality: "fast", language: "en", enhance: false },
        { onUploadProgress: vi.fn(), onProcessingProgress: vi.fn() },
        { t: en },
      ),
    ).rejects.toThrow("ocr open boom");
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw "ocr raw string throw";
    });
    await expect(
      ocrOneFile(
        image("scan-raw.png"),
        { quality: "fast", language: "en", enhance: false },
        { onUploadProgress: vi.fn(), onProcessingProgress: vi.fn() },
        { networkError: "Custom OCR network fallback", t: en },
      ),
    ).rejects.toThrow("Custom OCR network fallback");
    expect(FakeEventSource.instances[1].closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    vi.spyOn(FakeXhr.prototype, "setRequestHeader").mockImplementationOnce(() => {
      throw new Error("ocr header boom");
    });
    useFeaturesStore.setState({ loaded: true, loadError: false, bundles: [] });
    useFileStore.getState().setFiles([image("scan2.png")]);
    const ocrView = render(<OcrSettings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ocr-submit"));
    });
    expect(FakeEventSource.instances[2].closed).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe("scan2.png: ocr header boom");
    expect(vi.getTimerCount()).toBe(0);
    ocrView.unmount();
    const remountedOcrView = render(<OcrSettings />);
    expect(vi.getTimerCount()).toBe(0);
    remountedOcrView.unmount();

    // 2. EraseObjectSettings single-file (handleProcess): closes EventSource, clears stall & elapsed timers, settles processing, and handles non-Error throws + store reset during send
    useFileStore.getState().reset();
    useFileStore.getState().setFiles([image("photo1.png"), image("photo2.png")]);
    const eraseView = render(
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
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw new Error("erase single send boom");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    expect(FakeEventSource.instances[3].closed).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe("erase single send boom");
    expect(vi.getTimerCount()).toBe(0);

    vi.spyOn(FakeXhr.prototype, "open").mockImplementationOnce(() => {
      throw "erase raw string";
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    expect(FakeEventSource.instances[4].closed).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe(en.errors.network);
    expect(vi.getTimerCount()).toBe(0);

    // Store reset synchronously inside send() hits the abandoned || settled guard without writing error onto the reset store
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      useFileStore.getState().reset();
      throw new Error("erase after reset boom");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    expect(FakeEventSource.instances[5].closed).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    // 3. EraseObjectSettings batch (processOneFile): closes EventSource, clears 300s stall timer, and still rejects in finally if EventSource.close throws
    act(() => {
      useFileStore.getState().setFiles([image("photo1.png"), image("photo2.png")]);
    });
    eraseView.rerender(
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
    vi.spyOn(FakeXhr.prototype, "setRequestHeader").mockImplementationOnce(() => {
      throw new Error("erase batch 1 header boom");
    });
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw "erase batch 2 raw throw";
    });
    vi.spyOn(FakeEventSource.prototype, "close").mockImplementationOnce(function (
      this: FakeEventSource,
    ) {
      this.closed = true;
      throw new Error("close stream boom");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    expect(FakeEventSource.instances[6].closed).toBe(true);
    expect(FakeEventSource.instances[7].closed).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "erase batch 1 header boom",
    });
    expect(useFileStore.getState().entries[1]).toMatchObject({
      status: "failed",
      error: en.errors.network,
    });
    expect(vi.getTimerCount()).toBe(0);
    eraseView.unmount();

    // 4. SignPdfSettings (handleApply): closes EventSource, clears 300s stall timer, settles processing and entry status, re-enables Apply button, and does not overwrite error on unmount
    useFileStore.getState().reset();
    useFileStore.getState().setFiles([pdf("contract.pdf")]);
    const signView = render(
      <SignPdfSettings
        signProps={{
          canvasRef: { current: fakeSignCanvas() },
          hasSelection: false,
          placementCount: 1,
        }}
      />,
    );
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw new Error("sign send boom");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
    });
    expect(FakeEventSource.instances[8].closed).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "sign send boom",
      errorCategory: "upload_error",
    });
    expect(screen.getByText("sign send boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
    expect(vi.getTimerCount()).toBe(0);

    // Non-Error throw in SignPdfSettings falls back to t.errors.network
    vi.spyOn(FakeXhr.prototype, "open").mockImplementationOnce(() => {
      throw "sign raw throw";
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
    });
    expect(FakeEventSource.instances[9].closed).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: en.errors.network,
      errorCategory: "upload_error",
    });
    expect(vi.getTimerCount()).toBe(0);
    signView.unmount();
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: en.errors.network,
      errorCategory: "upload_error",
    });

    // 5. FindDuplicatesSettings (handleScan): resets scanning to false and sets error when open/setRequestHeader/send throws, including non-Error throws, store replacement during send, and setError listener throws
    useFileStore.getState().reset();
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const dupView = render(<FindDuplicatesSettings />);
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw new Error("dup send boom");
    });
    act(() => {
      fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    });
    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(useDuplicateStore.getState().error).toBe("dup send boom");
    expect(vi.getTimerCount()).toBe(0);

    vi.spyOn(FakeXhr.prototype, "setRequestHeader").mockImplementationOnce(() => {
      throw new Error("dup header boom");
    });
    act(() => {
      fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    });
    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(useDuplicateStore.getState().error).toBe("dup header boom");
    expect(vi.getTimerCount()).toBe(0);

    vi.spyOn(FakeXhr.prototype, "open").mockImplementationOnce(() => {
      throw "dup raw throw";
    });
    act(() => {
      fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    });
    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(useDuplicateStore.getState().error).toBe(
      en.toolSettings["find-duplicates"].networkErrorUpload,
    );
    expect(vi.getTimerCount()).toBe(0);

    // If a subscriber on useDuplicateStore throws when setError runs, finally still resets scanning to false
    let threwOnError = false;
    const unsubDup = useDuplicateStore.subscribe((state) => {
      if (state.error === "dup listener boom" && !threwOnError) {
        threwOnError = true;
        throw new Error("dup subscriber threw");
      }
    });
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      throw new Error("dup listener boom");
    });
    const windowErrors: unknown[] = [];
    const onWindowError = (event: ErrorEvent) => {
      event.preventDefault();
      windowErrors.push(event.error);
    };
    window.addEventListener("error", onWindowError);
    try {
      act(() => {
        fireEvent.click(screen.getByTestId("find-duplicates-submit"));
      });
      expect(windowErrors).toEqual([expect.objectContaining({ message: "dup subscriber threw" })]);
      expect(useDuplicateStore.getState().scanning).toBe(false);
      expect(useDuplicateStore.getState().error).toBe("dup listener boom");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      window.removeEventListener("error", onWindowError);
      unsubDup();
    }

    // Replacing files synchronously inside send() hits !stillLoaded() guard without writing error onto the replacement files
    vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
      useFileStore.getState().setFiles([image("three.png"), image("four.png")]);
      throw new Error("dup replaced boom");
    });
    act(() => {
      fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    });
    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(useDuplicateStore.getState().error).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    dupView.unmount();

    // 6. BarcodeReadSettings (scanOneFile): clears activeBarcodeWatchdog when open() or setRequestHeader() throws synchronously so remounting does not arm a 120s stall timer (#3936)
    useFileStore.getState().reset();
    useFileStore.getState().setFiles([image("code1.png")]);
    const barcodeView = render(<BarcodeReadSettings />);
    vi.spyOn(FakeXhr.prototype, "setRequestHeader").mockImplementationOnce(() => {
      throw new Error("barcode header boom");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("barcode-read-submit"));
    });
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe("code1.png: barcode header boom");
    expect(vi.getTimerCount()).toBe(0);

    barcodeView.unmount();
    const remountedBarcodeView = render(<BarcodeReadSettings />);
    expect(vi.getTimerCount()).toBe(0);

    vi.spyOn(FakeXhr.prototype, "open").mockImplementationOnce(() => {
      throw "barcode open raw throw";
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("barcode-read-submit"));
    });
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe("code1.png: barcode open raw throw");
    expect(vi.getTimerCount()).toBe(0);

    remountedBarcodeView.unmount();
    const remountedBarcodeView2 = render(<BarcodeReadSettings />);
    expect(vi.getTimerCount()).toBe(0);
    remountedBarcodeView2.unmount();
  });

  it("logs the parse error and response snippet when an upload response is not JSON (#4062)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const upload = apiUploadUserFiles([image("not-json.png")]);
    const xhr = FakeXhr.instances[0];
    const html = `<html><body>502 Bad Gateway</body></html>${"x".repeat(300)}`;

    try {
      xhr.respondRaw(200, html);

      await expect(upload).rejects.toThrow(en.errors.invalidResponse);
      expect(warn).toHaveBeenCalledWith(
        "Failed to parse upload response:",
        expect.any(SyntaxError),
        html.substring(0, 200),
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("uses the caller's translation when an upload response is not JSON (#4083)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const upload = apiUploadUserFiles([image("not-json-de.png")], undefined, de);
    const xhr = FakeXhr.instances[0];

    try {
      xhr.respondRaw(200, "<html><body>proxy error</body></html>");
      await expect(upload).rejects.toThrow(de.errors.invalidResponse);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("logs the parse error and response snippet when an upload error response is not JSON (#4062)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const upload = apiUploadUserFiles([image("bad-gateway.png")]);
    const xhr = FakeXhr.instances[0];
    const html = "<html><body>502 Bad Gateway</body></html>";

    try {
      xhr.respondRaw(502, html);

      await expect(upload).rejects.toThrow(en.errors.failedWithStatus);
      expect(warn).toHaveBeenCalledWith(
        "Failed to parse upload error response (status: 502):",
        expect.any(SyntaxError),
        html,
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });
});
