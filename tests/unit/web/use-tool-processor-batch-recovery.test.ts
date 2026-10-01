// @vitest-environment jsdom

import { FILE_NOTES_ALL_FILES } from "@snapotter/shared";
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
  return { ...actual, generateId: vi.fn(() => "33333333-3333-4333-8333-333333333333") };
});

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { track } from "@/lib/analytics";
import { generateId } from "@/lib/utils";
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
    // total_bytes is the sum of the two 16-byte inputs; a completed run
    // carries no failure reason (#1161).
    expect(batchEvents[0][1]).toEqual({
      tool_id: "resize",
      file_count: 2,
      status: "completed",
      total_bytes: 32,
    });

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

  it("reports an abandoned run on batch_processed with the unconfirmed reason (#945, #1161)", () => {
    vi.useFakeTimers();
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
      latestSse().onmessage?.({
        data: JSON.stringify({ type: "heartbeat" }),
      } as MessageEvent);
      vi.advanceTimersByTime(30_001);
    });

    // The evidence timer ends the run, so it must land in analytics like
    // every other terminal path; a run that vanishes from batch_processed
    // is exactly the failure mode the event exists to count.
    expect(vi.mocked(track)).toHaveBeenCalledWith("batch_processed", {
      tool_id: "resize",
      file_count: 2,
      status: "failed",
      reason: "unconfirmed",
      total_bytes: 32,
    });

    unmount();
  });

  it("lets a later single run's evidence timer settle that run, not a stale batch closure", () => {
    vi.useFakeTimers();
    const files = [
      new File([new ArrayBuffer(16)], "first.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "second.jpg", { type: "image/jpeg" }),
    ];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    // Two runs, two ids: the closure guard is what is under test here.
    vi.mocked(generateId)
      .mockReturnValueOnce(JOB_ID)
      .mockReturnValueOnce("44444444-4444-4444-8444-444444444444");

    // A batch run degrades, then the user starts a single run on top of it
    // without the batch ever settling, so the batch closure is stale.
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      hook.result.current.processFiles([files[0]], { width: 50 });
    });
    act(() => {
      xhrs[1].upload.onload?.();
      xhrs[1].onerror?.();
      vi.advanceTimersByTime(30_001);
    });

    // The single run is the one the timer belongs to: it settles, and the
    // old batch does not get a spurious batch_processed on its behalf.
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe(
      "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
    );
    expect(vi.mocked(track)).not.toHaveBeenCalledWith(
      "batch_processed",
      expect.objectContaining({ reason: "unconfirmed" }),
    );

    hook.unmount();
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

  // #1287: a throw while settling from the terminal frame used to be
  // swallowed, leaving a degraded batch at "processing" with no stream and no
  // timer left to end it.
  describe("terminal-frame handler errors (#1287)", () => {
    const HANDLER_FAILURE = "Something went wrong while tracking this job. Try again.";
    const ALL_FAILED_FRAME = {
      status: "failed",
      totalFiles: 2,
      completedFiles: 2,
      failedFiles: 2,
      errors: [],
    };
    const realSetError = useFileStore.getState().setError;
    afterEach(() => {
      useFileStore.setState({ setError: realSetError });
    });

    function degrade() {
      act(() => {
        xhrs[0].upload.onload?.();
        xhrs[0].onerror?.();
      });
    }

    it("fails the run when settling from the terminal frame throws", () => {
      // The hook holds the setError it rendered with, so the spy goes in
      // first; only failRun's write of the frame's own error throws, before
      // the run's teardown. (The entry write can't carry this any more: it
      // runs last and logs instead of throwing, #1778.)
      let thrown = false;
      vi.spyOn(useFileStore.getState(), "setError").mockImplementation((message) => {
        if (!thrown && message === "All files failed processing") {
          thrown = true;
          throw new Error("boom");
        }
        realSetError(message);
      });
      const { unmount } = startBatchRun();
      degrade();

      expect(() =>
        act(() => {
          sendBatchFrame(ALL_FAILED_FRAME);
        }),
      ).toThrow("boom");

      expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().activeJobId).toBeNull();
      expect(useFileStore.getState().entries.map((e) => e.status)).toEqual(["failed", "failed"]);

      unmount();
    });

    it("keeps the real outcome when the throw lands after the run settled", async () => {
      const { unmount } = startBatchRun();
      degrade();
      // trackBatch is the last thing failRun does, after finishRun settled.
      vi.mocked(track).mockImplementationOnce(() => {
        throw new Error("analytics broke");
      });

      expect(() =>
        act(() => {
          sendBatchFrame(ALL_FAILED_FRAME);
        }),
      ).toThrow("analytics broke");

      expect(useFileStore.getState().error).toBe("All files failed processing");
      expect(useFileStore.getState().processing).toBe(false);
      // The entries settle before the outcome report, so a throw there can't
      // leave them pulsing behind a settled run (#1778).
      expect(useFileStore.getState().entries.map((e) => e.status)).toEqual(["failed", "failed"]);

      unmount();
    });
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

  it("degrades a batch 524 whose blob body is not JSON (#1161)", async () => {
    const { unmount } = startBatchRun();

    // Cloudflare answers 524 with an HTML page when the origin holds the
    // batch response past its 100 s limit. The batch keeps running
    // server-side exactly as it does behind an nginx 504, so the client
    // must ride the SSE instead of failing the run.
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 524;
      xhrs[0].response = new Blob(["<html><body>524 A timeout occurred</body></html>"], {
        type: "text/html",
      });
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(vi.mocked(track)).toHaveBeenCalledWith("tool_run_degraded", {
        tool_id: "resize",
        is_batch: true,
        trigger: "http-524",
        had_evidence: false,
      });
    });
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("reports the HTTP status as the failure reason when the app answers with an error (#1161)", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 422;
      xhrs[0].response = new Blob([JSON.stringify({ error: "All files failed processing" })], {
        type: "application/json",
      });
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expect(vi.mocked(track)).toHaveBeenCalledWith("batch_processed", {
      tool_id: "resize",
      file_count: 2,
      status: "failed",
      reason: "http-422",
      total_bytes: 32,
    });

    unmount();
  });

  it("reports the server's error code as the reason when the body carries one (#1161)", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 503;
      xhrs[0].response = new Blob(
        [JSON.stringify({ error: "Workspace storage limit reached", code: "workspace-cap" })],
        { type: "application/json" },
      );
      xhrs[0].onload?.();
    });

    // A JSON 5xx is the app speaking, never an intermediary: it must fail
    // the run with its message, not degrade, and the code beats the bare
    // status so the cap and the disk floor stay apart in analytics.
    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expect(useFileStore.getState().error).toBe("error");
    expect(vi.mocked(track)).not.toHaveBeenCalledWith("tool_run_degraded", expect.anything());
    expect(vi.mocked(track)).toHaveBeenCalledWith("batch_processed", {
      tool_id: "resize",
      file_count: 2,
      status: "failed",
      reason: "workspace-cap",
      total_bytes: 32,
    });

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

describe("useToolProcessor batch stale-state reset (#746)", () => {
  it("clears each entry's stale processed state and revokes its blob before uploading", () => {
    const files = [
      new File([new ArrayBuffer(16)], "first.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "second.jpg", { type: "image/jpeg" }),
    ];
    useFileStore.getState().setFiles(files);
    // A previous run left a result on the first entry.
    useFileStore.getState().updateEntry(0, {
      processedUrl: "blob:old-result",
      processedPreviewUrl: "/api/v1/download/old/preview.webp",
      processedFilename: "first_old.png",
      processedSize: 4321,
      status: "completed",
    });

    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });

    const entry = useFileStore.getState().entries[0];
    expect(entry.processedUrl).toBeNull();
    expect(entry.processedPreviewUrl).toBeNull();
    expect(entry.processedFilename).toBeNull();
    expect(entry.processedSize).toBeNull();
    expect(entry.status).toBe("processing");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:old-result");

    hook.unmount();
  });

  it("settles entries as failed, not stuck at processing, when a whole-run failure never reaches the ZIP", () => {
    const { unmount } = startBatchRun();

    act(() => {
      // Socket dies mid-upload (no upload.onload): the run fails via failRun
      // without a terminal ZIP. Entries must not stay pulsing at "processing".
      xhrs[0].onerror?.();
    });

    const entries = useFileStore.getState().entries;
    expect(entries[0].status).toBe("failed");
    expect(entries[1].status).toBe("failed");
    expect(entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });
});

/**
 * #1292: a batch said nothing per file about what a single run says, so
 * "compress 20 photos to 20 KB" could quietly scale half of them down. The
 * server now sends per-file notes keyed like fileResults; they land on each
 * FileEntry, where the panels and the thumbnail strip read them.
 */
describe("useToolProcessor per-file result notes (#1292)", () => {
  const NOTES = { "1": { resizedTo: { width: 800, height: 600 }, targetKb: 20 } };

  it("puts the sync response's X-File-Notes on the matching entries", async () => {
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].response = zipBlob();
      xhrs[0].getResponseHeader = vi.fn((name: string) => {
        if (name === "X-File-Results") return encodedFileResults();
        if (name === "X-File-Notes") return encodeURIComponent(JSON.stringify(NOTES));
        return null;
      });
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    const entries = useFileStore.getState().entries;
    expect(entries[0].resultNotes).toBeNull();
    expect(entries[1].resultNotes).toEqual(NOTES["1"]);

    unmount();
  });

  // #1303: a note every file shares arrives once, so a big batch where Deep
  // Enhance couldn't run anywhere doesn't grow the header per file.
  it("applies a note sent for all files to every entry with a result", async () => {
    const { unmount } = startBatchRun();
    const shared = { [FILE_NOTES_ALL_FILES]: { deepEnhanceSkipped: "unavailable" } };

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].response = zipBlob();
      xhrs[0].getResponseHeader = vi.fn((name: string) => {
        if (name === "X-File-Results") return encodedFileResults();
        if (name === "X-File-Notes") return encodeURIComponent(JSON.stringify(shared));
        return null;
      });
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    for (const entry of useFileStore.getState().entries) {
      expect(entry.resultNotes).toEqual({ deepEnhanceSkipped: "unavailable" });
    }

    unmount();
  });

  it("takes the notes from the terminal frame when the run settles over SSE", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(zipBlob()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      sendBatchFrame({
        ...completedTerminalFrame(),
        result: { ...TERMINAL_RESULT, fileNotes: NOTES },
      });
    });

    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    expect(useFileStore.getState().entries[1].resultNotes).toEqual(NOTES["1"]);
    expect(useFileStore.getState().entries[0].resultNotes).toBeNull();

    unmount();
  });

  it("leaves every entry without notes when the server sends none", async () => {
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
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    for (const entry of useFileStore.getState().entries) expect(entry.resultNotes).toBeNull();

    unmount();
  });

  it("keeps the results when the notes header is junk, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { unmount } = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].response = zipBlob();
      xhrs[0].getResponseHeader = vi.fn((name: string) => {
        if (name === "X-File-Results") return encodedFileResults();
        // Parses fine, but isn't a map: it used to throw inside the settle
        // and fail a good batch as "Batch processing failed".
        if (name === "X-File-Notes") return encodeURIComponent("null");
        return null;
      });
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    expect(useFileStore.getState().error).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    unmount();
  });

  it("clears every entry's notes when a batch starts", () => {
    const files = [
      new File([new ArrayBuffer(16)], "first.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "second.jpg", { type: "image/jpeg" }),
    ];
    useFileStore.getState().setFiles(files);
    useFileStore.getState().updateEntry(1, { resultNotes: { targetMet: false } });
    const { result, unmount } = renderHook(() => useToolProcessor("resize"));

    act(() => {
      void result.current.processAllFiles(files, { width: 50 });
    });

    for (const entry of useFileStore.getState().entries) expect(entry.resultNotes).toBeNull();
    unmount();
  });

  it("records a sync single run's notes on its entry", () => {
    const file = new File([new ArrayBuffer(64)], "photo.jpg", { type: "image/jpeg" });
    useFileStore.getState().setFiles([file]);
    const { result, unmount } = renderHook(() => useToolProcessor("compress"));
    act(() => {
      result.current.processFiles([file], { mode: "targetSize", targetSizeKb: 20 });
    });

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify({
        jobId: "server-job",
        downloadUrl: "/api/v1/download/server-job/photo.jpg",
        originalSize: 64,
        processedSize: 20,
        targetKb: 20,
        resizedTo: { width: 800, height: 600 },
      });
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0].resultNotes).toEqual({
      targetKb: 20,
      resizedTo: { width: 800, height: 600 },
    });
    unmount();
  });

  it("records a single run's notes on its entry too", () => {
    const { unmount } = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    act(() => {
      sendSingleFrame({
        phase: "complete",
        percent: 100,
        result: {
          jobId: "server-job",
          downloadUrl: "/api/v1/download/server-job/clip.pdf",
          originalSize: 64,
          processedSize: 32,
          targetKb: 100,
          targetMet: false,
        },
      });
    });

    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(useFileStore.getState().entries[0].resultNotes).toEqual({
      targetKb: 100,
      targetMet: false,
    });

    unmount();
  });
});

/**
 * #1778: a failed batch failed its entries before tearing the run down. That
 * entry write is a store write, and when the store keeps throwing (the #1354
 * case) the throw escaped failRun before setError, finishRun and trackBatch,
 * so the spinner stayed up, the cancel button stayed armed and the run never
 * reached batch_processed. The evidence timer and the cancel 404 return
 * straight into failRun, so nothing else was left to settle it. failRun now
 * ends the run first and fails the entries last, logging instead of throwing:
 * the batch twin of #1698.
 */
describe("useToolProcessor ends a failed batch before failing its entries (#1778)", () => {
  const SETTLE_FAILED_LOG = "Failing the run's entry failed";
  // Zustand copies state on every set, so a spy on getState().updateEntry
  // rides along into later states; put the real action back explicitly.
  const realUpdateEntry = useFileStore.getState().updateEntry;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let entryWritesBroken = false;
  let failedEntryWrites = 0;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    entryWritesBroken = false;
    failedEntryWrites = 0;
    // The batch reads updateEntry once at kickoff, so a swap after that
    // never reaches it. Wrap the action before the run starts and break it
    // once the run is in flight: the store's own write throwing.
    vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation((index, patch) => {
      if (entryWritesBroken) {
        failedEntryWrites++;
        throw new Error("store broke");
      }
      realUpdateEntry(index, patch);
    });
  });
  afterEach(() => {
    consoleError.mockRestore();
    useFileStore.setState({ updateEntry: realUpdateEntry });
  });

  function breakEntryWrites() {
    entryWritesBroken = true;
  }

  // The upload finished and the socket died: the #750 degrade to async, with
  // the cancel handle armed and the evidence timer running.
  function degrade() {
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().cancelCurrentJob).not.toBeNull();
  }

  function expectRunEnded(message: string, status: "failed" | "canceled", reason: string) {
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(useFileStore.getState().cancelCurrentJob).toBeNull();
    expect(useFileStore.getState().error).toBe(message);
    // The outcome still reaches batch_processed (#1161).
    expect(vi.mocked(track)).toHaveBeenCalledWith("batch_processed", {
      tool_id: "resize",
      file_count: 2,
      status,
      reason,
      total_bytes: 32,
    });
    // The entry write really was attempted and failed, and that is logged,
    // not lost.
    expect(failedEntryWrites).toBeGreaterThan(0);
    expect(consoleError).toHaveBeenCalledWith(
      SETTLE_FAILED_LOG,
      expect.objectContaining({ message: "store broke" }),
    );
  }

  it("ends the run when the server never confirms it and failing the entries throws", () => {
    vi.useFakeTimers();
    const { unmount } = startBatchRun();
    degrade();
    breakEntryWrites();

    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    expectRunEnded(
      "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
      "failed",
      "unconfirmed",
    );
    unmount();
  });

  it("ends the run when the cancel finds no job and failing the entries throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    );
    const { unmount } = startBatchRun();
    degrade();
    breakEntryWrites();

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    expectRunEnded("Canceled", "canceled", "canceled");
    // The cancel still stops the upload.
    expect(xhrs[0].abort).toHaveBeenCalled();
    unmount();
  });

  it("ends the run with the frame's own error when failing the entries throws", () => {
    const { unmount } = startBatchRun();
    degrade();
    breakEntryWrites();

    act(() => {
      sendBatchFrame({
        status: "failed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        errors: [],
      });
    });

    // The frame's failure, not the generic frame-handling one a throw out of
    // failRun used to fall back to.
    expectRunEnded("All files failed processing", "failed", "all-files-failed");
    unmount();
  });

  it("ends the run when a completed frame has no durable result and failing the entries throws", () => {
    const { unmount } = startBatchRun();
    degrade();
    breakEntryWrites();

    act(() => {
      sendBatchFrame({
        status: "completed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 0,
        errors: [],
      });
    });

    expectRunEnded(
      "Processing was interrupted. Retry when reconnected.",
      "failed",
      "no-durable-result",
    );
    unmount();
  });

  it("ends the run when the durable ZIP is gone and failing the entries throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }),
      ),
    );
    const { unmount } = startBatchRun();
    degrade();
    breakEntryWrites();

    act(() => {
      sendBatchFrame(completedTerminalFrame());
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expectRunEnded(
      "Completed result is no longer available. Run the job again.",
      "failed",
      "download-404",
    );
    unmount();
  });

  it("ends the run when the download retries run out and failing the entries throws", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    const { unmount } = startBatchRun();
    degrade();
    breakEntryWrites();

    act(() => {
      sendBatchFrame(completedTerminalFrame());
    });
    // This exit's failRun runs inside the download promise, so before the
    // fix the throw was an unhandled rejection on top of the stuck run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expectRunEnded(
      "Processing was interrupted. Retry when reconnected.",
      "failed",
      "download-failed",
    );
    unmount();
  });

  it("ends the run when the socket dies mid-upload and failing the entries throws", () => {
    const { unmount } = startBatchRun();
    breakEntryWrites();

    act(() => {
      xhrs[0].onerror?.();
    });

    expectRunEnded("Processing was interrupted. Retry when reconnected.", "failed", "socket");
    unmount();
  });

  it("ends the run when the request times out mid-upload and failing the entries throws", () => {
    const { unmount } = startBatchRun();
    breakEntryWrites();

    act(() => {
      xhrs[0].ontimeout?.();
    });

    expectRunEnded(
      "Request timed out - the server may be overloaded. Try again.",
      "failed",
      "timeout",
    );
    unmount();
  });

  it("ends the run on an error response when failing the entries throws", async () => {
    const { unmount } = startBatchRun();
    breakEntryWrites();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 422;
      xhrs[0].response = new Blob([JSON.stringify({ error: "All files failed processing" })], {
        type: "application/json",
      });
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expectRunEnded("error", "failed", "http-422");
    unmount();
  });

  it("ends the run when settling the ZIP and then failing the entries both throw", async () => {
    const { unmount } = startBatchRun();
    breakEntryWrites();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 200;
      xhrs[0].response = zipBlob();
      xhrs[0].getResponseHeader = vi.fn((name: string) =>
        name === "X-File-Results" ? encodedFileResults() : null,
      );
      xhrs[0].onload?.();
    });

    // settleFromZip's own entry write throws first; the unzip-failed exit's
    // failRun then has to end the run even though its write throws too.
    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expectRunEnded("Batch processing failed", "failed", "unzip-failed");
    unmount();
  });

  it("still fails the entries when the teardown itself throws, and lets that throw out", () => {
    vi.useFakeTimers();
    const message =
      "Processing was interrupted and the server never confirmed the job. Retry when reconnected.";
    const realSetError = useFileStore.getState().setError;
    // The hook holds the setError it rendered with, so the spy goes in first.
    vi.spyOn(useFileStore.getState(), "setError").mockImplementation((value) => {
      if (value === message) throw new Error("teardown broke");
      realSetError(value);
    });
    try {
      const { unmount } = startBatchRun();
      degrade();

      expect(() =>
        act(() => {
          vi.advanceTimersByTime(30_001);
        }),
      ).toThrow("teardown broke");

      // The entries settle regardless, instead of pulsing behind a run whose
      // teardown died partway.
      const entries = useFileStore.getState().entries;
      expect(entries.map((e) => e.status)).toEqual(["failed", "failed"]);
      expect(entries[0].error).toBe(message);
      unmount();
    } finally {
      useFileStore.setState({ setError: realSetError });
    }
  });

  it("still fails every entry when the store writes fine", () => {
    vi.useFakeTimers();
    const { unmount } = startBatchRun();
    degrade();

    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    const message =
      "Processing was interrupted and the server never confirmed the job. Retry when reconnected.";
    const entries = useFileStore.getState().entries;
    expect(entries[0]).toMatchObject({ status: "failed", error: message, errorCategory: null });
    expect(entries[1]).toMatchObject({ status: "failed", error: message, errorCategory: null });
    expect(useFileStore.getState().processing).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
    unmount();
  });
});
