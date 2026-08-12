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
  return { ...actual, generateId: () => "44444444-4444-4444-8444-444444444444" };
});

import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { track } from "@/lib/analytics";
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
