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
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
}

let xhrs: MockXhr[];

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

function stageLibraryFile() {
  const file = new File([new ArrayBuffer(64)], "photo.png", { type: "image/png" });
  useFileStore.getState().setFiles([file]);
  useFileStore.getState().updateEntry(0, { serverFileId: "lib-original" });
  return file;
}

function completeRun(xhr: MockXhr, savedFileId: string) {
  xhr.status = 200;
  xhr.responseText = JSON.stringify({
    jobId: "job-1",
    downloadUrl: "/api/v1/download/job-1/photo_resize.png",
    originalSize: 64,
    processedSize: 32,
    savedFileId,
  });
  xhr.onload?.();
}

describe("useToolProcessor library save mode (issue #495)", () => {
  it("sends the chosen saveMode with the library fileId", async () => {
    const file = stageLibraryFile();
    useFileStore.getState().setLibrarySaveMode("overwrite");
    const { result, unmount } = renderHook(() => useToolProcessor("resize"));

    act(() => {
      result.current.processFiles([file], {});
    });

    const sent = xhrs[0].send.mock.calls[0][0] as FormData;
    expect(sent.get("fileId")).toBe("lib-original");
    expect(sent.get("saveMode")).toBe("overwrite");
    unmount();
  });

  it("keeps serverFileId anchored to the original in 'new' mode", async () => {
    const file = stageLibraryFile();
    const { result, unmount } = renderHook(() => useToolProcessor("resize"));

    act(() => {
      result.current.processFiles([file], {});
    });
    act(() => {
      completeRun(xhrs[0], "lib-copy");
    });

    expect(useFileStore.getState().entries[0].serverFileId).toBe("lib-original");
    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("lib-copy");
    unmount();
  });

  it("re-anchors serverFileId to the saved version in 'overwrite' mode", async () => {
    const file = stageLibraryFile();
    useFileStore.getState().setLibrarySaveMode("overwrite");
    const { result, unmount } = renderHook(() => useToolProcessor("resize"));

    act(() => {
      result.current.processFiles([file], {});
    });
    act(() => {
      completeRun(xhrs[0], "lib-v2");
    });

    expect(useFileStore.getState().entries[0].serverFileId).toBe("lib-v2");
    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("lib-v2");
    unmount();
  });

  it("sends no saveMode for files that are not from the library", async () => {
    const file = new File([new ArrayBuffer(64)], "plain.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const { result, unmount } = renderHook(() => useToolProcessor("resize"));

    act(() => {
      result.current.processFiles([file], {});
    });

    const sent = xhrs[0].send.mock.calls[0][0] as FormData;
    expect(sent.get("fileId")).toBeNull();
    expect(sent.get("saveMode")).toBeNull();
    unmount();
  });

  it("keeps serverFileId anchored to the original on the async SSE path in 'new' mode", async () => {
    const file = stageLibraryFile();
    const { result, unmount } = renderHook(() => useToolProcessor("resize"));

    act(() => {
      result.current.processFiles([file], {});
    });
    // 202 accepted: completion arrives via the SSE progress stream instead
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });
    act(() => {
      MockEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: {
            jobId: "job-1",
            downloadUrl: "/api/v1/download/job-1/photo_resize.png",
            originalSize: 64,
            processedSize: 32,
            savedFileId: "lib-copy",
          },
        }),
      } as MessageEvent);
    });

    expect(useFileStore.getState().entries[0].serverFileId).toBe("lib-original");
    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("lib-copy");
    unmount();
  });

  it("re-anchors serverFileId on the async SSE path in 'overwrite' mode", async () => {
    const file = stageLibraryFile();
    useFileStore.getState().setLibrarySaveMode("overwrite");
    const { result, unmount } = renderHook(() => useToolProcessor("resize"));

    act(() => {
      result.current.processFiles([file], {});
    });
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });
    act(() => {
      MockEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: {
            jobId: "job-1",
            downloadUrl: "/api/v1/download/job-1/photo_resize.png",
            originalSize: 64,
            processedSize: 32,
            savedFileId: "lib-v2",
          },
        }),
      } as MessageEvent);
    });

    expect(useFileStore.getState().entries[0].serverFileId).toBe("lib-v2");
    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("lib-v2");
    unmount();
  });

  it("clears the saved indicator when a batch run starts", async () => {
    const fileA = new File([new ArrayBuffer(64)], "a.png", { type: "image/png" });
    const fileB = new File([new ArrayBuffer(64)], "b.png", { type: "image/png" });
    useFileStore.getState().setFiles([fileA, fileB]);
    useFileStore.getState().setLastSavedLibraryFileId("lib-stale");
    const { result, unmount } = renderHook(() => useToolProcessor("compress"));

    act(() => {
      result.current.processAllFiles([fileA, fileB], {});
    });

    expect(useFileStore.getState().lastSavedLibraryFileId).toBeNull();
    unmount();
  });

  it("clears the previous saved indicator when a new run starts", async () => {
    const file = stageLibraryFile();
    const { result, unmount } = renderHook(() => useToolProcessor("resize"));

    act(() => {
      result.current.processFiles([file], {});
    });
    act(() => {
      completeRun(xhrs[0], "lib-copy");
    });
    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("lib-copy");

    act(() => {
      result.current.processFiles([file], {});
    });
    expect(useFileStore.getState().lastSavedLibraryFileId).toBeNull();
    unmount();
  });
});
