// @vitest-environment jsdom

import { en } from "@snapotter/shared/i18n/en.js";
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
  parseApiError: (body: unknown) => (body as { error?: string } | null)?.error ?? "error",
}));

// Deterministic run ids. Tests that start a second run must queue a distinct
// id, or run-identity guards degenerate into always-true comparisons.
const generateIdMock = vi.hoisted(() => ({ queue: [] as string[] }));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    generateId: () => generateIdMock.queue.shift() ?? "44444444-4444-4444-8444-444444444444",
  };
});

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { captureHandledError, track } from "@/lib/analytics";
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

const JOB_ID = "44444444-4444-4444-8444-444444444444";

// Only the first file finished before the cancel landed.
const PARTIAL_NAMES = { "0": "first_resize.png" } as const;
const PARTIAL_ZIP_BYTES = (() => {
  const zip = new AdmZip();
  zip.addFile("first_resize.png", Buffer.from([1, 2, 3, 4]));
  return new Uint8Array(zip.toBuffer());
})();
const partialZipBlob = () =>
  new Blob([PARTIAL_ZIP_BYTES.slice().buffer], { type: "application/zip" });
const encodedPartialResults = () => encodeURIComponent(JSON.stringify(PARTIAL_NAMES));

// Every file finished: the cancel lost the race.
const FULL_NAMES = { "0": "first_resize.png", "1": "second_resize.jpg" } as const;
const FULL_ZIP_BYTES = (() => {
  const zip = new AdmZip();
  zip.addFile("first_resize.png", Buffer.from([1, 2, 3, 4]));
  zip.addFile("second_resize.jpg", Buffer.from([5, 6]));
  return new Uint8Array(zip.toBuffer());
})();
const fullZipBlob = () => new Blob([FULL_ZIP_BYTES.slice().buffer], { type: "application/zip" });

function latestSse(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

function sendBatchFrame(frame: Record<string, unknown>) {
  latestSse().onmessage?.({
    data: JSON.stringify({ type: "batch", jobId: JOB_ID, ...frame }),
  } as MessageEvent);
}

const PARTIAL_RESULT = {
  jobId: JOB_ID,
  downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize-44444444.zip`,
  zipFilename: "batch-resize-44444444.zip",
  fileResults: PARTIAL_NAMES,
  processedSize: PARTIAL_ZIP_BYTES.length,
};

function canceledPartialFrame() {
  return {
    status: "completed",
    totalFiles: 2,
    completedFiles: 2,
    failedFiles: 1,
    errors: [{ filename: "second.jpg", error: "Canceled" }],
    result: PARTIAL_RESULT,
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
  // Console spies must not outlive a test that failed partway.
  vi.restoreAllMocks();
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

async function settled(check: () => void) {
  await vi.waitFor(check, { timeout: 3_000 });
}

function batchProcessedEvents() {
  return vi.mocked(track).mock.calls.filter(([event]) => event === "batch_processed");
}

/**
 * #767: batch runs are cancelable. The progress-card button is armed for the
 * whole run, a cancel settles the run with the partial results the server
 * kept, and files the cancel skipped read "Canceled" instead of a lookup
 * failure.
 */
describe("useToolProcessor batch cancel (#767)", () => {
  it("arms the progress-card cancel handle for the whole batch run", () => {
    const { unmount } = startBatchRun();

    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);
    expect(typeof useFileStore.getState().cancelCurrentJob).toBe("function");

    unmount();
  });

  it("labels files the cancel skipped and reports batch_processed canceled", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/cancel")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ canceled: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(partialZipBlob()),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const hook = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });

    await act(async () => {
      await hook.result.current.cancelCurrentJob();
    });

    act(() => {
      sendBatchFrame(canceledPartialFrame());
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[1].status).toBe("failed");
    });
    expect(useFileStore.getState().entries[1].error).toBe("Canceled");
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);

    // trackBatch lands through a dynamic analytics import, one tick after
    // the run settles; assert with a wait so the event is not raced.
    await settled(() => expect(batchProcessedEvents()).toHaveLength(1));
    expect(batchProcessedEvents()[0][1]).toMatchObject({ status: "canceled" });

    hook.unmount();
  });

  it("settles a full cancel from the failed frame's Canceled synthetic", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });

    await act(async () => {
      await hook.result.current.cancelCurrentJob();
    });

    act(() => {
      sendBatchFrame({
        status: "failed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 2,
        errors: [
          { filename: "", error: "Canceled" },
          { filename: "first.png", error: "Canceled" },
          { filename: "second.jpg", error: "Canceled" },
        ],
      });
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().activeJobId).toBeNull();

    await settled(() => expect(batchProcessedEvents()).toHaveLength(1));
    // A canceled run reports the cancel as its reason, whichever path
    // carried it (#1161).
    expect(batchProcessedEvents()[0][1]).toMatchObject({ status: "canceled", reason: "canceled" });

    hook.unmount();
  });

  it("cancel during a run the server never saw aborts the upload and settles locally", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Job not found" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startBatchRun();

    // Upload still in flight: no upload.onload, no server response yet.
    await act(async () => {
      await hook.result.current.cancelCurrentJob();
    });

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();

    // trackBatch lands through a dynamic analytics import, one tick after
    // the run settles; assert with a wait so the event is not raced.
    await settled(() => expect(batchProcessedEvents()).toHaveLength(1));
    expect(batchProcessedEvents()[0][1]).toMatchObject({ status: "canceled" });

    hook.unmount();
  });

  // #1814: a local cancel whose teardown throws must still end the batch.
  // Zustand commits a write before its listeners run, so a throw there used
  // to skip every write after it and the outcome report: the run kept its
  // timers, its stream and its job handle, with nothing left to end it.
  it.each([
    [
      "every write",
      () => {
        throw new Error("teardown broke");
      },
    ],
    [
      "the cancel-handle write",
      (
        state: ReturnType<typeof useFileStore.getState>,
        prev: ReturnType<typeof useFileStore.getState>,
      ) => {
        if (prev.activeJobId && !state.activeJobId) throw new Error("teardown broke");
      },
    ],
  ] as const)("ends a locally canceled batch when %s throws (#1814)", async (_name, listener) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    );
    const hook = startBatchRun();
    const unsubscribe = useFileStore.subscribe(listener);

    try {
      await act(async () => {
        // The first throw still reaches the cancel button's catch.
        await expect(hook.result.current.cancelCurrentJob()).rejects.toThrow("teardown broke");
      });
    } finally {
      unsubscribe();
      consoleError.mockRestore();
    }

    const state = useFileStore.getState();
    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(state.processing).toBe(false);
    expect(state.error).toBe("Canceled");
    expect(state.activeJobId).toBeNull();
    expect(state.cancelCurrentJob).toBeNull();
    expect(hook.result.current.progress.phase).toBe("idle");
    expect(latestSse().close).toHaveBeenCalled();
    for (const entry of state.entries) {
      expect(entry).toMatchObject({ status: "failed", error: "Canceled" });
    }
    await settled(() => expect(batchProcessedEvents()).toHaveLength(1));
    expect(batchProcessedEvents()[0][1]).toMatchObject({ status: "canceled" });

    hook.unmount();
  });

  it("labels skipped files on the sync partial-ZIP response after a cancel", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
    });

    await act(async () => {
      await hook.result.current.cancelCurrentJob();
    });

    // The route streams the partial ZIP on the still-open sync response.
    act(() => {
      xhrs[0].status = 200;
      xhrs[0].response = partialZipBlob();
      xhrs[0].getResponseHeader = vi.fn((name: string) =>
        name === "X-File-Results" ? encodedPartialResults() : null,
      );
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[1].status).toBe("failed");
    });
    expect(useFileStore.getState().entries[1].error).toBe("Canceled");

    // trackBatch lands through a dynamic analytics import, one tick after
    // the run settles; assert with a wait so the event is not raced.
    await settled(() => expect(batchProcessedEvents()).toHaveLength(1));
    expect(batchProcessedEvents()[0][1]).toMatchObject({ status: "canceled" });

    hook.unmount();
  });

  it("a cancel the server refused settles the full result as a plain completion", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/cancel")) {
        // Too late: the server found the batch already terminal.
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ canceled: false }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(fullZipBlob()),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const hook = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });

    // The server's "can't cancel this now" is told to the user (#1815).
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    await act(async () => {
      await expect(hook.result.current.cancelCurrentJob()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "notCancellable",
      });
    });
    expect(consoleInfo).toHaveBeenCalledWith(
      "Cancel refused: the server can't cancel this run now",
    );

    act(() => {
      sendBatchFrame({
        status: "completed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 0,
        errors: [],
        result: { ...PARTIAL_RESULT, fileResults: FULL_NAMES },
      });
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[1].status).toBe("completed");
    });
    expect(useFileStore.getState().entries[1].error).toBeNull();
    expect(useFileStore.getState().error).toBeNull();

    // The server said canceled: false, so nothing was canceled: the event
    // reports the outcome, not the declined click.
    await settled(() => expect(batchProcessedEvents()).toHaveLength(1));
    expect(batchProcessedEvents()[0][1]).toMatchObject({ status: "completed" });

    hook.unmount();
  });

  it("a batch closure orphaned by the evidence timer cannot swallow a later single-run cancel", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Job not found" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Batch run degrades with no evidence and the 30s timer settles it.
    const hook = startBatchRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    act(() => {
      vi.advanceTimersByTime(30_001);
    });
    expect(useFileStore.getState().processing).toBe(false);
    vi.useRealTimers();

    // A later single run degrades the same way; its cancel must settle
    // immediately instead of being handed to the dead batch closure. The id
    // must differ from the batch run's or the closure's identity guard
    // cannot tell the runs apart.
    generateIdMock.queue.push("55555555-5555-4555-8555-555555555555");
    const file = new File([new ArrayBuffer(16)], "third.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[1].upload.onload?.();
      xhrs[1].onerror?.();
    });
    expect(useFileStore.getState().processing).toBe(true);

    await act(async () => {
      await hook.result.current.cancelCurrentJob();
    });

    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();

    hook.unmount();
  });

  it("reports a canceled 422 as Canceled, not a processing failure", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
    });

    await act(async () => {
      await hook.result.current.cancelCurrentJob();
    });

    act(() => {
      xhrs[0].status = 422;
      xhrs[0].response = new Blob(
        [
          JSON.stringify({
            error: "Batch canceled",
            canceled: true,
            errors: [
              { filename: "first.png", error: "Canceled" },
              { filename: "second.jpg", error: "Canceled" },
            ],
          }),
        ],
        { type: "application/json" },
      );
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expect(useFileStore.getState().error).toBe("Canceled");

    hook.unmount();
  });

  it("keeps a genuine failure message when the cancel lost to a real all-failed outcome", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
    });

    await act(async () => {
      await hook.result.current.cancelCurrentJob();
    });

    // Every file had already failed for real reasons before the cancel
    // registered; the route reports the failure, not a cancellation.
    act(() => {
      xhrs[0].status = 422;
      xhrs[0].response = new Blob(
        [
          JSON.stringify({
            error: "All files failed processing",
            errors: [
              { filename: "first.png", error: "Invalid image" },
              { filename: "second.jpg", error: "Invalid image" },
            ],
          }),
        ],
        { type: "application/json" },
      );
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expect(useFileStore.getState().error).toBe("All files failed processing");

    hook.unmount();
  });
});

// #1341 made a batch 413 read in the user's language. That text can't be
// classified for feedback, so the entry also stores the cause (#1596).
describe("useToolProcessor batch 413", () => {
  it("fails every file with the translated too-large text and an upload_error category", async () => {
    const hook = startBatchRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 413;
      xhrs[0].response = new Blob(["<html>413 Request Entity Too Large</html>"]);
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().entries.every((e) => e.status === "failed")).toBe(true);
    });
    for (const entry of useFileStore.getState().entries) {
      expect(entry).toMatchObject({ error: en.errors.fileTooLarge, errorCategory: "upload_error" });
    }

    hook.unmount();
  });
});
/**
 * #1815: a cancel the server refuses used to vanish. The batch keeps going
 * (only the server can stop it, #767), but the cancel rejects with the
 * refusal's reason for the button to show, the refusal is logged, and only a
 * fault reaches Sentry, under a constant message with the status as its tag.
 */
describe("useToolProcessor refused cancel (#1815)", () => {
  it.each([
    [409, "notCancellable", "info", false],
    [401, "notAllowed", "warn", false],
    [403, "notAllowed", "warn", false],
    [429, "failed", "warn", false],
    [500, "failed", "warn", true],
  ] as const)(
    "keeps the batch going on a %i and rejects with %s",
    async (status, reason, level, reported) => {
      const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(captureHandledError).mockClear();
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status,
            json: () => Promise.resolve({ error: "secret server detail" }),
          } as unknown as Response),
        ),
      );
      const hook = startBatchRun();

      await act(async () => {
        await expect(hook.result.current.cancelCurrentJob()).rejects.toMatchObject({
          name: "CancelRefusedError",
          reason,
          status,
        });
      });

      const state = useFileStore.getState();
      expect(state.processing).toBe(true);
      expect(state.activeJobId).toBe(JOB_ID);
      expect(state.cancelCurrentJob).not.toBeNull();
      expect(state.error).toBeNull();
      expect(xhrs[0].abort).not.toHaveBeenCalled();
      expect(state.entries.every((e) => e.status === "processing")).toBe(true);

      const logged = level === "info" ? consoleInfo : consoleWarn;
      expect(logged).toHaveBeenCalledWith("Cancel refused", status);
      const reports = vi.mocked(captureHandledError).mock.calls;
      if (reported) {
        expect(reports).toHaveLength(1);
        const [report, tags] = reports[0] as unknown as [
          Error & { statusCode?: number },
          Record<string, string>,
        ];
        expect(report.message).toBe("The server refused a cancel");
        expect(report.statusCode).toBe(status);
        expect(tags).toEqual({
          error_class: "operational",
          tool_id: "resize",
          status_code: String(status),
        });
        expect(JSON.stringify(reports)).not.toContain("secret server detail");
      } else {
        expect(reports).toHaveLength(0);
      }

      // The refused click recorded no intent: a later full result settles as
      // a plain completion, not a cancel.
      act(() => {
        xhrs[0].upload.onload?.();
        xhrs[0].status = 202;
        xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
        xhrs[0].onload?.();
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(fullZipBlob()) }),
        ),
      );
      act(() => {
        sendBatchFrame({
          status: "completed",
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [],
          result: { ...PARTIAL_RESULT, fileResults: FULL_NAMES },
        });
      });
      await settled(() => expect(batchProcessedEvents()).toHaveLength(1));
      expect(batchProcessedEvents()[0][1]).toMatchObject({ status: "completed" });

      consoleInfo.mockRestore();
      consoleWarn.mockRestore();
      hook.unmount();
    },
  );

  it("rejects a cancel request that never reached the server and leaves the batch running", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(captureHandledError).mockClear();
    const failure = new TypeError("Failed to fetch");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(failure)),
    );
    const hook = startBatchRun();

    await act(async () => {
      await expect(hook.result.current.cancelCurrentJob()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "failed",
      });
    });

    expect(consoleWarn).toHaveBeenCalledWith("Cancel request failed", failure);
    expect(captureHandledError).not.toHaveBeenCalled();
    expect(useFileStore.getState().processing).toBe(true);
    expect(xhrs[0].abort).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    hook.unmount();
  });

  it("reports a cancel request that failed for any other reason under the tool's id", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(captureHandledError).mockClear();
    const failure = new Error("headers broke");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(failure)),
    );
    const hook = startBatchRun();

    await act(async () => {
      await expect(hook.result.current.cancelCurrentJob()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "failed",
      });
    });

    const reports = vi.mocked(captureHandledError).mock.calls;
    expect(reports).toHaveLength(1);
    const [report, tags] = reports[0] as unknown as [Error, Record<string, string>];
    expect(report.message).toBe("A cancel request never reached the server");
    expect(report.cause).toBe(failure);
    expect(tags).toEqual({ error_class: "operational", tool_id: "resize" });
    hook.unmount();
  });
});
