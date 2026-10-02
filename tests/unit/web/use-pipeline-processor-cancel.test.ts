// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    generateId: () => generateIdMock.queue.shift() ?? "66666666-6666-4666-8666-666666666666",
  };
});

import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { captureHandledError } from "@/lib/analytics";
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

const JOB_ID = "66666666-6666-4666-8666-666666666666";
const STEPS = [{ id: "s1", toolId: "resize", settings: { width: 50 } }];

// Only the first file finished before the cancel landed.
const PARTIAL_NAMES = { "0": "first_resize.png" } as const;
const PARTIAL_ZIP_BYTES = (() => {
  const zip = new AdmZip();
  zip.addFile("first_resize.png", Buffer.from([1, 2, 3, 4]));
  return new Uint8Array(zip.toBuffer());
})();
const partialZipBlob = () =>
  new Blob([PARTIAL_ZIP_BYTES.slice().buffer], { type: "application/zip" });

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

beforeEach(() => {
  vi.mocked(captureHandledError).mockClear();
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
  // Console spies must not outlive a test that failed partway.
  vi.restoreAllMocks();
});

function startSingleRun() {
  const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
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
 * #771: pipeline runs are cancelable. The Automate page's ProgressCard
 * renders its cancel button off the store's activeJob handle, a cancel
 * settles single runs through the server's "Canceled" vocabulary, and batch
 * runs keep the partial results with skipped files reading "Canceled".
 */
describe("usePipelineProcessor cancel (#771)", () => {
  it("arms the progress-card cancel handle for a single pipeline run", () => {
    const { unmount } = startSingleRun();

    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);
    expect(typeof useFileStore.getState().cancelCurrentJob).toBe("function");

    unmount();
  });

  it("arms the progress-card cancel handle for a pipeline batch run", () => {
    const { unmount } = startBatchRun();

    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);
    expect(typeof useFileStore.getState().cancelCurrentJob).toBe("function");

    unmount();
  });

  it("POSTs the cancel to the run's client-facing id", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startSingleRun();

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/jobs/${JOB_ID}/cancel`,
      expect.objectContaining({ method: "POST" }),
    );

    hook.unmount();
  });

  it("settles a canceled single run from the failed frame and disarms the handle", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "Canceled" });
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Canceled",
    });

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
    const hook = startSingleRun();

    // Upload still in flight: no upload.onload, no server response yet.
    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Canceled",
    });

    hook.unmount();
  });

  it("a canceled sync 422 reads Canceled and disarms the handle", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
    });

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    act(() => {
      xhrs[0].status = 422;
      xhrs[0].responseText = JSON.stringify({
        error: "Canceled",
        completedSteps: [],
        canceled: true,
      });
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Canceled",
    });

    hook.unmount();
  });

  it("settles a canceled sync 422 structurally, not by matching the error string", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hook = startSingleRun();

    act(() => {
      xhrs[0].upload.onload?.();
    });

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    // The canceled marker is the contract; the error text may drift.
    act(() => {
      xhrs[0].status = 422;
      xhrs[0].responseText = JSON.stringify({
        error: "Pipeline run was canceled",
        completedSteps: [],
        canceled: true,
      });
      xhrs[0].onload?.();
    });

    await settled(() => {
      expect(useFileStore.getState().processing).toBe(false);
    });
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Canceled",
    });

    hook.unmount();
  });

  it("keeps the lookup-failure label when the cancel was refused", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/cancel")) {
        // Too late: the server found the run already terminal.
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ canceled: false }),
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

    // The server's "can't cancel this now" is told to the user (#1815).
    vi.spyOn(console, "info").mockImplementation(() => {});
    await act(async () => {
      await expect(useFileStore.getState().cancelCurrentJob?.()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "notCancellable",
      });
    });

    // The refused click must not repaint a genuine lookup failure.
    act(() => {
      sendBatchFrame({
        status: "completed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 1,
        errors: [{ filename: "second.jpg", error: "Processing failed" }],
        result: {
          jobId: JOB_ID,
          downloadUrl: `/api/v1/download/${JOB_ID}/pipeline-batch-66666666.zip`,
          zipFilename: "pipeline-batch-66666666.zip",
          fileResults: PARTIAL_NAMES,
          processedSize: PARTIAL_ZIP_BYTES.length,
        },
      });
    });

    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("failed");
    });
    expect(useFileStore.getState().entries[1].error).toBe("File not found in batch results");

    hook.unmount();
  });

  it("labels files the cancel skipped when settling the partial ZIP from SSE", async () => {
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
      await useFileStore.getState().cancelCurrentJob?.();
    });

    act(() => {
      sendBatchFrame({
        status: "completed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 1,
        errors: [{ filename: "second.jpg", error: "Canceled" }],
        result: {
          jobId: JOB_ID,
          downloadUrl: `/api/v1/download/${JOB_ID}/pipeline-batch-66666666.zip`,
          zipFilename: "pipeline-batch-66666666.zip",
          fileResults: PARTIAL_NAMES,
          processedSize: PARTIAL_ZIP_BYTES.length,
        },
      });
    });

    await settled(() => {
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[1].status).toBe("failed");
    });
    expect(useFileStore.getState().entries[1].error).toBe("Canceled");
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();

    hook.unmount();
  });

  it("keeps the lookup-failure label when nothing was canceled by the user", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(partialZipBlob()),
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

    // No cancel click: a partial result with a missing file is a genuine
    // lookup failure, not a cancellation.
    act(() => {
      sendBatchFrame({
        status: "completed",
        totalFiles: 2,
        completedFiles: 2,
        failedFiles: 1,
        errors: [{ filename: "second.jpg", error: "Processing failed" }],
        result: {
          jobId: JOB_ID,
          downloadUrl: `/api/v1/download/${JOB_ID}/pipeline-batch-66666666.zip`,
          zipFilename: "pipeline-batch-66666666.zip",
          fileResults: PARTIAL_NAMES,
          processedSize: PARTIAL_ZIP_BYTES.length,
        },
      });
    });

    await settled(() => {
      expect(useFileStore.getState().entries[1].status).toBe("failed");
    });
    expect(useFileStore.getState().entries[1].error).toBe("File not found in batch results");

    hook.unmount();
  });

  it("settles a full batch cancel from the failed frame's Canceled synthetic", async () => {
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
      await useFileStore.getState().cancelCurrentJob?.();
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

    hook.unmount();
  });

  it("reports the batch canceled 422 as Canceled, not a per-file failure list", async () => {
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
      await useFileStore.getState().cancelCurrentJob?.();
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
    expect(useFileStore.getState().activeJobId).toBeNull();

    hook.unmount();
  });
});

/**
 * #1779: only the cancel request may fail quietly. A cancel that never reached
 * the server says nothing about the job and the progress stream still settles
 * it, but a throw from the hook's own 404 teardown has nobody left to clean up
 * after it, so it must reject the cancel instead of vanishing.
 */
describe("usePipelineProcessor cancel failures (#1779)", () => {
  it.each([
    ["single", startSingleRun],
    ["batch", startBatchRun],
  ])("lets a %s run's cancel teardown that throws reach the caller", async (_kind, start) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    );
    const hook = start();
    const cancel = useFileStore.getState().cancelCurrentJob;
    // A store listener that breaks on every write, so the teardown itself throws.
    const unsubscribe = useFileStore.subscribe(() => {
      throw new Error("teardown broke");
    });

    try {
      await act(async () => {
        await expect(cancel?.()).rejects.toThrow("teardown broke");
      });
    } finally {
      unsubscribe();
    }

    // The stream is closed, so nothing else will settle the run's entries:
    // they must not be left pulsing at "processing".
    const { entries } = useFileStore.getState();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry).toMatchObject({ status: "failed", error: "Canceled" });
    }
    // Every entry write threw under the listener; the settle reports that
    // once for the run, not once per entry (#1812).
    expect(
      vi
        .mocked(captureHandledError)
        .mock.calls.filter(([e]) => e.message === "Failing a pipeline run's entries failed"),
    ).toHaveLength(1);
    hook.unmount();
  });

  it.each([
    ["single", startSingleRun],
    ["batch", startBatchRun],
  ])("keeps a %s run going when the cancel request itself fails", async (_kind, start) => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const hook = start();

    // The run is left alone, but the click is answered (#1815).
    await act(async () => {
      await expect(useFileStore.getState().cancelCurrentJob?.()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "failed",
      });
    });
    consoleWarn.mockRestore();

    // The progress stream still owns settling the run.
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);
    expect(useFileStore.getState().error).toBeNull();
    expect(xhrs[0].abort).not.toHaveBeenCalled();
    expect(useFileStore.getState().entries.every((e) => e.status === "processing")).toBe(true);

    hook.unmount();
  });

  it("keeps a run going when an acknowledged cancel's body is unreadable", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
        } as unknown as Response),
      ),
    );
    const hook = startSingleRun();

    // Whether the server canceled is unknown; the stream settles that. The
    // answer broke the route's contract, so it's said and reported (#1815).
    await act(async () => {
      await expect(useFileStore.getState().cancelCurrentJob?.()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "failed",
        status: 200,
      });
    });

    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);
    expect(useFileStore.getState().error).toBeNull();
    expect(consoleWarn).toHaveBeenCalledWith("Cancel answer unreadable", 200);
    const reports = vi.mocked(captureHandledError).mock.calls;
    expect(reports).toHaveLength(1);
    const [report, tags] = reports[0] as unknown as [
      Error & { statusCode?: number },
      Record<string, string>,
    ];
    expect(report.message).toBe("A cancel answer was unreadable");
    expect(report.statusCode).toBe(200);
    expect(tags).toEqual({ error_class: "operational", status_code: "200" });

    hook.unmount();
  });
});

type FileStoreState = ReturnType<typeof useFileStore.getState>;

/**
 * Store listeners that make a run's teardown throw (#1814). Zustand commits a
 * write before its listeners run, so each broken write still lands.
 */
const BREAKING_LISTENERS = {
  // Every store write throws.
  "every write": () => {
    throw new Error("teardown broke");
  },
  // Only the write that clears the cancel handle throws, so the writes after
  // it have to run anyway.
  "the cancel-handle write": (state: FileStoreState, prev: FileStoreState) => {
    if (prev.activeJobId && !state.activeJobId) throw new Error("teardown broke");
  },
} as const;

/**
 * #1814: a cancel 404 whose teardown throws must still end the run. The throw
 * from clearActiveJob's write had already hidden the cancel button, and every
 * write after it was skipped: the run sat at processing with no error, no
 * cancel button and a closed stream, with nothing left that could end it.
 * Each write now gets its own guard, and the first throw still reaches the
 * cancel button's catch.
 */
describe("usePipelineProcessor ends a canceled run whose teardown throws (#1814)", () => {
  it.each([
    ["single", "every write"],
    ["single", "the cancel-handle write"],
    ["batch", "every write"],
    ["batch", "the cancel-handle write"],
  ] as const)("ends a %s run when %s throws", async (kind, listener) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    );
    const hook = kind === "single" ? startSingleRun() : startBatchRun();
    expect(useFileStore.getState().processing).toBe(true);
    const cancel = useFileStore.getState().cancelCurrentJob;
    const unsubscribe = useFileStore.subscribe(BREAKING_LISTENERS[listener]);

    try {
      await act(async () => {
        await expect(cancel?.()).rejects.toThrow("teardown broke");
      });
    } finally {
      unsubscribe();
      consoleError.mockRestore();
    }

    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBe("Canceled");
    expect(state.activeJobId).toBeNull();
    expect(state.cancelCurrentJob).toBeNull();
    expect(hook.result.current.progress.phase).toBe("idle");
    expect(latestSse().close).toHaveBeenCalled();
    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(state.entries.length).toBeGreaterThan(0);
    for (const entry of state.entries) {
      expect(entry).toMatchObject({ status: "failed", error: "Canceled" });
    }
    hook.unmount();
  });
});
/**
 * #1815: a cancel the server refuses used to vanish. The run must keep going
 * (only the server can stop it, #767), but the click gets an answer: the
 * cancel rejects with the refusal's reason for the button to show, the
 * refusal is logged, and only a fault on our side reaches Sentry, under a
 * constant message with the status as its tag.
 */
describe("usePipelineProcessor refused cancel (#1815)", () => {
  const REFUSED = [
    // Can't be canceled now. Expected, so info only.
    [409, "notCancellable", "info", false],
    // Signed out, not allowed, or rate limited: the user's, not a bug.
    [401, "notAllowed", "warn", false],
    [403, "notAllowed", "warn", false],
    [429, "failed", "warn", false],
    // Faults.
    [500, "failed", "warn", true],
    [503, "failed", "warn", true],
  ] as const;

  // The route's own refusal: a 200 that says it canceled nothing.
  it.each([
    ["single", startSingleRun],
    ["batch", startBatchRun],
  ] as const)("tells a %s run's user when the server can't cancel it now", async (_kind, start) => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ canceled: false }),
        } as unknown as Response),
      ),
    );
    const hook = start();

    await act(async () => {
      await expect(useFileStore.getState().cancelCurrentJob?.()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "notCancellable",
      });
    });

    expect(consoleInfo).toHaveBeenCalledWith(
      "Cancel refused: the server can't cancel this run now",
    );
    expect(captureHandledError).not.toHaveBeenCalled();
    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.activeJobId).toBe(JOB_ID);
    expect(state.error).toBeNull();
    hook.unmount();
  });

  it("says nothing when the run ended while a declined cancel was out", async () => {
    let answer: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      ),
    );
    const hook = startSingleRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    const cancel = useFileStore.getState().cancelCurrentJob;

    let pending: Promise<void> | undefined;
    act(() => {
      pending = cancel?.();
    });
    // The run finishes on its own before the server answers.
    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "Processing failed" });
    });
    await settled(() => expect(useFileStore.getState().activeJobId).toBeNull());

    await act(async () => {
      answer({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: false }),
      } as unknown as Response);
      await expect(pending).resolves.toBeUndefined();
    });
    expect(useFileStore.getState().error).toBe("Processing failed");
    hook.unmount();
  });

  it.each(
    REFUSED.flatMap(([status, reason, level, reported]) =>
      (["single", "batch"] as const).map(
        (kind) => [kind, status, reason, level, reported] as const,
      ),
    ),
  )(
    "keeps a %s run going on a %i and rejects with %s",
    async (kind, status, reason, level, reported) => {
      const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
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
      const hook = kind === "single" ? startSingleRun() : startBatchRun();

      await act(async () => {
        await expect(useFileStore.getState().cancelCurrentJob?.()).rejects.toMatchObject({
          name: "CancelRefusedError",
          reason,
          status,
        });
      });

      // The server said no, so the run is still the server's to finish.
      const state = useFileStore.getState();
      expect(state.processing).toBe(true);
      expect(state.activeJobId).toBe(JOB_ID);
      expect(state.cancelCurrentJob).not.toBeNull();
      expect(state.error).toBeNull();
      expect(xhrs[0].abort).not.toHaveBeenCalled();
      expect(latestSse().close).not.toHaveBeenCalled();
      expect(state.entries.every((e) => e.status === "processing")).toBe(true);

      const logged = level === "info" ? consoleInfo : consoleWarn;
      const quiet = level === "info" ? consoleWarn : consoleInfo;
      expect(logged).toHaveBeenCalledWith("Cancel refused", status);
      expect(quiet).not.toHaveBeenCalled();

      const reports = vi.mocked(captureHandledError).mock.calls;
      if (reported) {
        expect(reports).toHaveLength(1);
        const [report, tags] = reports[0] as unknown as [
          Error & { isSafeMessage?: boolean; statusCode?: number; kind?: string },
          Record<string, string>,
        ];
        expect(report.message).toBe("The server refused a cancel");
        expect(report.isSafeMessage).toBe(true);
        expect(report.kind).toBe("operational");
        expect(report.statusCode).toBe(status);
        expect(report.cause).toBeUndefined();
        expect(tags).toEqual({ error_class: "operational", status_code: String(status) });
        expect(JSON.stringify(reports)).not.toContain("secret server detail");
      } else {
        expect(reports).toHaveLength(0);
      }

      consoleInfo.mockRestore();
      consoleWarn.mockRestore();
      hook.unmount();
    },
  );

  it("logs a cancel request that never reached the server without reporting a dropped connection", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new TypeError("Failed to fetch");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(failure)),
    );
    const hook = startSingleRun();

    await act(async () => {
      await expect(useFileStore.getState().cancelCurrentJob?.()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "failed",
        status: undefined,
      });
    });

    expect(consoleWarn).toHaveBeenCalledWith("Cancel request failed", failure);
    // Sentry's IGNORE_ERRORS drops a browser's own offline rejection; a
    // constant-message wrapper must not carry it past that filter.
    expect(captureHandledError).not.toHaveBeenCalled();
    expect(useFileStore.getState().processing).toBe(true);

    consoleWarn.mockRestore();
    hook.unmount();
  });

  it("reports a cancel request that failed for any other reason", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new Error("headers broke");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(failure)),
    );
    const hook = startSingleRun();

    await act(async () => {
      await expect(useFileStore.getState().cancelCurrentJob?.()).rejects.toMatchObject({
        name: "CancelRefusedError",
        reason: "failed",
      });
    });

    expect(consoleWarn).toHaveBeenCalledWith("Cancel request failed", failure);
    const reports = vi.mocked(captureHandledError).mock.calls;
    expect(reports).toHaveLength(1);
    const [report, tags] = reports[0] as unknown as [
      Error & { kind?: string },
      Record<string, string>,
    ];
    expect(report.message).toBe("A cancel request never reached the server");
    expect(report.kind).toBe("operational");
    expect(report.cause).toBe(failure);
    expect(tags).toEqual({ error_class: "operational" });

    consoleWarn.mockRestore();
    hook.unmount();
  });

  it("stays quiet on a cancel the server acknowledged", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ canceled: true }),
        } as unknown as Response),
      ),
    );
    const hook = startSingleRun();

    await act(async () => {
      await expect(useFileStore.getState().cancelCurrentJob?.()).resolves.toBeUndefined();
    });

    expect(consoleInfo).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();

    consoleInfo.mockRestore();
    consoleWarn.mockRestore();
    hook.unmount();
  });
});
