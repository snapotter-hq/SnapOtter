// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import AdmZip from "adm-zip";
import { useEffect } from "react";
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
  return { ...actual, generateId: () => "44444444-4444-4444-8444-444444444444" };
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
  upload: {
    onprogress?: ((event: ProgressEvent) => void) | null;
    onload?: (() => void) | null;
  };
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

const JOB_ID = "44444444-4444-4444-8444-444444444444";
const CANCEL_URL = `/api/v1/jobs/${JOB_ID}/cancel`;

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

const INTERRUPTED = "Processing was interrupted. Run it again.";

function image(name: string) {
  return new File([new ArrayBuffer(16)], name, { type: "image/png" });
}

function cancelPosts() {
  return fetchMock.mock.calls.filter(([url]) => url === CANCEL_URL);
}

/**
 * #2125: the processor's unmount cleanup aborts the request and closes the
 * stream, but never settled the run it stopped, so the file store sat at
 * `processing` for good. A layout switch (rotating a phone across the
 * breakpoint) remounts the settings panel for real, and the new panel then
 * showed a run that could never end.
 */
describe("useToolProcessor unmount settles the run it stops (#2125)", () => {
  it("settles a single-file run still uploading, aborts its request, and sends no cancel (#2125, #2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    expect(useFileStore.getState().processing).toBe(true);

    hook.unmount();

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBe(INTERRUPTED);
    expect(state.entries[0]).toMatchObject({
      status: "failed",
      error: INTERRUPTED,
      errorCategory: "processing_error",
    });
    expect(state.activeJobId).toBeNull();
    expect(cancelPosts()).toHaveLength(0);
  });

  it("keeps the request after the upload finished and cancels when the 202 arrives (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
    });

    hook.unmount();

    expect(xhrs[0].abort).not.toHaveBeenCalled();
    expect(MockEventSource.instances.at(-1)?.close).not.toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(0);
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBe(INTERRUPTED);
    expect(state.entries[0]).toMatchObject({
      status: "failed",
      error: INTERRUPTED,
      errorCategory: "processing_error",
    });
    expect(state.activeJobId).toBeNull();

    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });

    expect(cancelPosts()).toHaveLength(1);
    expect(cancelPosts()[0][1]).toMatchObject({ method: "POST" });
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
  });

  it("cancels and closes the kept request when a progress frame arrives after unmount (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
    });

    hook.unmount();

    expect(xhrs[0].abort).not.toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(0);

    act(() => {
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "single",
          jobId: JOB_ID,
          phase: "processing",
          percent: 15,
          stage: "Preparing...",
        }),
      } as MessageEvent);
    });

    expect(cancelPosts()).toHaveLength(1);
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    expect(xhrs[0].abort).toHaveBeenCalled();

    // A late 202 slipping past abort() does not fire a second cancel.
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });
    expect(cancelPosts()).toHaveLength(1);
  });

  it.each(["complete", "failed"] as const)(
    "sends no cancel and closes the kept request when a terminal %s frame arrives after unmount (#2240)",
    (phase) => {
      const file = image("photo.png");
      useFileStore.getState().setFiles([file]);
      const hook = renderHook(() => useToolProcessor("resize"));
      act(() => {
        hook.result.current.processFiles([file], { width: 50 });
      });
      act(() => {
        xhrs[0].upload.onload?.();
      });

      hook.unmount();

      act(() => {
        MockEventSource.instances.at(-1)?.onmessage?.({
          data: JSON.stringify({
            type: "single",
            jobId: JOB_ID,
            phase,
            ...(phase === "complete"
              ? {
                  result: {
                    jobId: JOB_ID,
                    downloadUrl: "/api/v1/download/job-1/photo.png",
                    originalSize: 16,
                    processedSize: 8,
                  },
                }
              : { error: "Processing failed" }),
          }),
        } as MessageEvent);
      });

      expect(cancelPosts()).toHaveLength(0);
      expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
      expect(xhrs[0].abort).toHaveBeenCalled();
      expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    },
  );

  it("ignores heartbeat and unparseable SSE frames on a kept request until a 202 arrives (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
    });

    hook.unmount();

    act(() => {
      const es = MockEventSource.instances.at(-1);
      es?.onmessage?.({ data: "not-json" } as MessageEvent);
      es?.onmessage?.({ data: "null" } as MessageEvent);
      es?.onmessage?.({ data: JSON.stringify({ type: "heartbeat" }) } as MessageEvent);
    });

    expect(cancelPosts()).toHaveLength(0);
    expect(MockEventSource.instances.at(-1)?.close).not.toHaveBeenCalled();
    expect(xhrs[0].abort).not.toHaveBeenCalled();

    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });

    expect(cancelPosts()).toHaveLength(1);
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
  });

  it("reopens the progress stream for a kept request when a sync SSE error closed it during upload (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      MockEventSource.instances[0].onerror?.();
      xhrs[0].upload.onload?.();
    });
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();

    hook.unmount();

    expect(MockEventSource.instances).toHaveLength(2);
    expect(cancelPosts()).toHaveLength(0);

    act(() => {
      MockEventSource.instances[1].onmessage?.({
        data: JSON.stringify({
          type: "single",
          jobId: JOB_ID,
          phase: "processing",
          percent: 5,
        }),
      } as MessageEvent);
    });

    expect(cancelPosts()).toHaveLength(1);
    expect(MockEventSource.instances[1].close).toHaveBeenCalled();
    expect(xhrs[0].abort).toHaveBeenCalled();
  });

  it("still cancels on the 202 when the kept progress stream errors before the answer (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
    });

    hook.unmount();

    act(() => {
      MockEventSource.instances.at(-1)?.onerror?.();
    });
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(0);

    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });

    expect(cancelPosts()).toHaveLength(1);
  });

  it("treats the final upload progress event as the upload being done (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onprogress?.(
        new ProgressEvent("progress", { loaded: 100, total: 100, lengthComputable: true }),
      );
    });

    hook.unmount();

    expect(xhrs[0].abort).not.toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(0);

    // Firefox fires upload.onload once the response starts, after the stop.
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });

    expect(cancelPosts()).toHaveLength(1);
  });

  it("aborts when the upload progress shows the body is only partly sent (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onprogress?.(
        new ProgressEvent("progress", { loaded: 40, total: 100, lengthComputable: true }),
      );
    });

    hook.unmount();

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(0);
  });

  it("aborts when an upload progress event has lengthComputable false (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onprogress?.(
        new ProgressEvent("progress", { loaded: 0, total: 0, lengthComputable: false }),
      );
    });

    hook.unmount();

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(0);
  });

  it("sends no cancel when the answer to a stopped, uploaded file is not a 202 (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
    });

    hook.unmount();
    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify({
        jobId: "job-1",
        downloadUrl: "/api/v1/download/job-1/photo.png",
        originalSize: 16,
        processedSize: 8,
      });
      xhrs[0].onload?.();
    });

    expect(cancelPosts()).toHaveLength(0);
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().entries[0].status).toBe("failed");
    expect(useFileStore.getState().processing).toBe(false);
  });

  it.each(["422", "error", "timeout"] as const)(
    "ignores a kept request's late %s once a new run has started (#2240)",
    (outcome) => {
      const file = image("photo.png");
      useFileStore.getState().setFiles([file]);
      const hook = renderHook(() => useToolProcessor("resize"));
      act(() => {
        hook.result.current.processFiles([file], { width: 50 });
      });
      act(() => {
        xhrs[0].upload.onload?.();
      });

      hook.unmount();
      act(() => {
        useFileStore.getState().setError(null);
        useFileStore.getState().setProcessing(true);
      });

      act(() => {
        if (outcome === "422") {
          xhrs[0].status = 422;
          xhrs[0].responseText = JSON.stringify({ error: "Processing failed" });
          xhrs[0].onload?.();
        } else if (outcome === "error") {
          xhrs[0].onerror?.();
        } else {
          xhrs[0].ontimeout?.();
        }
      });

      expect(useFileStore.getState().processing).toBe(true);
      expect(useFileStore.getState().error).toBeNull();
      expect(MockEventSource.instances[0].close).toHaveBeenCalled();
      expect(cancelPosts()).toHaveLength(0);
    },
  );

  it("cancels once and aborts when a progress frame arrived before unmount (#2240)", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "single",
          jobId: JOB_ID,
          phase: "processing",
          percent: 40,
        }),
      } as MessageEvent);
    });

    hook.unmount();

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(1);

    // Even if a late 202 slips past abort(), it does not fire a second cancel.
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });
    expect(cancelPosts()).toHaveLength(1);
  });

  it("settles a 202 run being followed over the progress stream", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });

    hook.unmount();

    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.entries[0]).toMatchObject({
      status: "failed",
      error: INTERRUPTED,
      errorCategory: "processing_error",
    });
    expect(state.activeJobId).toBeNull();
    expect(cancelPosts()).toHaveLength(1);
  });

  it("settles every file of a batch in flight, and reports why it ended", () => {
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });
    expect(useFileStore.getState().processing).toBe(true);

    hook.unmount();

    expect(xhrs[0].abort).toHaveBeenCalled();
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.entries).toMatchObject([
      { status: "failed", error: INTERRUPTED, errorCategory: "processing_error" },
      { status: "failed", error: INTERRUPTED, errorCategory: "processing_error" },
    ]);
    expect(state.activeJobId).toBeNull();
    expect(cancelPosts()).toHaveLength(0);
    // Not the "server never confirmed" signal the evidence timer reports.
    expect(vi.mocked(track)).toHaveBeenCalledWith(
      "batch_processed",
      expect.objectContaining({ status: "failed", reason: "panel-unmounted" }),
    );
  });

  it("keeps a batch request after the upload finished and cancels when the 202 arrives (#2240)", () => {
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
    });

    hook.unmount();

    expect(xhrs[0].abort).not.toHaveBeenCalled();
    expect(MockEventSource.instances.at(-1)?.close).not.toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(0);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries).toMatchObject([
      { status: "failed", error: INTERRUPTED, errorCategory: "processing_error" },
      { status: "failed", error: INTERRUPTED, errorCategory: "processing_error" },
    ]);

    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });

    expect(cancelPosts()).toHaveLength(1);
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
  });

  it("cancels and aborts a kept batch request when a batch progress frame arrives after unmount (#2240)", () => {
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onload?.();
    });

    hook.unmount();

    expect(xhrs[0].abort).not.toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(0);

    act(() => {
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "processing",
          totalFiles: 2,
          completedFiles: 0,
          failedFiles: 0,
          errors: [],
        }),
      } as MessageEvent);
    });

    expect(cancelPosts()).toHaveLength(1);
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    expect(xhrs[0].abort).toHaveBeenCalled();
  });

  it("cancels and aborts a batch immediately on unmount when a progress frame already arrived (#2240)", () => {
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });
    act(() => {
      xhrs[0].upload.onprogress?.(
        new ProgressEvent("progress", { loaded: 100, total: 100, lengthComputable: true }),
      );
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "processing",
          totalFiles: 2,
          completedFiles: 1,
          failedFiles: 0,
          errors: [],
        }),
      } as MessageEvent);
    });

    hook.unmount();

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(1);
  });

  it.each(["completed", "failed"] as const)(
    "sends no cancel and closes the kept batch request when a terminal %s frame arrives after unmount (#2240)",
    (status) => {
      const files = [image("one.png"), image("two.png")];
      useFileStore.getState().setFiles(files);
      const hook = renderHook(() => useToolProcessor("resize"));
      act(() => {
        void hook.result.current.processAllFiles(files, { width: 50 });
      });
      act(() => {
        xhrs[0].upload.onprogress?.(
          new ProgressEvent("progress", { loaded: 100, total: 100, lengthComputable: true }),
        );
      });

      hook.unmount();

      act(() => {
        MockEventSource.instances.at(-1)?.onmessage?.({
          data: JSON.stringify({
            type: "batch",
            jobId: JOB_ID,
            status,
            totalFiles: 2,
            completedFiles: 2,
            failedFiles: status === "failed" ? 2 : 0,
            errors: [],
          }),
        } as MessageEvent);
      });

      expect(cancelPosts()).toHaveLength(0);
      expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
      expect(xhrs[0].abort).toHaveBeenCalled();
    },
  );

  it.each(["200", "error", "timeout"] as const)(
    "closes a kept batch request without canceling on a late %s (#2240)",
    (outcome) => {
      const files = [image("one.png"), image("two.png")];
      useFileStore.getState().setFiles(files);
      const hook = renderHook(() => useToolProcessor("resize"));
      act(() => {
        void hook.result.current.processAllFiles(files, { width: 50 });
      });
      act(() => {
        xhrs[0].upload.onload?.();
      });

      hook.unmount();

      act(() => {
        if (outcome === "200") {
          xhrs[0].status = 200;
          xhrs[0].response = new Blob([]);
          xhrs[0].onload?.();
        } else if (outcome === "error") {
          xhrs[0].onerror?.();
        } else {
          xhrs[0].ontimeout?.();
        }
      });

      expect(cancelPosts()).toHaveLength(0);
      expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    },
  );

  // #2151: every conversion preset shares one panel that reads its tool id from
  // the route, so moving between presets changes the hook's toolId without an
  // unmount. That re-runs the effect that aborts the request and closes the
  // stream, and it has to settle the run it stops just as an unmount does.
  describe("a tool id change under the same panel (#2151)", () => {
    function startAsyncRun(hook: { result: { current: ReturnType<typeof useToolProcessor> } }) {
      const file = image("photo.png");
      useFileStore.getState().setFiles([file]);
      act(() => {
        hook.result.current.processFiles([file], {});
      });
      act(() => {
        xhrs[0].status = 202;
        xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
        xhrs[0].onload?.();
      });
    }

    it("settles a run being followed over the progress stream", () => {
      const hook = renderHook(({ toolId }) => useToolProcessor(toolId), {
        initialProps: { toolId: "jpg-to-png" },
      });
      startAsyncRun(hook);
      expect(useFileStore.getState().activeJobId).toBe(JOB_ID);

      hook.rerender({ toolId: "png-to-webp" });

      expect(xhrs[0].abort).toHaveBeenCalled();
      expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
      const state = useFileStore.getState();
      expect(state.processing).toBe(false);
      expect(state.error).toBe(INTERRUPTED);
      expect(state.entries[0]).toMatchObject({
        status: "failed",
        error: INTERRUPTED,
        errorCategory: "processing_error",
      });
      expect(state.activeJobId).toBeNull();
      expect(cancelPosts()).toHaveLength(1);

      hook.unmount();
      // The unmount that follows has nothing left to settle.
      expect(cancelPosts()).toHaveLength(1);
    });

    it("settles a single-file run still uploading", () => {
      const file = image("photo.png");
      useFileStore.getState().setFiles([file]);
      const hook = renderHook(({ toolId }) => useToolProcessor(toolId), {
        initialProps: { toolId: "jpg-to-png" },
      });
      act(() => {
        hook.result.current.processFiles([file], {});
      });
      expect(useFileStore.getState().processing).toBe(true);

      hook.rerender({ toolId: "png-to-webp" });

      expect(xhrs[0].abort).toHaveBeenCalled();
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "failed",
        error: INTERRUPTED,
        errorCategory: "processing_error",
      });
      expect(cancelPosts()).toHaveLength(0);
    });

    it("keeps an uploaded run's request across a tool id change and cancels when the 202 arrives (#2151, #2240)", () => {
      const file = image("photo.png");
      useFileStore.getState().setFiles([file]);
      const hook = renderHook(({ toolId }) => useToolProcessor(toolId), {
        initialProps: { toolId: "jpg-to-png" },
      });
      act(() => {
        hook.result.current.processFiles([file], {});
      });
      act(() => {
        xhrs[0].upload.onload?.();
      });

      hook.rerender({ toolId: "png-to-webp" });

      expect(xhrs[0].abort).not.toHaveBeenCalled();
      expect(useFileStore.getState().processing).toBe(false);
      expect(cancelPosts()).toHaveLength(0);

      hook.unmount();
      // Unmounting after the preset switch must not abort the kept request either.
      expect(xhrs[0].abort).not.toHaveBeenCalled();
      expect(cancelPosts()).toHaveLength(0);

      act(() => {
        xhrs[0].status = 202;
        xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
        xhrs[0].onload?.();
      });

      expect(cancelPosts()).toHaveLength(1);
      expect(MockEventSource.instances[0].close).toHaveBeenCalled();
    });

    it("reports an unexpected cancel failure under the stopped run's toolId after a preset switch (#2151, #2240)", async () => {
      fetchMock.mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        json: () => {
          throw new Error("corrupt response");
        },
      }));
      const file = image("photo.png");
      useFileStore.getState().setFiles([file]);
      const hook = renderHook(({ toolId }) => useToolProcessor(toolId), {
        initialProps: { toolId: "jpg-to-png" },
      });
      act(() => {
        hook.result.current.processFiles([file], {});
      });
      act(() => {
        xhrs[0].upload.onload?.();
      });

      hook.rerender({ toolId: "png-to-webp" });
      await act(async () => {
        xhrs[0].status = 202;
        xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
        xhrs[0].onload?.();
      });

      expect(vi.mocked(captureHandledError)).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Ending a tool run after its panel unmounted failed",
        }),
        { error_class: "bug", tool_id: "jpg-to-png" },
      );
    });

    it("does not cancel a settling batch a second time when a preset switch is followed by unmount without a store reset (#2151, #2240)", () => {
      const download = new Promise<Blob>(() => {});
      fetchMock.mockImplementation(async (url: string) =>
        url === CANCEL_URL
          ? new Response(null, { status: 409 })
          : { ok: true, status: 200, blob: () => download },
      );
      const files = [image("one.png"), image("two.png")];
      useFileStore.getState().setFiles(files);
      const hook = renderHook(({ toolId }) => useToolProcessor(toolId), {
        initialProps: { toolId: "jpg-to-png" },
      });
      act(() => {
        void hook.result.current.processAllFiles(files, {});
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
              downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize.zip`,
              zipFilename: "batch-resize.zip",
              fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
              processedSize: 16,
            },
          }),
        } as MessageEvent);
      });

      hook.rerender({ toolId: "png-to-webp" });
      expect(cancelPosts()).toHaveLength(1);

      hook.unmount();
      expect(cancelPosts()).toHaveLength(1);
    });

    it("settles a batch in flight", () => {
      const files = [image("one.png"), image("two.png")];
      useFileStore.getState().setFiles(files);
      const hook = renderHook(({ toolId }) => useToolProcessor(toolId), {
        initialProps: { toolId: "jpg-to-png" },
      });
      act(() => {
        void hook.result.current.processAllFiles(files, {});
      });

      hook.rerender({ toolId: "png-to-webp" });

      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().entries).toMatchObject([
        { status: "failed", error: INTERRUPTED, errorCategory: "processing_error" },
        { status: "failed", error: INTERRUPTED, errorCategory: "processing_error" },
      ]);
      expect(vi.mocked(track)).toHaveBeenCalledWith(
        "batch_processed",
        expect.objectContaining({ tool_id: "jpg-to-png", reason: "panel-unmounted" }),
      );
    });

    it("drops a batch's ZIP that arrives after the page reset the store for the next tool", async () => {
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
      const hook = renderHook(
        ({ toolId }) => {
          const processor = useToolProcessor(toolId);
          // biome-ignore lint/correctness/useExhaustiveDependencies: toolId is the trigger, as on the tool page
          useEffect(() => {
            useFileStore.getState().reset();
          }, [toolId]);
          return processor;
        },
        { initialProps: { toolId: "jpg-to-png" } },
      );
      act(() => {
        void hook.result.current.processAllFiles(files, {});
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
              downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize.zip`,
              zipFilename: "batch-resize.zip",
              fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
              processedSize: bytes.length,
            },
          }),
        } as MessageEvent);
      });

      hook.rerender({ toolId: "png-to-webp" });
      deliverZip(new Blob([bytes.slice().buffer], { type: "application/zip" }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const state = useFileStore.getState();
      expect(state.entries).toHaveLength(0);
      expect(state.batchZipBlob).toBeNull();
      expect(state.processing).toBe(false);
      expect(state.activeJobId).toBeNull();
      expect(vi.mocked(track)).not.toHaveBeenCalledWith(
        "batch_processed",
        expect.objectContaining({ status: "completed" }),
      );
      // Nothing is left for the unmount that follows to cancel again.
      hook.unmount();
      expect(cancelPosts()).toHaveLength(1);
    });

    // The tool page resets the file store in an effect keyed on the tool id. React
    // runs every cleanup before any effect body, so the settle goes first and the
    // reset has the last word: the next tool starts from a clean store.
    it("leaves a clean store once the tool page's reset has run after it", () => {
      const hook = renderHook(
        ({ toolId }) => {
          const processor = useToolProcessor(toolId);
          // biome-ignore lint/correctness/useExhaustiveDependencies: toolId is the trigger, as on the tool page
          useEffect(() => {
            useFileStore.getState().reset();
          }, [toolId]);
          return processor;
        },
        { initialProps: { toolId: "jpg-to-png" } },
      );
      startAsyncRun(hook);

      hook.rerender({ toolId: "png-to-webp" });

      const state = useFileStore.getState();
      expect(cancelPosts()).toHaveLength(1);
      expect(state.entries).toHaveLength(0);
      expect(state.error).toBeNull();
      expect(state.processing).toBe(false);
      expect(state.activeJobId).toBeNull();
    });
  });

  it("leaves the store alone when no run is in flight", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    useFileStore.getState().updateEntry(0, { status: "completed", processedUrl: "/done.png" });
    const hook = renderHook(() => useToolProcessor("resize"));

    hook.unmount();

    const state = useFileStore.getState();
    expect(state.error).toBeNull();
    expect(state.entries[0]).toMatchObject({ status: "completed", processedUrl: "/done.png" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a finished run's result alone", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
    });
    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify({
        jobId: "job-1",
        downloadUrl: "/api/v1/download/job-1/photo.png",
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
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });

    // "Clear all" empties the store and the panel goes with it.
    act(() => {
      useFileStore.getState().reset();
    });
    hook.unmount();

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries).toHaveLength(0);
    expect(vi.mocked(track)).not.toHaveBeenCalledWith("batch_processed", expect.anything());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw out of the cleanup when ending a batch fails, and reports it", () => {
    const real = useFileStore.getState().setProcessing;
    // The panel reads setProcessing when it renders, so the break goes in first.
    // Only the clear throws: starting the run must work.
    vi.spyOn(useFileStore.getState(), "setProcessing").mockImplementation((value) => {
      if (!value) throw new Error("boom");
      real(value);
    });
    try {
      const files = [image("one.png"), image("two.png")];
      useFileStore.getState().setFiles(files);
      const hook = renderHook(() => useToolProcessor("resize"));
      act(() => {
        void hook.result.current.processAllFiles(files, { width: 50 });
      });

      expect(() => hook.unmount()).not.toThrow();

      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
        "Ending a tool run after its panel unmounted failed",
      );
      expect(useFileStore.getState().entries).toMatchObject([
        { status: "failed", error: INTERRUPTED, errorCategory: "processing_error" },
        { status: "failed", error: INTERRUPTED, errorCategory: "processing_error" },
      ]);
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
    // Everything but the cancel POST is the durable ZIP download.
    fetchMock.mockImplementation(async (url: string) =>
      url === CANCEL_URL
        ? new Response(JSON.stringify({ canceled: false }))
        : { ok: true, status: 200, blob: () => download },
    );
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });
    // The socket dies after the upload; the terminal frame points at the ZIP.
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize.zip`,
            zipFilename: "batch-resize.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: bytes.length,
          },
        }),
      } as MessageEvent);
    });

    hook.unmount();
    deliverZip(new Blob([bytes.slice().buffer], { type: "application/zip" }));

    await vi.waitFor(() => expect(useFileStore.getState().processing).toBe(false), {
      timeout: 3_000,
    });
    expect(useFileStore.getState().entries.map((e) => e.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(useFileStore.getState().batchZipBlob).not.toBeNull();
  });

  it("drops an unmounted settling batch's ZIP when a new run with its own activeJobId has started (#2637)", async () => {
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
        ? new Response(null, { status: 409 })
        : { ok: true, status: 200, blob: () => download },
    );
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize.zip`,
            zipFilename: "batch-resize.zip",
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
    expect(state.activeJobId).toBe("77777777-7777-4777-8777-777777777777");
    expect(state.batchZipBlob).toBeNull();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      status: "processing",
      processedUrl: null,
    });
    expect(vi.mocked(track)).not.toHaveBeenCalledWith(
      "batch_processed",
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("drops an unmounted settling batch's ZIP when a new sync single-file run has started, even without an intervening reset (#2637)", async () => {
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
        ? new Response(null, { status: 409 })
        : { ok: true, status: 200, blob: () => download },
    );
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize.zip`,
            zipFilename: "batch-resize.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: bytes.length,
          },
        }),
      } as MessageEvent);
    });

    hook.unmount();
    const nextFile = image("single.png");
    useFileStore.getState().setFiles([nextFile]);
    const nextHook = renderHook(() => useToolProcessor("rotate"));
    act(() => {
      nextHook.result.current.processFiles([nextFile], { angle: 90 });
    });
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBeNull();

    await act(async () => {
      deliverZip(new Blob([bytes.slice().buffer], { type: "application/zip" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.batchZipBlob).toBeNull();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      status: "processing",
      processedUrl: null,
    });
    expect(vi.mocked(track)).not.toHaveBeenCalledWith(
      "batch_processed",
      expect.objectContaining({ status: "completed" }),
    );
    nextHook.unmount();
  });

  it("does not fail a new run when an unmounted settling batch's ZIP download returns 404 (#2637)", async () => {
    vi.useRealTimers();
    let resolveDownload: (res: Response) => void = () => {};
    const download = new Promise<Response>((resolve) => {
      resolveDownload = resolve;
    });
    fetchMock.mockImplementation((url: string) =>
      url === CANCEL_URL ? Promise.resolve(new Response(null, { status: 409 })) : download,
    );
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize.zip`,
            zipFilename: "batch-resize.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: 16,
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
      resolveDownload(new Response("not found", { status: 404 }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.error).toBeNull();
    expect(state.activeJobId).toBe("77777777-7777-4777-8777-777777777777");
    expect(state.entries[0].status).toBe("processing");
  });

  it("stops retrying a settling batch's ZIP download when a new run starts during retry backoff (#2637)", async () => {
    let downloadCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === CANCEL_URL) {
        return Promise.resolve(new Response(null, { status: 409 }));
      }
      downloadCalls++;
      return Promise.reject(new Error("network blip"));
    });
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize.zip`,
            zipFilename: "batch-resize.zip",
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

    hook.unmount();
    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next-run.png")]);
      useFileStore.getState().updateEntry(0, { status: "processing" });
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("77777777-7777-4777-8777-777777777777", null);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(downloadCalls).toBe(1);
    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.error).toBeNull();
    expect(state.activeJobId).toBe("77777777-7777-4777-8777-777777777777");
  });

  it("drops an unmounted sync 200 batch's ZIP when a new run starts while the ZIP is unpacking (#2637)", async () => {
    vi.useRealTimers();
    fetchMock.mockImplementation(async () => new Response(null, { status: 409 }));
    const zip = new AdmZip();
    zip.addFile("one_resize.png", Buffer.from([1, 2, 3, 4]));
    zip.addFile("two_resize.png", Buffer.from([5, 6]));
    const bytes = new Uint8Array(zip.toBuffer());
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });

    act(() => {
      xhrs[0].status = 200;
      xhrs[0].response = new Blob([bytes.slice().buffer], { type: "application/zip" });
      xhrs[0].getResponseHeader = vi.fn((name: string) =>
        name === "X-File-Results"
          ? encodeURIComponent(JSON.stringify({ "0": "one_resize.png", "1": "two_resize.png" }))
          : null,
      );
      xhrs[0].onload?.();
    });

    // Unmount while unpackBatchZip is still awaiting its async buffer read / unzip.
    hook.unmount();
    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next-run.png")]);
      useFileStore.getState().updateEntry(0, { status: "processing" });
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("77777777-7777-4777-8777-777777777777", null);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.activeJobId).toBe("77777777-7777-4777-8777-777777777777");
    expect(state.batchZipBlob).toBeNull();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      status: "processing",
      processedUrl: null,
    });
    expect(vi.mocked(track)).not.toHaveBeenCalledWith(
      "batch_processed",
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("does not overwrite a new run when a preset switch left a settling batch and the panel later unmounts (#2637)", () => {
    const download = new Promise<Blob>(() => {});
    fetchMock.mockImplementation(async (url: string) =>
      url === CANCEL_URL
        ? new Response(null, { status: 409 })
        : { ok: true, status: 200, blob: () => download },
    );
    const files = [image("one.png"), image("two.png")];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(
      ({ toolId }) => {
        const processor = useToolProcessor(toolId);
        // biome-ignore lint/correctness/useExhaustiveDependencies: toolId is the trigger, as on the tool page
        useEffect(() => {
          useFileStore.getState().reset();
        }, [toolId]);
        return processor;
      },
      { initialProps: { toolId: "jpg-to-png" } },
    );
    act(() => {
      void hook.result.current.processAllFiles(files, {});
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-resize.zip`,
            zipFilename: "batch-resize.zip",
            fileResults: { "0": "one_resize.png", "1": "two_resize.png" },
            processedSize: 16,
          },
        }),
      } as MessageEvent);
    });

    hook.rerender({ toolId: "png-to-webp" });
    act(() => {
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
    expect(cancelPosts()).toHaveLength(1);
  });
});
