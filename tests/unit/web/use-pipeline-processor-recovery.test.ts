// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

// Lets a test make the batch's unpack throw instead of answering, the way
// the fflate chunk failing to load after a deploy does (#1805; batch-zip.test.ts
// pins that the chunk failure does throw). The real unpack otherwise.
const batchZipState = vi.hoisted(() => ({ unpackThrows: false }));
vi.mock("@/lib/batch-zip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/batch-zip")>();
  return {
    ...actual,
    unpackBatchZip: (...args: Parameters<typeof actual.unpackBatchZip>) =>
      batchZipState.unpackThrows
        ? Promise.reject(new Error("chunk failed to load"))
        : actual.unpackBatchZip(...args),
  };
});

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

// A batch settles in a promise nobody awaits, so a throw it lets out is an
// unhandled rejection. Takes vitest's listener over until restore() runs.
function captureRejections() {
  const saved = process.listeners("unhandledRejection");
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => {
    rejections.push(reason);
  };
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", onRejection);
  return {
    rejections,
    restore: () => {
      process.off("unhandledRejection", onRejection);
      for (const listener of saved) process.on("unhandledRejection", listener);
    },
  };
}

// #1812: a store write that breaks while a run ends is reported once, as a
// handled bug with a constant message and fixed tags, so nothing from the
// entries (names, error text, URLs) rides along. The cause goes along and is
// redacted by the scrubber (run-end-report.test.ts).
const PIPELINE_SETTLE_REPORT = "Failing a pipeline run's entries failed";
const PIPELINE_TEARDOWN_REPORT = "Ending a pipeline run after a result handling error failed";

function expectReportedOnce(message: string, causeMessage = "store broke") {
  const calls = vi
    .mocked(captureHandledError)
    .mock.calls.filter(([error]) => error.message === message);
  expect(calls).toHaveLength(1);
  const [error, tags] = calls[0];
  expect(error).toMatchObject({ name: "SafeError", isSafeMessage: true, kind: "bug" });
  expect(error.cause).toMatchObject({ message: causeMessage });
  expect(tags).toEqual({ error_class: "bug" });
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
      expectReportedOnce(PIPELINE_SETTLE_REPORT);
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
      throw new Error(writes === 1 ? "root cause" : `teardown broke ${writes}`);
    });

    try {
      expect(() => act(() => respond(200, JSON.stringify(SINGLE_RESULT)))).toThrow("root cause");
      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a result handling error failed",
        expect.objectContaining({ message: "teardown broke 2" }),
      );
      // Only the root cause is rethrown, so the teardown's own break is
      // reported here, once for the run however many of its writes threw.
      expect(
        consoleError.mock.calls.filter(
          ([log]) => log === "Ending the run after a result handling error failed",
        ).length,
      ).toBeGreaterThan(1);
      // The first break is the one reported.
      expectReportedOnce(PIPELINE_TEARDOWN_REPORT, "teardown broke 2");
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

/**
 * #1794: the progress stream's completed frame is the async twin of the sync
 * 2xx answer #1740 checks. One with no download URL used to land as a
 * finished run with nothing behind it, and nobody heard about it.
 */
describe("usePipelineProcessor malformed completed frames (#1794)", () => {
  function startAsyncRun() {
    const hook = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    return hook;
  }

  function expectReported(message: string) {
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error.message).toBe(message);
    expect(error.cause).toBeUndefined();
    // No HTTP answer stands behind a progress frame.
    expect((error as { statusCode?: number }).statusCode).toBeUndefined();
    expect(tags).toEqual({ error_class: "operational" });
  }

  function expectRunFailed() {
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Invalid response from server",
      processedUrl: null,
    });
    expect(useFileStore.getState().error).toBe("Invalid response from server");
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(latestSse().close).toHaveBeenCalled();
  }

  it.each([
    ["an empty result", {}],
    ["a result with no download URL", { ...SINGLE_RESULT, downloadUrl: undefined }],
    ["a result with an empty download URL", { ...SINGLE_RESULT, downloadUrl: "" }],
    ["a result whose download URL is not a string", { ...SINGLE_RESULT, downloadUrl: 7 }],
  ])("fails the run on %s and reports it", (_label, result) => {
    const { unmount } = startAsyncRun();

    act(() => sendSingleFrame({ phase: "complete", percent: 100, result }));

    expectRunFailed();
    expectReported("Tool result has no download URL");
    unmount();
  });

  it("lands nothing from a bad result that carries a saved file and preview", () => {
    const { unmount } = startAsyncRun();
    const serverFileIdBefore = useFileStore.getState().entries[0].serverFileId;

    act(() =>
      sendSingleFrame({
        phase: "complete",
        percent: 100,
        result: {
          ...SINGLE_RESULT,
          downloadUrl: undefined,
          savedFileId: "saved-1",
          previewUrl: `/api/v1/download/${JOB_ID}/preview.png`,
        },
      }),
    );

    expectRunFailed();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      serverFileId: serverFileIdBefore,
      processedPreviewUrl: null,
    });
    expectReported("Tool result has no download URL");
    unmount();
  });

  it("fails the run on a completed frame with no result at all", () => {
    const { unmount } = startAsyncRun();

    act(() => sendSingleFrame({ phase: "complete", percent: 100 }));

    expectRunFailed();
    expectReported("Tool result body is not a JSON object");
    unmount();
  });

  it("reports a replayed bad frame once", () => {
    const { unmount } = startAsyncRun();

    act(() => sendSingleFrame({ phase: "complete", percent: 100, result: {} }));
    act(() => sendSingleFrame({ phase: "complete", percent: 100, result: {} }));

    expectReported("Tool result has no download URL");
    unmount();
  });

  it("fails a sync run whose stream completes first, and stops its POST", () => {
    const { unmount } = startSingleRun();

    act(() => sendSingleFrame({ phase: "complete", percent: 100, result: {} }));

    expectRunFailed();
    expect(xhrs[0].abort).toHaveBeenCalled();
    expectReported("Tool result has no download URL");
    unmount();
  });

  it("lands a good frame untouched and reports nothing", () => {
    const { unmount } = startAsyncRun();

    act(() => sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT }));

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: SINGLE_RESULT.downloadUrl,
      error: null,
    });
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    unmount();
  });

  it("still reads a store throw while landing a good frame as ours", () => {
    const { unmount } = startAsyncRun();
    // Zustand copies state on every set, so put the real action back explicitly.
    const realUpdateEntry = useFileStore.getState().updateEntry;
    vi.spyOn(useFileStore.getState(), "updateEntry")
      .mockImplementationOnce(() => {
        throw new Error("store write failed");
      })
      .mockImplementation(realUpdateEntry);

    try {
      expect(() =>
        act(() => sendSingleFrame({ phase: "complete", percent: 100, result: SINGLE_RESULT })),
      ).toThrow("store write failed");

      expect(useFileStore.getState().error).toBe(
        "Something went wrong while tracking this job. Try again.",
      );
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      useFileStore.setState({ updateEntry: realUpdateEntry });
      unmount();
    }
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

/**
 * #1699: a batch run never reset the entries it was about to process, and a
 * run-level failure never touched them, so whatever an earlier run left on an
 * entry (its result URL, size, "completed") survived a failed batch and the
 * Automate result pane kept showing it as this run's output. The batch now
 * marks its entries "processing" with their old results cleared at kickoff,
 * and every failure exit settles what is still "processing" as failed.
 */
describe("usePipelineProcessor batch entry settle (#1699)", () => {
  const BATCH_FAILED = "Processing was interrupted. Retry when reconnected.";

  function respondZip(index: number, names: Record<string, string> = ZIP_NAMES) {
    xhrs[index].upload.onload?.();
    xhrs[index].status = 200;
    xhrs[index].response = zipBlob();
    xhrs[index].getResponseHeader = vi.fn((name: string) =>
      name === "X-File-Results" ? encodeURIComponent(JSON.stringify(names)) : null,
    );
    xhrs[index].onload?.();
  }

  function respondError(index: number, status: number, body: string) {
    xhrs[index].upload.onload?.();
    xhrs[index].status = status;
    xhrs[index].response = body;
    xhrs[index].onload?.();
  }

  function expectBatchFailed(message: string) {
    expect(useFileStore.getState().error).toBe(message);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    for (const entry of useFileStore.getState().entries) {
      expect(entry).toMatchObject({
        status: "failed",
        error: message,
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        processedSize: null,
      });
    }
  }

  it("fails every entry of a failed batch instead of keeping a successful batch's results", async () => {
    let urlCount = 0;
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:result-${urlCount++}`);
    const { result, unmount } = startBatchRun();
    act(() => respondZip(0));
    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    const firstUrls = useFileStore.getState().entries.map((e) => e.processedUrl);
    expect(new Set(firstUrls).size).toBe(2);

    act(() => {
      void result.current.processAll(useFileStore.getState().files, STEPS);
    });
    // The rerun starts from a clean slate: no earlier result can render as
    // this run's while it is in flight.
    for (const entry of useFileStore.getState().entries) {
      expect(entry).toMatchObject({ status: "processing", processedUrl: null, error: null });
    }
    // The old results' blob URLs are released, not leaked.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrls[0]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrls[1]);

    act(() => respondError(1, 422, JSON.stringify({ error: "Step 1 (resize): bad width" })));

    // parseApiError is mocked to "error" in this file.
    await settled(() => expectBatchFailed("error"));
    unmount();
  });

  it("fails an entry a single run completed when the batch after it fails", async () => {
    // The issue's repro: one image through a single run, a second image
    // added, then a batch the server rejects.
    const { result, unmount } = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify({
        ...SINGLE_RESULT,
        previewUrl: `/api/v1/download/${JOB_ID}/preview.webp`,
      });
      xhrs[0].onload?.();
    });
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: SINGLE_RESULT.downloadUrl,
    });
    act(() => {
      useFileStore
        .getState()
        .addFiles([new File([new ArrayBuffer(16)], "second.jpg", { type: "image/jpeg" })]);
    });

    act(() => {
      void result.current.processAll(useFileStore.getState().files, STEPS);
    });
    act(() => respondError(1, 422, JSON.stringify({ error: "Step 1 (resize): bad width" })));

    await settled(() => expectBatchFailed("error"));
    // The pane's processedUrl selector follows the selected entry, so the
    // single run's result is gone from screen too.
    expect(useFileStore.getState().processedUrl).toBeNull();
    // A server-side result URL is not a blob this page owns.
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(SINGLE_RESULT.downloadUrl);
    unmount();
  });

  it("fails every entry when the socket dies mid-upload", () => {
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].onerror?.();
    });

    expectBatchFailed(BATCH_FAILED);
    unmount();
  });

  it("fails every entry when the request times out mid-upload", () => {
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].ontimeout?.();
    });

    expectBatchFailed("Request timed out - the server may be overloaded. Try again.");
    unmount();
  });

  it("fails every entry with Canceled on a canceled batch response", async () => {
    const { unmount } = startBatchRun();
    act(() => respondError(0, 422, JSON.stringify({ error: "Canceled", canceled: true })));

    await settled(() => expectBatchFailed("Canceled"));
    unmount();
  });

  it("fails every entry on a failed terminal frame after a degrade", async () => {
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      sendBatchFrame({ status: "failed", totalFiles: 2, completedFiles: 2, failedFiles: 2 });
    });

    await settled(() => expectBatchFailed("All files failed processing"));
    unmount();
  });

  it("fails every entry when the server never confirms a degraded batch", () => {
    vi.useFakeTimers();
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().entries[0].status).toBe("processing");

    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    expectBatchFailed(
      "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
    );
    unmount();
  });

  it("fails every entry with Canceled when the cancel finds no job server-side", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })),
    );
    const { unmount } = startBatchRun();

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    expectBatchFailed("Canceled");
    unmount();
  });

  it("clears an earlier result from a file missing from the batch ZIP", async () => {
    const { result, unmount } = startBatchRun();
    act(() => respondZip(0));
    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });

    act(() => {
      void result.current.processAll(useFileStore.getState().files, STEPS);
    });
    act(() => respondZip(1, { "0": "first_resize.png" }));

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
    });
    expect(useFileStore.getState().entries[1]).toMatchObject({
      status: "failed",
      error: "File not found in batch results",
      processedUrl: null,
      processedPreviewUrl: null,
    });
    expect(useFileStore.getState().error).toBeNull();
    unmount();
  });

  it("keeps an entry the ZIP already settled when a later write fails the run", async () => {
    const realUpdateEntry = useFileStore.getState().updateEntry;
    // The first entry lands; writing the second one's result throws, and the
    // run fails with only the still-unsettled entry swept. Installed before
    // the run starts, because the batch captures updateEntry at kickoff.
    const spy = vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation((i, patch) => {
      if (i === 1 && patch.status === "completed") throw new Error("store broke");
      realUpdateEntry(i, patch);
    });
    const captured = captureRejections();
    const { unmount } = startBatchRun();

    try {
      act(() => respondZip(0));
      // The write's throw is our own bug, so it's let out, not swallowed (#1805).
      await settled(() =>
        expect(captured.rejections).toEqual([expect.objectContaining({ message: "store broke" })]),
      );
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe("Batch processing failed");
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "completed",
        processedFilename: "first_resize.png",
      });
      expect(useFileStore.getState().entries[1]).toMatchObject({
        status: "failed",
        error: "Batch processing failed",
      });
    } finally {
      captured.restore();
      spy.mockRestore();
      useFileStore.setState({ updateEntry: realUpdateEntry });
      unmount();
    }
  });

  it("ends a failed batch even when failing its entries throws", () => {
    const realUpdateEntry = useFileStore.getState().updateEntry;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = startBatchRun();
    const spy = vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation((i) => {
      throw new Error(i === 0 ? "store broke" : `store broke on entry ${i}`);
    });

    try {
      act(() => {
        xhrs[0].onerror?.();
      });

      expect(useFileStore.getState().error).toBe(BATCH_FAILED);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().activeJobId).toBeNull();
      expect(useFileStore.getState().cancelCurrentJob).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        "Failing the run's entry failed",
        expect.objectContaining({ message: "store broke" }),
      );
      // Each entry's write is tried and logged on its own, but the run's
      // failure reaches Sentry once, not once per entry, with the first
      // entry's cause.
      expect(
        consoleError.mock.calls.filter(([log]) => log === "Failing the run's entry failed"),
      ).toHaveLength(2);
      expectReportedOnce(PIPELINE_SETTLE_REPORT);
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      consoleError.mockRestore();
      useFileStore.setState({ updateEntry: realUpdateEntry });
      unmount();
    }
  });

  it("still fails the entries when the run's teardown throws, and surfaces the throw", () => {
    const { unmount } = startBatchRun();
    // Breaks clearActiveJob's store write inside the teardown.
    const unsubscribe = useFileStore.subscribe((state, prev) => {
      if (prev.activeJobId && !state.activeJobId) throw new Error("listener broke");
    });

    try {
      expect(() =>
        act(() => {
          xhrs[0].onerror?.();
        }),
      ).toThrow("listener broke");

      for (const entry of useFileStore.getState().entries) {
        expect(entry).toMatchObject({ status: "failed", error: BATCH_FAILED });
      }
    } finally {
      unsubscribe();
      unmount();
    }
  });

  it("fails every entry when a batch frame's handling throws", () => {
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    xhrs[0].abort.mockImplementationOnce(() => {
      throw new Error("abort broke");
    });

    expect(() =>
      act(() => {
        sendBatchFrame(completedBatchTerminal());
      }),
    ).toThrow("abort broke");

    expectBatchFailed("Something went wrong while tracking this job. Try again.");
    unmount();
  });

  it("fails every entry when the server answers with a ZIP that does not unpack", async () => {
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].response = new Blob(["not a zip"], { type: "application/zip" });
      xhrs[0].getResponseHeader = vi.fn((name: string) =>
        name === "X-File-Results" ? encodedFileResults() : null,
      );
      xhrs[0].onload?.();
    });

    await settled(() => expectBatchFailed("Batch processing failed"));
    unmount();
  });

  it("fails every entry when the durable ZIP is already gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(null) })),
    );
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      sendBatchFrame(completedBatchTerminal());
    });

    await settled(() =>
      expectBatchFailed("Completed result is no longer available. Run the job again."),
    );
    unmount();
  });

  it("fails every entry when every durable ZIP download attempt fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("network down"))),
    );
    const { unmount } = startBatchRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      sendBatchFrame(completedBatchTerminal());
    });

    // Three attempts, 2s and 5s apart.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expectBatchFailed(BATCH_FAILED);
    expect(fetch).toHaveBeenCalledTimes(3);
    unmount();
  });
});

/**
 * #1821: a store write that throws while a pipeline run starts, before any
 * XHR handler exists, has no exit to end the run. The kickoff must end it
 * itself: processing off, the job and its cancel handle released, the
 * elapsed ticker and the stream stopped, and every entry it reset failed
 * with a client-side message. The throw still reaches the caller, and
 * through it Sentry's global handler, so it isn't reported a second time.
 */
describe("usePipelineProcessor ends a run whose start throws (#1821)", () => {
  const START_FAILURE = "Something went wrong while tracking this job. Try again.";
  const START_TEARDOWN_REPORT = "Ending a pipeline run after its start failed";
  // JSON.stringify throws on a BigInt, after the ticker and the stream have
  // both started.
  const UNSERIALIZABLE_STEPS = [
    { id: "s1", toolId: "resize", settings: { width: 50n } },
  ] as unknown as PipelineStep[];
  let consoleError: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let unsubscribe: (() => void) | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    unsubscribe?.();
    unsubscribe = null;
    consoleError.mockRestore();
  });

  function photoFiles(count: number) {
    return Array.from(
      { length: count },
      (_, i) => new File([new ArrayBuffer(16)], `photo-${i}.png`, { type: "image/png" }),
    );
  }

  // Throws once, from the write that turns processing on.
  function breakProcessingOn() {
    unsubscribe = useFileStore.subscribe((state, prev) => {
      if (!prev.processing && state.processing) throw new Error("kickoff broke");
    });
  }

  function expectRunEnded(entryCount: number) {
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBe(START_FAILURE);
    expect(state.activeJobId).toBeNull();
    expect(state.cancelCurrentJob).toBeNull();
    for (let i = 0; i < entryCount; i++) {
      expect(state.entries[i]).toMatchObject({ status: "failed", error: START_FAILURE });
    }
  }

  async function expectJobReleased(cancel: () => Promise<void>) {
    await act(async () => {
      await cancel();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  }

  it("fails the entry when turning processing on throws", async () => {
    const [file] = photoFiles(1);
    useFileStore.getState().setFiles([file]);
    const { result, unmount } = renderHook(() => usePipelineProcessor());
    breakProcessingOn();

    expect(() => act(() => result.current.processSingle(file, STEPS))).toThrow("kickoff broke");
    act(() => {});

    expectRunEnded(1);
    expect(result.current.progress.phase).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
    expect(xhrs).toHaveLength(0);
    // The rethrow is the report; nothing else goes to Sentry.
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    await expectJobReleased(result.current.cancelCurrentJob);
    unmount();
  });

  it("stops the ticker and the stream when the steps do not serialize", async () => {
    const [file] = photoFiles(1);
    useFileStore.getState().setFiles([file]);
    const { result, unmount } = renderHook(() => usePipelineProcessor());

    expect(() => act(() => result.current.processSingle(file, UNSERIALIZABLE_STEPS))).toThrow(
      TypeError,
    );
    act(() => {});

    expectRunEnded(1);
    expect(latestSse().close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.progress).toMatchObject({ phase: "idle", elapsed: 0 });
    expect(xhrs).toHaveLength(0);
    await expectJobReleased(result.current.cancelCurrentJob);
    unmount();
  });

  it("runs normally on the next try after a start that threw", () => {
    const [file] = photoFiles(1);
    useFileStore.getState().setFiles([file]);
    const { result, unmount } = renderHook(() => usePipelineProcessor());
    expect(() => act(() => result.current.processSingle(file, UNSERIALIZABLE_STEPS))).toThrow(
      TypeError,
    );
    act(() => {});

    act(() => result.current.processSingle(file, STEPS));
    expect(xhrs).toHaveLength(1);
    expect(xhrs[0].send).toHaveBeenCalledTimes(1);
    expect(latestSse().close).not.toHaveBeenCalled();
    expect(useFileStore.getState()).toMatchObject({ processing: true, error: null });

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify(SINGLE_RESULT);
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      error: null,
    });
    expect(useFileStore.getState()).toMatchObject({ processing: false, error: null });
    unmount();
  });

  it("rethrows the root cause and reports a teardown that throws too, once", () => {
    const [file] = photoFiles(1);
    useFileStore.getState().setFiles([file]);
    const { result, unmount } = renderHook(() => usePipelineProcessor());
    // The store breaks for good on the write that turns processing on, with
    // the entry already at "processing". Zustand commits each write before
    // its listeners run, so every later write lands and its listener throws.
    let broken = false;
    unsubscribe = useFileStore.subscribe((state, prev) => {
      if (broken) throw new Error("store broke");
      if (!prev.processing && state.processing) {
        broken = true;
        throw new Error("root cause");
      }
    });

    expect(() => act(() => result.current.processSingle(file, STEPS))).toThrow("root cause");
    unsubscribe();
    unsubscribe = null;

    expectRunEnded(1);
    expect(consoleError).toHaveBeenCalledWith(
      "Ending the run failed",
      expect.objectContaining({ message: "store broke" }),
    );
    expectReportedOnce(START_TEARDOWN_REPORT);
    expectReportedOnce(PIPELINE_SETTLE_REPORT);
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("fails every entry of a batch when turning processing on throws", async () => {
    const files = photoFiles(2);
    useFileStore.getState().setFiles(files);
    const { result, unmount } = renderHook(() => usePipelineProcessor());
    breakProcessingOn();

    // Caught inside act: an act whose callback rejects leaves the next
    // test's render uncommitted.
    let thrown: unknown;
    await act(async () => {
      await result.current.processAll(files, STEPS).catch((err: unknown) => {
        thrown = err;
      });
    });
    expect(() => {
      throw thrown;
    }).toThrow("kickoff broke");

    expectRunEnded(2);
    expect(result.current.progress.phase).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
    expect(xhrs).toHaveLength(0);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    await expectJobReleased(result.current.cancelCurrentJob);
    unmount();
  });

  it("stops a batch's stream when its steps do not serialize", async () => {
    const files = photoFiles(2);
    useFileStore.getState().setFiles(files);
    const { result, unmount } = renderHook(() => usePipelineProcessor());

    // Caught inside act: an act whose callback rejects leaves the next
    // test's render uncommitted.
    let thrown: unknown;
    await act(async () => {
      await result.current.processAll(files, UNSERIALIZABLE_STEPS).catch((err: unknown) => {
        thrown = err;
      });
    });
    expect(() => {
      throw thrown;
    }).toThrow(TypeError);

    expectRunEnded(2);
    expect(latestSse().close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(xhrs).toHaveLength(0);
    await expectJobReleased(result.current.cancelCurrentJob);
    unmount();
  });
});
/**
 * #1805: a batch whose result ZIP won't unpack used to fail with its cause
 * thrown away. Bytes that won't unpack are the server's (or the transfer's)
 * fault: logged, reported under a constant message without the cause (#1740),
 * and failed once, never retried as if the network were at fault. A throw from
 * our own code while settling still fails the run, and reaches the global
 * handler instead of disappearing.
 */
describe("usePipelineProcessor batch ZIP that won't unpack (#1805)", () => {
  const NOT_A_ZIP = () => new Blob(["not a zip"], { type: "application/zip" });
  let consoleError: ReturnType<typeof vi.spyOn>;
  let captured: ReturnType<typeof captureRejections>;
  let rejections: unknown[];

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    captured = captureRejections();
    rejections = captured.rejections;
  });
  afterEach(() => {
    captured.restore();
    consoleError.mockRestore();
  });

  function respond(response: Blob, fileResultsHeader: string | null = encodedFileResults()) {
    xhrs[0].upload.onload?.();
    xhrs[0].status = 200;
    xhrs[0].response = response;
    xhrs[0].getResponseHeader = vi.fn((name: string) =>
      name === "X-File-Results" ? fileResultsHeader : null,
    );
    xhrs[0].onload?.();
  }

  function degradeAndComplete() {
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      sendBatchFrame(completedBatchTerminal());
    });
  }

  function expectUnpackReported(status?: number) {
    expect(consoleError).toHaveBeenCalledWith(
      "Batch result ZIP could not be unpacked",
      expect.anything(),
    );
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error).toMatchObject({ name: "BatchZipUnreadableError", isSafeMessage: true });
    expect(error.message).toBe("Batch result ZIP could not be unpacked");
    expect(error.cause).toBeUndefined();
    expect((error as { statusCode?: number }).statusCode).toBe(status);
    expect(tags).toEqual({ error_class: "operational" });
  }

  function expectBatchFailed(message: string) {
    const state = useFileStore.getState();
    expect(state.error).toBe(message);
    expect(state.processing).toBe(false);
    expect(state.activeJobId).toBeNull();
    expect(state.entries.map((e) => [e.status, e.error])).toEqual([
      ["failed", message],
      ["failed", message],
    ]);
  }

  function breakCompletedWrites() {
    const realUpdateEntry = useFileStore.getState().updateEntry;
    // Installed before the run starts, because the batch captures
    // updateEntry at kickoff.
    vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation((i, patch) => {
      if (patch.status === "completed") throw new Error("store broke");
      realUpdateEntry(i, patch);
    });
    return () => useFileStore.setState({ updateEntry: realUpdateEntry });
  }

  it("logs and reports a sync answer that won't unpack, and keeps no batch ZIP", async () => {
    const { unmount } = startBatchRun();
    act(() => respond(NOT_A_ZIP()));

    await settled(() => expect(useFileStore.getState().processing).toBe(false));
    expectBatchFailed("Batch processing failed");
    expectUnpackReported(200);
    // A ZIP that won't open isn't offered as the batch's download.
    expect(useFileStore.getState().batchZipBlob).toBeNull();
    expect(rejections).toEqual([]);
    unmount();
  });

  it("fails a degraded run once when its durable ZIP won't unpack, without blaming the network", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(NOT_A_ZIP()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();
    degradeAndComplete();

    await settled(() => expect(useFileStore.getState().processing).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectBatchFailed("Batch processing failed");
    expectUnpackReported(undefined);
    expect(useFileStore.getState().batchZipBlob).toBeNull();
    expect(rejections).toEqual([]);
    unmount();
  });

  it("still retries a durable download the network dropped, body included, then settles", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      // The body breaks mid-transfer: still the network, still retried.
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: () => Promise.reject(new TypeError("body stream broke")),
      })
      .mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(zipBlob()) });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();
    degradeAndComplete();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });
    vi.useRealTimers();

    await settled(() => expect(useFileStore.getState().entries[1].status).toBe("completed"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(useFileStore.getState().error).toBeNull();
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    unmount();
  });

  it.each([
    ["does not decode", "%ZZ"],
    ["is not JSON", encodeURIComponent("{oops")],
    ["is not an object", encodeURIComponent("[1]")],
  ])("logs and reports a file-results header that %s", async (_label, header) => {
    const { unmount } = startBatchRun();
    act(() => respond(zipBlob(), header));

    await settled(() => expect(useFileStore.getState().processing).toBe(false));
    // Only the length: the header holds file names.
    expect(consoleError).toHaveBeenCalledWith("Ignoring unreadable X-File-Results", {
      length: header.length,
    });
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error).toMatchObject({
      name: "FileResultsUnreadableError",
      message: "Batch result file map could not be read",
      statusCode: 200,
    });
    expect(error.cause).toBeUndefined();
    expect(tags).toEqual({ error_class: "operational" });
    // No file can be matched to its result, as before.
    expect(useFileStore.getState().entries.map((e) => e.error)).toEqual([
      "File not found in batch results",
      "File not found in batch results",
    ]);
    unmount();
  });

  it("reads a missing file-results header as no results, without a report", async () => {
    const { unmount } = startBatchRun();
    act(() => respond(zipBlob(), null));

    await settled(() => expect(useFileStore.getState().processing).toBe(false));
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    unmount();
  });

  it("fails the run on a store throw while settling, and lets the throw out", async () => {
    const restore = breakCompletedWrites();
    const { unmount } = startBatchRun();

    try {
      act(() => respond(zipBlob()));

      await settled(() =>
        expect(rejections).toEqual([expect.objectContaining({ message: "store broke" })]),
      );
      expectBatchFailed("Batch processing failed");
      // Our own bug, not a bad answer: it isn't reported as one.
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
      // The ZIP itself was fine, so it stays downloadable.
      expect(useFileStore.getState().batchZipBlob).not.toBeNull();
    } finally {
      restore();
      unmount();
    }
  });

  it("fails a degraded run once on a store throw while settling, and lets the throw out", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(zipBlob()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const restore = breakCompletedWrites();
    const { unmount } = startBatchRun();

    try {
      degradeAndComplete();

      await settled(() =>
        expect(rejections).toEqual([expect.objectContaining({ message: "store broke" })]),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expectBatchFailed("Batch processing failed");
    } finally {
      restore();
      unmount();
    }
  });

  it("keeps a settled batch's outcome when its teardown throws, and lets the throw out", async () => {
    const { unmount } = startBatchRun();
    // Breaks the run's teardown after every entry settled: the write that
    // clears the active job throws once it lands.
    const unsubscribe = useFileStore.subscribe((state, prev) => {
      if (prev.activeJobId && !state.activeJobId) throw new Error("teardown broke");
    });

    try {
      act(() => respond(zipBlob()));

      await settled(() =>
        expect(rejections).toEqual([expect.objectContaining({ message: "teardown broke" })]),
      );
      // Not repainted as a failure: every file did complete. Whether the
      // rest of the teardown still runs after such a throw is #1890.
      expect(useFileStore.getState().error).toBeNull();
      expect(useFileStore.getState().entries.map((e) => e.status)).toEqual([
        "completed",
        "completed",
      ]);
    } finally {
      unsubscribe();
      unmount();
    }
  });
  it("leaves a run canceled while its ZIP unpacked alone when the ZIP turns out bad", async () => {
    let resolveBytes: (bytes: ArrayBuffer) => void = () => {};
    const pendingZip = {
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          resolveBytes = resolve;
        }),
    } as unknown as Blob;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: "Job not found" }),
        }),
      ),
    );
    const { result, unmount } = startBatchRun();

    act(() => respond(pendingZip));
    // The unpack is waiting on the bytes; the cancel finds no job and ends
    // the run locally.
    await act(async () => {
      await result.current.cancelCurrentJob();
    });
    expect(useFileStore.getState().error).toBe("Canceled");

    await act(async () => {
      resolveBytes(new TextEncoder().encode("not a zip").buffer as ArrayBuffer);
    });
    await settled(() => expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1));

    // The bad ZIP is still reported, but the canceled run keeps its outcome.
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().entries.map((e) => e.error)).toEqual(["Canceled", "Canceled"]);
    unmount();
  });

  it("keeps a settled batch's outcome when its teardown throws before the job is cleared", async () => {
    const { unmount } = startBatchRun();
    // Every entry settles, then the teardown's first step throws while the
    // job is still this run's: only the "nothing left at processing" check
    // stands between that throw and repainting the batch as failed.
    latestSse().close.mockImplementationOnce(() => {
      throw new Error("close broke");
    });

    act(() => respond(zipBlob()));

    await settled(() =>
      expect(captured.rejections).toEqual([expect.objectContaining({ message: "close broke" })]),
    );
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries.map((e) => e.status)).toEqual([
      "completed",
      "completed",
    ]);
    unmount();
  });

  it("fails the run when the unzip code won't load, without reporting a bad answer", async () => {
    batchZipState.unpackThrows = true;
    try {
      const { unmount } = startBatchRun();
      act(() => respond(zipBlob()));

      await settled(() =>
        expect(captured.rejections).toEqual([
          expect.objectContaining({ message: "chunk failed to load" }),
        ]),
      );
      expectBatchFailed("Batch processing failed");
      // Ours, not the server's: the global handler gets it, not a
      // malformed-result report.
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
      unmount();
    } finally {
      batchZipState.unpackThrows = false;
    }
  });
});
