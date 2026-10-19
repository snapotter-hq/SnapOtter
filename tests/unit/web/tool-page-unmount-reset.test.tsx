// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdmZip from "adm-zip";
import { StrictMode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "44444444-4444-4444-8444-444444444444" };
});

import { I18nProvider } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { ToolPage } from "@/pages/tool-page";
import { useBase64Store } from "@/stores/base64-store";
import { useCollageStore } from "@/stores/collage-store";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useFileStore } from "@/stores/file-store";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";
import { useMemeStore } from "@/stores/meme-store";
import { useMultiToolStore } from "@/stores/multi-tool-store";
import { useOrganizeStore } from "@/stores/organize-store";
import { usePassportPhotoStore } from "@/stores/passport-photo-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useQrStore } from "@/stores/qr-store";
import { useSplitStore } from "@/stores/split-store";

const JOB_ID = "44444444-4444-4444-8444-444444444444";
const CANCEL_URL = `/api/v1/jobs/${JOB_ID}/cancel`;

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

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

let xhrs: MockXhr[];
let fetchMock: ReturnType<typeof vi.fn>;

function png(name = "photo.png"): File {
  return new File(["png-bytes"], name, { type: "image/png" });
}

function cancelPosts() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(CANCEL_URL));
}

function renderRoutes(
  initialEntry: string | { pathname: string; state?: unknown },
  strict = false,
) {
  const tree = (
    <I18nProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Link to="/files" data-testid="go-files">
          Files
        </Link>
        <Link to="/image/split" data-testid="go-split">
          Split
        </Link>
        <Routes>
          <Route path="/:section/:toolId" element={<ToolPage />} />
          <Route path="/files" element={<div data-testid="files-page">Files Page</div>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  storageMap.clear();
  xhrs = [];
  MockEventSource.instances = [];
  vi.stubGlobal("localStorage", localStorageMock);
  let blobSeq = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:tool-page-input-${++blobSeq}`),
      revokeObjectURL: vi.fn(),
    }),
  );
  Element.prototype.scrollIntoView = vi.fn();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(CANCEL_URL)) {
      return new Response(JSON.stringify({ canceled: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ authEnabled: false }), { status: 200 });
  });
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
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
  vi.mocked(captureHandledError).mockClear();
  useFileStore.getState().reset();
  useBase64Store.getState().reset();
  useCollageStore.getState().reset();
  useDuplicateStore.getState().reset();
  useMemeStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  usePdfToImageStore.getState().reset();
  useQrStore.getState().reset();
  useSplitStore.getState().reset();
  useHtmlToImageStore.getState().reset();
  useMultiToolStore.getState().clear();
  useOrganizeStore.getState().clear();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  useBase64Store.getState().reset();
  useCollageStore.getState().reset();
  useDuplicateStore.getState().reset();
  useMemeStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  usePdfToImageStore.getState().reset();
  useQrStore.getState().reset();
  useSplitStore.getState().reset();
  useHtmlToImageStore.getState().reset();
  useMultiToolStore.getState().clear();
  useOrganizeStore.getState().clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ToolPage resets file and tool stores on unmount (#1122)", () => {
  it("clears processing, entries, and error when navigating to /files mid-run while still canceling the server job", async () => {
    renderRoutes("/image/rotate");

    await act(async () => {
      useFileStore.getState().setFiles([png()]);
    });

    const rotateRight = await screen.findByTestId("rotate-right");
    fireEvent.click(rotateRight);
    fireEvent.click(screen.getByTestId("rotate-submit"));

    expect(useFileStore.getState().processing).toBe(true);
    expect(xhrs).toHaveLength(1);
    act(() => {
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "single",
          jobId: JOB_ID,
          phase: "processing",
          percent: 25,
        }),
      } as MessageEvent);
    });

    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(1);
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBeNull();
    expect(state.entries).toEqual([]);
    expect(state.activeJobId).toBeNull();
  });

  it("stops a file-store-watched scan (barcode-read) and clears processing when leaving for /files mid-run", async () => {
    renderRoutes("/image/barcode-read");

    await act(async () => {
      useFileStore.getState().setFiles([png("code-1.png"), png("code-2.png")]);
    });

    const submit = await screen.findByTestId("barcode-read-submit");
    fireEvent.click(submit);

    expect(useFileStore.getState().processing).toBe(true);
    expect(xhrs).toHaveLength(1);

    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    expect(xhrs[0].abort).toHaveBeenCalled();
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.entries).toEqual([]);
    expect(xhrs).toHaveLength(1);
  });

  it("drops a degraded batch ZIP that finishes downloading after leaving the tool page for /files", async () => {
    const zip = new AdmZip();
    zip.addFile("one_rotate.png", Buffer.from([1, 2, 3, 4]));
    zip.addFile("two_rotate.png", Buffer.from([5, 6]));
    const bytes = new Uint8Array(zip.toBuffer());
    let deliverZip: (blob: Blob) => void = () => {};
    const download = new Promise<Blob>((resolve) => {
      deliverZip = resolve;
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(CANCEL_URL)) {
        return new Response(JSON.stringify({ canceled: false }), { status: 200 });
      }
      if (url.includes("/api/v1/download/")) {
        return { ok: true, status: 200, blob: () => download } as unknown as Response;
      }
      return new Response(JSON.stringify({ authEnabled: false }), { status: 200 });
    });

    renderRoutes("/image/rotate");

    await act(async () => {
      useFileStore.getState().setFiles([png("one.png"), png("two.png")]);
    });

    const rotateRight = await screen.findByTestId("rotate-right");
    fireEvent.click(rotateRight);
    fireEvent.click(screen.getByTestId("rotate-submit"));

    await act(async () => {
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-rotate.zip`,
            zipFilename: "batch-rotate.zip",
            fileResults: { "0": "one_rotate.png", "1": "two_rotate.png" },
            processedSize: bytes.length,
          },
        }),
      } as MessageEvent);
    });

    // Leave for /files while the batch ZIP download is still in flight.
    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries).toEqual([]);

    await act(async () => {
      deliverZip(new Blob([bytes.slice().buffer], { type: "application/zip" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.entries).toEqual([]);
    expect(state.batchZipBlob).toBeNull();
  });

  it("resets own-store tool stores when ToolPage unmounts", async () => {
    const view = renderRoutes("/image/split");

    act(() => {
      useSplitStore.setState({ processing: true, zipBlobUrl: "blob:split.zip" });
      useBase64Store.setState({ processing: true });
      useCollageStore.setState({ phase: "processing", resultUrl: "blob:collage.png" });
      useDuplicateStore.setState({ scanning: true });
      useMemeStore.setState({
        phase: "result",
        generating: true,
        resultUrl: "/api/v1/download/meme.png",
      });
      usePassportPhotoStore.setState({ analyzing: true, generating: true });
      usePdfToImageStore.setState({ processing: true, zipUrl: "/api/v1/download/pdf.zip" });
      useHtmlToImageStore.setState({ capturing: true, resultUrl: "blob:capture.png" });
      useQrStore.setState({ textData: "https://snapotter.com" });
      useMultiToolStore.getState().setPrimary(png("doc.pdf"), 4);
      useOrganizeStore.getState().setDocument(png("doc.pdf"), 3);
    });

    view.unmount();

    expect(useSplitStore.getState().processing).toBe(false);
    expect(useSplitStore.getState().zipBlobUrl).toBeNull();
    expect(useBase64Store.getState().processing).toBe(false);
    expect(useCollageStore.getState().phase).toBe("upload");
    expect(useCollageStore.getState().resultUrl).toBeNull();
    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(useMemeStore.getState().phase).toBe("gallery");
    expect(useMemeStore.getState().generating).toBe(false);
    expect(useMemeStore.getState().resultUrl).toBeNull();
    expect(usePassportPhotoStore.getState().analyzing).toBe(false);
    expect(usePassportPhotoStore.getState().generating).toBe(false);
    expect(usePdfToImageStore.getState().processing).toBe(false);
    expect(useHtmlToImageStore.getState().capturing).toBe(false);
    expect(useQrStore.getState().textData).toBe("");
    expect(useMultiToolStore.getState().docs).toEqual([]);
    expect(useOrganizeStore.getState().pageCount).toBe(0);
  });

  it("settles a 202 async run and wipes the store under StrictMode when navigating to /files", async () => {
    renderRoutes("/image/rotate", true);

    await act(async () => {
      useFileStore.getState().setFiles([png()]);
    });

    const rotateRight = await screen.findByTestId("rotate-right");
    fireEvent.click(rotateRight);
    fireEvent.click(screen.getByTestId("rotate-submit"));

    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: JOB_ID, async: true });
      xhrs[0].onload?.();
    });
    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);

    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    expect(MockEventSource.instances.at(-1)?.close).toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(1);
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBeNull();
    expect(state.entries).toEqual([]);
    expect(state.activeJobId).toBeNull();
  });

  it("aborts a useSettleOnUnmount panel (favicon) and wipes its interrupted error when leaving ToolPage", async () => {
    renderRoutes("/image/favicon");

    await act(async () => {
      useFileStore.getState().setFiles([png()]);
    });

    const submit = await screen.findByTestId("favicon-submit");
    fireEvent.click(submit);
    expect(useFileStore.getState().processing).toBe(true);

    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    expect(xhrs[0].abort).toHaveBeenCalled();
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBeNull();
    expect(state.entries).toEqual([]);
  });

  it("guards each store reset on unmount and tool-to-tool navigation so a throwing reset reports with the outgoing toolId and still resets the rest", () => {
    const view = renderRoutes("/image/rotate");
    act(() => {
      useSplitStore.setState({ processing: true });
    });

    const realReset = useFileStore.getState().reset;
    const boom = new Error("reset-boom");
    vi.spyOn(useFileStore.getState(), "reset").mockImplementation(() => {
      throw boom;
    });

    try {
      expect(() => fireEvent.click(screen.getByTestId("go-split"))).not.toThrow();
      expect(useSplitStore.getState().processing).toBe(false);
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
        "Ending a tool run after its panel unmounted failed",
      );
      expect(vi.mocked(captureHandledError).mock.calls[0][0].cause).toBe(boom);
      expect(vi.mocked(captureHandledError).mock.calls[0][1]).toEqual({
        error_class: "bug",
        tool_id: "rotate",
      });

      vi.mocked(captureHandledError).mockClear();
      act(() => {
        useSplitStore.setState({ processing: true });
      });

      expect(() => view.unmount()).not.toThrow();
    } finally {
      useFileStore.setState({ reset: realReset });
    }

    expect(useSplitStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
      "Ending a tool run after its panel unmounted failed",
    );
    expect(vi.mocked(captureHandledError).mock.calls[0][0].cause).toBe(boom);
    expect(vi.mocked(captureHandledError).mock.calls[0][1]).toEqual({
      error_class: "bug",
      tool_id: "split",
    });
  });

  it("cancels an active server job and wipes the file store when switching directly to another tool route mid-run", async () => {
    renderRoutes("/image/rotate");

    await act(async () => {
      useFileStore.getState().setFiles([png()]);
      useMultiToolStore.getState().setPrimary(png("doc.pdf"), 4);
    });

    const rotateRight = await screen.findByTestId("rotate-right");
    fireEvent.click(rotateRight);
    fireEvent.click(screen.getByTestId("rotate-submit"));

    expect(useFileStore.getState().processing).toBe(true);
    expect(xhrs).toHaveLength(1);
    act(() => {
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "single",
          jobId: JOB_ID,
          phase: "processing",
          percent: 25,
        }),
      } as MessageEvent);
    });

    fireEvent.click(screen.getByTestId("go-split"));

    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(cancelPosts()).toHaveLength(1);
    const state = useFileStore.getState();
    expect(state.processing).toBe(false);
    expect(state.error).toBeNull();
    expect(state.entries).toEqual([]);
    expect(state.activeJobId).toBeNull();
    expect(useMultiToolStore.getState().docs).toEqual([]);
  });

  it("preserves files imported with fromLibrary: true across StrictMode mount and resets them on real unmount", async () => {
    useFileStore.getState().setFiles([png("from-library.png")]);

    const view = renderRoutes({ pathname: "/image/rotate", state: { fromLibrary: true } }, true);

    expect(useFileStore.getState().entries).toHaveLength(1);
    expect(useFileStore.getState().entries[0].file.name).toBe("from-library.png");

    view.unmount();

    expect(useFileStore.getState().entries).toEqual([]);
    expect(useFileStore.getState().processing).toBe(false);
  });
});
