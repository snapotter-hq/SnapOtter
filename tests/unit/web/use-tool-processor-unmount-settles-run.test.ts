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
  it("settles a single-file run in flight and cancels its job", () => {
    const file = image("photo.png");
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.result.current.processFiles([file], { width: 50 });
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
    expect(state.entries[0].status).toBe("failed");
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

    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.entries.map((e) => e.status)).toEqual(["failed", "failed"]);
    expect(state.activeJobId).toBeNull();
    expect(cancelPosts()).toHaveLength(1);
    // Not the "server never confirmed" signal the evidence timer reports.
    expect(vi.mocked(track)).toHaveBeenCalledWith(
      "batch_processed",
      expect.objectContaining({ status: "failed", reason: "panel-unmounted" }),
    );
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
      expect(useFileStore.getState().entries.map((e) => e.status)).toEqual(["failed", "failed"]);
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
});
