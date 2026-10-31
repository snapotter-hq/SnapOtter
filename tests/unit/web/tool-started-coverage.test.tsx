// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "@testing-library/jest-dom/vitest";
import { ANALYTICS_EVENTS, CONVERSION_PRESETS, TOOLS } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
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
import { BeautifySettings } from "@/components/tools/beautify-settings";
import { BulkRenameSettings } from "@/components/tools/bulk-rename-settings";
import { CollageSettings } from "@/components/tools/collage-settings";
import { ColorPaletteSettings } from "@/components/tools/color-palette-settings";
import { CompareSettings } from "@/components/tools/compare-settings";
import { ComposeSettings } from "@/components/tools/compose-settings";
import { EraseObjectSettings } from "@/components/tools/erase-object-settings";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { FaviconSettings } from "@/components/tools/favicon-settings";
import { FindDuplicatesSettings } from "@/components/tools/find-duplicates-settings";
import { ImageToBase64Settings } from "@/components/tools/image-to-base64-settings";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
import { InfoSettings } from "@/components/tools/info-settings";
import { OcrSettings, resetOcrResult } from "@/components/tools/ocr-settings";
import { PassportPhotoSettings } from "@/components/tools/passport-photo-settings";
import { QrGenerateSettings } from "@/components/tools/qr-generate-settings";
import type { SignCanvasRef } from "@/components/tools/sign-canvas";
import { SignPdfSettings } from "@/components/tools/sign-pdf-settings";
import { SplitSettings } from "@/components/tools/split-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { WatermarkImageSettings } from "@/components/tools/watermark-image-settings";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { track } from "@/lib/analytics";
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "../../../apps/web/src");
const REGISTRY = path.join(WEB_SRC, "lib/tool-registry.tsx");
const registrySource = readFileSync(REGISTRY, "utf8");

/**
 * Tools whose run action lives in their dedicated Zustand store rather than in
 * the settings component file itself.
 */
const STORE_RUNNER_FILES: Record<string, string> = {
  "html-to-image": path.join(WEB_SRC, "stores/html-to-image-store.ts"),
  "meme-generator": path.join(WEB_SRC, "stores/meme-store.ts"),
  "pdf-to-image": path.join(WEB_SRC, "stores/pdf-to-image-store.ts"),
};

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

const IMPORT_SPECS = lazyImportSpecs();
const ENTRIES = registryEntries();

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

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*(?:\/\/|\*).*$/gm, "");
}

function usesToolProcessor(file: string): boolean {
  const source = withoutComments(readFileSync(file, "utf8"));
  return /\buseToolProcessor\b/.test(source) && /\bprocess(Files|AllFiles|Batch)\b/.test(source);
}

function tracksToolStartedFor(files: string[], toolId: string): boolean {
  const escaped = toolId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `track\\(\\s*ANALYTICS_EVENTS\\.TOOL_STARTED\\s*,\\s*\\{[\\s\\S]*?tool_id\\s*:\\s*"${escaped}"`,
  );
  return files.some((f) => pattern.test(withoutComments(readFileSync(f, "utf8"))));
}

class MockXhr {
  static instances: MockXhr[] = [];
  status = 200;
  responseText = JSON.stringify({
    jobId: "job-1",
    downloadUrl: "/api/v1/download/job-1/out.png",
    originalSize: 100,
    processedSize: 80,
  });
  response: unknown = new Blob(["zip"], { type: "application/zip" });
  responseType = "";
  upload: { onprogress?: (e: unknown) => void; onload?: () => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  open = vi.fn();
  setRequestHeader = vi.fn();
  abort = vi.fn();
  send = vi.fn(() => {
    MockXhr.instances.push(this);
  });
}

class FakeEventSource {
  static OPEN = 1;
  readyState = FakeEventSource.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
}

function makeFile(name = "sample.png", type = "image/png"): File {
  return new File(["img"], name, { type });
}

function startedCallsFor(toolId: string) {
  return vi
    .mocked(track)
    .mock.calls.filter(
      ([event, props]) =>
        event === ANALYTICS_EVENTS.TOOL_STARTED &&
        (props as Record<string, unknown> | undefined)?.tool_id === toolId,
    );
}

describe("tool_started funnel coverage (#1160)", () => {
  beforeEach(() => {
    MockXhr.instances = [];
    vi.mocked(track).mockClear();
    vi.stubGlobal("XMLHttpRequest", MockXhr);
    vi.stubGlobal("EventSource", FakeEventSource);
    let blobSeq = 0;
    class MockURL extends URL {
      static createObjectURL = vi.fn(() => `blob:fake-${++blobSeq}`);
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", MockURL);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ downloadUrl: "/api/v1/download/j/o.png" }))),
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
    resetOcrResult();
    resetBarcodeResults();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ensures every tool in TOOLS either runs through useToolProcessor or emits TOOL_STARTED directly", () => {
    const missing: string[] = [];
    const validToolIds = new Set(TOOLS.map((t) => t.id));
    for (const tool of TOOLS) {
      const settingsFile = settingsFileFor(tool.id);
      if (!settingsFile) {
        missing.push(tool.id);
        continue;
      }
      if (usesToolProcessor(settingsFile)) continue;
      const candidateFiles = [
        settingsFile,
        ...(STORE_RUNNER_FILES[tool.id] ? [STORE_RUNNER_FILES[tool.id]] : []),
      ];
      if (!tracksToolStartedFor(candidateFiles, tool.id)) {
        missing.push(tool.id);
      }
      for (const f of candidateFiles) {
        const src = withoutComments(readFileSync(f, "utf8"));
        for (const m of src.matchAll(
          /track\(\s*ANALYTICS_EVENTS\.TOOL_STARTED\s*,\s*\{[\s\S]*?tool_id\s*:\s*"([^"]+)"/g,
        )) {
          expect(validToolIds.has(m[1]), `Unknown tool_id "${m[1]}" in ${f}`).toBe(true);
          expect(m[1], `Mismatched tool_id "${m[1]}" in ${f} for ${tool.id}`).toBe(tool.id);
        }
      }
    }

    expect(
      missing,
      "These tools bypass useToolProcessor without emitting ANALYTICS_EVENTS.TOOL_STARTED under their own tool_id.",
    ).toEqual([]);
  });

  it("emits tool_started on each interactive-eraser submission and on Erase All batches", async () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    vi.mocked(track).mockClear();

    const maskBlob = new Blob(["mask"], { type: "image/png" });
    const eraserRef: { current: EraserCanvasRef | null } = {
      current: {
        clear: vi.fn(),
        clearAll: vi.fn(),
        undo: vi.fn(),
        exportMask: vi.fn(async () => maskBlob),
        exportAllMasks: vi.fn(
          async () =>
            new Map([
              [useFileStore.getState().entries[0].blobUrl, maskBlob],
              [useFileStore.getState().entries[1].blobUrl, maskBlob],
            ]),
        ),
        getMaskCenter: () => 50,
      },
    };

    const { rerender } = render(
      <EraseObjectSettings
        eraserRef={eraserRef}
        hasStrokes={true}
        brushSize={30}
        onBrushSizeChange={vi.fn()}
        mode="brush"
        onModeChange={vi.fn()}
        maskedFileCount={1}
      />,
    );

    // First single-file submission
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    expect(MockXhr.instances).toHaveLength(1);
    act(() => {
      MockXhr.instances[0].onload?.();
    });

    // Second single-file submission in the same session (retry metric)
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    expect(MockXhr.instances).toHaveLength(2);
    act(() => {
      MockXhr.instances[1].onload?.();
    });

    expect(startedCallsFor("erase-object")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "erase-object", is_batch: false, file_count: 1 }],
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "erase-object", is_batch: false, file_count: 1 }],
    ]);

    // Batch ("Erase All") submission when maskedFileCount > 1
    vi.mocked(track).mockClear();
    rerender(
      <EraseObjectSettings
        eraserRef={eraserRef}
        hasStrokes={true}
        brushSize={30}
        onBrushSizeChange={vi.fn()}
        mode="brush"
        onModeChange={vi.fn()}
        maskedFileCount={2}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("erase-object-submit"));
    });
    expect(startedCallsFor("erase-object")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "erase-object", is_batch: true, file_count: 2 }],
    ]);
  });

  it("emits tool_started on each interactive-sign submission", async () => {
    useFileStore.getState().setFiles([makeFile("contract.pdf", "application/pdf")]);
    vi.mocked(track).mockClear();

    const canvasRef: { current: SignCanvasRef | null } = {
      current: {
        addSignature: vi.fn(),
        deleteSelected: vi.fn(),
        hasPlacements: () => true,
        exportPlacements: vi.fn(async () => ({
          pngs: [new Blob(["sig"], { type: "image/png" })],
          placements: [{ page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.1, signatureIndex: 0 }],
        })),
      },
    };

    const { rerender } = render(
      <SignPdfSettings
        signProps={{
          canvasRef,
          hasSelection: false,
          placementCount: 1,
          staleEntryId: null,
          onStaleEntryChange: vi.fn(),
        }}
      />,
    );

    const submitButton = () => screen.getByRole("button", { name: /apply.*download/i });

    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(MockXhr.instances).toHaveLength(1);
    act(() => {
      MockXhr.instances[0].onload?.();
    });

    // Mark stale (user nudged signature) and submit a second time in the session
    rerender(
      <SignPdfSettings
        signProps={{
          canvasRef,
          hasSelection: false,
          placementCount: 1,
          staleEntryId: useFileStore.getState().entries[0].id,
          onStaleEntryChange: vi.fn(),
        }}
      />,
    );

    await act(async () => {
      fireEvent.click(submitButton());
    });

    expect(startedCallsFor("sign-pdf")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "sign-pdf", is_batch: false, file_count: 1 }],
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "sign-pdf", is_batch: false, file_count: 1 }],
    ]);
  });

  it("emits tool_started for passport-photo when generating (not on auto-analyze) and on re-generation", async () => {
    const file = makeFile("portrait.jpg", "image/jpeg");
    useFileStore.getState().setFiles([file]);
    usePassportPhotoStore.setState({
      analyzedFileKey: `${useFileStore.getState().entries[0].id}:portrait.jpg-${file.size}-${file.lastModified}`,
      analyzeResult: {
        jobId: "job-pass",
        filename: "portrait.jpg",
        preview:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        imageWidth: 800,
        imageHeight: 1000,
        landmarks: {
          leftEye: { x: 0.4, y: 0.4 },
          rightEye: { x: 0.6, y: 0.4 },
          eyeCenter: { x: 0.5, y: 0.4 },
          chin: { x: 0.5, y: 0.7 },
          forehead: { x: 0.5, y: 0.25 },
          crown: { x: 0.5, y: 0.15 },
          nose: { x: 0.5, y: 0.5 },
          faceCenterX: 0.5,
        },
      },
    });
    vi.mocked(track).mockClear();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              downloadUrl: "/api/v1/download/job-pass/out.jpg",
              dimensions: { width: 600, height: 600 },
              spec: { country: "US", document: "passport" },
            }),
            { status: 200 },
          ),
      ),
    );

    render(<PassportPhotoSettings />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("passport-photo-generate"));
    });

    // Adjusting crop resets generateResult and re-exposes the Generate button
    act(() => {
      usePassportPhotoStore.getState().setAdjustX(0.05);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("passport-photo-generate"));
    });

    expect(startedCallsFor("passport-photo")).toEqual([
      [
        ANALYTICS_EVENTS.TOOL_STARTED,
        { tool_id: "passport-photo", is_batch: false, file_count: 1 },
      ],
      [
        ANALYTICS_EVENTS.TOOL_STARTED,
        { tool_id: "passport-photo", is_batch: false, file_count: 1 },
      ],
    ]);
  });

  it("emits tool_started for store-driven tools (meme-generator, html-to-image, pdf-to-image)", async () => {
    useMemeStore.setState({
      selectedTemplate: {
        id: "drake",
        name: "Drake",
        imageUrl: "/templates/drake.jpg",
        width: 500,
        height: 500,
        category: "classic",
        textBoxes: [],
      },
    });
    await act(async () => {
      await useMemeStore.getState().generateMeme();
      await useMemeStore.getState().generateMeme();
    });
    expect(startedCallsFor("meme-generator")).toEqual([
      [
        ANALYTICS_EVENTS.TOOL_STARTED,
        { tool_id: "meme-generator", is_batch: false, file_count: 1 },
      ],
      [
        ANALYTICS_EVENTS.TOOL_STARTED,
        { tool_id: "meme-generator", is_batch: false, file_count: 1 },
      ],
    ]);

    useHtmlToImageStore.setState({ mode: "url", url: "https://example.com" });
    await act(async () => {
      await useHtmlToImageStore.getState().capture();
      await useHtmlToImageStore.getState().capture();
    });
    expect(startedCallsFor("html-to-image")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "html-to-image", is_batch: false, file_count: 1 }],
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "html-to-image", is_batch: false, file_count: 1 }],
    ]);

    const pdfFile = makeFile("doc.pdf", "application/pdf");
    useFileStore.getState().setFiles([pdfFile]);
    usePdfToImageStore.setState({
      file: pdfFile,
      pageCount: 2,
      selectedPages: new Set([1, 2]),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              pages: [
                {
                  page: 1,
                  downloadUrl: "/api/v1/download/j/p1.png",
                  width: 100,
                  height: 100,
                  size: 50,
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    await act(async () => {
      await usePdfToImageStore.getState().convert();
      await usePdfToImageStore.getState().convert();
    });
    expect(startedCallsFor("pdf-to-image")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "pdf-to-image", is_batch: false, file_count: 1 }],
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "pdf-to-image", is_batch: false, file_count: 1 }],
    ]);
  });

  it("emits tool_started for remaining custom settings panels without double-firing on hybrid tools", async () => {
    // 1. qr-generate
    useQrStore.getState().setTextData("https://snapotter.com");
    const qrView = render(<QrGenerateSettings />);
    fireEvent.click(screen.getByTestId("qr-generate-download"));
    fireEvent.click(screen.getByTestId("qr-generate-download"));
    expect(startedCallsFor("qr-generate")).toHaveLength(2);
    qrView.unmount();

    // 2. barcode-generate
    const barcodeGenView = render(<BarcodeGenerateSettings />);
    fireEvent.change(screen.getByTestId("barcode-input-text"), { target: { value: "123456" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("barcode-generate-submit"));
    });
    expect(startedCallsFor("barcode-generate")).toEqual([
      [
        ANALYTICS_EVENTS.TOOL_STARTED,
        { tool_id: "barcode-generate", is_batch: false, file_count: 1 },
      ],
    ]);
    barcodeGenView.unmount();

    // 3. collage
    useCollageStore.getState().addImages([makeFile("c1.png"), makeFile("c2.png")]);
    vi.mocked(track).mockClear();
    const collageView = render(<CollageSettings />);
    act(() => {
      fireEvent.click(screen.getByTestId("collage-submit"));
    });
    expect(startedCallsFor("collage")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "collage", is_batch: false, file_count: 2 }],
    ]);
    collageView.unmount();

    // 4. stitch & find-duplicates (multi-file)
    useFileStore.getState().setFiles([makeFile("s1.png"), makeFile("s2.png")]);
    vi.mocked(track).mockClear();
    const stitchView = render(<StitchSettings />);
    fireEvent.click(screen.getByTestId("stitch-submit"));
    expect(startedCallsFor("stitch")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "stitch", is_batch: false, file_count: 2 }],
    ]);
    stitchView.unmount();

    const dupView = render(<FindDuplicatesSettings />);
    fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    expect(startedCallsFor("find-duplicates")).toEqual([
      [
        ANALYTICS_EVENTS.TOOL_STARTED,
        { tool_id: "find-duplicates", is_batch: false, file_count: 2 },
      ],
    ]);
    dupView.unmount();

    // 5. info, color-palette, favicon, image-to-pdf, image-to-base64, split, bulk-rename, ocr
    useFileStore.getState().setFiles([makeFile("single.png")]);
    vi.mocked(track).mockClear();

    const infoView = render(<InfoSettings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("info-submit"));
    });
    // Retry after failed/uncached response fires tool_started again
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              filename: "single.png",
              fileSize: 100,
              width: 10,
              height: 10,
              format: "png",
              channels: 4,
              hasAlpha: true,
              colorSpace: "srgb",
              density: 72,
              isProgressive: false,
              orientation: null,
              hasProfile: false,
              hasExif: false,
              hasIcc: false,
              hasXmp: false,
              bitDepth: "uchar",
              pages: 1,
              histogram: [{ channel: "red", min: 0, max: 255, mean: 128, stdev: 10 }],
            }),
          ),
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("info-submit"));
    });
    expect(startedCallsFor("info")).toHaveLength(2);
    // Subsequent click on the now-cached entry serves from memory without a new run
    await act(async () => {
      fireEvent.click(screen.getByTestId("info-submit"));
    });
    expect(startedCallsFor("info")).toHaveLength(2);
    infoView.unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ downloadUrl: "/api/v1/download/j/o.png" }))),
    );

    const paletteView = render(<ColorPaletteSettings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("color-palette-submit"));
    });
    expect(startedCallsFor("color-palette")).toHaveLength(1);
    paletteView.unmount();

    const faviconView = render(<FaviconSettings />);
    fireEvent.click(screen.getByTestId("favicon-submit"));
    expect(startedCallsFor("favicon")).toHaveLength(1);
    faviconView.unmount();

    const imgPdfView = render(<ImageToPdfSettings />);
    fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    expect(startedCallsFor("image-to-pdf")).toHaveLength(1);
    imgPdfView.unmount();

    const base64View = render(<ImageToBase64Settings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("base64-submit"));
    });
    expect(startedCallsFor("image-to-base64")).toHaveLength(1);
    base64View.unmount();

    const splitView = render(<SplitSettings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("split-submit"));
    });
    expect(startedCallsFor("split")).toHaveLength(1);
    splitView.unmount();

    const renameView = render(<BulkRenameSettings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("bulk-rename-submit"));
    });
    expect(startedCallsFor("bulk-rename")).toHaveLength(1);
    renameView.unmount();

    const ocrView = render(<OcrSettings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("ocr-submit"));
    });
    expect(startedCallsFor("ocr")).toHaveLength(1);
    ocrView.unmount();

    useFileStore.getState().setFiles([makeFile("barcode.png")]);
    vi.mocked(track).mockClear();
    const barcodeReadView = render(<BarcodeReadSettings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("barcode-read-submit"));
    });
    expect(startedCallsFor("barcode-read")).toHaveLength(1);
    barcodeReadView.unmount();

    // 6. compose, watermark-image, compare (two-input tools)
    useFileStore.getState().setFiles([makeFile("base.png")]);
    vi.mocked(track).mockClear();

    const composeView = render(<ComposeSettings />);
    fireEvent.change(
      composeView.container.querySelector("#compose-overlay-image") as HTMLInputElement,
      { target: { files: [makeFile("overlay.png")] } },
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("compose-submit"));
    });
    expect(startedCallsFor("compose")).toHaveLength(1);
    composeView.unmount();

    const wmView = render(<WatermarkImageSettings />);
    fireEvent.change(wmView.container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [makeFile("wm.png")] },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
    });
    expect(startedCallsFor("watermark-image")).toHaveLength(1);
    wmView.unmount();

    const compareView = render(<CompareSettings />);
    fireEvent.change(
      compareView.container.querySelector("#compare-second-image") as HTMLInputElement,
      { target: { files: [makeFile("second.png")] } },
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("compare-submit"));
    });
    expect(startedCallsFor("compare")).toHaveLength(1);
    compareView.unmount();

    // 7. beautify: standard path vs image-background manual path (no double-fire)
    useFileStore.getState().setFiles([makeFile("shot.png")]);
    vi.mocked(track).mockClear();
    const beautifyView = render(<BeautifySettings />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("beautify-submit"));
    });
    expect(startedCallsFor("beautify")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "beautify", is_batch: false, file_count: 1 }],
    ]);
    beautifyView.unmount();

    useFileStore.getState().setFiles([makeFile("shot2.png")]);
    vi.mocked(track).mockClear();
    const beautifyImgView = render(<BeautifySettings />);
    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.change(
      beautifyImgView.container.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [makeFile("bg.png")] } },
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("beautify-submit"));
    });
    expect(startedCallsFor("beautify")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "beautify", is_batch: false, file_count: 1 }],
    ]);
    beautifyImgView.unmount();
  });

  it("does not double-fire tool_started when processAllFiles is called with a single file", async () => {
    useFileStore.getState().setFiles([makeFile("one.png")]);
    vi.mocked(track).mockClear();

    const { result } = renderHook(() => useToolProcessor("resize"));
    await act(async () => {
      await result.current.processAllFiles(useFileStore.getState().files, { width: 100 });
    });

    expect(startedCallsFor("resize")).toEqual([
      [ANALYTICS_EVENTS.TOOL_STARTED, { tool_id: "resize", is_batch: false, file_count: 1 }],
    ]);
  });

  it("includes tool_id on file_added when files are added on a tool route", async () => {
    window.history.replaceState({}, "", "/image/erase-object");
    vi.mocked(track).mockClear();

    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().addFiles([makeFile("b.png")]);

    await vi.waitFor(() => {
      expect(
        vi.mocked(track).mock.calls.filter(([e]) => e === ANALYTICS_EVENTS.FILE_ADDED),
      ).toEqual([
        [ANALYTICS_EVENTS.FILE_ADDED, { tool_id: "erase-object", file_count: 1 }],
        [ANALYTICS_EVENTS.FILE_ADDED, { tool_id: "erase-object", file_count: 1 }],
      ]);
    });

    // Non-tool routes omit tool_id
    window.history.replaceState({}, "", "/automate");
    vi.mocked(track).mockClear();
    useFileStore.getState().setFiles([makeFile("auto.png")]);
    expect(vi.mocked(track)).toHaveBeenCalledWith(ANALYTICS_EVENTS.FILE_ADDED, {
      file_count: 1,
    });

    // Collage uses its own store for image intake
    vi.mocked(track).mockClear();
    useCollageStore.getState().addImages([makeFile("c1.png"), makeFile("c2.png")]);
    expect(vi.mocked(track)).toHaveBeenCalledWith(ANALYTICS_EVENTS.FILE_ADDED, {
      tool_id: "collage",
      file_count: 2,
    });
  });
});
