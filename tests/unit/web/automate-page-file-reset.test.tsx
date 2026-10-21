// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  return { ...actual, generateId: () => "66666666-6666-4666-8666-666666666666" };
});

import { I18nProvider } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { AutomatePage } from "@/pages/automate-page";
import { useFileStore } from "@/stores/file-store";
import { usePipelineStore } from "@/stores/pipeline-store";

/**
 * #1122: a tool page hands /automate a run that is already over.
 * use-tool-processor aborts its request and closes its stream on unmount but
 * never clears the file store's processing flag, and nothing on this page owns
 * that flag afterwards. useWorkInFlight counts /automate as owning the file
 * store, so the leftovers had the navigation guard asking about finished work
 * on every navigation away, and raising beforeunload on every tab close, for as
 * long as the tab stayed open.
 *
 * #2634: leaving /automate mid-run cancels the pipeline job and resets
 * useFileStore on unmount, so the next route starts with processing: false.
 */

const JOB_ID = "66666666-6666-4666-8666-666666666666";
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

// This jsdom setup has no working localStorage; same Map-backed stub as
// avatar-dropdown-session-username.test.tsx.
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

function png(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

function cancelPosts() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(CANCEL_URL));
}

/** Land on /automate, optionally the way the file library navigates here. */
function arrive(state?: { libraryFileIds: string[] }, strict = false) {
  const tree = (
    <I18nProvider>
      <MemoryRouter initialEntries={[{ pathname: "/automate", state: state ?? null }]}>
        <Link to="/files" data-testid="go-files">
          Files
        </Link>
        <Routes>
          <Route path="/automate" element={<AutomatePage />} />
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
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
  Element.prototype.scrollIntoView = vi.fn();
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(CANCEL_URL)) {
      return Promise.resolve(new Response(JSON.stringify({ canceled: true }), { status: 200 }));
    }
    if (url.includes("/pipeline/list")) {
      return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
    }
    if (url.includes("/files/")) {
      return Promise.resolve(
        new Response("file-bytes", {
          headers: { "content-disposition": 'attachment; filename="from-library.png"' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
    );
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
  vi.mocked(captureHandledError).mockClear();
  useFileStore.getState().reset();
  usePipelineStore.getState().reset();
});

afterEach(() => {
  cleanup();
  // Before the globals go: reset revokes blob urls through the stubbed URL.
  useFileStore.getState().reset();
  usePipelineStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the automate page arrives with a clean file store", () => {
  // The flag the guard reads. Nothing on this page would ever clear it.
  it("clears a processing flag left behind by a tool page", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    useFileStore.getState().setProcessing(true);

    arrive();

    expect(useFileStore.getState().processing).toBe(false);
  });

  it("clears an untaken result left behind by a tool page", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    useFileStore
      .getState()
      .updateEntry(0, { processedUrl: "blob:result", processedFilename: "a-small.png" });

    arrive();

    expect(useFileStore.getState().entries).toEqual([]);
  });

  // The one arrival that carries its own files. Wiping on the way in would be
  // a race against the import, which lands them a tick later.
  it("still imports the files the library sent it", async () => {
    arrive({ libraryFileIds: ["file-1"] });

    await waitFor(() => expect(useFileStore.getState().entries).toHaveLength(1));
    expect(useFileStore.getState().entries[0].file.name).toBe("from-library.png");
  });
});

describe("AutomatePage resets file store and cancels active pipeline run on unmount (#2634)", () => {
  it("clears processing, entries, and error when navigating to /files mid-run while still canceling the server job", async () => {
    usePipelineStore.getState().loadSteps([{ toolId: "rotate", settings: { angle: 90 } }]);
    arrive();

    act(() => {
      useFileStore.getState().setFiles([png("photo.png")]);
    });

    fireEvent.click(screen.getByText(/^Process/));
    expect(useFileStore.getState().processing).toBe(true);
    expect(xhrs).toHaveLength(1);

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

  it("drops a degraded batch ZIP that finishes downloading after leaving /automate for /files", async () => {
    const zip = new AdmZip();
    zip.addFile("one_rotate.png", Buffer.from([1, 2, 3, 4]));
    zip.addFile("two_rotate.png", Buffer.from([5, 6]));
    const bytes = new Uint8Array(zip.toBuffer());
    let deliverZip: (blob: Blob) => void = () => {};
    const download = new Promise<Blob>((resolve) => {
      deliverZip = resolve;
    });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(CANCEL_URL)) {
        return Promise.resolve(new Response(JSON.stringify({ canceled: false }), { status: 200 }));
      }
      if (url.includes("/api/v1/download/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => download,
        } as unknown as Response);
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    usePipelineStore.getState().loadSteps([{ toolId: "rotate", settings: { angle: 90 } }]);
    arrive();

    act(() => {
      useFileStore.getState().setFiles([png("one.png"), png("two.png")]);
    });

    fireEvent.click(screen.getByText(/^Process/));

    act(() => {
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-pipeline.zip`,
            zipFilename: "batch-pipeline.zip",
            fileResults: { "0": "one_rotate.png", "1": "two_rotate.png" },
            processedSize: bytes.length,
          },
        }),
      } as MessageEvent);
    });

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

  it("drops a degraded batch ZIP even if a new run started on another page before the ZIP finished downloading", async () => {
    const zip = new AdmZip();
    zip.addFile("one_rotate.png", Buffer.from([1, 2, 3, 4]));
    zip.addFile("two_rotate.png", Buffer.from([5, 6]));
    const bytes = new Uint8Array(zip.toBuffer());
    let deliverZip: (blob: Blob) => void = () => {};
    const download = new Promise<Blob>((resolve) => {
      deliverZip = resolve;
    });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(CANCEL_URL)) {
        return Promise.resolve(new Response(JSON.stringify({ canceled: false }), { status: 200 }));
      }
      if (url.includes("/api/v1/download/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => download,
        } as unknown as Response);
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    usePipelineStore.getState().loadSteps([{ toolId: "rotate", settings: { angle: 90 } }]);
    arrive();

    act(() => {
      useFileStore.getState().setFiles([png("one.png"), png("two.png")]);
    });

    fireEvent.click(screen.getByText(/^Process/));

    act(() => {
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
            downloadUrl: `/api/v1/download/${JOB_ID}/batch-pipeline.zip`,
            zipFilename: "batch-pipeline.zip",
            fileResults: { "0": "one_rotate.png", "1": "two_rotate.png" },
            processedSize: bytes.length,
          },
        }),
      } as MessageEvent);
    });

    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    // Simulate a new run starting on another route before the old ZIP resolves.
    act(() => {
      useFileStore.getState().setFiles([png("next-route.png")]);
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("77777777-7777-4777-8777-777777777777", null);
    });

    await act(async () => {
      deliverZip(new Blob([bytes.slice().buffer], { type: "application/zip" }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const state = useFileStore.getState();
    expect(state.processing).toBe(true);
    expect(state.activeJobId).toBe("77777777-7777-4777-8777-777777777777");
    expect(state.batchZipBlob).toBeNull();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].file.name).toBe("next-route.png");
  });

  it("cancels an active pipeline run and resets the store under StrictMode when navigating to /files", async () => {
    usePipelineStore.getState().loadSteps([{ toolId: "rotate", settings: { angle: 90 } }]);
    arrive(undefined, true);

    act(() => {
      useFileStore.getState().setFiles([png("photo.png")]);
    });

    fireEvent.click(screen.getByText(/^Process/));
    expect(useFileStore.getState().processing).toBe(true);

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

  it("preserves files imported with libraryFileIds across StrictMode mount and resets them on real unmount", async () => {
    const view = arrive({ libraryFileIds: ["file-1"] }, true);

    await waitFor(() => expect(useFileStore.getState().entries).toHaveLength(1));
    expect(useFileStore.getState().entries[0].file.name).toBe("from-library.png");

    view.unmount();

    expect(useFileStore.getState().entries).toEqual([]);
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("aborts in-flight libraryFileIds downloads on unmount and does not overwrite files loaded on the next page (#2669)", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveDownload: (res: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/files/file-1/download")) {
        capturedSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveDownload = resolve;
        });
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    arrive({ libraryFileIds: ["file-1"] }, true);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    expect(capturedSignal?.aborted).toBe(true);

    act(() => {
      useFileStore.getState().setFiles([png("destination.png")]);
    });

    await act(async () => {
      resolveDownload(
        new Response("late-library-bytes", {
          headers: { "content-disposition": 'attachment; filename="from-library.png"' },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const entries = useFileStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].file.name).toBe("destination.png");
  });

  it("drops a libraryFileIds download whose response body resolves after unmount (#2669)", async () => {
    let blobCalled = false;
    let resolveBlob: (blob: Blob) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/files/file-1/download")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({
            "content-disposition": 'attachment; filename="from-library.png"',
          }),
          blob: () => {
            blobCalled = true;
            return new Promise<Blob>((resolve) => {
              resolveBlob = resolve;
            });
          },
        } as unknown as Response);
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    arrive({ libraryFileIds: ["file-1"] });
    await waitFor(() => expect(blobCalled).toBe(true));

    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    act(() => {
      useFileStore.getState().setFiles([png("destination.png")]);
    });

    await act(async () => {
      resolveBlob(new Blob(["late-library-bytes"], { type: "image/png" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const entries = useFileStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].file.name).toBe("destination.png");
  });

  it("drops a multi-file libraryFileIds import when one file finished before unmount and the remaining fetch fails after unmount (#2669)", async () => {
    let firstFileFinished = false;
    let secondSignal: AbortSignal | undefined;
    let rejectSecondDownload: (err: Error) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/files/file-1/download")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => {
              if (name.toLowerCase() === "content-disposition") {
                firstFileFinished = true;
                return 'attachment; filename="first-library.png"';
              }
              return null;
            },
          },
          blob: () => Promise.resolve(new Blob(["first-file-bytes"], { type: "image/png" })),
        } as unknown as Response);
      }
      if (url.includes("/files/file-2/download")) {
        secondSignal = init?.signal ?? undefined;
        return new Promise<Response>((_, reject) => {
          rejectSecondDownload = reject;
        });
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    arrive({ libraryFileIds: ["file-1", "file-2"] }, true);
    await waitFor(() => expect(firstFileFinished).toBe(true));

    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();
    expect(secondSignal?.aborted).toBe(true);

    act(() => {
      useFileStore.getState().setFiles([png("destination.png")]);
    });

    await act(async () => {
      rejectSecondDownload(new DOMException("Aborted", "AbortError"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const entries = useFileStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].file.name).toBe("destination.png");
  });

  it("guards the file store reset on unmount so a throwing reset reports and does not crash unmount", () => {
    const view = arrive();

    const realReset = useFileStore.getState().reset;
    vi.spyOn(useFileStore.getState(), "reset").mockImplementation(() => {
      throw new Error("reset-boom");
    });

    try {
      expect(() => view.unmount()).not.toThrow();
    } finally {
      useFileStore.setState({ reset: realReset });
    }

    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
      "Ending a pipeline run after its panel unmounted failed",
    );
  });

  it("aborts in-flight libraryFileIds downloads when the user drops a file on /automate and does not overwrite it (#3162)", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveDownload: (res: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/files/slow-file/download")) {
        capturedSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveDownload = resolve;
        });
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    arrive({ libraryFileIds: ["slow-file"] });
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.drop(screen.getByRole("region", { name: en.dropzone.ariaLabel }), {
      dataTransfer: { files: [png("dropped.png")] },
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["dropped.png"]);

    await act(async () => {
      resolveDownload(
        new Response("slow-library-bytes", {
          headers: { "content-disposition": 'attachment; filename="slow-library.png"' },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["dropped.png"]);
  });

  it("aborts in-flight libraryFileIds downloads when importing from the library modal on /automate (#3162)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let capturedSignal: AbortSignal | undefined;
    let rejectSlowDownload: (err: Error) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/files/slow-file/download")) {
        capturedSignal = init?.signal ?? undefined;
        return new Promise<Response>((_, reject) => {
          rejectSlowDownload = reject;
        });
      }
      if (url.includes("/files/modal-file/download")) {
        return Promise.resolve(new Response("modal-bytes", { status: 200 }));
      }
      if (url.includes("/api/v1/files")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              files: [{ id: "modal-file", originalName: "modal.png", mimeType: "image/png" }],
              total: 1,
            }),
          ),
        );
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    arrive({ libraryFileIds: ["slow-file"] });
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(screen.getAllByText(en.automate.importFromLibrary)[0]);
    fireEvent.click(await screen.findByText("modal.png"));
    fireEvent.click(screen.getByText(en.commonUi.fileLibrary.importCount.replace("{count}", "1")));

    await waitFor(() =>
      expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["modal.png"]),
    );
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      rejectSlowDownload(new DOMException("Aborted", "AbortError"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["modal.png"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("aborts in-flight libraryFileIds downloads only when handleAddMore picks at least one file (#3162)", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveSlowDownload: (res: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/files/slow-file/download")) {
        capturedSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveSlowDownload = resolve;
        });
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    useFileStore.getState().setFiles([png("existing.png")]);
    arrive({ libraryFileIds: ["slow-file"] });
    expect(capturedSignal?.aborted).toBe(false);

    const createdInputs: HTMLInputElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = realCreate(tag);
      if (tag === "input") {
        createdInputs.push(el as HTMLInputElement);
        (el as HTMLInputElement).click = () => {};
      }
      return el;
    }) as typeof document.createElement);

    // Empty file picker selection (user canceled dialog) leaves the download running.
    fireEvent.click(screen.getByText(en.automate.addButton));
    const emptyInput = createdInputs.at(-1);
    if (!emptyInput) throw new Error("handleAddMore created no file input");
    Object.defineProperty(emptyInput, "files", { value: [] });
    act(() => {
      emptyInput.onchange?.({ target: emptyInput } as unknown as Event);
    });
    expect(capturedSignal?.aborted).toBe(false);

    // Picking a file aborts the slow libraryFileIds download and appends the picked file.
    fireEvent.click(screen.getByText(en.automate.addButton));
    const pickedInput = createdInputs.at(-1);
    if (!pickedInput) throw new Error("handleAddMore created no file input");
    Object.defineProperty(pickedInput, "files", { value: [png("added.png")] });
    act(() => {
      pickedInput.onchange?.({ target: pickedInput } as unknown as Event);
    });
    expect(capturedSignal?.aborted).toBe(true);
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual([
      "existing.png",
      "added.png",
    ]);

    await act(async () => {
      resolveSlowDownload(
        new Response("slow-library-bytes", {
          headers: { "content-disposition": 'attachment; filename="slow-library.png"' },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual([
      "existing.png",
      "added.png",
    ]);
  });

  it("surfaces an alert, resets stale file store state, and logs each failure when all libraryFileIds downloads fail, including on mobile and when res.blob() rejects (#3162)", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/files/missing-1/download")) {
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }
      if (url.includes("/files/missing-2/download")) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      if (url.includes("/files/corrupt-3/download")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          blob: () => Promise.reject(new TypeError("Stream reset")),
        } as unknown as Response);
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    useFileStore.getState().setFiles([png("stale-from-tool.png")]);
    useFileStore.getState().setProcessing(true);
    arrive({ libraryFileIds: ["missing-1", "missing-2", "corrupt-3"] });

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 3 of 3 files.");
    expect(useFileStore.getState().entries).toEqual([]);
    expect(useFileStore.getState().processing).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(3);
    expect(consoleError).toHaveBeenCalledWith(
      "[automate-page] failed to download file missing-1",
      expect.objectContaining({ message: "HTTP 404" }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[automate-page] failed to download file missing-2",
      expect.objectContaining({ message: "Failed to fetch" }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[automate-page] failed to download file corrupt-3",
      expect.objectContaining({ message: "Stream reset" }),
    );

    fireEvent.click(screen.getByLabelText(en.common.close));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("loads the valid files, surfaces a partial-failure alert, and clears the alert when files are cleared (#3162)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/files/good-file/download")) {
        return Promise.resolve(
          new Response("good-bytes", {
            headers: { "content-disposition": 'attachment; filename="good.png"' },
          }),
        );
      }
      if (url.includes("/files/bad-file/download")) {
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    arrive({ libraryFileIds: ["good-file", "bad-file"] });

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["good.png"]);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[automate-page] failed to download file bad-file",
      expect.objectContaining({ message: "HTTP 404" }),
    );

    fireEvent.click(screen.getByText(en.automate.clearButton));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(useFileStore.getState().entries).toEqual([]);
  });

  it("aborts in-flight libraryFileIds downloads when the Clear button is clicked mid-download (#3162)", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveSlowDownload: (res: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/files/slow-file/download")) {
        capturedSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveSlowDownload = resolve;
        });
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    useFileStore.getState().setFiles([png("existing.png")]);
    arrive({ libraryFileIds: ["slow-file"] });
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByText(en.automate.clearButton));
    expect(capturedSignal?.aborted).toBe(true);
    expect(useFileStore.getState().entries).toEqual([]);

    await act(async () => {
      resolveSlowDownload(
        new Response("slow-library-bytes", {
          headers: { "content-disposition": 'attachment; filename="slow-library.png"' },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(useFileStore.getState().entries).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears an active libraryImportFailed alert when selecting files via Dropzone, FileLibraryModal, or handleAddMore (#3162)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/files/good-file/download")) {
        return Promise.resolve(
          new Response("good-bytes", {
            headers: { "content-disposition": 'attachment; filename="good.png"' },
          }),
        );
      }
      if (url.includes("/files/bad-file/download")) {
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }
      if (url.includes("/files/modal-file/download")) {
        return Promise.resolve(new Response("modal-bytes", { status: 200 }));
      }
      if (url.includes("/api/v1/files")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              files: [{ id: "modal-file", originalName: "modal.png", mimeType: "image/png" }],
              total: 1,
            }),
          ),
        );
      }
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    // 1. Total failure alert cleared by dropping a file onto Dropzone (handleFiles).
    const firstView = arrive({ libraryFileIds: ["bad-file"] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 1 files.");
    fireEvent.drop(screen.getByRole("region", { name: en.dropzone.ariaLabel }), {
      dataTransfer: { files: [png("dropped.png")] },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    firstView.unmount();

    // 2. Total failure alert cleared by importing from FileLibraryModal (handleLibraryImport).
    const secondView = arrive({ libraryFileIds: ["bad-file"] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 1 files.");
    fireEvent.click(screen.getAllByText(en.automate.importFromLibrary)[0]);
    fireEvent.click(await screen.findByText("modal.png"));
    fireEvent.click(screen.getByText(en.commonUi.fileLibrary.importCount.replace("{count}", "1")));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    secondView.unmount();

    // 3. Partial failure alert preserved when handleAddMore is canceled, then cleared when a file is picked.
    const createdInputs: HTMLInputElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = realCreate(tag);
      if (tag === "input") {
        createdInputs.push(el as HTMLInputElement);
        (el as HTMLInputElement).click = () => {};
      }
      return el;
    }) as typeof document.createElement);

    arrive({ libraryFileIds: ["good-file", "bad-file"] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");

    fireEvent.click(screen.getByText(en.automate.addButton));
    const emptyInput = createdInputs.at(-1);
    if (!emptyInput) throw new Error("handleAddMore created no file input");
    Object.defineProperty(emptyInput, "files", { value: [] });
    act(() => {
      emptyInput.onchange?.({ target: emptyInput } as unknown as Event);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");

    fireEvent.click(screen.getByText(en.automate.addButton));
    const pickedInput = createdInputs.at(-1);
    if (!pickedInput) throw new Error("handleAddMore created no file input");
    Object.defineProperty(pickedInput, "files", { value: [png("added.png")] });
    act(() => {
      pickedInput.onchange?.({ target: pickedInput } as unknown as Event);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
