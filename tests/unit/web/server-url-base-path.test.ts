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

import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { resolveServerUrls, serverUrl } from "@/lib/app-url";
import { useFileStore } from "@/stores/file-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import type { PipelineStep } from "@/stores/pipeline-store";

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

  it("leaves user content alone even when it looks like an API path", () => {
    // A QR code that encodes "/api/v1/foo" must read back exactly that.
    const barcodeRead = {
      downloadUrl: "/api/v1/download/job/annotated.png",
      barcodes: [{ type: "QRCode", text: "/api/v1/foo" }],
      text: "/api/v1/ocr-line",
    };
    expect(resolveServerUrls(barcodeRead)).toEqual({
      downloadUrl: "/snapotter/api/v1/download/job/annotated.png",
      barcodes: [{ type: "QRCode", text: "/api/v1/foo" }],
      text: "/api/v1/ocr-line",
    });
  });
});

interface MockXhr {
  status: number;
  responseText: string;
  timeout: number;
  upload: { onload?: (() => void) | null };
  onload?: () => void;
  onerror?: (() => void) | null;
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

const STEPS = [
  { id: "s1", toolId: "resize", settings: { width: 50 } },
] as unknown as PipelineStep[];

describe("usePipelineProcessor under /snapotter", () => {
  it("resolves a synchronous pipeline result against the deployment path", () => {
    const file = stageFile();
    const { result: hook, unmount } = renderHook(() => usePipelineProcessor());
    act(() => {
      hook.current.processSingle(file, STEPS);
    });
    expect(xhrs[0].open.mock.calls[0][1]).toMatch(/^\/snapotter\/api\/v1\/pipeline\//);

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

  it("resolves a pipeline result recovered over SSE against the deployment path", () => {
    const file = stageFile();
    const { result: hook, unmount } = renderHook(() => usePipelineProcessor());
    act(() => {
      hook.current.processSingle(file, STEPS);
    });
    // The upload finished but the response socket died: the run settles from SSE.
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    const sse = MockEventSource.instances.at(-1);
    expect(sse?.url).toMatch(/^\/snapotter\/api\/v1\/jobs\/[^/]+\/progress$/);

    act(() => {
      sse?.onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", percent: 100, result }),
      } as MessageEvent);
    });

    expect(useFileStore.getState().entries[0].processedUrl).toBe(
      "/snapotter/api/v1/download/job-1/photo_resize.png",
    );
    unmount();
  });
});

describe("pdf-to-image store under /snapotter", () => {
  it("resolves nested page links and the ZIP link", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pages: [{ page: 1, downloadUrl: "/api/v1/download/job-2/page-1.png", size: 10 }],
        zipUrl: "/api/v1/download/job-2/pages.zip",
        zipSize: 20,
      }),
    });
    vi.stubGlobal("fetch", fetch);
    usePdfToImageStore.setState({
      file: new File([new Uint8Array([1])], "doc.pdf", { type: "application/pdf" }),
    });

    await usePdfToImageStore.getState().convert();

    expect(fetch.mock.calls[0][0]).toBe("/snapotter/api/v1/tools/pdf/pdf-to-image");
    const state = usePdfToImageStore.getState();
    expect(state.results?.[0].downloadUrl).toBe("/snapotter/api/v1/download/job-2/page-1.png");
    expect(state.zipUrl).toBe("/snapotter/api/v1/download/job-2/pages.zip");
  });
});
