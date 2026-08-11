// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import AdmZip from "adm-zip";
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

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "33333333-3333-4333-8333-333333333333" };
});

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { track } from "@/lib/analytics";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  status: number;
  responseText: string;
  responseType: string;
  response: unknown;
  timeout: number;
  upload: { onprogress?: unknown; onload?: (() => void) | null };
  onload?: () => void;
  onerror?: (() => void) | null;
  ontimeout?: (() => void) | null;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  getResponseHeader: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

class MockEventSource {
  static OPEN = 1;
  static instances: MockEventSource[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockEventSource.OPEN;
  close = vi.fn(() => {
    this.readyState = 2;
  });

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
}

let xhrs: MockXhr[];

const JOB_ID = "33333333-3333-4333-8333-333333333333";

const ZIP_NAMES = { "0": "first_resize.png", "1": "second_resize.jpg" } as const;
const ZIP_BYTES = (() => {
  const zip = new AdmZip();
  zip.addFile("first_resize.png", Buffer.from([1, 2, 3, 4]));
  zip.addFile("second_resize.jpg", Buffer.from([5, 6]));
  return new Uint8Array(zip.toBuffer());
})();
const zipBlob = () => new Blob([ZIP_BYTES.slice().buffer], { type: "application/zip" });
const encodedFileResults = () => encodeURIComponent(JSON.stringify(ZIP_NAMES));

function latestSse(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

function sendBatchFrame(frame: Record<string, unknown>) {
  latestSse().onmessage?.({
    data: JSON.stringify({ type: "batch", jobId: JOB_ID, ...frame }),
  } as MessageEvent);
}

function sendSingleFrame(frame: Record<string, unknown>) {
  latestSse().onmessage?.({
    data: JSON.stringify({ type: "single", jobId: JOB_ID, ...frame }),
  } as MessageEvent);
}

const TERMINAL_RESULT = {
  jobId: JOB_ID,
  downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize-33333333.zip`,
  zipFilename: "batch-resize-33333333.zip",
  fileResults: ZIP_NAMES,
  processedSize: ZIP_BYTES.length,
};

function completedTerminalFrame() {
  return {
    status: "completed",
    totalFiles: 2,
    completedFiles: 2,
    failedFiles: 0,
    errors: [],
    result: TERMINAL_RESULT,
  };
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
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
        responseType: "",
        response: null,
        timeout: 0,
        upload: {},
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        getResponseHeader: vi.fn(() => null),
        abort: vi.fn(),
      };
      xhrs.push(xhr);
      return xhr;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.mocked(track).mockClear();
});

function startBatchRun() {
  const files = [
    new File([new ArrayBuffer(16)], "first.png", { type: "image/png" }),
    new File([new ArrayBuffer(16)], "second.jpg", { type: "image/jpeg" }),
  ];
  useFileStore.getState().setFiles(files);
  const hook = renderHook(() => useToolProcessor("resize"));
  act(() => {
    void hook.result.current.processAllFiles(files, { width: 50 });
  });
  return hook;
}

function startSingleRun() {
  const file = new File([new ArrayBuffer(64)], "clip.mp4", { type: "video/mp4" });
  useFileStore.getState().setFiles([file]);
  const hook = renderHook(() => useToolProcessor("trim-video"));
  act(() => {
    hook.result.current.processFiles([file], { startS: 0, endS: 2 });
  });
  return hook;
}

async function settled(check: () => void) {
  await vi.waitFor(check, { timeout: 3_000 });
}

/**
 * #750: the batch path gets the #722 treatment. A dead POST after the upload
 * finished degrades to the async path; the terminal batch SSE frame carries
 * the durable ZIP's downloadUrl + fileResults, and the client settles the run
 * from that instead of abandoning a batch that keeps running server-side.
 */
describe("useToolProcessor batch recovery (#750)", () => {
  it("settles the happy path from the XHR response ZIP", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].response = zipBlob();
      xhrs[0].getResponseHeader = vi.fn((name: string) =>
        name === "X-File-Results" ? encodedFileResults() : null,
      );
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().batchZipBlob).not.toBeNull();

    unmount();
  });

  it("ignores the terminal SSE frame while the sync response is still the settling path", async () => {
    const { unmount } = startBatchRun();

    // The finalize publishes the terminal frame before the route streams the
    // ZIP, so in sync mode the frame always precedes the response.
    act(() => {
      xhrs[0].upload.onload?.();
      sendBatchFrame(completedTerminalFrame());
    });
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      xhrs[0].status = 200;
      xhrs[0].response = zipBlob();
      xhrs[0].getResponseHeader = vi.fn((name: string) =>
        name === "X-File-Results" ? encodedFileResults() : null,
      );
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
    });
    const batchEvents = vi
      .mocked(track)
      .mock.calls.filter(([event]) => event === "batch_processed");
    expect(batchEvents).toHaveLength(1);
    expect(batchEvents[0][1]).toMatchObject({ status: "completed" });

    unmount();
  });

  it("degrades a dead post-upload socket and settles from the terminal frame's download URL", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(zipBlob()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    // Not an error: the batch is live server-side and tracked via SSE.
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      sendBatchFrame(completedTerminalFrame());
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().batchZipBlob).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(TERMINAL_RESULT.downloadUrl, expect.anything());

    unmount();
  });

  it("still fails immediately when the socket dies mid-upload", () => {
    const { unmount } = startBatchRun();

    act(() => {
      // No upload.onload: the request body never fully left the browser.
      xhrs[0].onerror?.();
    });

    expect(useFileStore.getState().error).toBe(
      "Processing was interrupted. Retry when reconnected.",
    );
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("surfaces the never-confirmed error when no batch evidence ever arrives", () => {
    vi.useFakeTimers();
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      latestSse().onmessage?.({
        data: JSON.stringify({ type: "heartbeat" }),
      } as MessageEvent);
      vi.advanceTimersByTime(30_001);
    });

    expect(useFileStore.getState().error).toBe(
      "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
    );
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("skips the evidence timer when a batch frame already proved the batch exists", () => {
    vi.useFakeTimers();
    const { unmount } = startBatchRun();

    act(() => {
      sendBatchFrame({
        status: "processing",
        totalFiles: 2,
        completedFiles: 0,
        failedFiles: 0,
        errors: [],
      });
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("treats a 202 as the async contract and settles from the terminal frame", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(zipBlob()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].onload?.();
    });
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();

    act(() => {
      sendBatchFrame(completedTerminalFrame());
    });

    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("fails the run when the terminal frame reports every file failed", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    act(() => {
      sendBatchFrame({
        status: "failed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        errors: [
          { filename: "first.png", error: "corrupt" },
          { filename: "second.jpg", error: "too large" },
        ],
      });
    });

    await settled(() => {
      expect(useFileStore.getState().error).toBe("All files failed processing");
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("fails a degraded run when a completed terminal frame has no durable result", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    // Custom batch sub-routes (pdf-to-image, svg-to-raster) emit terminal
    // frames without a result; their ZIP only ever existed on the dead
    // response, so the run cannot be recovered.
    act(() => {
      sendBatchFrame({
        status: "completed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 0,
        errors: [],
      });
    });

    await settled(() => {
      expect(useFileStore.getState().error).toBe(
        "Processing was interrupted. Retry when reconnected.",
      );
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("fails fast with the right message when the durable ZIP is already gone", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      sendBatchFrame(completedTerminalFrame());
    });

    // A 404 is deterministic: no retries, no network blame.
    await settled(() => {
      expect(useFileStore.getState().error).toBe(
        "Completed result is no longer available. Run the job again.",
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("gives up after download retries are exhausted", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.reject(new Error("network down")));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    act(() => {
      sendBatchFrame(completedTerminalFrame());
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(useFileStore.getState().error).toBe(
      "Processing was interrupted. Retry when reconnected.",
    );
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("degrades a batch 502 whose blob body is not JSON", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 502;
      xhrs[0].response = new Blob(["<html><body>502 Bad Gateway</body></html>"], {
        type: "text/html",
      });
      xhrs[0].onload?.();
    });

    // The 5xx body read is async (Blob.text), so the degrade lands a tick
    // later; what must never happen is an error.
    await settled(() => {
      expect(vi.mocked(track)).toHaveBeenCalledWith("tool_run_degraded", {
        tool_id: "resize",
        is_batch: true,
        trigger: "http-502",
        had_evidence: false,
      });
    });
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("recovers through the stall timer when the terminal frame was missed", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(zipBlob()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();

    act(() => {
      // Evidence first, so the 30s evidence timer never arms and the 300s
      // stall timer is the recovery path under test.
      sendBatchFrame({
        status: "processing",
        totalFiles: 2,
        completedFiles: 1,
        failedFiles: 0,
        errors: [],
      });
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    const sourcesAfterDegrade = MockEventSource.instances.length;

    // The terminal frame never arrives on this source (half-open SSE). The
    // stall timer must force a fresh source, whose server-side replay then
    // delivers the terminal frame.
    act(() => {
      vi.advanceTimersByTime(300_001);
    });
    expect(MockEventSource.instances.length).toBeGreaterThan(sourcesAfterDegrade);
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      sendBatchFrame(completedTerminalFrame());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("emits tool_run_degraded with batch dimensions on degrade", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    await settled(() => {
      expect(vi.mocked(track)).toHaveBeenCalledWith("tool_run_degraded", {
        tool_id: "resize",
        is_batch: true,
        trigger: "socket",
        had_evidence: false,
      });
    });

    unmount();
  });
});

/**
 * #750 item 2: a gateway that answers 502/504 with a body (nginx/haproxy
 * error pages) after a fully sent upload is an intermediary speaking, not the
 * app. The app's own 5xx always carries a parseable JSON error body and must
 * keep its precise message.
 */
describe("useToolProcessor proxy 5xx degrade (#750)", () => {
  it("degrades a post-upload 502 with an unparseable body", async () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 502;
      xhrs[0].responseText = "<html><body>502 Bad Gateway</body></html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);

    act(() => {
      sendSingleFrame({
        phase: "complete",
        percent: 100,
        result: {
          jobId: "server-job",
          downloadUrl: "/api/v1/download/server-job/clip_trimmed.mp4",
          originalSize: 64,
          processedSize: 32,
        },
      });
    });

    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);

    await settled(() => {
      expect(vi.mocked(track)).toHaveBeenCalledWith("tool_run_degraded", {
        tool_id: "trim-video",
        is_batch: false,
        trigger: "http-502",
        had_evidence: false,
      });
    });

    unmount();
  });

  it("degrades a post-upload 504 with an empty body", () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 504;
      xhrs[0].responseText = "";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("keeps the precise error for a 504 with a JSON body (the app spoke)", () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 504;
      xhrs[0].responseText = JSON.stringify({ error: "Page took too long to load" });
      xhrs[0].onload?.();
    });

    // parseApiError is mocked to "error"; the point is it went through the
    // normal error path instead of degrading.
    expect(useFileStore.getState().error).toBe("error");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("does not degrade a 502 that arrived before the upload finished", () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].status = 502;
      xhrs[0].responseText = "<html>bad gateway</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().error).toBe("Processing failed: 502");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });
});
