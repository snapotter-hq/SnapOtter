// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en, FEATURE_BUNDLES } from "@snapotter/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
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

const copyToClipboardMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    copyToClipboard: copyToClipboardMock,
  };
});

import { BarcodeReadSettings } from "@/components/tools/barcode-read-settings";
import { FaviconSettings } from "@/components/tools/favicon-settings";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
import { OcrSettings } from "@/components/tools/ocr-settings";
import { RemoveBgSettings } from "@/components/tools/remove-bg-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { useWorkInFlight } from "@/hooks/use-work-in-flight";
import { ToolPage } from "@/pages/tool-page";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";

class FakeEventSource {
  static OPEN = 1;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.readyState = 2;
  }
}

class FakeXhr {
  static instances: FakeXhr[] = [];

  responseType = "";
  timeout = 0;
  status = 0;
  response: unknown = null;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  url = "";
  body: FormData | null = null;
  aborted = false;
  upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(_key: string, _value: string) {}

  send(body: FormData) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  respondJson(status: number, body: unknown) {
    if (this.aborted) return;
    act(() => {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    });
  }

  respondBlob(status: number, blob: Blob) {
    if (this.aborted) return;
    act(() => {
      this.status = status;
      this.response = blob;
      this.onload?.();
    });
  }
}

function image(name = "photo.png"): File {
  return new File(["png"], name, { type: "image/png" });
}

function guardWork(route: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );
  return renderHook(() => useWorkInFlight(), { wrapper }).result.current;
}

function swallowNavigation(e: Event) {
  e.preventDefault();
}

let blobCounter = 0;
let createdBlobs: Map<string, Blob>;
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

beforeEach(() => {
  storageMap.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
    ),
  );
  blobCounter = 0;
  createdBlobs = new Map();
  URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => {
    const url = `blob:mock-${++blobCounter}`;
    if (obj instanceof Blob) createdBlobs.set(url, obj);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
  copyToClipboardMock.mockReset().mockResolvedValue(true);
  document.addEventListener("click", swallowNavigation, true);
  FakeXhr.instances = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("EventSource", FakeEventSource);
  useFeaturesStore.setState({
    bundles: Object.values(FEATURE_BUNDLES).map((b) => ({
      ...b,
      status: "installed" as const,
      installedAt: "2026-01-01T00:00:00Z",
      error: null,
    })),
    loaded: true,
    loadError: false,
  });
  useFileStore.getState().reset();
});

afterEach(() => {
  document.removeEventListener("click", swallowNavigation, true);
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useFileStore.getState().reset();
});

describe("favicon reports its result to the file store (#1111)", () => {
  const ROUTE = "/image/favicon";

  it("warns during the run, offers favicons.zip once finished, and goes quiet when downloaded", async () => {
    useFileStore.getState().setFiles([image("logo.png")]);
    render(<FaviconSettings />);

    fireEvent.click(screen.getByTestId("favicon-submit"));
    expect(guardWork(ROUTE)).toEqual({ kind: "processing" });

    FakeXhr.instances[0].respondBlob(200, new Blob(["zip-bytes"], { type: "application/zip" }));

    const url = useFileStore.getState().entries[0].processedUrl;
    expect(url).toMatch(/^blob:mock-/);
    expect(guardWork(ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: url as string, filename: "favicons.zip" }],
    });

    fireEvent.click(screen.getByTestId("favicon-download"));
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("lands the zip on the entry the run started against even when files are reordered mid-run", () => {
    useFileStore.getState().setFiles([image("first.png"), image("second.png")]);
    render(<FaviconSettings />);

    fireEvent.click(screen.getByTestId("favicon-submit"));
    act(() => useFileStore.getState().reorderFiles(0, 1));
    FakeXhr.instances[0].respondBlob(200, new Blob(["zip-bytes"], { type: "application/zip" }));

    const { entries } = useFileStore.getState();
    expect(entries[1].file.name).toBe("first.png");
    expect(entries[1].processedUrl).toMatch(/^blob:mock-/);
    expect(entries[1].processedFilename).toBe("favicons.zip");
    expect(entries[0].processedUrl).toBeNull();

    // reorderFiles follows the selected entry, so selectedIndex is now 1.
    fireEvent.click(screen.getByTestId("favicon-download"));
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("clears the previous result and claim when a second run starts", () => {
    useFileStore.getState().setFiles([image("logo.png")]);
    render(<FaviconSettings />);

    fireEvent.click(screen.getByTestId("favicon-submit"));
    FakeXhr.instances[0].respondBlob(200, new Blob(["zip-1"], { type: "application/zip" }));
    fireEvent.click(screen.getByTestId("favicon-download"));
    expect(useFileStore.getState().entries[0].claimed).toBe(true);

    fireEvent.click(screen.getByTestId("favicon-submit"));
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("clears the first entry's result when a second run starts after the user selected another file", () => {
    useFileStore.getState().setFiles([image("first.png"), image("second.png")]);
    render(<FaviconSettings />);

    fireEvent.click(screen.getByTestId("favicon-submit"));
    FakeXhr.instances[0].respondBlob(200, new Blob(["zip-1"], { type: "application/zip" }));
    expect(useFileStore.getState().entries[0].processedUrl).not.toBeNull();

    act(() => useFileStore.getState().setSelectedIndex(1));
    fireEvent.click(screen.getByTestId("favicon-submit"));

    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().entries[1].processedUrl).toBeNull();
  });
});

describe("image-to-pdf reports its result to the file store (#1111)", () => {
  const ROUTE = "/image/image-to-pdf";
  const PDF_URL = "/api/v1/download/job-pdf-1/pages.pdf";

  it("warns during the run, offers the PDF once finished, and goes quiet when downloaded", () => {
    useFileStore.getState().setFiles([image("page1.png")]);
    render(<ImageToPdfSettings />);

    fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    expect(guardWork(ROUTE)).toEqual({ kind: "processing" });

    FakeXhr.instances[0].respondJson(200, {
      jobId: "job-pdf-1",
      downloadUrl: PDF_URL,
      originalSize: 1000,
      processedSize: 800,
    });

    expect(guardWork(ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: PDF_URL, filename: "pages.pdf" }],
    });

    fireEvent.click(screen.getByTestId("image-to-pdf-download"));
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("lands the PDF on the entry the run started against even when files are reordered mid-run", () => {
    useFileStore.getState().setFiles([image("page1.png"), image("page2.png")]);
    render(<ImageToPdfSettings />);

    fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    act(() => useFileStore.getState().reorderFiles(0, 1));
    FakeXhr.instances[0].respondJson(200, {
      jobId: "job-pdf-1",
      downloadUrl: PDF_URL,
      originalSize: 1000,
      processedSize: 800,
    });

    const { entries } = useFileStore.getState();
    expect(entries[1].file.name).toBe("page1.png");
    expect(entries[1].processedUrl).toBe(PDF_URL);
    expect(entries[1].processedFilename).toBe("pages.pdf");
    expect(entries[0].processedUrl).toBeNull();

    fireEvent.click(screen.getByTestId("image-to-pdf-download"));
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("clears the previous result and claim when a second run starts, and rejects a 200 with no downloadUrl", () => {
    useFileStore.getState().setFiles([image("page1.png")]);
    render(<ImageToPdfSettings />);

    fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    FakeXhr.instances[0].respondJson(200, {
      jobId: "job-pdf-1",
      downloadUrl: PDF_URL,
      originalSize: 1000,
      processedSize: 800,
    });
    fireEvent.click(screen.getByTestId("image-to-pdf-download"));
    expect(useFileStore.getState().entries[0].claimed).toBe(true);

    // Second run with a malformed 200 (missing downloadUrl) clears the old result and shows the parse error.
    fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);

    FakeXhr.instances[1].respondJson(200, { jobId: "job-pdf-2" });
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(
      screen.getByText(en.toolSettings["image-to-pdf"].parseResponseFailed),
    ).toBeInTheDocument();
  });
});

describe("ocr reports its extracted text to the file store (#1111)", () => {
  const ROUTE = "/image/ocr";

  async function runOcr(responseBody: unknown = { text: "Hello Otter" }) {
    fireEvent.click(screen.getByTestId("ocr-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].respondJson(200, responseBody);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
  }

  it("offers the extracted text as a .txt download in the guard and goes quiet on copy", async () => {
    useFileStore.getState().setFiles([image("receipt.png")]);
    render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    await runOcr({ text: "Hello Otter" });

    const entry = useFileStore.getState().entries[0];
    expect(entry.processedUrl).toMatch(/^blob:mock-/);
    expect(entry.processedFilename).toBe("receipt_ocr.txt");
    await expect(createdBlobs.get(entry.processedUrl as string)?.text()).resolves.toBe(
      "Hello Otter",
    );
    expect(guardWork(ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [
        {
          kind: "result",
          index: 0,
          url: entry.processedUrl as string,
          filename: "receipt_ocr.txt",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: en.common.copy }));
    await waitFor(() => expect(copyToClipboardMock).toHaveBeenCalledWith("Hello Otter"));
    await act(async () => {});
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("stays unclaimed when copying to clipboard fails", async () => {
    copyToClipboardMock.mockResolvedValueOnce(false);
    useFileStore.getState().setFiles([image("receipt.png")]);
    render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    await runOcr({ text: "Hello Otter" });
    fireEvent.click(screen.getByRole("button", { name: en.common.copy }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: en.common.copyFailed })).toBeInTheDocument(),
    );

    expect(guardWork(ROUTE)).not.toBeNull();
  });

  it("goes quiet when the user downloads the .txt file, and warns again if they edit the text", async () => {
    useFileStore.getState().setFiles([image("receipt.png")]);
    render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    await runOcr({ text: "Hello Otter" });
    fireEvent.click(screen.getByRole("button", { name: en.common.download }));
    expect(guardWork(ROUTE)).toBeNull();

    // Editing the extracted text creates unsaved work again with the updated text.
    fireEvent.change(screen.getByTestId("ocr-result-text"), {
      target: { value: "Hello Edited Otter" },
    });
    const updatedUrl = useFileStore.getState().entries[0].processedUrl;
    expect(guardWork(ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [
        {
          kind: "result",
          index: 0,
          url: updatedUrl as string,
          filename: "receipt_ocr.txt",
        },
      ],
    });
    await expect(createdBlobs.get(updatedUrl as string)?.text()).resolves.toBe(
      "Hello Edited Otter",
    );

    // Emptying the textarea leaves nothing to download, so the guard goes quiet.
    fireEvent.change(screen.getByTestId("ocr-result-text"), {
      target: { value: "" },
    });
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("names a multi-file OCR result ocr_results_ocr.txt and leaves processedUrl null when all files fail", async () => {
    useFileStore.getState().setFiles([image("a.png"), image("b.png")]);
    render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("ocr-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].respondJson(500, { error: "failed-a" });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respondJson(500, { error: "failed-b" });
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(guardWork(ROUTE)).toBeNull();

    // Re-run where both succeed:
    FakeXhr.instances = [];
    fireEvent.click(screen.getByTestId("ocr-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].respondJson(200, { text: "Page 1" });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respondJson(200, { text: "Page 2" });
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(useFileStore.getState().entries[0].processedFilename).toBe("ocr_results_ocr.txt");
    expect(guardWork(ROUTE)).not.toBeNull();
  });

  it("marks an auto-saved library OCR run claimed and updates serverFileId on overwrite", async () => {
    useFileStore.getState().setFiles([image("receipt.png")]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-1" });
    useFileStore.getState().setLibrarySaveMode("overwrite");
    render(
      <MemoryRouter>
        <OcrSettings />
      </MemoryRouter>,
    );

    await runOcr({ text: "Saved text", savedFileId: "lib-2" });

    expect(useFileStore.getState().entries[0].serverFileId).toBe("lib-2");
    expect(useFileStore.getState().entries[0].claimed).toBe(true);
    expect(guardWork(ROUTE)).toBeNull();
  });
});

describe("barcode-read claims its entries when decoded barcodes are taken (#1111)", () => {
  const ROUTE = "/image/barcode-read";
  const ANNOTATED_URL = "/api/v1/download/job-bc-1/annotated.png";

  async function scanBarcodes(texts: string[]) {
    render(<BarcodeReadSettings />);
    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].respondJson(200, {
      filename: "code.png",
      barcodes: texts.map((text) => ({
        type: "QRCode",
        text,
        position: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 10, y: 0 },
          bottomLeft: { x: 0, y: 10 },
          bottomRight: { x: 10, y: 10 },
        },
      })),
      annotatedUrl: ANNOTATED_URL,
    });
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
  }

  beforeEach(() => {
    useFileStore.getState().setFiles([image("code.png")]);
  });

  it("goes quiet when the user exports the CSV", async () => {
    await scanBarcodes(["https://snapotter.com"]);
    expect(guardWork(ROUTE)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("goes quiet when the user clicks Copy All", async () => {
    await scanBarcodes(["https://snapotter.com", "SECOND-CODE"]);
    expect(guardWork(ROUTE)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["barcode-read"].copyAll }));
    await waitFor(() => expect(copyToClipboardMock).toHaveBeenCalled());
    await act(async () => {});
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("goes quiet only once every individual barcode row has been copied", async () => {
    await scanBarcodes(["FIRST", "SECOND"]);
    const rowButtons = screen.getAllByTitle(en.toolSettings["barcode-read"].copyValue);
    expect(rowButtons).toHaveLength(2);

    fireEvent.click(rowButtons[0]);
    await waitFor(() => expect(copyToClipboardMock).toHaveBeenCalledWith("FIRST"));
    await act(async () => {});
    // One barcode is still untaken.
    expect(guardWork(ROUTE)).not.toBeNull();

    fireEvent.click(rowButtons[1]);
    await waitFor(() => expect(copyToClipboardMock).toHaveBeenCalledWith("SECOND"));
    await act(async () => {});
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("stays unclaimed when Copy All or row Copy fails", async () => {
    await scanBarcodes(["ONLY"]);
    copyToClipboardMock.mockResolvedValue(false);

    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["barcode-read"].copyAll }));
    await waitFor(() => expect(copyToClipboardMock).toHaveBeenCalled());
    await act(async () => {});
    expect(guardWork(ROUTE)).not.toBeNull();

    const rowButton = screen.getByTitle(en.toolSettings["barcode-read"].copyValue);
    fireEvent.click(rowButton);
    await act(async () => {});
    expect(guardWork(ROUTE)).not.toBeNull();
  });

  it("clears a previous scan's processedUrl when a subsequent scan finds no barcodes", async () => {
    await scanBarcodes(["ONLY"]);
    expect(guardWork(ROUTE)).not.toBeNull();

    FakeXhr.instances = [];
    fireEvent.click(screen.getByTestId("barcode-read-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0].respondJson(200, {
      filename: "code.png",
      barcodes: [],
      annotatedUrl: null,
    });
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(guardWork(ROUTE)).toBeNull();
  });
});

describe("ToolPage keeps the input image area and suppresses duplicate ReviewPanel for panel-owned results (#1111)", () => {
  it.each([
    ["/image/favicon", "blob:result-zip", "favicons.zip"],
    ["/image/image-to-pdf", "/api/v1/download/job-pdf-1/pages.pdf", "pages.pdf"],
    ["/image/ocr", "blob:result-txt", "scan_ocr.txt"],
  ])(
    "renders no ReviewPanel, conversionCompleteCard, or broken result preview on %s even with multiple files",
    async (route, resultUrl, filename) => {
      useFileStore.getState().setFiles([image("first.png"), image("second.png")]);
      const inputBlobUrl = useFileStore.getState().entries[0].blobUrl;
      render(
        <I18nProvider>
          <MemoryRouter initialEntries={[{ pathname: route, state: { fromLibrary: true } }]}>
            <Routes>
              <Route path="/:section/:toolId" element={<ToolPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>,
      );

      act(() => {
        useFileStore.getState().updateEntry(0, {
          processedUrl: resultUrl,
          processedFilename: filename,
          status: "completed",
        });
      });

      // Neither the main-area conversion-complete card nor the sidebar ReviewPanel appears.
      expect(screen.queryByText(en.toolPage.conversionComplete)).not.toBeInTheDocument();
      expect(document.querySelector("[data-download-button]")).toBeNull();
      // The main area and ThumbnailStrip keep the input image blobUrl rather than feeding
      // the .zip, .pdf, or .txt result URL into an <img>.
      const imgs = Array.from(document.querySelectorAll("img")).map((img) =>
        img.getAttribute("src"),
      );
      expect(imgs).toContain(inputBlobUrl);
      expect(imgs).not.toContain(resultUrl);
      cleanup();
    },
  );
});

describe("remove-background Phase 2 effects download claims and invalidates on edit (#1111)", () => {
  const ROUTE = "/image/remove-background";
  const CUTOUT_URL = "/api/v1/download/job-bg-1/portrait_nobg.png";
  const EFFECTS_URL = "/api/v1/download/job-bg-1/portrait_nobg.webp";

  it("claims the entry when the Phase 2 effects download completes, and unclaims if effects change afterwards", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jobId: "job-bg-1",
            downloadUrl: EFFECTS_URL,
            processedSize: 512,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    useFileStore.getState().setFiles([image("portrait.png")]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: CUTOUT_URL,
      status: "completed",
      originalSize: 1024,
      processedSize: 600,
    });

    render(<RemoveBgSettings />);
    await screen.findByTestId("remove-background-download");
    expect(guardWork(ROUTE)).not.toBeNull();

    // Switch output format to WebP so the download routes through Phase 2 (/effects).
    fireEvent.click(screen.getByTestId("remove-background-format-webp"));
    const effectsBtn = await screen.findByTestId("remove-background-download-effects");
    fireEvent.click(effectsBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(guardWork(ROUTE)).toBeNull();

    // Changing to AVIF after downloading means the new configuration has not been taken yet.
    fireEvent.click(screen.getByTestId("remove-background-format-avif"));
    await act(async () => {});
    expect(guardWork(ROUTE)).not.toBeNull();
  });

  it("stays unclaimed if the user edits effects while the Phase 2 download request is in flight", async () => {
    let resolveEffects: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveEffects = resolve;
          }),
      ),
    );
    useFileStore.getState().setFiles([image("portrait.png")]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: CUTOUT_URL,
      status: "completed",
      originalSize: 1024,
      processedSize: 600,
    });

    render(<RemoveBgSettings />);
    await screen.findByTestId("remove-background-download");
    fireEvent.click(screen.getByTestId("remove-background-format-webp"));
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(resolveEffects).toBeDefined());

    // User switches to AVIF while the WebP request is still in flight.
    fireEvent.click(screen.getByTestId("remove-background-format-avif"));
    await act(async () => {
      resolveEffects?.(
        new Response(
          JSON.stringify({
            jobId: "job-bg-1",
            downloadUrl: EFFECTS_URL,
            processedSize: 512,
          }),
          { status: 200 },
        ),
      );
    });

    expect(guardWork(ROUTE)).not.toBeNull();
  });
});

describe("use-pipeline-processor claims auto-saved library results (#1111)", () => {
  const ROUTE = "/automate";
  const RESULT_URL = "/api/v1/download/job-pipe-1/out.png";

  it("records lastSavedLibraryFileId, claims the entry, and keeps original serverFileId when saveMode is new", () => {
    useFileStore.getState().setFiles([image("lib.png")]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-orig" });
    useFileStore.getState().setLibrarySaveMode("new");

    const { result } = renderHook(() => usePipelineProcessor());
    act(() => {
      result.current.processSingle(useFileStore.getState().files[0], [
        { id: "s1", toolId: "resize", settings: { width: 100 } },
      ]);
    });

    FakeXhr.instances[0].respondJson(200, {
      jobId: "job-pipe-1",
      downloadUrl: RESULT_URL,
      originalSize: 1000,
      processedSize: 500,
      savedFileId: "lib-new-copy",
    });

    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("lib-new-copy");
    expect(useFileStore.getState().entries[0].serverFileId).toBe("lib-orig");
    expect(useFileStore.getState().entries[0].claimed).toBe(true);
    expect(guardWork(ROUTE)).toBeNull();
  });

  it("updates serverFileId on overwrite and claims the entry when settled over SSE", () => {
    useFileStore.getState().setFiles([image("lib.png")]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-orig" });
    useFileStore.getState().setLibrarySaveMode("overwrite");

    const { result } = renderHook(() => usePipelineProcessor());
    act(() => {
      result.current.processSingle(useFileStore.getState().files[0], [
        { id: "s1", toolId: "resize", settings: { width: 100 } },
      ]);
    });

    FakeXhr.instances[0].respondJson(202, { jobId: "job-pipe-1", async: true });
    act(() => {
      FakeEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          percent: 100,
          result: {
            jobId: "job-pipe-1",
            downloadUrl: RESULT_URL,
            originalSize: 1000,
            processedSize: 500,
            savedFileId: "lib-overwritten",
          },
        }),
      });
    });

    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("lib-overwritten");
    expect(useFileStore.getState().entries[0].serverFileId).toBe("lib-overwritten");
    expect(useFileStore.getState().entries[0].claimed).toBe(true);
    expect(guardWork(ROUTE)).toBeNull();

    // Starting a second run clears lastSavedLibraryFileId from the first run.
    act(() => {
      result.current.processSingle(useFileStore.getState().files[0], [
        { id: "s1", toolId: "resize", settings: { width: 100 } },
      ]);
    });
    expect(useFileStore.getState().lastSavedLibraryFileId).toBeNull();
  });
});
