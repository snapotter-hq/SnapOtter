// @vitest-environment jsdom

// Result URLs from the API are root-relative ("/api/v1/download/..."), so the
// web app has to resolve them against its deployment path (#1274). The <base>
// tag is set before any module loads because BASE_PATH is read at import.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  document.head.innerHTML = '<base href="/snapotter/">';
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  getDistinctId: vi.fn(() => "test-distinct-id"),
}));

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { resolveServerUrls, serverUrl } from "@/lib/app-url";
import { useFileStore } from "@/stores/file-store";

describe("serverUrl under /snapotter", () => {
  it("prefixes root-relative API paths", () => {
    expect(serverUrl("/api/v1/download/job/a.png")).toBe("/snapotter/api/v1/download/job/a.png");
  });

  it.each([
    "blob:http://host/3f2a",
    "data:image/png;base64,AAAA",
    "https://cdn.example.com/a.png",
    "/snapotter/api/v1/download/job/a.png",
    "/login",
  ])("leaves %s unchanged", (url) => {
    expect(serverUrl(url)).toBe(url);
  });

  it("passes empty values through", () => {
    expect(serverUrl(null)).toBeNull();
    expect(serverUrl(undefined)).toBeUndefined();
    expect(serverUrl("")).toBe("");
  });

  it("resolves every API path in a nested response and leaves the rest alone", () => {
    const response = {
      jobId: "job",
      downloadUrl: "/api/v1/download/job/out.zip",
      pages: [{ page: 1, downloadUrl: "/api/v1/download/job/p1.png", width: 10 }],
      extra: { maskUrl: "/api/v1/download/job/m.png", note: "keep /api/ mid-string" },
      blob: "blob:http://host/1",
      count: 2,
      ok: true,
      missing: null,
    };
    expect(resolveServerUrls(response)).toEqual({
      ...response,
      downloadUrl: "/snapotter/api/v1/download/job/out.zip",
      pages: [{ page: 1, downloadUrl: "/snapotter/api/v1/download/job/p1.png", width: 10 }],
      extra: { maskUrl: "/snapotter/api/v1/download/job/m.png", note: "keep /api/ mid-string" },
    });
    expect(resolveServerUrls(resolveServerUrls(response))).toEqual(resolveServerUrls(response));
  });
});

interface MockXhr {
  status: number;
  responseText: string;
  timeout: number;
  upload: Record<string, unknown>;
  onload?: () => void;
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

const result = {
  jobId: "job-1",
  downloadUrl: "/api/v1/download/job-1/photo_resize.png",
  previewUrl: "/api/v1/download/job-1/preview.webp",
  originalSize: 64,
  processedSize: 32,
};

function stageFile() {
  const file = new File([new ArrayBuffer(64)], "photo.png", { type: "image/png" });
  useFileStore.getState().setFiles([file]);
  return file;
}

describe("useToolProcessor under /snapotter", () => {
  it("resolves a synchronous result against the deployment path", () => {
    const file = stageFile();
    const { result: hook, unmount } = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.current.processFiles([file], {});
    });
    expect(xhrs[0].open.mock.calls[0][1]).toBe("/snapotter/api/v1/tools/image/resize");

    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = JSON.stringify(result);
      xhrs[0].onload?.();
    });

    const entry = useFileStore.getState().entries[0];
    expect(entry.processedUrl).toBe("/snapotter/api/v1/download/job-1/photo_resize.png");
    expect(entry.processedPreviewUrl).toBe("/snapotter/api/v1/download/job-1/preview.webp");
    unmount();
  });

  it("resolves an SSE completion against the deployment path", () => {
    const file = stageFile();
    const { result: hook, unmount } = renderHook(() => useToolProcessor("resize"));
    act(() => {
      hook.current.processFiles([file], {});
    });
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhrs[0].onload?.();
    });
    expect(MockEventSource.instances[0].url).toMatch(
      /^\/snapotter\/api\/v1\/jobs\/[^/]+\/progress$/,
    );

    act(() => {
      MockEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result }),
      } as MessageEvent);
    });

    const entry = useFileStore.getState().entries[0];
    expect(entry.processedUrl).toBe("/snapotter/api/v1/download/job-1/photo_resize.png");
    expect(entry.processedPreviewUrl).toBe("/snapotter/api/v1/download/job-1/preview.webp");
    unmount();
  });
});
