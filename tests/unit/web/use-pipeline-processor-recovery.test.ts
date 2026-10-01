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
  captureHandledError: vi.fn(async () => null),
}));

vi.mock("@/lib/api", () => ({
  formatHeaders: () => new Map<string, string>(),
  parseApiError: () => "error",
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "44444444-4444-4444-8444-444444444444" };
});

import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { captureHandledError, track } from "@/lib/analytics";
import { useFileStore } from "@/stores/file-store";
import type { PipelineStep } from "@/stores/pipeline-store";

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

const JOB_ID = "44444444-4444-4444-8444-444444444444";

const STEPS = [
  { id: "s1", toolId: "resize", settings: { width: 50 } },
] as unknown as PipelineStep[];

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

function sendSingleFrame(frame: Record<string, unknown>) {
  latestSse().onmessage?.({
    data: JSON.stringify({ type: "single", jobId: JOB_ID, ...frame }),
  } as MessageEvent);
}

function sendBatchFrame(frame: Record<string, unknown>) {
  latestSse().onmessage?.({
    data: JSON.stringify({ type: "batch", jobId: JOB_ID, ...frame }),
  } as MessageEvent);
}

const SINGLE_RESULT = {
  jobId: JOB_ID,
  downloadUrl: `/api/v1/download/${JOB_ID}/photo_final.png`,
  originalSize: 64,
  processedSize: 32,
  stepsCompleted: 1,
  steps: [{ step: 1, toolId: "resize", size: 32 }],
};

const BATCH_RESULT = {
  jobId: JOB_ID,
  downloadUrl: `/api/v1/download/${JOB_ID}/pipeline-batch-44444444.zip`,
  zipFilename: "pipeline-batch-44444444.zip",
  fileResults: ZIP_NAMES,
  processedSize: ZIP_BYTES.length,
};

function completedBatchTerminal() {
  return {
    status: "completed",
    totalFiles: 2,
    completedFiles: 2,
    failedFiles: 0,
    errors: [],
    result: BATCH_RESULT,
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
  vi.mocked(captureHandledError).mockClear();
});

function startSingleRun() {
  const file = new File([new ArrayBuffer(64)], "photo.png", { type: "image/png" });
  useFileStore.getState().setFiles([file]);
  const hook = renderHook(() => usePipelineProcessor());
  act(() => {
    hook.result.current.processSingle(file, STEPS);
  });
  return hook;
}

function startBatchRun() {
  const files = [
    new File([new ArrayBuffer(16)], "first.png", { type: "image/png" }),
    new File([new ArrayBuffer(16)], "second.jpg", { type: "image/jpeg" }),
  ];
  useFileStore.getState().setFiles(files);
  const hook = renderHook(() => usePipelineProcessor());
  act(() => {
    void hook.result.current.processAll(files, STEPS);
  });
  return hook;
}

async function settled(check: () => void) {
  await vi.waitFor(check, { timeout: 3_000 });
}

/**
 * #766: the pipeline hook gets the #750 treatment. A dead response after the
 * upload finished degrades to the async path; the terminal SSE frame settles
 * the run (the single frame's own result, or the batch frame's durable ZIP).
 */
describe("usePipelineProcessor single-run recovery (#766)", () => {
  it("degrades a dead post-upload socket and settles from the terminal single frame", () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    // Not an error: the flow is live server-side and tracked via SSE.
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: SINGLE_RESULT.downloadUrl,
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("still fails immediately when the socket dies mid-upload", () => {
    const { unmount } = startSingleRun();

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

  it("degrades a post-upload 502 with an unparseable body and tracks it", async () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 502;
      xhrs[0].responseText = "<html><body>502 Bad Gateway</body></html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    await settled(() => {
      expect(vi.mocked(track)).toHaveBeenCalledWith("tool_run_degraded", {
        tool_id: "pipeline",
        is_batch: false,
        trigger: "http-502",
        had_evidence: false,
      });
    });

    act(() => {
      sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
    });
    expect(useFileStore.getState().entries[0].status).toBe("completed");

    unmount();
  });

  it("keeps the precise error for a 504 with a JSON body", () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 504;
      xhrs[0].responseText = JSON.stringify({ error: "Page took too long to load" });
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().error).toBe("error");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("treats a 202 as the async contract and settles from the terminal frame", () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();

    act(() => {
      sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
    });
    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("surfaces the never-confirmed error when no evidence ever arrives", () => {
    vi.useFakeTimers();
    const { unmount } = startSingleRun();

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

  it("recovers through the stall timer when the terminal frame was missed", () => {
    vi.useFakeTimers();
    const { unmount } = startSingleRun();

    act(() => {
      // Evidence first, so the 30s evidence timer never arms and the 300s
      // stall timer is the recovery path under test.
      sendSingleFrame({ phase: "processing", percent: 40, stage: "Step 1/1" });
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
      sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
    });
    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("recovers via the visibility handler when the tab comes back with a dead SSE", () => {
    vi.useFakeTimers();
    const { unmount } = startSingleRun();

    act(() => {
      sendSingleFrame({ phase: "processing", percent: 40, stage: "Step 1/1" });
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    // The phone comes back from background with a source that died while
    // suspended: not OPEN, so the handler must open a fresh one able to
    // settle the run (the old handler could only render progress).
    act(() => {
      latestSse().readyState = 2;
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(501);
    });

    act(() => {
      sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
    });
    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("keeps a degraded run's leftovers away from the next run", () => {
    vi.useFakeTimers();
    const { result, unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().processing).toBe(true);

    // Second run: the previous run's evidence timer must not fire into it.
    const file = new File([new ArrayBuffer(64)], "photo2.png", { type: "image/png" });
    act(() => {
      useFileStore.getState().setFiles([file]);
      result.current.processSingle(file, STEPS);
    });

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("settles a failed frame with its step error", () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "Step 2: kaboom" });
    });

    expect(useFileStore.getState().error).toBe("Step 2: kaboom");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });
});

describe("usePipelineProcessor batch recovery (#766)", () => {
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
    expect(useFileStore.getState().batchZipBlob).not.toBeNull();

    unmount();
  });

  it("ignores the terminal frame in sync mode so the response cannot double-settle", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      sendBatchFrame(completedBatchTerminal());
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
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("degrades a dead post-upload socket and settles from the durable ZIP", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(zipBlob()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    await settled(() => {
      expect(vi.mocked(track)).toHaveBeenCalledWith("tool_run_degraded", {
        tool_id: "pipeline",
        is_batch: true,
        trigger: "socket",
        had_evidence: false,
      });
    });

    act(() => {
      sendBatchFrame(completedBatchTerminal());
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    expect(fetchMock).toHaveBeenCalledWith(BATCH_RESULT.downloadUrl, expect.anything());
    expect(useFileStore.getState().batchZipBlob).not.toBeNull();

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
      sendBatchFrame(completedBatchTerminal());
    });

    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });

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
          { filename: "first.png", error: "Step 1: corrupt" },
          { filename: "second.jpg", error: "Step 1: corrupt" },
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
      sendBatchFrame(completedBatchTerminal());
    });

    await settled(() => {
      expect(useFileStore.getState().error).toBe(
        "Completed result is no longer available. Run the job again.",
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

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
        tool_id: "pipeline",
        is_batch: true,
        trigger: "http-502",
        had_evidence: false,
      });
    });
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("keeps original-index alignment when fileResults has a hole", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(zipBlob()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const files = [
      new File([new ArrayBuffer(16)], "good1.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "bad.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "good2.jpg", { type: "image/jpeg" }),
    ];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => usePipelineProcessor());
    act(() => {
      void hook.result.current.processAll(files, STEPS);
    });

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      // Slot 1 pre-failed server-side: it is a hole in fileResults, and the
      // outputs for slots 0 and 2 must not shift into it.
      sendBatchFrame({
        status: "completed",
        totalFiles: 3,
        completedFiles: 3,
        failedFiles: 1,
        errors: [{ filename: "bad.png", error: "Invalid image" }],
        result: {
          ...BATCH_RESULT,
          fileResults: { "0": "first_resize.png", "2": "second_resize.jpg" },
        },
      });
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[2].status).toBe("completed");
    });
    expect(useFileStore.getState().entries[0].processedFilename).toBe("first_resize.png");
    expect(useFileStore.getState().entries[1].status).toBe("failed");
    expect(useFileStore.getState().entries[2].processedFilename).toBe("second_resize.jpg");

    hook.unmount();
  });

  it("skips the evidence timer when a batch frame already proved the flow exists", () => {
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
});

// #1287: the onmessage catch used to wrap the whole handler, so a throw while
// handling a completion frame was swallowed and the run sat at "processing"
// until the stall timer, which only reconnected into the same throw.
describe("usePipelineProcessor handler errors (#1287)", () => {
  const HANDLER_FAILURE = "Something went wrong while tracking this job. Try again.";
  // Zustand copies state on every set, so a spy on getState().updateEntry
  // rides along into later states; put the real action back explicitly.
  const realUpdateEntry = useFileStore.getState().updateEntry;
  afterEach(() => {
    useFileStore.setState({ updateEntry: realUpdateEntry });
  });

  function startAsyncSingleRun() {
    const hook = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    expect(useFileStore.getState().processing).toBe(true);
    return hook;
  }

  it("fails the run with a real message when completion handling throws", () => {
    vi.useFakeTimers();
    const { unmount } = startAsyncSingleRun();
    vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() =>
      act(() => {
        sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
      }),
    ).toThrow("boom");

    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
    expect(latestSse().close).toHaveBeenCalled();

    // Settled for good: the stall timer must not reconnect into the same throw.
    const sources = MockEventSource.instances.length;
    act(() => {
      vi.advanceTimersByTime(600_001);
    });
    expect(MockEventSource.instances).toHaveLength(sources);
    expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);

    unmount();
  });

  it("keeps the real outcome when the throw lands after the run settled", () => {
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    // Breaks finishRun's clearActiveJob write, after failRun has recorded the
    // real error (setError also turns processing off).
    const unsubscribe = useFileStore.subscribe((state, prev) => {
      if (prev.activeJobId && !state.activeJobId) throw new Error("listener broke");
    });

    try {
      expect(() =>
        act(() => {
          sendBatchFrame({
            status: "failed",
            totalFiles: 2,
            completedFiles: 2,
            failedFiles: 2,
            errors: [],
          });
        }),
      ).toThrow("listener broke");

      expect(useFileStore.getState().error).toBe("All files failed processing");
      expect(useFileStore.getState().processing).toBe(false);
    } finally {
      unsubscribe();
      unmount();
    }
  });

  it("still ignores a malformed frame", () => {
    const { unmount } = startAsyncSingleRun();

    act(() => {
      latestSse().onmessage?.({ data: "not json" } as MessageEvent);
    });

    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();

    act(() => {
      sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
    });
    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });
});

/**
 * #1352: a failed single run must fail its entry too. The Automate result pane
 * gates its failure card on status === "failed" and the thumbnail strip draws
 * its failed badge off the same status, so an entry left at "processing" hides
 * the failure everywhere but the side-panel banner.
 */
describe("usePipelineProcessor single-run entry settle (#1352)", () => {
  function expectEntryFailed(message: string) {
    expect(useFileStore.getState().error).toBe(message);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0]).toMatchObject({ status: "failed", error: message });
  }

  it("fails the entry on a failed frame", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "Step 2: kaboom" });
    });

    expectEntryFailed("Step 2: kaboom");
    unmount();
  });

  it("falls back to a generic message for a failed frame with no error", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0 });
    });

    expectEntryFailed("Processing failed");
    unmount();
  });

  it("fails the entry on an app error response", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 422;
      xhrs[0].responseText = JSON.stringify({ error: "Step 1 (resize): width must be positive" });
      xhrs[0].onload?.();
    });

    // parseApiError is mocked to "error" in this file.
    expectEntryFailed("error");
    unmount();
  });

  it("fails the entry on an error response whose body is not JSON", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 500;
      xhrs[0].responseText = "<html>Internal Server Error</html>";
      xhrs[0].onload?.();
    });

    expectEntryFailed("Processing failed: 500");
    unmount();
  });

  it("fails the entry on a canceled error response with the literal Canceled", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 422;
      xhrs[0].responseText = JSON.stringify({ error: "Canceled", canceled: true });
      xhrs[0].onload?.();
    });

    expectEntryFailed("Canceled");
    unmount();
  });

  it("fails the entry on a 2xx body that does not parse", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].responseText = "not json";
      xhrs[0].onload?.();
    });

    expectEntryFailed("Invalid response from server");
    unmount();
  });

  it("fails the entry when the socket dies mid-upload", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].onerror?.();
    });

    expectEntryFailed("Processing was interrupted. Retry when reconnected.");
    unmount();
  });

  it("fails the entry when the request times out mid-upload", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].ontimeout?.();
    });

    expectEntryFailed("Request timed out - the server may be overloaded. Try again.");
    unmount();
  });

  it("fails the entry when the server never confirms a degraded run", () => {
    vi.useFakeTimers();
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().entries[0].status).toBe("processing");

    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    expectEntryFailed(
      "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
    );
    unmount();
  });

  it("fails the entry with Canceled when the cancel finds no job server-side", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })),
    );
    const { unmount } = startSingleRun();

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    expectEntryFailed("Canceled");
    unmount();
  });

  it("fails the entry when frame handling throws before the result is written", () => {
    const realUpdateEntry = useFileStore.getState().updateEntry;
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    // Only the completion write throws; the settle that follows must land.
    const spy = vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementationOnce(() => {
      throw new Error("boom");
    });

    try {
      expect(() =>
        act(() => {
          sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
        }),
      ).toThrow("boom");

      expectEntryFailed("Something went wrong while tracking this job. Try again.");
    } finally {
      spy.mockRestore();
      useFileStore.setState({ updateEntry: realUpdateEntry });
      unmount();
    }
  });

  it("keeps a written result when frame handling throws after it", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    // Breaks clearActiveJob's store write, after the completion branch has
    // already written the result to the entry.
    const unsubscribe = useFileStore.subscribe((state, prev) => {
      if (prev.activeJobId && !state.activeJobId) throw new Error("listener broke");
    });

    try {
      expect(() =>
        act(() => {
          sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT });
        }),
      ).toThrow("listener broke");

      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "completed",
        processedUrl: SINGLE_RESULT.downloadUrl,
      });
    } finally {
      unsubscribe();
      unmount();
    }
  });

  it("fails the entry when a batch terminal frame reaches a single run", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });

    act(() => {
      sendBatchFrame({ status: "failed", totalFiles: 1, completedFiles: 1, failedFiles: 1 });
    });

    expectEntryFailed("Processing was interrupted. Retry when reconnected.");
    unmount();
  });

  it("finishes the run when failing the entry throws too", () => {
    const realUpdateEntry = useFileStore.getState().updateEntry;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = startSingleRun();
    // Both the completion write and the settle after it throw: the run must
    // still end, with the banner up and the cancel handle disarmed.
    const spy = vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation(() => {
      throw new Error("store broke");
    });

    try {
      // The good body parsed, so the store's own throw is what surfaces
      // (#1354), not a claim that the server sent garbage.
      expect(() =>
        act(() => {
          xhrs[0].upload.onload?.();
          xhrs[0].status = 200;
          xhrs[0].responseText = JSON.stringify(SINGLE_RESULT);
          xhrs[0].onload?.();
        }),
      ).toThrow("store broke");

      expect(useFileStore.getState().error).toBe(
        "Something went wrong while tracking this job. Try again.",
      );
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().activeJobId).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        "Failing the run's entry failed",
        expect.objectContaining({ message: "store broke" }),
      );
    } finally {
      spy.mockRestore();
      consoleError.mockRestore();
      useFileStore.setState({ updateEntry: realUpdateEntry });
      unmount();
    }
  });

  it("fails only the run's own entry", () => {
    const files = ["a.png", "b.png", "c.png"].map(
      (name) => new File([new ArrayBuffer(16)], name, { type: "image/png" }),
    );
    useFileStore.getState().setFiles(files);
    useFileStore.getState().updateEntry(2, { status: "completed", processedUrl: "blob:done" });
    useFileStore.getState().setSelectedIndex(1);
    const { result, unmount } = renderHook(() => usePipelineProcessor());
    act(() => {
      result.current.processSingle(files[1], STEPS);
    });
    expect(useFileStore.getState().entries[1].status).toBe("processing");

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 422;
      xhrs[0].responseText = JSON.stringify({ error: "bad settings" });
      xhrs[0].onload?.();
    });

    const entries = useFileStore.getState().entries;
    expect(entries[0].status).toBe("pending");
    expect(entries[1]).toMatchObject({ status: "failed", error: "error" });
    expect(entries[2]).toMatchObject({ status: "completed", processedUrl: "blob:done" });
    unmount();
  });

  it("clears a failed entry's error when the retry succeeds", () => {
    const file = new File([new ArrayBuffer(64)], "photo.png", { type: "image/png" });
    const { result, unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 422;
      xhrs[0].responseText = JSON.stringify({ error: "bad settings" });
      xhrs[0].onload?.();
    });
    expect(useFileStore.getState().entries[0].status).toBe("failed");

    act(() => {
      result.current.processSingle(file, STEPS);
    });
    act(() => {
      xhrs[1].upload.onload?.();
      xhrs[1].status = 200;
      xhrs[1].responseText = JSON.stringify(SINGLE_RESULT);
      xhrs[1].onload?.();
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({ status: "completed", error: null });
    unmount();
  });

  // Pins the #722 run-identity guard for the new entry write: the aborted
  // POST's late socket event must not reach the settle at all.
  it("ignores a late socket event once a failed frame settled the run", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "Step 2: kaboom" });
    });

    // A late socket event from the aborted POST is ignored by the run guard.
    act(() => {
      xhrs[0].onerror?.();
    });

    expectEntryFailed("Step 2: kaboom");
    unmount();
  });

  it("still completes the entry on a successful response", () => {
    const { unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify(SINGLE_RESULT);
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: SINGLE_RESULT.downloadUrl,
      error: null,
    });
    unmount();
  });
});

/**
 * #1354: the sync response path parsed the body and wrote the result under
 * one catch, so a throw from our own store write on a good 200 read as
 * "Invalid response from server" and vanished. Only an unparseable body
 * blames the server now; a handling error ends the run with the client-side
 * message and is rethrown for the console and Sentry.
 */
describe("usePipelineProcessor sync result handling errors (#1354)", () => {
  const HANDLER_FAILURE = "Something went wrong while tracking this job. Try again.";
  const realUpdateEntry = useFileStore.getState().updateEntry;
  afterEach(() => {
    useFileStore.setState({ updateEntry: realUpdateEntry });
  });

  function respond(status: number, body: string) {
    xhrs[0].upload.onload?.();
    xhrs[0].status = status;
    xhrs[0].responseText = body;
    xhrs[0].onload?.();
  }

  it("fails the run with a client-side message when the result write throws", () => {
    const { unmount } = startSingleRun();
    vi.spyOn(useFileStore.getState(), "updateEntry")
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockImplementation(realUpdateEntry);

    expect(() => act(() => respond(200, JSON.stringify(SINGLE_RESULT)))).toThrow("boom");

    expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: HANDLER_FAILURE,
    });
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    unmount();
  });

  it("rethrows the root cause when the teardown after it throws too", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = startSingleRun();
    // A store listener that breaks on every write: the result write throws
    // the root cause, then the teardown's first write throws again.
    let writes = 0;
    const unsubscribe = useFileStore.subscribe(() => {
      writes++;
      throw new Error(writes === 1 ? "root cause" : "teardown broke");
    });

    try {
      expect(() => act(() => respond(200, JSON.stringify(SINGLE_RESULT)))).toThrow("root cause");
      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a result handling error failed",
        expect.objectContaining({ message: "teardown broke" }),
      );
      // Every teardown step still ran: the run is released for good.
      expect(useFileStore.getState().activeJobId).toBeNull();
      expect(useFileStore.getState().cancelCurrentJob).toBeNull();
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
    } finally {
      unsubscribe();
      consoleError.mockRestore();
      unmount();
    }
  });

  it.each([
    ["an unparseable body", "not json"],
    ["a JSON null body", "null"],
    ["a JSON string body", JSON.stringify("ok")],
  ])("still blames the server for %s", (_label, body) => {
    const { unmount } = startSingleRun();

    act(() => respond(200, body));

    expect(useFileStore.getState().error).toBe("Invalid response from server");
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Invalid response from server",
    });
    expect(useFileStore.getState().processing).toBe(false);
    unmount();
  });
});

/**
 * #1740: a 2xx body that isn't a result is a server bug the user sees and
 * nobody else hears about. An object with no download URL (`{}`) used to land
 * as a completed run with nothing behind it, and no malformed body was ever
 * reported.
 */
describe("usePipelineProcessor malformed 2xx results (#1740)", () => {
  function respond(status: number, body: string) {
    xhrs[0].upload.onload?.();
    xhrs[0].status = status;
    xhrs[0].responseText = body;
    xhrs[0].onload?.();
  }

  function expectReported(message: string) {
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error.message).toBe(message);
    expect(error.cause).toBeUndefined();
    expect((error as { statusCode?: number }).statusCode).toBe(200);
    expect(tags).toEqual({ error_class: "operational" });
  }

  it.each([
    ["an empty object", "{}"],
    ["a result with no download URL", JSON.stringify({ ...SINGLE_RESULT, downloadUrl: undefined })],
  ])("fails the run on %s and reports it", (_label, body) => {
    const { unmount } = startSingleRun();

    act(() => respond(200, body));

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Invalid response from server",
      processedUrl: null,
    });
    expect(useFileStore.getState().error).toBe("Invalid response from server");
    expect(useFileStore.getState().processing).toBe(false);
    expectReported("Tool result has no download URL");
    unmount();
  });

  it("reports a body that does not parse, without its text", () => {
    const { unmount } = startSingleRun();

    act(() => respond(200, "<html>secret-token</html>"));

    expect(useFileStore.getState().error).toBe("Invalid response from server");
    expectReported("Tool result body is not a JSON object");
    unmount();
  });

  it("lands a good result without reporting anything", () => {
    const { unmount } = startSingleRun();

    act(() => respond(200, JSON.stringify(SINGLE_RESULT)));

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: SINGLE_RESULT.downloadUrl,
    });
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    unmount();
  });
});

describe("usePipelineProcessor batch failure message (#1432)", () => {
  it("reads a coded batch failure through parseApiError instead of the first file", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 503;
      // The batch path reads its body from `response` (a Blob in the browser).
      xhrs[0].response = JSON.stringify({
        error: "Media processing is unavailable on this server because ffmpeg is not installed.",
        code: "ENGINE_UNAVAILABLE",
        details: "Install ffmpeg in the container or set FFMPEG_PATH and FFPROBE_PATH.",
        errors: [
          { filename: "first.png", error: "engine down", code: "ENGINE_UNAVAILABLE" },
          { filename: "second.jpg", error: "engine down", code: "ENGINE_UNAVAILABLE" },
        ],
      });
      xhrs[0].onload?.();
    });

    // parseApiError is mocked to "error"; the first file's "engine down (2
    // files failed)" is what a coded body used to be reduced to. The batch
    // path reads the body asynchronously.
    await settled(() => expect(useFileStore.getState().error).toBe("error"));

    unmount();
  });
});
