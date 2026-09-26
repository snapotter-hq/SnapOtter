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

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  status: number;
  responseText: string;
  timeout: number;
  upload: { onprogress?: unknown; onload?: (() => void) | null };
  onload?: () => void;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) {}
}

let xhrs: MockXhr[];

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  useFileStore.getState().reset();
  xhrs = [];
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
});

function jpeg(name: string): File {
  return new File([new ArrayBuffer(64)], name, { type: "image/jpeg" });
}

describe("useToolProcessor batch run clears the last single run's payload (#1272)", () => {
  it("does not carry a single run's resizedTo into a batch", () => {
    const single = jpeg("a.jpg");
    useFileStore.getState().setFiles([single]);
    const hook = renderHook(() => useToolProcessor("compress"));

    act(() => {
      hook.result.current.processFiles([single], { mode: "targetSize", targetSizeKb: 20 });
    });
    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify({
        jobId: "11111111-1111-4111-8111-111111111111",
        downloadUrl: "/api/v1/download/x/a.jpg",
        originalSize: 90_000,
        processedSize: 19_000,
        targetKb: 20,
        resizedTo: { width: 400, height: 300 },
      });
      xhrs[0].onload?.();
    });
    expect(hook.result.current.resultPayload?.resizedTo).toEqual({ width: 400, height: 300 });

    const batch = [jpeg("b.jpg"), jpeg("c.jpg")];
    useFileStore.getState().setFiles(batch);
    act(() => {
      void hook.result.current.processAllFiles(batch, { mode: "targetSize", targetSizeKb: 100 });
    });

    expect(hook.result.current.resultPayload).toBeNull();
    hook.unmount();
  });
});
