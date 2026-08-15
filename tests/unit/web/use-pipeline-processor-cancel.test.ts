// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
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

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
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
