import {
  getRequiredBundlesForTool,
  PYTHON_SIDECAR_TOOLS,
  SECTIONS,
  TOOLS,
  toolSection,
} from "@snapotter/shared";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Download,
  FileImage,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Crop } from "react-image-crop";
import { Link, useLocation, useParams } from "react-router-dom";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { BottomSheet } from "@/components/common/bottom-sheet";
import { Dropzone } from "@/components/common/dropzone";
import { type BgPreviewState, ImageViewer } from "@/components/common/image-viewer";
import { ReviewPanel } from "@/components/common/review-panel";
import { SideBySideComparison } from "@/components/common/side-by-side-comparison";
import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { ToolDropzone } from "@/components/common/tool-dropzone";
import { FeatureInstallPrompt } from "@/components/features/feature-install-prompt";
import { AppLayout } from "@/components/layout/app-layout";
import { CropCanvas } from "@/components/tools/crop-canvas";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { EraserCanvas } from "@/components/tools/eraser-canvas";
import type { PreviewTransform } from "@/components/tools/rotate-settings";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { useMobile } from "@/hooks/use-mobile";
import { usePageTitle } from "@/hooks/use-page-title";
import { recordRecentTool } from "@/hooks/use-recent-tools";
import { formatFileSize } from "@/lib/download";
import { format } from "@/lib/format";
import { ICON_MAP } from "@/lib/icon-map";
import { MULTI_FILE_TOOLS } from "@/lib/tool-display-modes";
import { getToolName } from "@/lib/tool-i18n";
import { getToolRegistryEntry } from "@/lib/tool-registry";
import { useBase64Store } from "@/stores/base64-store";
import { useCollageStore } from "@/stores/collage-store";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useFeaturesStore } from "@/stores/features-store";
import { type FileEntry, useFileStore } from "@/stores/file-store";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useQrStore } from "@/stores/qr-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useSplitStore } from "@/stores/split-store";

const MediaPlayerView = lazy(() =>
  import("@/components/tools/media-player-view").then((m) => ({ default: m.MediaPlayerView })),
);
const WaveformPlayer = lazy(() =>
  import("@/components/common/waveform-player").then((m) => ({ default: m.WaveformPlayer })),
);
const DocumentView = lazy(() =>
  import("@/components/tools/document-view").then((m) => ({ default: m.DocumentView })),
);
const NonNativePreview = lazy(() =>
  import("@/components/common/non-native-preview").then((m) => ({
    default: m.NonNativePreview,
  })),
);

/**
 * Formats that browsers can render in <img> tags.
 * Intentionally image-only: all consumers (BeforeAfterSlider, SideBySideComparison,
 * ImageViewer) render via <img>. Video/audio/PDF processed outputs are handled by
 * dedicated display-mode branches (media-player, document) before this check runs.
 */
const BROWSER_PREVIEWABLE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "avif",
]);

function canBrowserPreview(url: string, filename?: string | null): boolean {
  // Blob URLs are always renderable in <img> tags — no extension to check
  if (url.startsWith("blob:")) return true;
  // For batch results, check the stored filename (has extension) rather than the blob URL
  const source = filename ?? url;
  const ext = decodeURIComponent(source).split(".").pop()?.toLowerCase() ?? "";
  return BROWSER_PREVIEWABLE_EXTS.has(ext);
}

function getFileFormat(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext.toUpperCase() || "?";
}

const COLLAPSED_LIMIT = 5;

/** Status icon for a file entry in the batch list. */
function FileStatusIcon({ status }: { status: FileEntry["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-destructive shrink-0" />;
    case "processing":
      return <Loader2 className="h-3 w-3 text-primary shrink-0 animate-spin" />;
    default:
      return <Circle className="h-3 w-3 text-muted-foreground/40 shrink-0" />;
  }
}

/** File selection indicator shown in left panel */
function FileSelectionInfo({
  files,
  fileEntries,
  selectedIndex,
  onSelect,
  onClear,
  onAddMore,
}: {
  files: File[];
  fileEntries: FileEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onClear: () => void;
  onAddMore: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (files.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{t.toolPage.emptyPrompt}</p>;
  }

  const showToggle = files.length > COLLAPSED_LIMIT;
  const visible = expanded ? files : files.slice(0, COLLAPSED_LIMIT);
  const hasAnyProcessed = fileEntries.some(
    (e) => e.status === "completed" || e.status === "failed",
  );

  return (
    <div className="space-y-1.5">
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

      <div className="space-y-0.5">
        {visible.map((file, i) => {
          const isSelected = i === selectedIndex;
          const entry = fileEntries[i];
          return (
            <button
              key={`${file.name}-${i}`}
              type="button"
              onClick={() => onSelect(i)}
              className={`w-full flex items-center gap-1.5 text-xs rounded px-2 py-1.5 text-start transition-colors ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {hasAnyProcessed && entry ? (
                <FileStatusIcon status={entry.status} />
              ) : (
                isSelected && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
              )}
              <span className="truncate flex-1 min-w-0">{file.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {getFileFormat(file.name)}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums">{formatFileSize(file.size)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        {showToggle ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:text-primary/80"
          >
            {expanded ? "Show less" : `Show ${files.length - COLLAPSED_LIMIT} more`}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

export function ToolPage() {
  const { t } = useTranslation();
  const { toolId } = useParams<{ toolId: string }>();
  const location = useLocation();
  const tool = useMemo(() => TOOLS.find((t) => t.id === toolId), [toolId]);
  const registryEntry = useMemo(
    () => (toolId ? getToolRegistryEntry(toolId) : undefined),
    [toolId],
  );
  const isAiTool = toolId ? (PYTHON_SIDECAR_TOOLS as readonly string[]).includes(toolId) : false;
  const featuresLoaded = useFeaturesStore((s) => s.loaded);
  const featureBundles = useFeaturesStore((s) => s.bundles);
  const fetchFeatures = useFeaturesStore((s) => s.fetch);
  const featureBundle = useMemo(() => {
    if (!toolId) return null;
    const required = getRequiredBundlesForTool(toolId);
    if (required.length === 0) return null;
    // A tool can need more than one bundle (e.g. passport-photo needs
    // background-removal AND face-detection). Surface the first one that is
    // still missing so the install prompt asks for what's actually needed;
    // once everything is installed, fall back to the primary bundle.
    for (const bundleId of required) {
      const bundle = featureBundles.find((b) => b.id === bundleId);
      if (bundle && bundle.status !== "installed") return bundle;
    }
    return featureBundles.find((b) => b.id === required[0]) ?? null;
  }, [toolId, featureBundles]);
  const toolInstalled = featureBundle ? featureBundle.status === "installed" : !isAiTool;
  const showSizeComparison = toolId === "compress" || toolId === "optimize-for-web";
  usePageTitle(tool ? getToolName(t, tool.id, tool.name) : undefined);
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission("settings:write");
  const disabledTools = useSettingsStore((s) => s.disabledTools);

  const breadcrumb = useMemo(() => {
    if (!tool) return undefined;
    const section = toolSection(tool);
    const sectionInfo = SECTIONS.find((s) => s.id === section);
    return {
      modality: sectionInfo?.name ?? section,
      modalityTab: section,
      toolName: getToolName(t, tool.id, tool.name),
    };
  }, [tool, t]);

  useEffect(() => {
    if (isAiTool) fetchFeatures();
  }, [isAiTool, fetchFeatures]);

  useEffect(() => {
    if (tool) {
      recordRecentTool(tool.id);
    }
  }, [tool]);

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

  const liveMessage = useMemo(() => {
    if (!currentEntry) return "";
    if (currentEntry.status === "completed" && processedUrl) return t.a11y.processingComplete;
    if (currentEntry.status === "failed") return t.a11y.processingFailed;
    return "";
  }, [currentEntry, processedUrl, t.a11y.processingComplete, t.a11y.processingFailed]);

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
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [previewTransform, setPreviewTransform] = useState<PreviewTransform | null>(null);
  const [previewFilter, setPreviewFilter] = useState<string>("");
  const [imageWrapperStyle, setImageWrapperStyle] = useState<React.CSSProperties | null>(null);
  const [imageWrapperChildren, setImageWrapperChildren] = useState<React.ReactNode>(null);
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
  const [eraserMaskedCount, setEraserMaskedCount] = useState(0);
  // Center of the painted mask as a 0-100 percentage — used to init the slider at the right spot
  const [eraserSliderInitPos, setEraserSliderInitPos] = useState<number | null>(null);

  // Page-level drag overlay state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);
  const isMultiFileTool = toolId ? MULTI_FILE_TOOLS.has(toolId) : false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: toolId triggers intentional reset on tool navigation
  useEffect(() => {
    const fromLibrary = (location.state as { fromLibrary?: boolean } | null)?.fromLibrary;
    if (!fromLibrary) {
      useFileStore.getState().reset();
    }

    useBase64Store.getState().reset();
    useCollageStore.getState().reset();
    useDuplicateStore.getState().reset();
    usePdfToImageStore.getState().reset();
    useQrStore.getState().reset();
    useSplitStore.getState().reset();
    useHtmlToImageStore.getState().reset();

    setPreviewTransform(null);
    setPreviewFilter("");
    setBgPreview(null);
    setCropCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
    setCropAspect(undefined);
    setCropShowGrid(true);
    setCropImgDimensions(null);
    setEraserHasStrokes(false);
    setEraserMaskedCount(0);
    setEraserBrushSize(30);
    setEraserSliderInitPos(null);
    setMobileSettingsOpen(false);
  }, [toolId]);

  const toolAccept = registryEntry?.accept ?? (tool?.acceptedInputs?.join(",") || undefined);
  const acceptsAnyFile = !registryEntry?.accept && tool?.acceptedInputs?.length === 0;
  const toolAcceptExts = useMemo(
    () =>
      toolAccept
        ?.split(",")
        .map((e) => e.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean),
    [toolAccept],
  );
  const toolFileFilter = useMemo(() => {
    if (acceptsAnyFile) return () => true;
    if (!toolAcceptExts || toolAcceptExts.length === 0) return undefined;
    return (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      return toolAcceptExts.includes(ext);
    };
  }, [toolAcceptExts, acceptsAnyFile]);
  const toolAcceptDescription = useMemo(
    () =>
      toolAcceptExts && toolAcceptExts.length > 0
        ? `${toolAcceptExts.map((e) => e.toUpperCase()).join(", ")} files only`
        : undefined,
    [toolAcceptExts],
  );

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      setEraserSliderInitPos(null);
      reset();
      setFiles(newFiles);
    },
    [setFiles, reset],
  );

  const handleUrlImport = useCallback(
    (file: File) => {
      addFiles([file]);
    },
    [addFiles],
  );

  const handleUndo = useCallback(() => {
    undoProcessing();
    setEraserSliderInitPos(null);
  }, [undoProcessing]);

  const startOver = useCallback(() => {
    reset();
  }, [reset]);

  const handleAddMore = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (!acceptsAnyFile) {
      input.accept =
        toolAccept ??
        "image/*,.avif,.heic,.heif,.hif,.jxl,.dng,.cr2,.cr3,.nef,.nrw,.arw,.orf,.rw2,.raf,.pef,.3fr,.iiq,.srw,.x3f,.rwl,.gpr,.fff,.mrw,.mef,.kdc,.dcr,.erf,.ptx,.tga,.psd,.exr,.hdr,.svgz,.jp2,.j2k,.qoi,.eps,.dds,.cur,.apng,.dpx,.cin,.fits,.ppm,.pgm,.pbm,.pfm";
    }
    input.onchange = (e) => {
      const selected = Array.from((e.target as HTMLInputElement).files || []);
      const newFiles = toolFileFilter ? selected.filter(toolFileFilter) : selected;
      if (newFiles.length > 0) addFiles(newFiles);
    };
    input.click();
  }, [addFiles, toolAccept, toolFileFilter, acceptsAnyFile]);

  // Page-level drag handlers (active when a file is already loaded)
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDraggingOver(false);
  }, []);

  const handlePageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDraggingOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      const validFiles = toolFileFilter ? droppedFiles.filter(toolFileFilter) : droppedFiles;
      if (validFiles.length === 0) return;
      if (isMultiFileTool) {
        addFiles(validFiles);
      } else {
        setFiles(validFiles);
      }
    },
    [toolFileFilter, addFiles, setFiles, isMultiFileTool],
  );

  // Document-level paste handler (skip for generator tools that don't accept file input)
  useEffect(() => {
    if (registryEntry?.displayMode === "no-dropzone") return;

    const handlePaste = (e: ClipboardEvent) => {
      const pastedFiles: File[] = [];
      if (e.clipboardData?.files.length) {
        pastedFiles.push(...Array.from(e.clipboardData.files));
      } else if (e.clipboardData?.items) {
        for (const item of Array.from(e.clipboardData.items)) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) pastedFiles.push(file);
          }
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        const filtered = toolFileFilter ? pastedFiles.filter(toolFileFilter) : pastedFiles;
        if (filtered.length > 0) {
          if (isMultiFileTool) addFiles(filtered);
          else setFiles(filtered);
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [toolFileFilter, isMultiFileTool, addFiles, setFiles, registryEntry?.displayMode]);

  const handleDownloadAll = useCallback(() => {
    if (!batchZipBlob) return;
    const url = URL.createObjectURL(batchZipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = batchZipFilename ?? "processed-files.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [batchZipBlob, batchZipFilename]);

  if (toolId && TOOLS.some((tt) => tt.id === toolId) && disabledTools.includes(toolId)) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
          <p className="text-lg font-medium">{t.toolPage.disabledByAdmin}</p>
          <Link
            to="/"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            {t.toolPage.browseOtherTools}
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (!tool || !registryEntry) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
          <p className="text-lg font-medium">{t.toolPage.notFound}</p>
          <Link
            to="/"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            {t.common.goHome}
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (isAiTool && !featuresLoaded) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {t.common.loading}
        </div>
      </AppLayout>
    );
  }

  if (isAiTool && !toolInstalled && featureBundle) {
    return (
      <AppLayout breadcrumb={breadcrumb}>
        <div className="flex-1 overflow-y-auto bg-muted/20">
          <div className="flex items-center justify-center min-h-full">
            <FeatureInstallPrompt
              bundle={featureBundle}
              isAdmin={isAdmin}
              toolName={tool?.name}
              toolDescription={tool?.description}
            />
          </div>
        </div>
      </AppLayout>
    );
  }

  const IconComponent =
    (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;

  const hasFile = files.length > 0;
  const hasProcessed = !!processedUrl;
  const isProcessing = currentEntry?.status === "processing";
  const displayMode = registryEntry.displayMode;
  const isNoDropzone = displayMode === "no-dropzone";
  const isLivePreview = registryEntry.livePreview ?? false;

  // Derive processed file info: use stored filename for batch results (blob URLs),
  // fall back to parsing the download URL for single-file results
  const processedFileName =
    currentEntry?.processedFilename ??
    (processedUrl
      ? decodeURIComponent(processedUrl.split("/").pop() ?? "processed-file")
      : "processed-file");
  const processedFileType = processedFileName.split(".").pop()?.toUpperCase() || "FILE";
  const isProcessedPreviewable = processedUrl
    ? canBrowserPreview(processedUrl, currentEntry?.processedFilename ?? processedFileName)
    : false;
  // Use server-generated preview for non-previewable formats (HEIC, TIFF).
  // Falls back to the upload-decoded blobUrl so TIFF/DNG always have a renderable src.
  const displayUrl = (processedPreviewUrl ??
    (isProcessedPreviewable ? processedUrl : null) ??
    originalBlobUrl ??
    processedUrl) as string;

  // Build settings props
  const settingsProps = {
    onPreviewTransform: isLivePreview ? setPreviewTransform : undefined,
    onPreviewFilter: isLivePreview ? setPreviewFilter : undefined,
    onImageStyle: isLivePreview ? setImageWrapperStyle : undefined,
    onImageOverlay: isLivePreview ? (c: React.ReactNode) => setImageWrapperChildren(c) : undefined,
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
            onMaskCenter: setEraserSliderInitPos,
            maskedFileCount: eraserMaskedCount,
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
          <p className="text-sm">{t.toolPage.configureAndGenerate}</p>
        </div>
      );
    }

    // Media player: waveform for audio, native <video> for video
    if (displayMode === "media-player" && hasFile) {
      if (tool?.modality === "audio") {
        const audioSrc = processedUrl ?? originalBlobUrl;
        if (audioSrc) {
          return (
            <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
              <WaveformPlayer src={audioSrc} />
            </Suspense>
          );
        }
      }
      // Tools that convert video to a non-video format (gif, webp, frames):
      // after processing, show the result as an image instead of a video player
      if (hasProcessed && processedUrl) {
        const outName = currentEntry?.processedFilename ?? processedFileName;
        const ext = outName.split(".").pop()?.toLowerCase();
        if (ext && ["gif", "webp", "png", "jpg", "jpeg", "apng"].includes(ext)) {
          return (
            <ImageViewer
              src={processedUrl}
              filename={outName}
              fileSize={currentEntry?.processedSize ?? 0}
            />
          );
        }
      }
      // Check if the current file is browser-playable
      const currentFileName = hasProcessed
        ? (currentEntry?.processedFilename ?? processedFileName ?? "")
        : (currentEntry?.file?.name ?? "");
      const currentExt = currentFileName.split(".").pop()?.toLowerCase() ?? "";
      const nativeVideoExts = new Set(["mp4", "webm", "ogg", "ogv", "m4v", "mov"]);
      const isNativeVideo = nativeVideoExts.has(currentExt);

      if (!isNativeVideo && currentExt) {
        const previewFile = hasProcessed ? undefined : currentEntry?.file;
        const previewSrc = hasProcessed ? (processedUrl ?? originalBlobUrl) : undefined;
        const previewSize = hasProcessed
          ? (currentEntry?.processedSize ?? 0)
          : (currentEntry?.file?.size ?? 0);
        return (
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
            <NonNativePreview
              file={previewFile}
              src={previewSrc}
              filename={currentFileName}
              fileSize={previewSize}
              modality="video"
            />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <MediaPlayerView />
        </Suspense>
      );
    }

    // Document viewer: pdf.js canvas with pagination
    if (displayMode === "document" && hasFile) {
      return (
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <DocumentView />
        </Suspense>
      );
    }

    // Show error state for failed batch files (before interactive canvas blocks,
    // which also match !hasProcessed and would show the canvas instead of the error)
    if (hasFile && !hasProcessed && currentEntry?.status === "failed") {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-3" />
            <p className="font-medium text-foreground mb-1">
              {currentEntry.error || t.toolPage.processingFailed}
            </p>
            <p className="text-sm text-muted-foreground mb-4">{t.toolPage.settingsSaved}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleUndo}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
              >
                {t.toolPage.tryAgain}
              </button>
              <button
                type="button"
                onClick={startOver}
                className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
              >
                {t.toolPage.tryDifferentFile}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Custom results panel (find-duplicates, etc.)
    if (displayMode === "custom-results" && registryEntry?.ResultsPanel) {
      if (!hasFile)
        return (
          <Dropzone
            onFiles={handleFiles}
            onUrlImport={handleUrlImport}
            accept={toolAccept ?? "image/*"}
            multiple
            currentFiles={files}
            fileFilter={toolFileFilter}
            acceptDescription={toolAcceptDescription}
          />
        );
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

    if (
      displayMode === "interactive-eraser" &&
      hasFile &&
      !hasProcessed &&
      originalBlobUrl &&
      !currentEntry?.previewLoading
    ) {
      return (
        <EraserCanvas
          ref={eraserRef}
          imageSrc={originalBlobUrl}
          brushSize={eraserBrushSize}
          onStrokeChange={setEraserHasStrokes}
          onMaskedCountChange={setEraserMaskedCount}
        />
      );
    }

    // After erasing: compare clean original vs inpainted result.
    // Initialise the divider at the center of the painted area so the comparison
    // lands right where the object was removed.
    if (displayMode === "interactive-eraser" && hasProcessed && originalBlobUrl) {
      return (
        <BeforeAfterSlider
          beforeSrc={originalBlobUrl}
          afterSrc={displayUrl}
          beforeSize={showSizeComparison ? (originalSize ?? undefined) : undefined}
          afterSize={showSizeComparison ? (processedSize ?? undefined) : undefined}
          initialPosition={eraserSliderInitPos ?? 50}
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

    // Non-previewable format with no fallback at all - show success card
    if (hasProcessed && !isProcessedPreviewable && !processedPreviewUrl && !originalBlobUrl) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 max-w-xs">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="font-medium text-foreground mb-1">{t.toolPage.conversionComplete}</p>
            <p className="text-sm text-muted-foreground mb-1">{processedFileName}</p>
            {processedSize != null && (
              <p className="text-xs text-muted-foreground/60">
                {processedFileType} &middot; {formatFileSize(processedSize)}
              </p>
            )}
          </div>
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
          beforeSize={showSizeComparison ? (originalSize ?? undefined) : undefined}
          afterSize={showSizeComparison ? (processedSize ?? undefined) : undefined}
        />
      );
    }

    if (hasProcessed && originalBlobUrl && displayMode === "no-comparison") {
      return (
        <ImageViewer src={displayUrl} filename={processedFileName} fileSize={processedSize ?? 0} />
      );
    }

    // For live-preview tools: keep showing the CSS-styled original so WYSIWYG.
    // The server-rendered result is available via download.
    if (hasProcessed && originalBlobUrl && displayMode === "live-preview" && imageWrapperStyle) {
      return (
        <ImageViewer
          src={originalBlobUrl}
          filename={selectedFileName ?? files[0].name}
          fileSize={selectedFileSize ?? files[0].size}
          imageWrapperStyle={imageWrapperStyle}
          imageWrapperChildren={imageWrapperChildren}
        />
      );
    }

    if (hasProcessed && originalBlobUrl && displayMode === "live-preview") {
      return (
        <ImageViewer src={displayUrl} filename={processedFileName} fileSize={processedSize ?? 0} />
      );
    }

    if (hasProcessed && originalBlobUrl) {
      return (
        <BeforeAfterSlider
          beforeSrc={originalBlobUrl}
          afterSrc={displayUrl}
          beforeSize={showSizeComparison ? (originalSize ?? undefined) : undefined}
          afterSize={showSizeComparison ? (processedSize ?? undefined) : undefined}
          bgPreview={bgPreview}
        />
      );
    }

    if (hasFile && currentEntry?.previewLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">{t.toolPage.generatingPreview}</p>
          <p className="text-xs text-muted-foreground">{selectedFileName}</p>
        </div>
      );
    }

    if (hasFile && originalBlobUrl) {
      const fname = selectedFileName ?? files[0].name;
      const fsize = selectedFileSize ?? files[0].size;
      if (!canBrowserPreview(originalBlobUrl, fname)) {
        const ext = fname.split(".").pop()?.toUpperCase() ?? "";
        const previewModality =
          tool?.modality === "video" ? "video" : tool?.modality === "audio" ? "audio" : null;
        if (previewModality && currentEntry?.file) {
          return (
            <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
              <NonNativePreview
                file={currentEntry.file}
                filename={fname}
                fileSize={fsize}
                modality={previewModality}
              />
            </Suspense>
          );
        }
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 max-w-xs">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <FileImage className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground mb-1">{fname}</p>
              <p className="text-sm text-muted-foreground mb-1">
                {ext} &middot; {formatFileSize(fsize)}
              </p>
              <p className="text-xs text-muted-foreground/60">{t.toolPage.previewUnavailable}</p>
            </div>
          </div>
        );
      }
      return (
        <ImageViewer
          src={originalBlobUrl}
          filename={fname}
          fileSize={fsize}
          originalWidth={currentEntry?.originalWidth}
          originalHeight={currentEntry?.originalHeight}
          {...(isLivePreview && previewTransform
            ? {
                cssRotate: previewTransform.rotate,
                cssFlipH: previewTransform.flipH,
                cssFlipV: previewTransform.flipV,
              }
            : {})}
          {...(isLivePreview && previewFilter ? { cssFilter: previewFilter } : {})}
          {...(isLivePreview && imageWrapperStyle ? { imageWrapperStyle } : {})}
          {...(isLivePreview && imageWrapperChildren ? { imageWrapperChildren } : {})}
        />
      );
    }

    return (
      <Dropzone
        onFiles={handleFiles}
        onUrlImport={handleUrlImport}
        accept={toolAccept ?? "image/*"}
        multiple
        currentFiles={files}
        fileFilter={toolFileFilter}
        acceptDescription={toolAcceptDescription}
      />
    );
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
            aria-label={t.a11y.previousImage}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {hasMultiple && hasNext && (
          <button
            type="button"
            onClick={navigateNext}
            className="absolute right-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label={t.a11y.nextImage}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {hasMultiple && (
          <div
            role="status"
            aria-label={format(t.a11y.imageNOfTotal, {
              n: selectedIndex + 1,
              total: entries.length,
            })}
            className="absolute top-3 right-3 z-10 bg-background/80 border border-border px-2 py-0.5 rounded-full text-xs text-muted-foreground tabular-nums"
          >
            {selectedIndex + 1} / {entries.length}
          </div>
        )}
      </>
    );
  }

  // Batch stats for partial failure display
  const batchTotal = entries.length;
  const batchSuccess = entries.filter((e) => e.status === "completed").length;
  const batchFailed = entries.filter((e) => e.status === "failed").length;

  // Render the settings panel content (shared between mobile/desktop)
  function renderSettingsContent() {
    return (
      <>
        {!isNoDropzone && (
          <div className="space-y-2">
            <FileSelectionInfo
              files={files}
              fileEntries={entries}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onClear={reset}
              onAddMore={handleAddMore}
            />
          </div>
        )}

        <div className="border-t border-border" />

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t.common.settings}</h3>
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
            {t.toolPage.downloadAllZip}
          </button>
        )}

        {hasProcessed && processedSize != null && (
          <div className="animate-fade-in">
            <ReviewPanel
              filename={processedFileName}
              fileSize={processedSize}
              fileType={processedFileType}
              originalSize={originalSize ?? 0}
              downloadUrl={processedUrl}
              onUndo={handleUndo}
              onStartOver={startOver}
              currentToolId={tool?.id ?? ""}
              totalCount={batchTotal}
              successCount={batchSuccess}
              failedCount={batchFailed}
            />
          </div>
        )}
      </>
    );
  }

  // Mobile layout: full-height image area with BottomSheet for settings
  if (isMobile) {
    // Full-width dropzone when no file is loaded (non-generator tools)
    if (!hasFile && !isNoDropzone) {
      return (
        <AppLayout breadcrumb={breadcrumb}>
          <div className="flex-1 overflow-y-auto bg-muted/20">
            <div className="flex items-center justify-center min-h-full">
              <ToolDropzone
                tool={tool}
                accept={toolAccept}
                fileFilter={toolFileFilter}
                multiple
                onFiles={handleFiles}
                onUrlImport={handleUrlImport}
              />
            </div>
          </div>
        </AppLayout>
      );
    }

    return (
      <AppLayout breadcrumb={breadcrumb}>
        <div
          className="flex flex-col w-full h-full"
          {...(!isNoDropzone
            ? {
                onDragEnter: handleDragEnter,
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
                onDrop: handlePageDrop,
              }
            : {})}
        >
          {/* Page-level drop overlay */}
          {isDraggingOver && !isNoDropzone && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center">
                <Upload className="mx-auto h-12 w-12 text-primary animate-bounce" />
                <p className="mt-3 text-lg font-medium">
                  {isMultiFileTool ? t.dropzone.dropToAdd : t.dropzone.dropToReplace}
                </p>
              </div>
            </div>
          )}

          {/* Tool header */}
          <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <IconComponent className="h-5 w-5" />
            </div>
            <h1 className="font-semibold text-lg text-foreground flex-1">
              {getToolName(t, tool.id, tool.name)}
            </h1>
            <button
              type="button"
              onClick={() => setMobileSettingsOpen(!mobileSettingsOpen)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted"
            >
              {t.common.settings}
            </button>
          </div>

          {/* Main area: image viewer (full height) */}
          <section
            aria-label={t.a11y.imageArea}
            className="flex-1 flex flex-col min-h-0 min-w-0"
            onKeyDown={hasMultiple ? handleImageKeyDown : undefined}
            tabIndex={hasMultiple ? 0 : undefined}
          >
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {liveMessage}
            </div>
            <div
              className={`flex-1 relative flex items-center justify-center p-4 min-h-0 min-w-0${isProcessing ? " animate-pulse" : ""}`}
            >
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

          {/* Peek bar -- visible when bottom sheet is collapsed */}
          {!mobileSettingsOpen && (
            <button
              type="button"
              onClick={() => setMobileSettingsOpen(true)}
              className="shrink-0 border-t border-border bg-background px-4 py-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
                <span className="text-sm font-medium text-foreground">{t.common.process}</span>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          {/* Settings BottomSheet */}
          <BottomSheet
            open={mobileSettingsOpen}
            onClose={() => setMobileSettingsOpen(false)}
            title={t.common.settings}
          >
            <div className="settings-container space-y-3">{renderSettingsContent()}</div>
          </BottomSheet>
        </div>
      </AppLayout>
    );
  }

  // Desktop: full-width dropzone when no file is loaded (non-generator tools)
  if (!hasFile && !isNoDropzone) {
    return (
      <AppLayout breadcrumb={breadcrumb}>
        <div className="flex-1 overflow-y-auto bg-muted/20">
          <div className="flex items-center justify-center min-h-full">
            <ToolDropzone
              tool={tool}
              accept={toolAccept}
              fileFilter={toolFileFilter}
              multiple
              onFiles={handleFiles}
              onUrlImport={handleUrlImport}
            />
          </div>
        </div>
      </AppLayout>
    );
  }

  // Desktop layout: side-by-side
  return (
    <AppLayout breadcrumb={breadcrumb}>
      <div
        className="flex h-full w-full"
        {...(!isNoDropzone
          ? {
              onDragEnter: handleDragEnter,
              onDragOver: handleDragOver,
              onDragLeave: handleDragLeave,
              onDrop: handlePageDrop,
            }
          : {})}
      >
        {/* Page-level drop overlay */}
        {isDraggingOver && !isNoDropzone && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="text-center">
              <Upload className="mx-auto h-12 w-12 text-primary animate-bounce" />
              <p className="mt-3 text-lg font-medium">
                {isMultiFileTool ? t.dropzone.dropToAdd : t.dropzone.dropToReplace}
              </p>
            </div>
          </div>
        )}

        {/* Tool Settings Panel */}
        <div className="settings-container settings-slide-in w-72 border-e border-border shrink-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                <IconComponent className="h-5 w-5" />
              </div>
              <h1 className="font-semibold text-lg text-foreground">
                {getToolName(t, tool.id, tool.name)}
              </h1>
            </div>

            {renderSettingsContent()}
          </div>
          <div className="pointer-events-none sticky bottom-0 h-6 bg-gradient-to-t from-background to-transparent" />
        </div>

        {/* Main area: image viewer */}
        <section
          aria-label={t.a11y.imageArea}
          className="flex-1 flex flex-col min-h-0 min-w-0"
          onKeyDown={hasMultiple ? handleImageKeyDown : undefined}
          tabIndex={hasMultiple ? 0 : undefined}
        >
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {liveMessage}
          </div>
          <div
            key={hasProcessed ? `processed-${selectedIndex}` : `pending-${selectedIndex}`}
            className={`flex-1 relative flex items-center justify-center p-6 min-h-0 min-w-0 ${hasProcessed ? "animate-fade-in" : ""}${isProcessing ? " animate-pulse" : ""}`}
          >
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
