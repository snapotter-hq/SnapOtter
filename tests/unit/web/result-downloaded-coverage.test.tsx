// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "@testing-library/jest-dom/vitest";
import { ANALYTICS_EVENTS, CONVERSION_PRESETS, TOOLS } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));
vi.mock("qr-code-styling", () => ({
  default: class FakeQRCodeStyling {
    download = vi.fn();
    append = vi.fn();
    update = vi.fn();
  },
}));

import { BarcodeGenerateSettings } from "@/components/tools/barcode-generate-settings";
import { BarcodeReadSettings, resetBarcodeResults } from "@/components/tools/barcode-read-settings";
import { BulkRenameSettings } from "@/components/tools/bulk-rename-settings";
import { CollageSettings } from "@/components/tools/collage-settings";
import { FaviconSettings } from "@/components/tools/favicon-settings";
import { FindDuplicatesSettings } from "@/components/tools/find-duplicates-settings";
import { HtmlToImageResults } from "@/components/tools/html-to-image-results";
import { ImageToBase64Results } from "@/components/tools/image-to-base64-results";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
import { MemeGeneratorSettings } from "@/components/tools/meme-generator-settings";
import { OcrSettings, resetOcrResult } from "@/components/tools/ocr-settings";
import { PassportPhotoSettings } from "@/components/tools/passport-photo-settings";
import { PdfToImagePreview } from "@/components/tools/pdf-to-image-preview";
import { PdfToImageSettings } from "@/components/tools/pdf-to-image-settings";
import { QrGenerateSettings } from "@/components/tools/qr-generate-settings";
import type { SignCanvasRef } from "@/components/tools/sign-canvas";
import { SignPdfSettings } from "@/components/tools/sign-pdf-settings";
import { SplitSettings } from "@/components/tools/split-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { OWN_STORE_TOOL_IDS } from "@/hooks/use-work-in-flight";
import { track } from "@/lib/analytics";
import { ToolPage } from "@/pages/tool-page";
import { useBase64Store } from "@/stores/base64-store";
import { useCollageStore } from "@/stores/collage-store";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useFileStore } from "@/stores/file-store";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";
import { useMemeStore } from "@/stores/meme-store";
import { usePassportPhotoStore } from "@/stores/passport-photo-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useQrStore } from "@/stores/qr-store";
import { useSplitStore } from "@/stores/split-store";
import {
  base64FileKey,
  base64ResultKey,
  claimToolResult,
  claimToolResultItem,
  collageResultKey,
  duplicateResultKey,
  htmlToImageResultKey,
  memeResultKey,
  passportPhotoResultKey,
  pdfToImagePageKey,
  pdfToImageResultKey,
  type ResultKey,
  splitResultKey,
  splitTileKey,
  useToolResultClaims,
} from "@/stores/tool-result-claims";

function swallowNavigation(e: Event) {
  if ((e.target as HTMLElement | null)?.closest?.("a")) {
    e.preventDefault();
  }
}

function makeFile(name = "sample.png", type = "image/png"): File {
  return new File(["img"], name, { type });
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "../../../apps/web/src");
const REGISTRY = path.join(WEB_SRC, "lib/tool-registry.tsx");
const registrySource = readFileSync(REGISTRY, "utf8");

/** Tools that only read metadata or colors out of the input and produce no downloadable file. */
const NO_DOWNLOAD_TOOLS = new Set(["info", "color-palette"]);

/** Tools where ToolPage suppresses ReviewPanel (panelOwnsResult), so useToolProcessor alone is not enough. */
const PANEL_OWNS_RESULT_TOOLS = new Set(["sign-pdf", "ocr", "favicon", "image-to-pdf"]);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*(?:\/\/|\*).*$/gm, "");
}

function lazyImportSpecs(): Map<string, string> {
  const specs = new Map<string, string>();
  for (const m of registrySource.matchAll(
    /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("([^"]+)"\)/g,
  )) {
    specs.set(m[1], m[2]);
  }
  return specs;
}

function registryEntries(): Map<string, string> {
  const entries = new Map<string, string>();
  for (const m of registrySource.matchAll(/\[\s*"([a-z0-9-]+)",\s*\{[\s\S]*?Settings:\s*(\w+)/g)) {
    entries.set(m[1], m[2]);
  }
  const preset = registrySource.match(/CONVERSION_PRESETS\.map\([\s\S]*?Settings:\s*(\w+)/);
  if (preset) {
    for (const p of CONVERSION_PRESETS) entries.set(p.id, preset[1]);
  }
  return entries;
}

function entryBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  const starts = [...registrySource.matchAll(/\[\s*"([a-z0-9-]+)",\s*\{/g)];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index ?? 0;
    const to = i + 1 < starts.length ? (starts[i + 1].index ?? undefined) : undefined;
    bodies.set(starts[i][1], registrySource.slice(from, to));
  }
  return bodies;
}

const IMPORT_SPECS = lazyImportSpecs();
const ENTRIES = registryEntries();
const ENTRY_BODIES = entryBodies();

function fileFor(importSpec: string): string | null {
  if (!importSpec.startsWith("@/")) return null;
  return path.join(WEB_SRC, `${importSpec.slice(2)}.tsx`);
}

function settingsFileFor(toolId: string): string | null {
  const componentName = ENTRIES.get(toolId);
  if (!componentName) return null;
  const direct = IMPORT_SPECS.get(componentName);
  if (direct) return fileFor(direct);
  const body = registrySource.match(new RegExp(`function\\s+${componentName}\\b[\\s\\S]*?\\n}`));
  const rendered = body?.[0].match(/<([A-Z]\w*)\b/)?.[1];
  const wrapped = rendered ? IMPORT_SPECS.get(rendered) : undefined;
  return wrapped ? fileFor(wrapped) : null;
}

function resultsFileFor(toolId: string): string | null {
  const componentName = ENTRY_BODIES.get(toolId)?.match(/ResultsPanel:\s*(\w+)/)?.[1];
  const spec = componentName ? IMPORT_SPECS.get(componentName) : undefined;
  return spec ? fileFor(spec) : null;
}

function panelFilesFor(toolId: string): string[] {
  return [settingsFileFor(toolId), resultsFileFor(toolId)].filter((f): f is string => f !== null);
}

function downloadedCallsFor(toolId: string) {
  return vi
    .mocked(track)
    .mock.calls.filter(
      ([event, props]) =>
        event === ANALYTICS_EVENTS.RESULT_DOWNLOADED &&
        (props as Record<string, unknown> | undefined)?.tool_id === toolId,
    );
}

describe("result_downloaded funnel coverage (#3966)", () => {
  beforeEach(() => {
    vi.mocked(track).mockClear();
    document.addEventListener("click", swallowNavigation, true);
    Element.prototype.scrollIntoView = vi.fn();
    const storageMap = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => storageMap.set(key, value),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
      key: () => null,
      get length() {
        return storageMap.size;
      },
    });
    let blobSeq = 0;
    class MockURL extends URL {
      static createObjectURL = vi.fn(() => `blob:fake-${++blobSeq}`);
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", MockURL);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      ),
    );
    window.history.replaceState({}, "", "/");
    useFileStore.getState().reset();
    useBase64Store.getState().reset();
    useCollageStore.getState().reset();
    useDuplicateStore.getState().reset();
    useHtmlToImageStore.getState().reset();
    useMemeStore.getState().reset();
    usePassportPhotoStore.getState().reset();
    usePdfToImageStore.getState().reset();
    useQrStore.getState().reset();
    useSplitStore.getState().reset();
    useToolResultClaims.getState().reset();
    resetOcrResult();
    resetBarcodeResults();
  });

  afterEach(() => {
    document.removeEventListener("click", swallowNavigation, true);
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ensures every downloadable tool in TOOLS emits RESULT_DOWNLOADED through ReviewPanel, ResultDownloadLink, claimToolResult, or a direct track call", () => {
    const missing: string[] = [];
    const validToolIds = new Set(TOOLS.map((t) => t.id));
    for (const tool of TOOLS) {
      if (NO_DOWNLOAD_TOOLS.has(tool.id)) continue;
      const files = panelFilesFor(tool.id);
      const combined = files.map((f) => withoutComments(readFileSync(f, "utf8"))).join("\n");
      const usesProcessor =
        !PANEL_OWNS_RESULT_TOOLS.has(tool.id) &&
        /\buseToolProcessor\b/.test(combined) &&
        /\bprocess(Files|AllFiles|Batch)\b/.test(combined);
      const usesResultDownloadLink = /\bResultDownloadLink\b/.test(combined);
      const claimsOwnStore = new RegExp(
        `claimToolResult(?:Item)?\\(\\s*"${tool.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      ).test(combined);
      const tracksDirectly = new RegExp(
        `track\\(\\s*ANALYTICS_EVENTS\\.RESULT_DOWNLOADED\\s*,\\s*\\{[\\s\\S]*?tool_id\\s*:\\s*"${tool.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      ).test(combined);

      if (!usesProcessor && !usesResultDownloadLink && !claimsOwnStore && !tracksDirectly) {
        missing.push(tool.id);
      }

      for (const tag of combined.matchAll(/<ResultDownloadLink\b[\s\S]*?(?:\/>|>)/g)) {
        const snippet = tag[0];
        const hasToolIdProp = /\btoolId\s*=/.test(snippet);
        const testIdMatch = snippet.match(/\btestId\s*=\s*"([^"]+)-download"/);
        const candidate = testIdMatch?.[1] === "blur-bg" ? "blur-background" : testIdMatch?.[1];
        const hasResolvableTestId = candidate !== undefined && validToolIds.has(candidate);
        expect(
          hasToolIdProp || hasResolvableTestId,
          `Unresolvable ResultDownloadLink in ${tool.id}: ${snippet}`,
        ).toBe(true);
      }
    }

    expect(
      missing,
      "These tools produce downloadable output without routing through ReviewPanel, ResultDownloadLink, claimToolResult, or an explicit RESULT_DOWNLOADED track call.",
    ).toEqual([]);
  });

  it("emits RESULT_DOWNLOADED from claimToolResult across all 8 OWN_STORE_TOOL_IDS", () => {
    const sampleKeys: Record<(typeof OWN_STORE_TOOL_IDS)[number], ResultKey> = {
      collage: collageResultKey("/api/v1/download/j/collage.png"),
      "find-duplicates": duplicateResultKey({
        totalFiles: 2,
        uniqueCount: 1,
        duplicateGroups: [],
      }),
      "html-to-image": htmlToImageResultKey("/api/v1/download/j/shot.png"),
      "image-to-base64": base64ResultKey([
        {
          entryId: "entry-1",
          filename: "a.png",
          mimeType: "image/png",
          width: 10,
          height: 10,
          originalSize: 10,
          encodedSize: 16,
          overheadPercent: 33,
          base64: "YWJj",
          dataUri: "data:image/png;base64,YWJj",
        },
      ]),
      "meme-generator": memeResultKey("/api/v1/download/j/meme.png"),
      "passport-photo": passportPhotoResultKey({
        downloadUrl: "/api/v1/download/j/passport.jpg",
        printDownloadUrl: null,
        widthPx: 600,
        heightPx: 600,
        dpi: 300,
        fileSize: 12000,
      }),
      "pdf-to-image": pdfToImageResultKey(
        [{ page: 1, downloadUrl: "/api/v1/download/j/p1.png", width: 100, height: 100, size: 500 }],
        "/api/v1/download/j/pages.zip",
      ),
      split: splitResultKey(
        [{ row: 1, col: 1, label: "1,1", blobUrl: "blob:tile-1" }],
        "blob:split-zip",
      ),
    };

    for (const toolId of OWN_STORE_TOOL_IDS) {
      claimToolResult(toolId, sampleKeys[toolId]);
      expect(downloadedCallsFor(toolId)).toHaveLength(1);
    }
  });

  it("emits RESULT_DOWNLOADED from claimToolResultItem and ignores null keys", () => {
    claimToolResult("collage", null);
    claimToolResultItem("split", null);
    expect(vi.mocked(track)).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.RESULT_DOWNLOADED,
      expect.anything(),
    );

    const tile = { row: 1, col: 1, label: "1,1", blobUrl: "blob:t1" };
    claimToolResultItem("split", splitTileKey(tile));
    expect(downloadedCallsFor("split")).toHaveLength(1);

    const page = {
      page: 1,
      downloadUrl: "/api/v1/download/j/p1.png",
      width: 100,
      height: 100,
      size: 500,
    };
    claimToolResultItem("pdf-to-image", pdfToImagePageKey(page));
    expect(downloadedCallsFor("pdf-to-image")).toHaveLength(1);

    const fileRes = {
      entryId: "entry-1",
      filename: "a.png",
      mimeType: "image/png",
      width: 10,
      height: 10,
      originalSize: 10,
      encodedSize: 16,
      overheadPercent: 33,
      base64: "YWJj",
      dataUri: "data:image/png;base64,YWJj",
    };
    claimToolResultItem("image-to-base64", base64FileKey(fileRes));
    expect(downloadedCallsFor("image-to-base64")).toHaveLength(1);
  });

  it("does not emit a duplicate RESULT_DOWNLOADED when base64-store re-keys a claimed batch after file removal", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    const [entryA, entryB] = useFileStore.getState().entries;
    const results = [
      {
        entryId: entryA.id,
        filename: "a.png",
        mimeType: "image/png",
        width: 10,
        height: 10,
        originalSize: 10,
        encodedSize: 16,
        overheadPercent: 33,
        base64: "YQ==",
        dataUri: "data:image/png;base64,YQ==",
      },
      {
        entryId: entryB.id,
        filename: "b.png",
        mimeType: "image/png",
        width: 10,
        height: 10,
        originalSize: 10,
        encodedSize: 16,
        overheadPercent: 33,
        base64: "Yg==",
        dataUri: "data:image/png;base64,Yg==",
      },
    ];
    useBase64Store.getState().setResults(results, []);
    claimToolResult("image-to-base64", base64ResultKey(useBase64Store.getState().results));
    expect(downloadedCallsFor("image-to-base64")).toHaveLength(1);

    useFileStore.getState().removeFile(1);
    expect(downloadedCallsFor("image-to-base64")).toHaveLength(1);
  });

  it("emits RESULT_DOWNLOADED when clicking own-store download controls in panels and results views", () => {
    // collage
    useCollageStore.setState({ resultUrl: "/api/v1/download/j/collage.png", phase: "done" });
    const collageView = render(<CollageSettings />);
    fireEvent.click(collageView.getByTestId("collage-download"));
    expect(downloadedCallsFor("collage")).toHaveLength(1);
    collageView.unmount();

    // html-to-image
    useHtmlToImageStore.setState({ resultUrl: "/api/v1/download/j/shot.png", capturing: false });
    const htmlView = render(<HtmlToImageResults />);
    fireEvent.click(htmlView.getByRole("button", { name: /download/i }));
    expect(downloadedCallsFor("html-to-image")).toHaveLength(1);
    htmlView.unmount();

    // image-to-base64 single file Download .txt
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const entryId = useFileStore.getState().entries[0].id;
    useBase64Store.getState().setResults(
      [
        {
          entryId,
          filename: "a.png",
          mimeType: "image/png",
          width: 10,
          height: 10,
          originalSize: 10,
          encodedSize: 16,
          overheadPercent: 33,
          base64: "YQ==",
          dataUri: "data:image/png;base64,YQ==",
        },
      ],
      [],
    );
    const b64View = render(<ImageToBase64Results />);
    fireEvent.click(b64View.getByRole("button", { name: /download/i }));
    expect(downloadedCallsFor("image-to-base64")).toHaveLength(1);
    b64View.unmount();

    // meme-generator
    useMemeStore.setState({ phase: "result", resultUrl: "/api/v1/download/j/meme.png" });
    const memeView = render(<MemeGeneratorSettings />);
    fireEvent.click(memeView.getByTestId("sidebar-download-meme"));
    expect(downloadedCallsFor("meme-generator")).toHaveLength(1);
    memeView.unmount();

    // passport-photo
    const faceFile = makeFile("face.jpg");
    useFileStore.getState().setFiles([faceFile]);
    usePassportPhotoStore.setState({
      analyzedFileKey: `${useFileStore.getState().entries[0].id}:face.jpg-${faceFile.size}-${faceFile.lastModified}`,
      analyzeResult: {
        jobId: "j-1",
        filename: "face.jpg",
        preview: "",
        imageWidth: 800,
        imageHeight: 1000,
        landmarks: null,
      },
      generateResult: {
        downloadUrl: "/api/v1/download/j-1/passport.jpg",
        printDownloadUrl: null,
        widthPx: 600,
        heightPx: 600,
        dpi: 300,
        fileSize: 10000,
      },
    });
    const passportView = render(<PassportPhotoSettings />);
    fireEvent.click(passportView.getByRole("link", { name: /download/i }));
    expect(downloadedCallsFor("passport-photo")).toHaveLength(1);
    passportView.unmount();

    // pdf-to-image ZIP and per-page download
    const pdfFile = makeFile("doc.pdf", "application/pdf");
    useFileStore.getState().setFiles([pdfFile]);
    usePdfToImageStore.setState({
      file: pdfFile,
      results: [
        { page: 1, downloadUrl: "/api/v1/download/j/p1.png", width: 100, height: 100, size: 500 },
      ],
      zipUrl: "/api/v1/download/j/pages.zip",
    });
    const pdfSettingsView = render(<PdfToImageSettings />);
    fireEvent.click(pdfSettingsView.getByTestId("pdf-to-image-download"));
    expect(downloadedCallsFor("pdf-to-image")).toHaveLength(1);
    pdfSettingsView.unmount();

    const pdfPreviewView = render(<PdfToImagePreview />);
    const pageLink = pdfPreviewView.container.querySelector("a[download]");
    expect(pageLink).not.toBeNull();
    fireEvent.click(pageLink as HTMLElement);
    expect(downloadedCallsFor("pdf-to-image")).toHaveLength(2);
    pdfPreviewView.unmount();

    // split ZIP and per-tile download
    useFileStore.getState().setFiles([makeFile("grid.png")]);
    const splitView = render(<SplitSettings />);
    act(() => {
      useSplitStore.setState({
        tiles: [{ row: 1, col: 1, label: "1,1", blobUrl: "blob:tile-1" }],
        zipBlobUrl: "blob:split-zip",
        runFileCount: 1,
      });
    });
    fireEvent.click(splitView.getByRole("button", { name: /download all as zip/i }));
    expect(downloadedCallsFor("split")).toHaveLength(1);
    fireEvent.click(splitView.getByTitle(/download tile/i));
    expect(downloadedCallsFor("split")).toHaveLength(2);
    splitView.unmount();
  });

  it("emits RESULT_DOWNLOADED from ToolPage handleDownloadAll batch ZIP button", async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/image/resize"]}>
          <Routes>
            <Route path="/:section/:toolId" element={<ToolPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    await act(async () => {
      useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "blob:out-1",
        processedFilename: "a-resized.png",
        processedSize: 120,
      });
      useFileStore.getState().updateEntry(1, {
        status: "completed",
        processedUrl: "blob:out-2",
        processedFilename: "b-resized.png",
        processedSize: 130,
      });
      useFileStore
        .getState()
        .setBatchZip(new Blob(["zip"], { type: "application/zip" }), "resized.zip");
    });

    const zipButtons = await screen.findAllByRole("button", { name: /download all \(zip\)/i });
    fireEvent.click(zipButtons[0]);
    await new Promise((r) => setTimeout(r, 0));

    expect(downloadedCallsFor("resize")).toHaveLength(1);
    expect(useFileStore.getState().batchZipClaimed).toBe(true);
  });

  it("emits RESULT_DOWNLOADED from QrGenerateSettings, BarcodeGenerateSettings, BulkRenameSettings, OcrSettings, and BarcodeReadSettings", async () => {
    // qr-generate
    useQrStore.getState().setTextData("https://snapotter.com");
    const qrView = render(<QrGenerateSettings />);
    fireEvent.click(qrView.getByTestId("qr-generate-download"));
    expect(downloadedCallsFor("qr-generate")).toHaveLength(1);
    qrView.unmount();

    // barcode-generate
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ downloadUrl: "/api/v1/download/j/barcode.png" }), {
            status: 200,
          }),
      ),
    );
    const barcodeGenView = render(<BarcodeGenerateSettings />);
    fireEvent.change(barcodeGenView.getByTestId("barcode-input-text"), {
      target: { value: "12345678" },
    });
    fireEvent.click(barcodeGenView.getByTestId("barcode-generate-submit"));
    const barcodeDownload = await barcodeGenView.findByTestId("barcode-generate-download");
    fireEvent.click(barcodeDownload);
    expect(downloadedCallsFor("barcode-generate")).toHaveLength(1);
    barcodeGenView.unmount();

    // bulk-rename
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(["zip"]),
      })),
    );
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const bulkView = render(<BulkRenameSettings />);
    await act(async () => {
      fireEvent.click(bulkView.getByTestId("bulk-rename-submit"));
    });
    expect(downloadedCallsFor("bulk-rename")).toHaveLength(1);
    bulkView.unmount();

    // ocr
    class OcrXhr {
      status = 200;
      responseText = JSON.stringify({ text: "hello world" });
      upload: { onprogress?: (e: unknown) => void; onload?: () => void } = {};
      onload?: () => void;
      onerror?: () => void;
      ontimeout?: () => void;
      onabort?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      abort = vi.fn();
      send = vi.fn(() => {
        this.onload?.();
      });
    }
    class FakeES {
      static OPEN = 1;
      readyState = 1;
      onmessage: ((e: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();
    }
    vi.stubGlobal("XMLHttpRequest", OcrXhr);
    vi.stubGlobal("EventSource", FakeES);
    useFileStore.getState().setFiles([makeFile("doc.png")]);
    const ocrView = render(<OcrSettings />);
    await act(async () => {
      fireEvent.click(ocrView.getByTestId("ocr-submit"));
    });
    fireEvent.click(ocrView.getByRole("button", { name: /^download$/i }));
    expect(downloadedCallsFor("ocr")).toHaveLength(1);
    ocrView.unmount();

    // barcode-read CSV export
    class BarcodeReadXhr {
      status = 200;
      responseText = JSON.stringify({
        filename: "code.png",
        barcodes: [{ type: "QRCode", text: "https://snapotter.com", position: {} }],
        annotatedUrl: "/api/v1/download/j/annotated.png",
      });
      upload: { onprogress?: (e: unknown) => void; onload?: () => void } = {};
      onload?: () => void;
      onerror?: () => void;
      ontimeout?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      abort = vi.fn();
      send = vi.fn(() => {
        this.onload?.();
      });
    }
    vi.stubGlobal("XMLHttpRequest", BarcodeReadXhr);
    useFileStore.getState().setFiles([makeFile("code.png")]);
    const brView = render(<BarcodeReadSettings />);
    await act(async () => {
      fireEvent.click(brView.getByTestId("barcode-read-submit"));
    });
    fireEvent.click(brView.getByRole("button", { name: /csv/i }));
    expect(downloadedCallsFor("barcode-read")).toHaveLength(1);
    brView.unmount();
  });

  it("emits RESULT_DOWNLOADED from panelOwnsResult tools (sign-pdf, favicon, image-to-pdf) and find-duplicates", async () => {
    // sign-pdf
    useFileStore.getState().setFiles([makeFile("contract.pdf", "application/pdf")]);
    useFileStore.getState().updateEntry(0, {
      status: "completed",
      processedUrl: "/api/v1/download/j/signed.pdf",
    });
    const signCanvasRef = {
      current: {
        getPlacements: () => [{ page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.1 }],
        getSignatureBlob: async () => new Blob(["sig"], { type: "image/png" }),
        addSignature: vi.fn(),
        deleteSelected: vi.fn(),
        clearAll: vi.fn(),
      } satisfies SignCanvasRef,
    };
    const signView = render(
      <SignPdfSettings
        signProps={{
          canvasRef: signCanvasRef,
          hasSelection: false,
          placementCount: 1,
          staleEntryId: null,
          onStaleEntryChange: vi.fn(),
        }}
      />,
    );
    fireEvent.click(signView.getByRole("link", { name: /download/i }));
    expect(downloadedCallsFor("sign-pdf")).toHaveLength(1);
    signView.unmount();

    // favicon
    class FaviconAndPdfXhr {
      status = 200;
      responseType = "";
      response: unknown = new Blob(["zip"], { type: "application/zip" });
      responseText = JSON.stringify({
        jobId: "j-1",
        downloadUrl: "/api/v1/download/j-1/images.pdf",
        originalSize: 100,
        processedSize: 80,
      });
      upload: { onprogress?: (e: unknown) => void; onload?: () => void } = {};
      onload?: () => void;
      onerror?: () => void;
      ontimeout?: () => void;
      onabort?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      abort = vi.fn();
      send = vi.fn(() => {
        this.onload?.();
      });
    }
    vi.stubGlobal("XMLHttpRequest", FaviconAndPdfXhr);
    useFileStore.getState().setFiles([makeFile("icon.png")]);
    const favView = render(<FaviconSettings />);
    await act(async () => {
      fireEvent.click(favView.getByTestId("favicon-submit"));
    });
    fireEvent.click(favView.getByTestId("favicon-download"));
    expect(downloadedCallsFor("favicon")).toHaveLength(1);
    favView.unmount();

    // image-to-pdf
    useFileStore.getState().setFiles([makeFile("page1.png")]);
    const imgPdfView = render(<ImageToPdfSettings />);
    await act(async () => {
      fireEvent.click(imgPdfView.getByTestId("image-to-pdf-submit"));
    });
    fireEvent.click(imgPdfView.getByTestId("image-to-pdf-download"));
    expect(downloadedCallsFor("image-to-pdf")).toHaveLength(1);
    imgPdfView.unmount();

    // find-duplicates
    const dupA = makeFile("dup1.png");
    const dupB = makeFile("dup2.png");
    useFileStore.getState().setFiles([dupA, dupB]);
    const dupView = render(<FindDuplicatesSettings />);
    act(() => {
      useDuplicateStore.setState({
        results: {
          totalFiles: 2,
          uniqueCount: 1,
          duplicateGroups: [
            {
              files: [
                { filename: "dup1.png", width: 10, height: 10, size: 100, similarity: 100 },
                { filename: "dup2.png", width: 10, height: 10, size: 100, similarity: 100 },
              ],
              bestFile: "dup1.png",
            },
          ],
        },
      });
    });
    fireEvent.click(dupView.getByRole("button", { name: /download unique/i }));
    await vi.waitFor(() => {
      expect(downloadedCallsFor("find-duplicates")).toHaveLength(1);
    });
    dupView.unmount();
  });
});
