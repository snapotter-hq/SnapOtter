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
  return { ...actual, generateId: () => "11111111-1111-4111-8111-111111111111" };
});

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  status: number;
  responseText: string;
  timeout: number;
  upload: { onprogress?: unknown; onload?: unknown };
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

describe("useToolProcessor SSE recovery", () => {
  it("reconnects after a transport stall and accepts the terminal replay", () => {
    const file = new File([new ArrayBuffer(64)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const { result, unmount } = renderHook(() => useToolProcessor("upscale"));

    act(() => {
      result.current.processFiles([file], {});
    });
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "server-job", async: true });
      xhrs[0].onload?.();
    });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(useFileStore.getState().activeJobId).toBe("11111111-1111-4111-8111-111111111111");

    act(() => {
      vi.advanceTimersByTime(300_001);
    });

    expect(MockEventSource.instances[0].close).toHaveBeenCalledOnce();
    expect(MockEventSource.instances).toHaveLength(2);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().activeJobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(useFileStore.getState().entries[0].status).toBe("processing");

    act(() => {
      vi.advanceTimersByTime(300_001);
    });

    expect(MockEventSource.instances[1].close).toHaveBeenCalledOnce();
    expect(MockEventSource.instances).toHaveLength(3);
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      MockEventSource.instances[2].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          percent: 100,
          result: {
            jobId: "server-job",
            downloadUrl: "/api/v1/download/server-job/upscaled.png",
            originalSize: 64,
            processedSize: 128,
          },
        }),
      } as MessageEvent);
    });

    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: "/api/v1/download/server-job/upscaled.png",
      processedSize: 128,
    });

    unmount();
  });
});
