// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
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
  parseApiError: (body: { code?: string }) =>
    body?.code === "feature_not_installed"
      ? { type: "feature_not_installed", featureName: "Background Removal" }
      : "error",
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "33333333-3333-4333-8333-333333333333" };
});

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  status: number;
  responseText: string;
  timeout: number;
  upload: { onprogress?: unknown; onload?: (() => void) | null };
  onload?: () => void;
  onerror?: (() => void) | null;
  ontimeout?: (() => void) | null;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
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

function latestSse(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

function sendSingleFrame(frame: Record<string, unknown>) {
  latestSse().onmessage?.({
    data: JSON.stringify({ type: "single", jobId: JOB_ID, ...frame }),
  } as MessageEvent);
}

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
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "XMLHttpRequest",
    vi.fn(() => {
      const xhr: MockXhr = {
        status: 0,
        responseText: "",
        timeout: 0,
        upload: {},
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
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

/**
 * #799: a failed single-file run must settle the entry to "failed", not
 * leave it at the kickoff's "processing". The tool page derives the pulse
 * from status === "processing" and gates the failure screen on
 * status === "failed", so an unsettled entry pulses on the untouched
 * original forever with only the settings-panel error banner showing.
 * Single-file twin of the batch fix in #798 (#746).
 */
describe("useToolProcessor single-file failure settle (#799)", () => {
  function startRun() {
    const file = new File([new ArrayBuffer(64)], "clip.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles([file], { startS: 0, endS: 2 });
    });
    return hook;
  }

  it("settles the entry to failed on a non-2xx response", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 500;
      xhrs[0].responseText = JSON.stringify({ error: "boom" });
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "error",
      processedUrl: null,
    });
    expect(useFileStore.getState().error).toBe("error");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed on a non-2xx response with an unreadable body", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 500;
      xhrs[0].responseText = "<html>bad gateway</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing failed: 500",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed on a pre-upload 502 with a non-JSON body", () => {
    const { unmount } = startRun();

    act(() => {
      // An intermediary 502 with an HTML body normally degrades to async,
      // but the upload never finished here so no job can exist server-side:
      // degradeToAsync declines and this is a real failure.
      xhrs[0].status = 502;
      xhrs[0].responseText = "<html>Bad Gateway</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing failed: 502",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed when the socket dies mid-upload", () => {
    const { unmount } = startRun();

    act(() => {
      // No upload.onload: the body never fully left the browser, so this is
      // a real failure, not the #722 degrade-to-async recovery.
      xhrs[0].onerror?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing was interrupted. Retry when reconnected.",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed on a client timeout mid-upload", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].ontimeout?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Request timed out - the server may be overloaded. Try again.",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("keeps the entry processing when a post-upload socket drop degrades to async", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    // The #722 recovery: the job is live server-side; SSE will settle it.
    expect(useFileStore.getState().entries[0].status).toBe("processing");
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("keeps the entry processing when a post-upload timeout degrades to async", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].ontimeout?.();
    });

    expect(useFileStore.getState().entries[0].status).toBe("processing");
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("settles the entry to failed on a post-upload 5xx the app itself emitted", () => {
    const { unmount } = startRun();

    act(() => {
      // A JSON body means the app answered (html-to-image's own 504), not an
      // intermediary standing in for a dead sync wait: a real failure, no
      // degrade even though the upload finished.
      xhrs[0].upload.onload?.();
      xhrs[0].status = 504;
      xhrs[0].responseText = JSON.stringify({ error: "render timeout" });
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "error",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("carries the feature-not-installed message onto the failed entry", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 409;
      xhrs[0].responseText = JSON.stringify({ code: "feature_not_installed" });
      xhrs[0].onload?.();
    });

    const entry = useFileStore.getState().entries[0];
    expect(entry.status).toBe("failed");
    expect(entry.error).toContain('requires the "Background Removal" feature');
    expect(useFileStore.getState().error).toBe(entry.error);

    unmount();
  });

  it("does not clobber an SSE-completed entry on a late non-2xx response", () => {
    const { unmount } = startRun();

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

    act(() => {
      // An onload task queued before the SSE settle dispatches after it;
      // the status guard must leave the completed result alone.
      xhrs[0].status = 502;
      xhrs[0].responseText = "<html>Bad Gateway</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: "/api/v1/download/server-job/clip_trimmed.mp4",
    });

    unmount();
  });

  it("settles the entry to failed when the SSE reports the job failed", () => {
    const { unmount } = startRun();

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "boom" });
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "boom",
    });
    expect(useFileStore.getState().error).toBe("boom");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed on a 2xx with an unparseable body", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = "<html>not json</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Invalid response from server",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed when the job-evidence timeout fires", () => {
    const { unmount } = startRun();

    // Degrade first (#722): upload finished, socket died, no frame ever
    // proves the job exists, so the evidence timeout is the terminal path.
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().entries[0].status).toBe("processing");

    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error:
        "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed when cancel finds no job server-side", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    const cancel = useFileStore.getState().cancelCurrentJob;
    expect(cancel).not.toBeNull();
    await act(async () => {
      await cancel?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Canceled",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("the failure sweep leaves completed and pending siblings alone", () => {
    const files = ["a.mp4", "b.mp4", "c.mp4"].map(
      (name) => new File([new ArrayBuffer(64)], name, { type: "video/mp4" }),
    );
    useFileStore.getState().setFiles(files);
    // File A already carries a delivered result from an earlier run.
    useFileStore.getState().updateEntry(0, { status: "completed", processedUrl: "blob:done" });
    useFileStore.getState().setSelectedIndex(1);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles(files, { startS: 0, endS: 2 });
    });

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "boom" });
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: "blob:done",
    });
    expect(useFileStore.getState().entries[1]).toMatchObject({
      status: "failed",
      error: "boom",
    });
    expect(useFileStore.getState().entries[2].status).toBe("pending");

    hook.unmount();
  });

  it("falls back to a generic message when the failed frame carries no error", () => {
    const { unmount } = startRun();

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0 });
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing failed",
    });
    expect(useFileStore.getState().error).toBe("Processing failed");

    unmount();
  });

  it("fails the entry the run started with, not the currently selected one", () => {
    const fileA = new File([new ArrayBuffer(64)], "a.mp4", { type: "video/mp4" });
    const fileB = new File([new ArrayBuffer(64)], "b.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([fileA, fileB]);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles([fileA, fileB], { startS: 0, endS: 2 });
    });

    act(() => {
      // The user browses to the other file while the run is in flight.
      useFileStore.getState().setSelectedIndex(1);
      xhrs[0].onerror?.();
    });

    expect(useFileStore.getState().entries[0].status).toBe("failed");
    expect(useFileStore.getState().entries[1].status).toBe("pending");

    hook.unmount();
  });
});
