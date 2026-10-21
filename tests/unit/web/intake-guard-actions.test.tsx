// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const showIgnored = vi.hoisted(() => vi.fn());
const showUnsupported = vi.hoisted(() => vi.fn());
vi.mock("@/lib/intake-notice", () => ({
  showIntakeIgnored: showIgnored,
  showUnsupportedFileType: showUnsupported,
}));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { I18nProvider } from "@/contexts/i18n-context";
import { AutomatePage } from "@/pages/automate-page";
import { ToolPage } from "@/pages/tool-page";
import { useFileStore } from "@/stores/file-store";
import { usePassportPhotoStore } from "@/stores/passport-photo-store";
import { usePipelineStore } from "@/stores/pipeline-store";

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

function png(name: string): File {
  return new File(["img"], name, { type: "image/png" });
}

function renderToolPage(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:section/:toolId" element={<ToolPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function renderAutomatePage(state?: { libraryFileIds?: string[] }) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[{ pathname: "/automate", state: state ?? null }]}>
        <Routes>
          <Route path="/automate" element={<AutomatePage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  storageMap.clear();
  showIgnored.mockClear();
  showUnsupported.mockClear();
  vi.stubGlobal("localStorage", localStorageMock);
  let blobCounter = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => `blob:original-input-${++blobCounter}`,
    revokeObjectURL: () => {},
  });
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
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
      return Promise.resolve(
        new Response(
          JSON.stringify({
            authEnabled: false,
            pageCount: 1,
            thumbnails: [],
            bundles: [],
          }),
          { status: 200 },
        ),
      );
    }),
  );
  useFileStore.getState().reset();
  usePipelineStore.getState().reset();
  usePassportPhotoStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  usePipelineStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ToolPage handleUndo and startOver intake guard (#2652)", () => {
  it("refuses ReviewPanel Undo and New file while another entry's run is in flight", async () => {
    renderToolPage("/image/resize");
    await act(async () => {
      useFileStore.getState().setFiles([png("a.png"), png("b.png")]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "blob:done-a",
        processedFilename: "a-resized.png",
        processedSize: 120,
      });
      useFileStore.getState().updateEntry(1, { status: "processing" });
      useFileStore.getState().setSelectedIndex(0);
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("job-b", null);
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.adjustSettings }));
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe("job-b");
    expect(useFileStore.getState().entries[0].status).toBe("completed");
    expect(useFileStore.getState().entries[0].processedUrl).toBe("blob:done-a");

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.newFile }));
    expect(showIgnored).toHaveBeenCalledTimes(2);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe("job-b");
    expect(useFileStore.getState().entries).toHaveLength(2);
  });

  it("refuses failure-card Try again and Try a different file while another entry's run is in flight", async () => {
    renderToolPage("/image/resize");
    await act(async () => {
      useFileStore.getState().setFiles([png("a.png"), png("b.png")]);
      useFileStore.getState().updateEntry(0, {
        status: "failed",
        error: "Resize failed on a.png",
      });
      useFileStore.getState().updateEntry(1, { status: "processing" });
      useFileStore.getState().setSelectedIndex(0);
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("job-b", null);
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.tryAgain }));
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe("job-b");
    expect(useFileStore.getState().entries[0].status).toBe("failed");

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.tryDifferentFile }));
    expect(showIgnored).toHaveBeenCalledTimes(2);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().entries).toHaveLength(2);
  });

  it.each([
    ["analyzing", () => usePassportPhotoStore.setState({ analyzing: true })],
    ["generating", () => usePassportPhotoStore.setState({ generating: true })],
  ])(
    "refuses ReviewPanel Undo and New file on /image/passport-photo while %s is in flight",
    async (_phase, markBusy) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise<Response>(() => {})),
      );
      renderToolPage("/image/passport-photo");
      await act(async () => {
        useFileStore.getState().setFiles([png("portrait.png")]);
        useFileStore.getState().updateEntry(0, {
          status: "completed",
          processedUrl: "blob:sheet",
          processedFilename: "sheet.png",
          processedSize: 512,
        });
        markBusy();
      });

      fireEvent.click(screen.getByRole("button", { name: en.toolPage.adjustSettings }));
      expect(showIgnored).toHaveBeenCalledTimes(1);
      expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
      expect(useFileStore.getState().entries[0].processedUrl).toBe("blob:sheet");

      fireEvent.click(screen.getByRole("button", { name: en.toolPage.newFile }));
      expect(showIgnored).toHaveBeenCalledTimes(2);
      expect(useFileStore.getState().entries).toHaveLength(1);
    },
  );

  it("allows ReviewPanel and failure-card Undo and New file actions when no run is in flight", async () => {
    renderToolPage("/image/resize");
    await act(async () => {
      useFileStore.getState().setFiles([png("a.png")]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "blob:done-a",
        processedFilename: "a-resized.png",
        processedSize: 120,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.adjustSettings }));
    expect(showIgnored).not.toHaveBeenCalled();
    expect(useFileStore.getState().entries[0].status).toBe("pending");
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();

    await act(async () => {
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "blob:done-a",
        processedFilename: "a-resized.png",
        processedSize: 120,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.newFile }));
    expect(showIgnored).not.toHaveBeenCalled();
    expect(useFileStore.getState().entries).toHaveLength(0);

    await act(async () => {
      useFileStore.getState().setFiles([png("failed.png")]);
      useFileStore.getState().updateEntry(0, {
        status: "failed",
        error: "Resize failed",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.tryAgain }));
    expect(showIgnored).not.toHaveBeenCalled();
    expect(useFileStore.getState().entries[0].status).toBe("pending");
    expect(useFileStore.getState().entries[0].error).toBeNull();

    await act(async () => {
      useFileStore.getState().updateEntry(0, {
        status: "failed",
        error: "Resize failed",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.tryDifferentFile }));
    expect(showIgnored).not.toHaveBeenCalled();
    expect(useFileStore.getState().entries).toHaveLength(0);
  });
});

describe("ToolPage handleAddMore, handleFiles, and handleUrlImport intake guard (#3196)", () => {
  it("refuses handleAddMore click while a run is in flight and refuses onchange if a run starts while the file picker is open", async () => {
    renderToolPage("/image/resize");
    await act(async () => {
      useFileStore.getState().setFiles([png("a.png")]);
    });

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

    // Open the native file picker while idle.
    fireEvent.click(screen.getByRole("button", { name: en.toolPage.addMore }));
    expect(createdInputs).toHaveLength(1);
    const fileInput = createdInputs[0];

    // Start a run while the file dialog is still open.
    act(() => {
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("resize-job-1", null);
    });

    // Clicking "Add more" while already busy is refused before creating an input.
    fireEvent.click(screen.getByRole("button", { name: en.toolPage.addMore }));
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
    expect(createdInputs).toHaveLength(1);

    // Empty picker cancellation while busy stays silent.
    Object.defineProperty(fileInput, "files", { value: [], configurable: true });
    act(() => {
      fileInput.onchange?.({ target: fileInput } as unknown as Event);
    });
    expect(showIgnored).toHaveBeenCalledTimes(1);

    // Unsupported file selection reports unsupported file type without mutating useFileStore.
    Object.defineProperty(fileInput, "files", {
      value: [new File(["txt"], "notes.txt", { type: "text/plain" })],
      configurable: true,
    });
    act(() => {
      fileInput.onchange?.({ target: fileInput } as unknown as Event);
    });
    expect(showUnsupported).toHaveBeenCalledTimes(1);
    expect(showUnsupported).toHaveBeenCalledWith(en.dropzone.unsupportedFileType);
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["a.png"]);

    // Completing the file selection from the earlier dialog while busy is refused.
    Object.defineProperty(fileInput, "files", {
      value: [png("b.png")],
      configurable: true,
    });
    act(() => {
      fileInput.onchange?.({ target: fileInput } as unknown as Event);
    });
    expect(showIgnored).toHaveBeenCalledTimes(2);
    expect(showIgnored).toHaveBeenLastCalledWith(en.dropzone.ignoredWhileRunning);
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["a.png"]);
    expect(useFileStore.getState().processing).toBe(true);

    // Once the run finishes, picking a valid file appends it.
    act(() => {
      useFileStore.getState().setProcessing(false);
    });
    act(() => {
      fileInput.onchange?.({ target: fileInput } as unknown as Event);
    });
    expect(showIgnored).toHaveBeenCalledTimes(2);
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["a.png", "b.png"]);
  });

  it("refuses ToolPage Dropzone handleFiles and handleUrlImport when a run starts before picker onchange or URL fetch completes", async () => {
    let resolveUrlFetch: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/fetch-urls/download")) {
          return Promise.resolve(
            new Response("img", {
              status: 200,
              headers: { "Content-Type": "image/png" },
            }),
          );
        }
        if (url.includes("/api/v1/fetch-urls")) {
          return new Promise<Response>((resolve) => {
            resolveUrlFetch = resolve;
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
        );
      }),
    );

    renderToolPage("/image/resize");

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

    // Open Dropzone's Upload picker while idle.
    fireEvent.click(screen.getByRole("button", { name: en.common.upload }));
    expect(createdInputs).toHaveLength(1);
    const dropzoneFileInput = createdInputs[0];

    // Start a URL import in Dropzone while idle.
    const urlInput = screen.getByPlaceholderText(en.dropzone.urlPlaceholder);
    fireEvent.change(urlInput, { target: { value: "https://example.com/photo.png" } });
    fireEvent.click(screen.getByRole("button", { name: en.dropzone.addUrlButton }));
    expect(resolveUrlFetch).toBeTypeOf("function");

    // Start a run before either async intake finishes.
    act(() => {
      useFileStore.getState().setProcessing(true);
    });

    // Dropzone drop while busy is refused by handleFiles.
    fireEvent.drop(screen.getByRole("region", { name: en.a11y.fileDropZone }), {
      dataTransfer: { files: [png("dropped.png")] },
    });
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenLastCalledWith(en.dropzone.ignoredWhileRunning);
    expect(useFileStore.getState().entries).toHaveLength(0);

    // Dropzone picker onchange opened while idle is refused by handleFiles once busy.
    Object.defineProperty(dropzoneFileInput, "files", {
      value: [png("picked.png")],
      configurable: true,
    });
    act(() => {
      dropzoneFileInput.onchange?.({ target: dropzoneFileInput } as unknown as Event);
    });
    expect(showIgnored).toHaveBeenCalledTimes(2);
    expect(useFileStore.getState().entries).toHaveLength(0);

    // In-flight URL import started while idle is refused by handleUrlImport once busy.
    await act(async () => {
      resolveUrlFetch?.(
        new Response(
          JSON.stringify({
            results: [
              {
                success: true,
                url: "https://example.com/photo.png",
                filename: "photo.png",
                downloadUrl: "/api/v1/fetch-urls/download/photo.png",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    await waitFor(() => expect(showIgnored).toHaveBeenCalledTimes(3));
    expect(useFileStore.getState().entries).toHaveLength(0);

    // Once idle again, URL import and Dropzone drop are accepted by handleUrlImport and handleFiles.
    act(() => {
      useFileStore.getState().setProcessing(false);
    });
    fireEvent.change(urlInput, { target: { value: "https://example.com/accepted-url.png" } });
    fireEvent.click(screen.getByRole("button", { name: en.dropzone.addUrlButton }));
    await act(async () => {
      resolveUrlFetch?.(
        new Response(
          JSON.stringify({
            results: [
              {
                success: true,
                url: "https://example.com/accepted-url.png",
                filename: "accepted-url.png",
                downloadUrl: "/api/v1/fetch-urls/download/accepted-url.png",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    await waitFor(() =>
      expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["accepted-url.png"]),
    );

    act(() => {
      useFileStore.getState().reset();
    });
    fireEvent.drop(screen.getByRole("region", { name: en.a11y.fileDropZone }), {
      dataTransfer: { files: [png("accepted.png")] },
    });
    expect(showIgnored).toHaveBeenCalledTimes(3);
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["accepted.png"]);
  });
});

describe("AutomatePage file-action intake guard (#2652)", () => {
  it("refuses Add, Library, and Clear on desktop while a pipeline run is in flight", async () => {
    renderAutomatePage();
    await act(async () => {
      useFileStore.getState().setFiles([png("pipeline.png")]);
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("pipeline-job-1", null);
    });

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

    fireEvent.click(screen.getByRole("button", { name: en.automate.addButton }));
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
    expect(createdInputs).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: en.automate.libraryButton }));
    expect(showIgnored).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.automate.clearButton }));
    expect(showIgnored).toHaveBeenCalledTimes(3);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe("pipeline-job-1");
    expect(useFileStore.getState().entries).toHaveLength(1);
  });

  it("refuses Add, Library, and Clear on mobile while a pipeline run is in flight", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    renderAutomatePage();
    await act(async () => {
      useFileStore.getState().setFiles([png("mobile.png")]);
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("pipeline-job-mobile", null);
    });

    fireEvent.click(screen.getByRole("button", { name: en.automate.addButton }));
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);

    fireEvent.click(screen.getByRole("button", { name: en.automate.libraryButton }));
    expect(showIgnored).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.automate.clearButton }));
    expect(showIgnored).toHaveBeenCalledTimes(3);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().entries).toHaveLength(1);
  });

  it("refuses handleLibraryImport and handleAddMore onchange if a run starts while the modal or file picker is open, and ignores empty picker cancellation", async () => {
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

    renderAutomatePage();
    await act(async () => {
      useFileStore.getState().setFiles([png("initial.png")]);
    });

    // Open the file picker and the library modal while idle.
    fireEvent.click(screen.getByRole("button", { name: en.automate.addButton }));
    const fileInput = createdInputs.at(-1);
    if (!fileInput) throw new Error("Expected file input to be created");

    fireEvent.click(screen.getByRole("button", { name: en.automate.libraryButton }));
    fireEvent.click(await screen.findByText("modal.png"));

    // Start a pipeline run before the picker or modal completes its import.
    act(() => {
      useFileStore.getState().setProcessing(true);
      useFileStore.getState().setActiveJob("pipeline-job-race", null);
    });

    // Empty picker selection (user canceled dialog) while busy stays silent.
    Object.defineProperty(fileInput, "files", { value: [], configurable: true });
    act(() => {
      fileInput.onchange?.({ target: fileInput } as unknown as Event);
    });
    expect(showIgnored).not.toHaveBeenCalled();

    Object.defineProperty(fileInput, "files", {
      value: [png("late-picked.png")],
      configurable: true,
    });
    act(() => {
      fileInput.onchange?.({ target: fileInput } as unknown as Event);
    });
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["initial.png"]);

    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
      }),
    );
    await waitFor(() => expect(showIgnored).toHaveBeenCalledTimes(2));
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["initial.png"]);
    expect(useFileStore.getState().processing).toBe(true);
    // Refusing intake keeps the library modal open with its selection preserved (#3197).
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const retryImportBtn = screen.getByRole("button", {
      name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
    });
    expect(retryImportBtn).toBeEnabled();

    // Once the pipeline run finishes, clicking Import in the still-open modal imports the file and closes the modal.
    act(() => {
      useFileStore.getState().setProcessing(false);
    });
    fireEvent.click(retryImportBtn);
    await waitFor(() =>
      expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual([
        "initial.png",
        "modal.png",
      ]),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(showIgnored).toHaveBeenCalledTimes(2);
  });

  it("refuses FileLibraryModal import when a run starts while download is in flight with no initial files, then imports via setFiles once idle (#3197)", async () => {
    let resolveModalDownload: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/files/modal-file/download")) {
          return new Promise<Response>((resolve) => {
            resolveModalDownload = resolve;
          });
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
      }),
    );

    renderAutomatePage();
    expect(useFileStore.getState().entries).toHaveLength(0);

    // Open FileLibraryModal from the empty-state button and click Import while idle.
    const importButtons = screen.getAllByRole("button", {
      name: en.automate.importFromLibrary,
    });
    fireEvent.click(importButtons[0]);
    fireEvent.click(await screen.findByText("modal.png"));
    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
      }),
    );
    expect(resolveModalDownload).toBeTypeOf("function");

    // A run starts before the file download resolves.
    act(() => {
      useFileStore.getState().setProcessing(true);
    });
    await act(async () => {
      resolveModalDownload?.(new Response("modal-bytes", { status: 200 }));
    });

    await waitFor(() => expect(showIgnored).toHaveBeenCalledTimes(1));
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
    expect(useFileStore.getState().entries).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", {
      name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
    });
    expect(retryBtn).toBeEnabled();

    // Once the run finishes, retrying in the still-open modal loads modal.png via setFiles and closes the dialog.
    act(() => {
      useFileStore.getState().setProcessing(false);
    });
    fireEvent.click(retryBtn);
    await act(async () => {
      resolveModalDownload?.(new Response("modal-bytes", { status: 200 }));
    });
    await waitFor(() =>
      expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["modal.png"]),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refuses Dropzone drop and both Import from library buttons on desktop and mobile when processing is active with no files loaded", async () => {
    const desktopView = renderAutomatePage();
    await act(async () => {
      useFileStore.getState().setProcessing(true);
    });

    fireEvent.drop(screen.getByRole("region", { name: en.dropzone.ariaLabel }), {
      dataTransfer: { files: [png("dropped-while-busy.png")] },
    });
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(useFileStore.getState().entries).toHaveLength(0);

    const desktopImportButtons = screen.getAllByRole("button", {
      name: en.automate.importFromLibrary,
    });
    expect(desktopImportButtons).toHaveLength(2);
    fireEvent.click(desktopImportButtons[0]);
    expect(showIgnored).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(desktopImportButtons[1]);
    expect(showIgnored).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    desktopView.unmount();

    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    renderAutomatePage();
    await act(async () => {
      useFileStore.getState().setProcessing(true);
    });

    fireEvent.drop(screen.getByRole("region", { name: en.dropzone.ariaLabel }), {
      dataTransfer: { files: [png("mobile-dropped-while-busy.png")] },
    });
    expect(showIgnored).toHaveBeenCalledTimes(4);
    expect(useFileStore.getState().entries).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: en.automate.importFromLibrary }));
    expect(showIgnored).toHaveBeenCalledTimes(5);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves the libraryImportFailed alert and appends via handleLibraryImport when idle", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
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
      }),
    );

    renderAutomatePage({ libraryFileIds: ["good-file", "bad-file"] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["good.png"]);

    // While a run is in flight, refusing Clear leaves the partial-failure alert intact.
    await act(async () => {
      useFileStore.getState().setProcessing(true);
    });
    fireEvent.click(screen.getByRole("button", { name: en.automate.clearButton }));
    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");

    // Once idle, importing from the library modal with files.length > 0 appends the file and clears the alert.
    await act(async () => {
      useFileStore.getState().setProcessing(false);
    });
    fireEvent.click(screen.getByRole("button", { name: en.automate.libraryButton }));
    fireEvent.click(await screen.findByText("modal.png"));
    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
      }),
    );
    await waitFor(() =>
      expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual([
        "good.png",
        "modal.png",
      ]),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(showIgnored).toHaveBeenCalledTimes(1);
  });
});
