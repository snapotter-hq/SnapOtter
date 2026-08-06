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
  parseApiError: () => "error",
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "22222222-2222-4222-8222-222222222222" };
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

const JOB_ID = "22222222-2222-4222-8222-222222222222";

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
 * #722: the POST socket dying AFTER the upload finished (proxy idle timeout
 * on the sync wait, network blip) must not abandon the job. The server keeps
 * running it under clientJobId and the SSE channel delivers the result; the
 * client degrades to the async path exactly as if a 202 had arrived.
 */
describe("useToolProcessor upload interruption (#722)", () => {
  function startRun() {
    const file = new File([new ArrayBuffer(64)], "clip.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles([file], { startS: 0, endS: 2 });
    });
    return hook;
  }

  it("degrades to the async path when the socket dies after the upload", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    // Not an error: the job is live server-side and tracked via SSE.
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

    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: "/api/v1/download/server-job/clip_trimmed.mp4",
    });

    unmount();
  });

  it("still fails when the socket dies mid-upload", () => {
    const { unmount } = startRun();

    act(() => {
      // No upload.onload: the request body never fully left the browser, so
      // no job can exist server-side.
      xhrs[0].onerror?.();
    });

    expect(useFileStore.getState().error).toBe(
      "Processing was interrupted. Retry when reconnected.",
    );
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();

    unmount();
  });

  it("surfaces the error when no job evidence ever arrives", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().processing).toBe(true);

    // Only heartbeats: the server never saw the request tail, no job exists.
    act(() => {
      latestSse().onmessage?.({
        data: JSON.stringify({ type: "heartbeat" }),
      } as MessageEvent);
      vi.advanceTimersByTime(30_001);
    });

    expect(useFileStore.getState().error).toBe(
      "Processing was interrupted. Retry when reconnected.",
    );
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();

    unmount();
  });

  it("keeps waiting once a progress frame proves the job exists", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    act(() => {
      sendSingleFrame({ phase: "processing", percent: 40, stage: "Processing" });
      vi.advanceTimersByTime(60_000);
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

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

    unmount();
  });

  it("degrades on a client timeout after the upload as well", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].ontimeout?.();
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);

    unmount();
  });
});
