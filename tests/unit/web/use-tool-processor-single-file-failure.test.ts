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
});
