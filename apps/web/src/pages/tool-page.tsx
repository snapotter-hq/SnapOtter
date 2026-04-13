import { TOOLS } from "@stirling-image/shared";
import * as icons from "lucide-react";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Crop } from "react-image-crop";
import { useParams } from "react-router-dom";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { Dropzone } from "@/components/common/dropzone";
import { type BgPreviewState, ImageViewer } from "@/components/common/image-viewer";
import { ReviewPanel } from "@/components/common/review-panel";
import { SideBySideComparison } from "@/components/common/side-by-side-comparison";
import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { AppLayout } from "@/components/layout/app-layout";
import { CropCanvas } from "@/components/tools/crop-canvas";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { EraserCanvas } from "@/components/tools/eraser-canvas";
import type { PreviewTransform } from "@/components/tools/rotate-settings";
import { useMobile } from "@/hooks/use-mobile";
import { formatFileSize } from "@/lib/download";
import { getToolRegistryEntry } from "@/lib/tool-registry";
import { useFileStore } from "@/stores/file-store";

/** Formats that browsers can render in <img> tags. */
const BROWSER_PREVIEWABLE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);

function canBrowserPreview(url: string, filename?: string | null): boolean {
  // For blob URLs from batch processing, check the real filename instead
  const source = filename ?? url;
  const ext = decodeURIComponent(source).split(".").pop()?.toLowerCase() ?? "";
  return BROWSER_PREVIEWABLE_EXTS.has(ext);
}

/** File selection indicator shown in left panel */
function FileSelectionInfo({
  files,
  selectedFileName,
  selectedFileSize,
  onClear,
  onAddMore,
}: {
  files: File[];
  selectedFileName: string | null;
  selectedFileSize: number | null;
  onClear: () => void;
  onAddMore: () => void;
}) {
  if (files.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">Drop or upload an image to get started</p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Files ({files.length})</span>
        <button
          type="button"
          onClick={onAddMore}
          className="text-xs text-primary hover:text-primary/80"
        >
          + Add more
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-foreground bg-muted rounded px-2 py-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span className="truncate flex-1">{selectedFileName ?? files[0].name}</span>
        <span className="text-muted-foreground shrink-0 ml-1">
          {formatFileSize(selectedFileSize ?? files[0].size)}
        </span>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const tool = useMemo(() => TOOLS.find((t) => t.id === toolId), [toolId]);
  const registryEntry = useMemo(
    () => (toolId ? getToolRegistryEntry(toolId) : undefined),
    [toolId],
  );
  const {
    files,
    entries,
    setFiles,
    addFiles,
    reset,
    processedUrl,
    processedPreviewUrl,
    originalBlobUrl,
    originalSize,
    processedSize,
    selectedFileName,
    selectedFileSize,
    undoProcessing,
    batchZipBlob,
    batchZipFilename,
    selectedIndex,
    setSelectedIndex,
    navigateNext,
    navigatePrev,
    currentEntry,
  } = useFileStore();
  const isMobile = useMobile();
  const hasMultiple = entries.length > 1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < entries.length - 1;

  const handleImageKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateNext();
      }
    },
    [navigateNext, navigatePrev],
  );
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(true);
  const [previewTransform, setPreviewTransform] = useState<PreviewTransform | null>(null);
  const [previewFilter, setPreviewFilter] = useState<string>("");
  const [imageWrapperStyle, setImageWrapperStyle] = useState<React.CSSProperties | null>(null);
  const [bgPreview, setBgPreview] = useState<BgPreviewState | null>(null);

  const [cropCrop, setCropCrop] = useState<Crop>({
    unit: "%",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);
  const [cropShowGrid, setCropShowGrid] = useState(true);
  const [cropImgDimensions, setCropImgDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const cropState = useMemo(
    () => ({
      crop: cropCrop,
      aspect: cropAspect,
      showGrid: cropShowGrid,
      imgDimensions: cropImgDimensions,
    }),
    [cropCrop, cropAspect, cropShowGrid, cropImgDimensions],
  );

  // Eraser state
  const eraserRef = useRef<EraserCanvasRef | null>(null);
  const [eraserHasStrokes, setEraserHasStrokes] = useState(false);
  const [eraserBrushSize, setEraserBrushSize] = useState(30);

  // Reset crop state when the image changes
  useEffect(() => {
    setCropCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
    setCropImgDimensions(null);
  }, []);

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      reset();
      setFiles(newFiles);
    },
    [setFiles, reset],
  );

  const handleUndo = useCallback(() => {
    undoProcessing();
  }, [undoProcessing]);

  const handleAddMore = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.heic,.heif,.hif";
    input.onchange = (e) => {
      const newFiles = Array.from((e.target as HTMLInputElement).files || []);
      if (newFiles.length > 0) addFiles(newFiles);
    };
    input.click();
  }, [addFiles]);

  const handleDownloadAll = useCallback(() => {
    if (!batchZipBlob) return;
    const url = URL.createObjectURL(batchZipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = batchZipFilename ?? "processed-images.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [batchZipBlob, batchZipFilename]);

  if (!tool || !registryEntry) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Tool not found
        </div>
      </AppLayout>
    );
  }

  const IconComponent =
    (icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[tool.icon] ||
    icons.FileImage;

  const hasFile = files.length > 0;
  const hasProcessed = !!processedUrl;
  const displayMode = registryEntry.displayMode;
  const isNoDropzone = displayMode === "no-dropzone";
  const isLivePreview = registryEntry.livePreview ?? false;

  // Derive processed file info: use stored filename for batch results (blob URLs),
  // fall back to parsing the download URL for single-file results
  const processedFileName =
    currentEntry?.processedFilename ??
    (processedUrl
      ? decodeURIComponent(processedUrl.split("/").pop() ?? "processed-image")
      : "processed-image");
  const processedFileType = processedFileName.split(".").pop()?.toUpperCase() || "IMAGE";
  const isProcessedPreviewable = processedUrl
    ? canBrowserPreview(processedUrl, currentEntry?.processedFilename)
    : false;
  // Use server-generated preview for non-previewable formats (HEIC, TIFF).
  // Always a string when hasProcessed is true (processedUrl is non-null).
  const displayUrl = (processedPreviewUrl ?? processedUrl) as string;

  // Build settings props
  const settingsProps = {
    onPreviewTransform: isLivePreview ? setPreviewTransform : undefined,
    onPreviewFilter: isLivePreview ? setPreviewFilter : undefined,
    onImageStyle: isLivePreview ? setImageWrapperStyle : undefined,
    onBgPreview: setBgPreview,
    cropProps:
      displayMode === "interactive-crop"
        ? {
            cropState,
            onCropChange: setCropCrop,
            onAspectChange: setCropAspect,
            onGridToggle: setCropShowGrid,
          }
        : undefined,
    eraserProps:
      displayMode === "interactive-eraser"
        ? {
            eraserRef,
            hasStrokes: eraserHasStrokes,
            brushSize: eraserBrushSize,
            onBrushSizeChange: setEraserBrushSize,
          }
        : undefined,
  };

  const ToolSettings = registryEntry.Settings;

  // Render the image viewer based on display mode
  function renderImageArea() {
    if (isNoDropzone) {
      if (registryEntry?.ResultsPanel) {
        const Panel = registryEntry.ResultsPanel;
        return (
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
            <Panel />
          </Suspense>
        );
      }
      return (
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Configure settings and generate.</p>
        </div>
      );
    }

    // Show error state for failed batch files (before interactive canvas blocks,
    // which also match !hasProcessed and would show the canvas instead of the error)
    if (hasFile && !hasProcessed && currentEntry?.status === "failed") {
      return (
        <div className="flex flex-col items-center justify-center gap-3 h-full text-center px-4">
          <p className="text-sm text-red-500">
            {currentEntry.error ?? "Processing failed for this file"}
          </p>
        </div>
      );
    }

    // Custom results panel (find-duplicates, etc.)
    if (displayMode === "custom-results" && registryEntry?.ResultsPanel) {
      if (!hasFile)
        return <Dropzone onFiles={handleFiles} accept="image/*" multiple currentFiles={files} />;
      const ResultsPanel = registryEntry.ResultsPanel;
      return (
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <ResultsPanel />
        </Suspense>
      );
    }

    if (displayMode === "interactive-crop" && hasFile && !hasProcessed && originalBlobUrl) {
      return (
        <CropCanvas
          imageSrc={originalBlobUrl}
          crop={cropCrop}
          aspect={cropAspect}
          showGrid={cropShowGrid}
          imgDimensions={cropImgDimensions}
          onCropChange={setCropCrop}
          onImageLoad={setCropImgDimensions}
        />
      );
    }

    if (displayMode === "interactive-eraser" && hasFile && !hasProcessed && originalBlobUrl) {
      return (
        <EraserCanvas
          ref={eraserRef}
          imageSrc={originalBlobUrl}
          brushSize={eraserBrushSize}
          onStrokeChange={setEraserHasStrokes}
        />
      );
    }

    if (displayMode === "interactive-split" && hasFile && originalBlobUrl) {
      if (registryEntry?.ResultsPanel) {
        const Panel = registryEntry.ResultsPanel;
        return (
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
            <Panel />
          </Suspense>
        );
      }
    }

    // Non-previewable format with no server-generated preview - show success card
    if (hasProcessed && !isProcessedPreviewable && !processedPreviewUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium">Conversion complete</p>
            <p className="text-xs text-muted-foreground mt-1">{processedFileName}</p>
            {processedSize != null && (
              <p className="text-xs text-muted-foreground">
                {formatFileSize(processedSize)} · {processedFileType}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-w-xs">
            {processedFileType} files cannot be previewed in the browser. Use the download button to
            save your file.
          </p>
        </div>
      );
    }

    if (
      hasProcessed &&
      originalBlobUrl &&
      (displayMode === "side-by-side" || displayMode === "interactive-crop")
    ) {
      return (
        <SideBySideComparison
          beforeSrc={originalBlobUrl}
          afterSrc={displayUrl}
          beforeSize={originalSize ?? undefined}
          afterSize={processedSize ?? undefined}
        />
      );
    }

    if (
      hasProcessed &&
      originalBlobUrl &&
      (displayMode === "live-preview" || displayMode === "no-comparison")
    ) {
      return (
        <ImageViewer src={displayUrl} filename={processedFileName} fileSize={processedSize ?? 0} />
      );
    }

    if (hasProcessed && originalBlobUrl) {
      // When bg preview state is set (remove-background effects mode),
      // show the ImageViewer with layered CSS preview instead of before/after slider
      if (bgPreview) {
        return (
          <ImageViewer
            src={displayUrl}
            filename={processedFileName}
            fileSize={processedSize ?? 0}
            bgPreview={bgPreview}
          />
        );
      }
      return (
        <BeforeAfterSlider
          beforeSrc={originalBlobUrl}
          afterSrc={displayUrl}
          beforeSize={originalSize ?? undefined}
          afterSize={processedSize ?? undefined}
        />
      );
    }

    if (hasFile && currentEntry?.previewLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Generating preview...</p>
          <p className="text-xs text-muted-foreground/60">{selectedFileName}</p>
        </div>
      );
    }

    if (hasFile && originalBlobUrl) {
      return (
        <ImageViewer
          src={originalBlobUrl}
          filename={selectedFileName ?? files[0].name}
          fileSize={selectedFileSize ?? files[0].size}
          {...(isLivePreview && previewTransform
            ? {
                cssRotate: previewTransform.rotate,
                cssFlipH: previewTransform.flipH,
                cssFlipV: previewTransform.flipV,
              }
            : {})}
          {...(isLivePreview && previewFilter ? { cssFilter: previewFilter } : {})}
          {...(isLivePreview && imageWrapperStyle ? { imageWrapperStyle } : {})}
        />
      );
    }

    return <Dropzone onFiles={handleFiles} accept="image/*" multiple currentFiles={files} />;
  }

  // Navigation arrows (shared between mobile/desktop)
  function renderNavArrows() {
    return (
      <>
        {hasMultiple && hasPrev && (
          <button
            type="button"
            onClick={navigatePrev}
            className="absolute left-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {hasMultiple && hasNext && (
          <button
            type="button"
            onClick={navigateNext}
            className="absolute right-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {hasMultiple && (
          <div className="absolute top-3 right-3 z-10 bg-background/80 border border-border px-2 py-0.5 rounded-full text-xs text-muted-foreground tabular-nums">
            {selectedIndex + 1} / {entries.length}
          </div>
        )}
      </>
    );
  }

  // Render the settings panel content (shared between mobile/desktop)
  function renderSettingsContent() {
    return (
      <>
        {!isNoDropzone && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Files</h3>
            <FileSelectionInfo
              files={files}
              selectedFileName={selectedFileName}
              selectedFileSize={selectedFileSize}
              onClear={reset}
              onAddMore={handleAddMore}
            />
          </div>
        )}

        <div className="border-t border-border" />

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Settings</h3>
          <Suspense fallback={<div className="text-xs text-muted-foreground">Loading...</div>}>
            <ToolSettings {...settingsProps} />
          </Suspense>
        </div>

        {/* Batch download — shown right after settings for easy access */}
        {entries.length > 1 && hasProcessed && batchZipBlob && (
          <button
            type="button"
            onClick={handleDownloadAll}
            className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
          >
            <Download className="h-4 w-4" />
            Download All (ZIP)
          </button>
        )}

        {hasProcessed && processedSize != null && (
          <ReviewPanel
            filename={processedFileName}
            fileSize={processedSize}
            fileType={processedFileType}
            downloadUrl={processedUrl}
            previewUrl={isProcessedPreviewable ? processedUrl : (processedPreviewUrl ?? undefined)}
            onUndo={handleUndo}
            currentToolId={tool?.id ?? ""}
          />
        )}
      </>
    );
  }

  // Mobile layout: settings above dropzone (stacked)
  if (isMobile) {
    return (
      <AppLayout showToolPanel={false}>
        <div className="flex flex-col w-full h-full">
          {/* Tool header */}
          <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <IconComponent className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg text-foreground flex-1">{tool.name}</h2>
            <button
              type="button"
              onClick={() => setMobileSettingsOpen(!mobileSettingsOpen)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted"
            >
              {mobileSettingsOpen ? "Hide Settings" : "Settings"}
            </button>
          </div>

          {/* Collapsible settings */}
          {mobileSettingsOpen && (
            <div className="p-4 border-b border-border space-y-3 shrink-0 max-h-[40vh] overflow-y-auto">
              {renderSettingsContent()}
            </div>
          )}

          {/* Main area: image viewer */}
          <section
            aria-label="Image area"
            className="flex-1 flex flex-col min-h-0"
            onKeyDown={hasMultiple ? handleImageKeyDown : undefined}
            tabIndex={hasMultiple ? 0 : undefined}
          >
            <div className="flex-1 relative flex items-center justify-center p-4 min-h-0">
              {renderNavArrows()}
              {renderImageArea()}
            </div>
            {hasMultiple && (
              <ThumbnailStrip
                entries={entries}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
              />
            )}
          </section>
        </div>
      </AppLayout>
    );
  }

  // Desktop layout: side-by-side
  return (
    <AppLayout showToolPanel={false}>
      <div className="flex h-full w-full">
        {/* Tool Settings Panel */}
        <div className="w-72 border-r border-border p-4 space-y-4 overflow-y-auto shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <IconComponent className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg text-foreground">{tool.name}</h2>
          </div>

          {renderSettingsContent()}
        </div>

        {/* Main area: image viewer */}
        <section
          aria-label="Image area"
          className="flex-1 flex flex-col min-h-0"
          onKeyDown={hasMultiple ? handleImageKeyDown : undefined}
          tabIndex={hasMultiple ? 0 : undefined}
        >
          <div className="flex-1 relative flex items-center justify-center p-6 min-h-0">
            {renderNavArrows()}
            {renderImageArea()}
          </div>
          {hasMultiple && (
            <ThumbnailStrip
              entries={entries}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />
          )}
        </section>
      </div>
    </AppLayout>
  );
}
