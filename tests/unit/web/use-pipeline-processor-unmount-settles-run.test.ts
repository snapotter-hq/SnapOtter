// @vitest-environment jsdom

import { en } from "@snapotter/shared";
import { act, renderHook } from "@testing-library/react";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  captureHandledError: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  formatHeaders: () => new Map<string, string>(),
  parseApiError: () => "error",
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "66666666-6666-4666-8666-666666666666" };
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
let fetchMock: ReturnType<typeof vi.fn>;

const JOB_ID = "66666666-6666-4666-8666-666666666666";
const CANCEL_URL = `/api/v1/jobs/${JOB_ID}/cancel`;
const STEPS: PipelineStep[] = [{ id: "s1", toolId: "resize", settings: { width: 50 } }];
const INTERRUPTED = en.errors.runInterrupted;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
  useFileStore.getState().reset();
  xhrs = [];
  MockEventSource.instances = [];
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ canceled: true })));
  vi.stubGlobal("fetch", fetchMock);
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

function image(name: string) {
  return new File([new ArrayBuffer(16)], name, { type: "image/png" });
}

function cancelPosts() {
  return fetchMock.mock.calls.filter(([url]) => url === CANCEL_URL);
}

/**
 * #2634: usePipelineProcessor's unmount cleanup aborts the request and closes
 * the stream, and settles the run it stopped (mirroring useToolProcessor #2125)
 * while asking the server to cancel the active job.
 */
describe("usePipelineProcessor unmount settles the run it stops (#2634)", () => {
  it("settles a single-file pipeline run in flight and cancels its job", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => usePipelineProcessor());
    act(() => {
      hook.result.current.processSingle(file, STEPS);
    });
    expect(useFileStore.getState().processing).toBe(true);

    hook.unmount();

    expect(xhrs[0].abort).toHaveBeenCalled();
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBe(INTERRUPTED);
    expect(state.entries[0]).toMatchObject({ status: "failed", error: INTERRUPTED });
    expect(state.activeJobId).toBeNull();
    expect(cancelPosts()).toHaveLength(1);
    expect(cancelPosts()[0][1]).toMatchObject({ method: "POST" });
  });

  it("settles a 202 pipeline run being followed over the progress stream", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => usePipelineProcessor());
    act(() => {
      hook.result.current.processSingle(file, STEPS);
    });
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });

    hook.unmount();

    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.entries[0].status).toBe("failed");
    expect(state.activeJobId).toBeNull();
    expect(cancelPosts()).toHaveLength(1);
  });

  it("settles every file of a pipeline batch in flight and cancels its job", () => {
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => usePipelineProcessor());
    act(() => {
      void hook.result.current.processAll(files, STEPS);
    });
    expect(useFileStore.getState().processing).toBe(true);

    hook.unmount();

    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBe(INTERRUPTED);
    expect(state.entries.map((e: { status: string }) => e.status)).toEqual(["failed", "failed"]);
    expect(state.activeJobId).toBeNull();
    expect(cancelPosts()).toHaveLength(1);
  });

  it("leaves the store alone when no run is in flight", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    useFileStore.getState().updateEntry(0, { status: "completed", processedUrl: "/done.png" });
    const hook = renderHook(() => usePipelineProcessor());

    hook.unmount();

    const state = useFileStore.getState();
    expect(state.error).toBeNull();
    expect(state.entries[0]).toMatchObject({ status: "completed", processedUrl: "/done.png" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a finished run's result alone", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => usePipelineProcessor());
    act(() => {
      hook.result.current.processSingle(file, STEPS);
    });
    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify({
        jobId: JOB_ID,
        downloadUrl: `/api/v1/download/${JOB_ID}/photo.png`,
        originalSize: 16,
        processedSize: 8,
      });
      xhrs[0].onload?.();
    });
    expect(useFileStore.getState().entries[0].status).toBe("completed");

    hook.unmount();

    const state = useFileStore.getState();
    expect(state.error).toBeNull();
    expect(state.entries[0].status).toBe("completed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes nothing into a store the user already cleared", () => {
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => usePipelineProcessor());
    act(() => {
      void hook.result.current.processAll(files, STEPS);
    });

    act(() => {
      useFileStore.getState().reset();
    });
    hook.unmount();

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw out of the cleanup when ending a batch fails, and reports it", () => {
    const real = useFileStore.getState().setProcessing;
    vi.spyOn(useFileStore.getState(), "setProcessing").mockImplementation((value: boolean) => {
      if (!value) throw new Error("boom");
      real(value);
    });
    try {
      const files = [image("one.png"), image("two.png")];
      useFileStore.getState().setFiles(files);
      const hook = renderHook(() => usePipelineProcessor());
      act(() => {
        void hook.result.current.processAll(files, STEPS);
      });

      expect(() => hook.unmount()).not.toThrow();

      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
        "Ending a pipeline run after its panel unmounted failed",
      );
      expect(useFileStore.getState().entries.map((e: { status: string }) => e.status)).toEqual([
        "failed",
        "failed",
      ]);
    } finally {
      useFileStore.setState({ setProcessing: real });
    }
  });

  it("does not throw out of the cleanup when ending a single-file run fails, and reports it", () => {
    const real = useFileStore.getState().setProcessing;
    vi.spyOn(useFileStore.getState(), "setProcessing").mockImplementation((value: boolean) => {
      if (!value) throw new Error("single-boom");
      real(value);
    });
    try {
      const file = image("one.png");
      useFileStore.getState().setFiles([file]);
      const hook = renderHook(() => usePipelineProcessor());
      act(() => {
        hook.result.current.processSingle(file, STEPS);
      });

      expect(() => hook.unmount()).not.toThrow();

      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
        "Ending a pipeline run after its panel unmounted failed",
      );
      expect(useFileStore.getState().entries[0].status).toBe("failed");
    } finally {
      useFileStore.setState({ setProcessing: real });
    }
  });

  it("lets a batch whose ZIP is already on its way finish instead of failing it", async () => {
    vi.useRealTimers();
    const zip = new AdmZip();
    zip.addFile("one_resize.png", Buffer.from([1, 2, 3, 4]));
    zip.addFile("two_resize.png", Buffer.from([5, 6]));
    const bytes = new Uint8Array(zip.toBuffer());
    let deliverZip: (blob: Blob) => void = () => {};
    const download = new Promise<Blob>((resolve) => {
      deliverZip = resolve;
    });
    fetchMock.mockImplementation(async (url: string) =>
      url === CANCEL_URL
        ? new Response(JSON.stringify({ canceled: false }))
        : { ok: true, status: 200, blob: () => download },
    );
    const files = [image("one.png"), image("two.png")];
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
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "completed",
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [],
          result: {
            jobId: JOB_ID,
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-pipeline.zip`,
            zipFilename: "batch-pipeline.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: bytes.length,
          },
        }),
      } as MessageEvent);
    });

    hook.unmount();
    expect(cancelPosts()).toHaveLength(1);
    deliverZip(new Blob([bytes.slice().buffer], { type: "application/zip" }));

    await vi.waitFor(() => expect(useFileStore.getState().processing).toBe(false), {
      timeout: 3_000,
    });
    expect(useFileStore.getState().entries.map((e: { status: string }) => e.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(useFileStore.getState().batchZipBlob).not.toBeNull();
    // A 200 { canceled: false } rejects with CancelRefusedError, which unmount
    // ignores without reporting a bug.
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("reports a non-CancelRefusedError rejection from cancelCurrentJob during unmount", async () => {
    // When a settling batch unmounts, activeJobIdRef stays set while the ZIP
    // download is in flight; if the cancel POST answers 404 and a store write
    // in cancelCurrentJob's local settle throws, cancelCurrentJob rejects with
    // that error rather than CancelRefusedError.
    const realSetError = useFileStore.getState().setError;
    vi.spyOn(useFileStore.getState(), "setError").mockImplementation((msg: string | null) => {
      if (msg === "Canceled") throw new Error("cancel-teardown-boom");
      realSetError(msg);
    });
    const download = new Promise<Blob>(() => {});
    fetchMock.mockImplementation(async (url: string) =>
      url === CANCEL_URL
        ? new Response("{}", { status: 404 })
        : { ok: true, status: 200, blob: () => download },
    );
    try {
      const files = [image("one.png"), image("two.png")];
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
        MockEventSource.instances.at(-1)?.onmessage?.({
          data: JSON.stringify({
            type: "batch",
            jobId: JOB_ID,
            status: "completed",
            totalFiles: 2,
            completedFiles: 2,
            failedFiles: 0,
            errors: [],
            result: {
              jobId: JOB_ID,
              downloadUrl: `/api/v1/download/${JOB_ID}/batch-pipeline.zip`,
              zipFilename: "batch-pipeline.zip",
              fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
              processedSize: 16,
            },
          }),
        } as MessageEvent);
      });

      hook.unmount();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    } finally {
      useFileStore.setState({ setError: realSetError });
    }

    expect(vi.mocked(captureHandledError)).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Ending a pipeline run after its panel unmounted failed",
        cause: expect.objectContaining({ message: "cancel-teardown-boom" }),
      }),
      { error_class: "bug" },
    );
  });

  it("does not overwrite a new run when a settling pipeline batch unmounts after the store was reset and taken over (#2748)", () => {
    const download = new Promise<Blob>(() => {});
    fetchMock.mockImplementation(async (url: string) =>
      url === CANCEL_URL
        ? new Response(JSON.stringify({ canceled: false }))
        : { ok: true, status: 200, blob: () => download },
    );
    const files = [image("one.png"), image("two.png")];
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
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "completed",
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [],
          result: {
            jobId: JOB_ID,
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-pipeline.zip`,
            zipFilename: "batch-pipeline.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: 16,
          },
        }),
      } as MessageEvent);
    });

    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next-run.png")]);
      useFileStore.getState().updateEntry(0, { status: "processing" });
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("77777777-7777-4777-8777-777777777777", null);
    });

    hook.unmount();

    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.error).toBeNull();
    expect(state.activeJobId).toBe("77777777-7777-4777-8777-777777777777");
    expect(state.entries[0].status).toBe("processing");
    expect(cancelPosts()).toHaveLength(0);
  });

  it("does not overwrite a new run when an in-flight single-file pipeline unmounts after the store was reset and taken over (#2748)", () => {
    const file = image("one.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => usePipelineProcessor());
    act(() => {
      hook.result.current.processSingle(file, STEPS);
    });

    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next-run.png")]);
      useFileStore.getState().updateEntry(0, { status: "processing" });
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("77777777-7777-4777-8777-777777777777", null);
    });

    hook.unmount();

    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.error).toBeNull();
    expect(state.activeJobId).toBe("77777777-7777-4777-8777-777777777777");
    expect(state.entries[0].status).toBe("processing");
    expect(cancelPosts()).toHaveLength(0);
  });

  it("drops an unmounted settling pipeline batch's ZIP when a new run starts while the ZIP is downloading (#2748)", async () => {
    vi.useRealTimers();
    const zip = new AdmZip();
    zip.addFile("one_resize.png", Buffer.from([1, 2, 3, 4]));
    zip.addFile("two_resize.png", Buffer.from([5, 6]));
    const bytes = new Uint8Array(zip.toBuffer());
    let deliverZip: (blob: Blob) => void = () => {};
    const download = new Promise<Blob>((resolve) => {
      deliverZip = resolve;
    });
    fetchMock.mockImplementation(async (url: string) =>
      url === CANCEL_URL
        ? new Response(JSON.stringify({ canceled: false }))
        : { ok: true, status: 200, blob: () => download },
    );
    const files = [image("one.png"), image("two.png")];
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
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "completed",
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [],
          result: {
            jobId: JOB_ID,
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-pipeline.zip`,
            zipFilename: "batch-pipeline.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: bytes.length,
          },
        }),
      } as MessageEvent);
    });

    hook.unmount();
    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next-run.png")]);
      useFileStore.getState().updateEntry(0, { status: "processing" });
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("77777777-7777-4777-8777-777777777777", null);
    });

    await act(async () => {
      deliverZip(new Blob([bytes.slice().buffer], { type: "application/zip" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.error).toBeNull();
    expect(state.activeJobId).toBe("77777777-7777-4777-8777-777777777777");
    expect(state.batchZipBlob).toBeNull();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      status: "processing",
      processedUrl: null,
    });
  });

  it("drops an unmounted settling pipeline batch's ZIP when the store was reset before unmount (#2748)", async () => {
    vi.useRealTimers();
    const zip = new AdmZip();
    zip.addFile("one_resize.png", Buffer.from([1, 2, 3, 4]));
    zip.addFile("two_resize.png", Buffer.from([5, 6]));
    const bytes = new Uint8Array(zip.toBuffer());
    let deliverZip: (blob: Blob) => void = () => {};
    const download = new Promise<Blob>((resolve) => {
      deliverZip = resolve;
    });
    fetchMock.mockImplementation(async (url: string) =>
      url === CANCEL_URL
        ? new Response(JSON.stringify({ canceled: false }))
        : { ok: true, status: 200, blob: () => download },
    );
    const files = [image("one.png"), image("two.png")];
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
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "completed",
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [],
          result: {
            jobId: JOB_ID,
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-pipeline.zip`,
            zipFilename: "batch-pipeline.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: bytes.length,
          },
        }),
      } as MessageEvent);
    });

    // Store is cleared before unmount (processing = false), then unmount happens,
    // then a new run starts before the old ZIP resolves.
    act(() => {
      useFileStore.getState().reset();
    });
    hook.unmount();
    act(() => {
      useFileStore.getState().setFiles([image("next-run.png")]);
      useFileStore.getState().updateEntry(0, { status: "processing" });
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob(JOB_ID, null);
    });

    await act(async () => {
      deliverZip(new Blob([bytes.slice().buffer], { type: "application/zip" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.error).toBeNull();
    expect(state.activeJobId).toBe(JOB_ID);
    expect(state.batchZipBlob).toBeNull();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      status: "processing",
      processedUrl: null,
    });
  });

  it("stops retrying a settling pipeline batch's ZIP download when the store was reset before unmount (#2748)", async () => {
    let downloadCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === CANCEL_URL) {
        return Promise.resolve(new Response(JSON.stringify({ canceled: false })));
      }
      downloadCalls++;
      return Promise.reject(new Error("network blip"));
    });
    const files = [image("one.png"), image("two.png")];
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
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "completed",
          totalFiles: 2,
          completedFiles: 2,
          failedFiles: 0,
          errors: [],
          result: {
            jobId: JOB_ID,
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-pipeline.zip`,
            zipFilename: "batch-pipeline.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: 16,
          },
        }),
      } as MessageEvent);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(downloadCalls).toBe(1);

    act(() => {
      useFileStore.getState().reset();
    });
    hook.unmount();
    act(() => {
      useFileStore.getState().setFiles([image("next-run.png")]);
      useFileStore.getState().updateEntry(0, { status: "processing" });
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob(JOB_ID, null);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(downloadCalls).toBe(1);
    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.error).toBeNull();
    expect(state.activeJobId).toBe(JOB_ID);
  });
});
