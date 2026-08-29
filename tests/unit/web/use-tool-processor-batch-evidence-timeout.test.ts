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
  return { ...actual, generateId: () => "44444444-4444-4444-8444-444444444444" };
});

import { useToolProcessor } from "@/hooks/use-tool-processor";
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

/**
 * #929: the job-evidence timeout is a terminal failure, not a recovery. When
 * it tears down a degraded batch run it nulls batchRunRef without settling
 * the entries, so every file keeps pulsing at "processing" with only the
 * banner showing. Batch flavor of the single-file settles in the same issue.
 */
describe("useToolProcessor batch job-evidence timeout settle (#929)", () => {
  it("settles all processing entries when the evidence timeout ends a degraded batch", () => {
    const files = [
      new File([new ArrayBuffer(16)], "first.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "second.jpg", { type: "image/jpeg" }),
    ];
    useFileStore.getState().setFiles(files);
    const hook = renderHook(() => useToolProcessor("resize"));
    act(() => {
      void hook.result.current.processAllFiles(files, { width: 50 });
    });

    // Upload finished, POST died, no batch frame ever arrives: the degrade
    // (#750) hands the run to the evidence timeout.
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().entries.map((e) => e.status)).toEqual([
      "processing",
      "processing",
    ]);

    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    const entries = useFileStore.getState().entries;
    expect(entries[0]).toMatchObject({
      status: "failed",
      error:
        "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
    });
    expect(entries[1].status).toBe("failed");
    expect(useFileStore.getState().processing).toBe(false);

    hook.unmount();
  });
});
