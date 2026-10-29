import {
  ANALYTICS_EVENTS,
  COMPRESS_PRESET_BY_ID,
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
  MessageSquare,
  Upload,
  XCircle,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Crop } from "react-image-crop";
import { Link, useLocation, useParams } from "react-router";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { BottomSheet } from "@/components/common/bottom-sheet";
import { Dropzone } from "@/components/common/dropzone";
import { type BgPreviewState, ImageViewer } from "@/components/common/image-viewer";
import { LibrarySaveModeSelector } from "@/components/common/library-save-mode-selector";
import { ReviewPanel } from "@/components/common/review-panel";
import { SideBySideComparison } from "@/components/common/side-by-side-comparison";
import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { formatToolAcceptedInputs, ToolDropzone } from "@/components/common/tool-dropzone";
import { UrlImportModal } from "@/components/common/url-import-modal";
import { FeatureInstallPrompt } from "@/components/features/feature-install-prompt";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { AppLayout } from "@/components/layout/app-layout";
import { CropCanvas } from "@/components/tools/crop-canvas";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { EraserCanvas } from "@/components/tools/eraser-canvas";
import type { PreviewTransform } from "@/components/tools/rotate-settings";
import { SignCanvas, type SignCanvasRef } from "@/components/tools/sign-canvas";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { useIntakeGuard } from "@/hooks/use-intake-guard";
import { useMobile } from "@/hooks/use-mobile";
import { usePageTitle } from "@/hooks/use-page-title";
import { recordRecentTool } from "@/hooks/use-recent-tools";
import { track } from "@/lib/analytics";
import { downloadBlob, formatFileSize } from "@/lib/download";
import { classifyFeedbackError } from "@/lib/feedback";
import { format } from "@/lib/format";
import { ICON_MAP } from "@/lib/icon-map";
import { showUnsupportedFileType } from "@/lib/intake-notice";
import { withAnalytics } from "@/lib/lazy-analytics";
import { playerDownloadClaim, shouldShowConversionCard } from "@/lib/result-display";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { runEndWrites } from "@/lib/run-teardown";
import {
  DOC_CANVAS_TOOLS,
  LIVE_PREVIEW_INPUT_OVERLAY_TOOLS,
  MULTI_FILE_TOOLS,
  REORDERABLE_TOOLS,
} from "@/lib/tool-display-modes";
import { getToolName } from "@/lib/tool-i18n";
import { type ComparisonPreview, getToolRegistryEntry } from "@/lib/tool-registry";
import { useBase64Store } from "@/stores/base64-store";
import { useCollageStore } from "@/stores/collage-store";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useFeaturesStore } from "@/stores/features-store";
import { displayStoredError, type FileEntry, useFileStore } from "@/stores/file-store";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";
import { useMemeStore } from "@/stores/meme-store";
import { useMultiToolStore } from "@/stores/multi-tool-store";
import { useOrganizeStore } from "@/stores/organize-store";
import { usePassportPhotoStore } from "@/stores/passport-photo-store";
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
      return <CheckCircle2 className="h-3 w-3 text-success-ink shrink-0" />;
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
        <span className="text-xs font-medium text-foreground">
          {format(t.toolPage.filesCount, { count: files.length })}
        </span>
        <button
          type="button"
          onClick={onAddMore}
          className="text-xs text-primary-ink hover:text-primary-ink-strong"
        >
          {t.toolPage.addMore}
        </button>
      </div>

      <div className="space-y-0.5">
        {visible.map((file, i) => {
          const isSelected = i === selectedIndex;
          const entry = fileEntries[i];
          return (
            <button
              key={entry?.blobUrl ?? `${file.name}-${file.size}-${file.lastModified}`}
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
            className="text-xs text-primary-ink hover:text-primary-ink-strong"
          >
            {expanded
              ? t.common.showLess
              : format(t.common.showMore, { count: files.length - COLLAPSED_LIMIT })}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t.toolPage.clearAll}
        </button>
      </div>
    </div>
  );
}

const TOOL_STORE_RESETS: ReadonlyArray<() => void> = [
  () => useBase64Store.getState().reset(),
  () => useCollageStore.getState().reset(),
  () => useDuplicateStore.getState().reset(),
  () => useMemeStore.getState().reset(),
  () => usePassportPhotoStore.getState().reset(),
  () => usePdfToImageStore.getState().reset(),
  () => useQrStore.getState().reset(),
  () => useSplitStore.getState().reset(),
  () => useHtmlToImageStore.getState().reset(),
  () => useMultiToolStore.getState().clear(),
  () => useOrganizeStore.getState().clear(),
];

function ToolPageStoreReset({
  toolId,
  fromLibrary,
  resetToolIdRef,
}: {
  toolId: string | undefined;
  fromLibrary: boolean;
  resetToolIdRef: React.RefObject<string | undefined>;
}) {
  const probeRef = useRef<HTMLSpanElement | null>(null);
  const latestToolIdRef = useRef<string | undefined>(toolId);
  latestToolIdRef.current = toolId;
  const setupToolIdRef = useRef<string | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: toolId triggers intentional reset on tool navigation
  useEffect(() => {
    const previousToolId = resetToolIdRef.current;
    resetToolIdRef.current = toolId;
    if (setupToolIdRef.current !== toolId) {
      setupToolIdRef.current = toolId;
      const teardownError = runEndWrites([
        ...(!fromLibrary ? [() => useFileStore.getState().reset()] : []),
        ...TOOL_STORE_RESETS,
      ]);
      if (teardownError) {
        reportRunEndFailure(
          "Ending a tool run after its panel unmounted failed",
          teardownError.cause,
          previousToolId ?? toolId,
        );
      }
    }

    return () => {
      if (probeRef.current?.isConnected && latestToolIdRef.current === toolId) return;
      setupToolIdRef.current = undefined;
      const teardownError = runEndWrites([() => useFileStore.getState().stopRuns()]);
      if (teardownError) {
        reportRunEndFailure(
          "Ending a tool run after its panel unmounted failed",
          teardownError.cause,
          toolId,
        );
      }
    };
  }, [toolId]);

  return (
    <span
      ref={(el) => {
        if (el) probeRef.current = el;
      }}
      hidden
    />
  );
}

/**
 * Resets the file store and per-tool stores when ToolPage unmounts (#1122).
 *
 * Rendered as a sibling after ToolPageContent so React runs ToolSettings's
 * unmount cleanups first (canceling any active server job while `processing`
 * is still true) and then wipes the stores clean on the way out. In StrictMode,
 * React's simulated unmount on initial mount runs while the DOM node is still
 * connected; skipping that simulated pass preserves files pre-loaded into
 * useFileStore before navigating here with `state: { fromLibrary: true }`.
 */
function ToolPageUnmountReset({
  resetToolIdRef,
}: {
  resetToolIdRef: React.RefObject<string | undefined>;
}) {
  const probeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(
    () => () => {
      if (probeRef.current?.isConnected) return;
      const teardownError = runEndWrites([
        () => useFileStore.getState().reset(),
        ...TOOL_STORE_RESETS,
      ]);
      if (teardownError) {
        reportRunEndFailure(
          "Ending a tool run after its panel unmounted failed",
          teardownError.cause,
          resetToolIdRef.current,
        );
      }
    },
    [resetToolIdRef],
  );
  return (
    <span
      ref={(el) => {
        if (el) probeRef.current = el;
      }}
      hidden
    />
  );
}

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const location = useLocation();
  const fromLibrary = Boolean((location.state as { fromLibrary?: boolean } | null)?.fromLibrary);
  const resetToolIdRef = useRef<string | undefined>(undefined);

  return (
    <>
      <ToolPageStoreReset
        toolId={toolId}
        fromLibrary={fromLibrary}
        resetToolIdRef={resetToolIdRef}
      />
      <ToolPageContent resetToolIdRef={resetToolIdRef} />
      <ToolPageUnmountReset resetToolIdRef={resetToolIdRef} />
    </>
  );
}

function ToolPageContent({
  resetToolIdRef,
}: {
  resetToolIdRef: React.RefObject<string | undefined>;
}) {
  const { t } = useTranslation();
  const { section, toolId } = useParams<{ section: string; toolId: string }>();
  const location = useLocation();
  const tool = useMemo(
    () => TOOLS.find((t) => t.id === toolId && t.route === `/${section}/${toolId}`),
    [section, toolId],
  );
  const registryEntry = useMemo(() => (tool ? getToolRegistryEntry(tool.id) : undefined), [tool]);
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
  const showSizeComparison =
    toolId === "compress" ||
    toolId === "optimize-for-web" ||
    (toolId !== undefined && COMPRESS_PRESET_BY_ID[toolId]?.base === "compress");
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
      withAnalytics(({ track, setSentryTag }) => {
        // Tag Sentry so a frontend crash is filterable by which tool/section the
        // user was on (the web TAG_ALLOWLIST reserves these but nothing set them).
        setSentryTag("tool_id", tool.id);
        setSentryTag("route", toolSection(tool));
        track(ANALYTICS_EVENTS.TOOL_OPENED, {
          tool_id: tool.id,
          modality: tool.modality,
          category: tool.category,
        });
      });
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
    reorderFiles,
    reverseFiles,
    navigateNext,
    navigatePrev,
    currentEntry,
    lastSavedLibraryFileId,
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
  const [failedFeedbackOpen, setFailedFeedbackOpen] = useState(false);
  const [bulkModalToolId, setBulkModalToolId] = useState<string | null>(null);
  const bulkModalOpen = Boolean(tool && bulkModalToolId === tool.id);
  const handleBulkModalOpenChange = useCallback(
    (open: boolean) => {
      setBulkModalToolId(open && tool ? tool.id : null);
    },
    [tool],
  );
  const [previewTransform, setPreviewTransform] = useState<PreviewTransform | null>(null);
  const [previewFilter, setPreviewFilter] = useState<string>("");
  const [imageWrapperStyle, setImageWrapperStyle] = useState<React.CSSProperties | null>(null);
  const [imageWrapperChildren, setImageWrapperChildren] = useState<React.ReactNode>(null);
  const [bgPreview, setBgPreview] = useState<BgPreviewState | null>(null);
  const [comparisonPreview, setComparisonPreview] = useState<ComparisonPreview | null>(null);
  const failedFeedbackCategory = classifyFeedbackError(
    currentEntry?.error,
    currentEntry?.errorCategory,
  );

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
  const [perFileCropState, setPerFileCropState] = useState<
    Record<string, { crop: Crop; aspect: number | undefined }>
  >({});

  const handleCropChange = useCallback(
    (crop: Crop) => {
      setCropCrop(crop);
      if (currentEntry) {
        setPerFileCropState((prev) => ({
          ...prev,
          [currentEntry.id]: { crop, aspect: cropAspect },
        }));
      }
    },
    [currentEntry, cropAspect],
  );

  const handleAspectChange = useCallback(
    (aspect: number | undefined) => {
      setCropAspect(aspect);
      if (currentEntry) {
        setPerFileCropState((prev) => ({
          ...prev,
          [currentEntry.id]: { crop: cropCrop, aspect },
        }));
      }
    },
    [currentEntry, cropCrop],
  );

  const prevEntryIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentEntry?.id !== prevEntryIdRef.current) {
      prevEntryIdRef.current = currentEntry?.id || null;
      setSignStaleEntryId(null);
      if (currentEntry && perFileCropState[currentEntry.id]) {
        const state = perFileCropState[currentEntry.id];
        setCropCrop(state.crop);
        setCropAspect(state.aspect);
      } else {
        setCropCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
        setCropAspect(undefined);
      }
    }
  }, [currentEntry?.id, perFileCropState]);

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
  const [eraserMode, setEraserMode] = useState<"brush" | "lasso">("brush");
  const [eraserMaskedCount, setEraserMaskedCount] = useState(0);
  // Center of the painted mask as a 0-100 percentage, used to init the slider at the erased spot
  const [eraserSliderInitPos, setEraserSliderInitPos] = useState<number | null>(null);

  // Sign state
  const signCanvasRef = useRef<SignCanvasRef | null>(null);
  const [signHasSelection, setSignHasSelection] = useState(false);
  const [signPlacementCount, setSignPlacementCount] = useState(0);
  const [signStaleEntryId, setSignStaleEntryId] = useState<string | null>(null);
  const handleSignPlacementsChange = useCallback(() => {
    const { currentEntry: entry, processing } = useFileStore.getState();
    if (entry && (entry.processedUrl || processing)) {
      setSignStaleEntryId(entry.id);
    }
  }, []);

  // Page-level drag overlay state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);
  const isMultiFileTool = toolId ? MULTI_FILE_TOOLS.has(toolId) : false;
  const canReorder = toolId ? REORDERABLE_TOOLS.has(toolId) : false;
  // Canvas editors that manage their own document set hide the generic
  // file-selection UI (left list/add-more, bottom file strip, pager). See
  // DOC_CANVAS_TOOLS.
  const docCanvas = toolId ? DOC_CANVAS_TOOLS.has(toolId) : false;
  // Every generic multi-file affordance at once.
  const hasBatchUi = hasMultiple && !docCanvas;

  const fromLibrary = Boolean((location.state as { fromLibrary?: boolean } | null)?.fromLibrary);

  // biome-ignore lint/correctness/useExhaustiveDependencies: toolId triggers intentional reset on tool navigation
  useEffect(() => {
    setPreviewTransform(null);
    setPreviewFilter("");
    setBgPreview(null);
    setComparisonPreview(null);
    setCropCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
    setCropAspect(undefined);
    setCropShowGrid(true);
    setCropImgDimensions(null);
    setEraserHasStrokes(false);
    setEraserMaskedCount(0);
    setEraserBrushSize(30);
    setEraserSliderInitPos(null);
    setSignStaleEntryId(null);
    setMobileSettingsOpen(false);
    setBulkModalToolId(null);
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
        ? format(t.toolPage.acceptDescription, {
            exts: toolAcceptExts.map((e) => e.toUpperCase()).join(", "),
          })
        : undefined,
    [toolAcceptExts, t.toolPage.acceptDescription],
  );
  const toolFormatsDisplay = useMemo(
    () => formatToolAcceptedInputs(tool?.acceptedInputs, t.toolPage.andMore),
    [tool?.acceptedInputs, t.toolPage.andMore],
  );

  // Drops and pastes are turned away, with a message, while a run is in flight (#2108).
  const { running: runInFlight, allowIntake } = useIntakeGuard();
  const allowIntakeRef = useRef(allowIntake);
  allowIntakeRef.current = allowIntake;

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      if (!allowIntakeRef.current()) return;
      setEraserSliderInitPos(null);
      reset();
      setFiles(newFiles);
    },
    [setFiles, reset],
  );

  const handleUrlImport = useCallback(
    (file: File) => {
      if (!allowIntakeRef.current()) return false;
      addFiles([file]);
    },
    [addFiles],
  );

  const handleUndo = useCallback(() => {
    if (!allowIntake()) return;
    undoProcessing();
    setEraserSliderInitPos(null);
  }, [allowIntake, undoProcessing]);

  const startOver = useCallback(() => {
    if (!allowIntake()) return;
    reset();
  }, [allowIntake, reset]);

  const handleClearAll = useCallback(() => {
    if (!allowIntake()) return;
    reset();
    usePassportPhotoStore.getState().reset();
    useDuplicateStore.getState().reset();
    useSplitStore.getState().reset();
  }, [allowIntake, reset]);

  const handleAddMore = useCallback(() => {
    if (!allowIntake()) return;
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
      if (selected.length === 0) return;
      const newFiles = toolFileFilter ? selected.filter(toolFileFilter) : selected;
      if (newFiles.length > 0) {
        if (!allowIntakeRef.current()) return;
        addFiles(newFiles);
      } else {
        showUnsupportedFileType(t.dropzone.unsupportedFileType);
      }
    };
    input.click();
  }, [
    addFiles,
    toolAccept,
    toolFileFilter,
    acceptsAnyFile,
    allowIntake,
    t.dropzone.unsupportedFileType,
  ]);

  // Page-level drag handlers (active when a file is already loaded)
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      // No "drop to replace" overlay over a run: the drop would be turned away (#2108).
      if (e.dataTransfer.types.includes("Files") && !runInFlight) {
        setIsDraggingOver(true);
      }
    },
    [runInFlight],
  );

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
      if (validFiles.length === 0) {
        showUnsupportedFileType(t.dropzone.unsupportedFileType);
        return;
      }
      if (!allowIntake()) return;
      if (isMultiFileTool) {
        addFiles(validFiles);
      } else {
        setFiles(validFiles);
      }
    },
    [
      toolFileFilter,
      addFiles,
      setFiles,
      isMultiFileTool,
      allowIntake,
      t.dropzone.unsupportedFileType,
    ],
  );

  // Document-level paste handler (only when an active, installed tool workspace with a dropzone is rendered)
  const isToolDisabled = Boolean(tool && disabledTools.includes(tool.id));
  const canAcceptPaste = Boolean(
    tool &&
      registryEntry &&
      registryEntry.displayMode !== "no-dropzone" &&
      !isToolDisabled &&
      (!isAiTool || (featuresLoaded && (toolInstalled || !featureBundle))),
  );
  useEffect(() => {
    if (!canAcceptPaste) return;

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
        const filtered = toolFileFilter ? pastedFiles.filter(toolFileFilter) : pastedFiles;
        if (filtered.length > 0) {
          e.preventDefault();
          if (!allowIntake()) return;
          if (isMultiFileTool) {
            addFiles(filtered);
          } else {
            setEraserSliderInitPos(null);
            setFiles(filtered);
          }
        } else {
          showUnsupportedFileType(t.dropzone.unsupportedFileType);
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [
    canAcceptPaste,
    toolFileFilter,
    isMultiFileTool,
    addFiles,
    setFiles,
    allowIntake,
    t.dropzone.unsupportedFileType,
  ]);

  const handleDownloadAll = useCallback(() => {
    if (!batchZipBlob) return;
    if (toolId) {
      track(ANALYTICS_EVENTS.RESULT_DOWNLOADED, { tool_id: toolId });
    }
    downloadBlob(batchZipBlob, batchZipFilename ?? "processed-files.zip");
    useFileStore.getState().markBatchClaimed();
  }, [batchZipBlob, batchZipFilename, toolId]);

  if (isToolDisabled) {
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
        {/* min-h-full (not flex-1): AppLayout's <main> is a block scroll
            container, so flex-1 collapses to content height and the prompt
            hugs the top instead of centering. */}
        <div className="min-h-full bg-muted/20 flex items-center justify-center py-8">
          <FeatureInstallPrompt
            bundle={featureBundle}
            isAdmin={isAdmin}
            toolId={toolId}
            toolName={tool?.name}
            toolDescription={tool?.description}
          />
        </div>
      </AppLayout>
    );
  }

  const IconComponent =
    (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;

  const hasFile = (resetToolIdRef.current === toolId || fromLibrary) && files.length > 0;
  const hasProcessed = !!processedUrl || currentEntry?.status === "completed";
  const isProcessing = currentEntry?.status === "processing";
  const displayMode = registryEntry.displayMode;
  const isNoDropzone = displayMode === "no-dropzone";
  const isLivePreview = registryEntry.livePreview ?? false;
  // A landed result normally swaps the image area for a view of it and opens
  // ReviewPanel below the settings. interactive-sign and the three tools that
  // render their own result inline (ocr, favicon, image-to-pdf) keep the input
  // view in the main area and offer their own download/copy controls in the
  // panel (#1111).
  const panelOwnsResult =
    displayMode === "interactive-sign" ||
    toolId === "ocr" ||
    toolId === "favicon" ||
    toolId === "image-to-pdf";
  const resultOwnsImageArea = hasProcessed && !panelOwnsResult;
  // Shared between the mobile and desktop image-area divs so they reconcile in
  // place when useMobile flips at 768px and interactive canvases survive (#2248).
  const imageAreaKey = resultOwnsImageArea
    ? `processed-${selectedIndex}`
    : displayMode === "interactive-eraser"
      ? "pending-eraser"
      : `pending-${selectedIndex}`;

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
  const activeComparisonPreview =
    comparisonPreview && currentEntry?.id === comparisonPreview.entryId ? comparisonPreview : null;
  const liveComparisonOverride =
    resultOwnsImageArea && activeComparisonPreview?.supersedesResult
      ? activeComparisonPreview
      : null;

  // Build settings props
  const settingsProps = {
    onPreviewTransform: isLivePreview ? setPreviewTransform : undefined,
    onPreviewFilter: isLivePreview ? setPreviewFilter : undefined,
    onImageStyle: isLivePreview ? setImageWrapperStyle : undefined,
    onImageOverlay: isLivePreview ? (c: React.ReactNode) => setImageWrapperChildren(c) : undefined,
    onBgPreview: setBgPreview,
    onComparisonPreview: setComparisonPreview,
    cropProps:
      displayMode === "interactive-crop"
        ? {
            cropState,
            perFileCropState,
            onCropChange: handleCropChange,
            onAspectChange: handleAspectChange,
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
            mode: eraserMode,
            onModeChange: setEraserMode,
            onMaskCenter: setEraserSliderInitPos,
            maskedFileCount: eraserMaskedCount,
          }
        : undefined,
    signProps:
      displayMode === "interactive-sign"
        ? {
            canvasRef: signCanvasRef,
            hasSelection: signHasSelection,
            placementCount: signPlacementCount,
            staleEntryId: signStaleEntryId,
            onStaleEntryChange: setSignStaleEntryId,
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
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
          >
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

    const conversionCompleteCard = (
      <div className="flex min-h-0 max-h-full flex-1 overflow-auto">
        <div className="m-auto text-center p-8 max-w-xs">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-success-ink" />
          </div>
          <p className="font-medium text-foreground mb-1">{t.toolPage.conversionComplete}</p>
          <p className="text-sm text-muted-foreground mb-1">{processedFileName}</p>
          {processedSize != null && (
            <p className="text-xs text-muted-foreground">
              {processedFileType} &middot; {formatFileSize(processedSize)}
            </p>
          )}
        </div>
      </div>
    );

    // A processed result with no renderable preview must not fall back to the
    // original: the branches below (including media-player and document when a
    // large batch skipped ZIP extraction) would otherwise show the untouched
    // original under the processed filename and size (#746, #1240, #2449).
    if (
      !liveComparisonOverride &&
      shouldShowConversionCard({
        hasProcessed: resultOwnsImageArea,
        isProcessedPreviewable,
        processedUrl,
        processedPreviewUrl,
        originalBlobUrl,
        displayMode,
        hasImageWrapperStyle: imageWrapperStyle != null,
      })
    ) {
      return conversionCompleteCard;
    }

    // Media player: waveform for audio, native <video> for video
    if (displayMode === "media-player" && hasFile) {
      if (tool?.modality === "audio") {
        const audioSrc = processedUrl ?? originalBlobUrl;
        if (audioSrc) {
          return (
            <Suspense
              fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
            >
              {/* Scrolls inside the image area when the player doesn't fit (a phone
                  in landscape), centred only while it does, so its play button
                  never ends up under the z-20 bars (#2192). */}
              <div className="flex min-h-0 max-h-full w-full overflow-auto">
                <div className="m-auto w-full">
                  <WaveformPlayer
                    src={audioSrc}
                    // audioSrc falls back to the original, and only a result claims.
                    onDownload={playerDownloadClaim(processedUrl, () => {
                      track(ANALYTICS_EVENTS.RESULT_DOWNLOADED, { tool_id: tool.id });
                      useFileStore.getState().claimSelected();
                    })}
                  />
                </div>
              </div>
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
              fileSize={currentEntry?.processedSize ?? null}
              resultContext={{ toolId }}
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
        const previewSrc = hasProcessed
          ? (processedUrl ?? originalBlobUrl ?? undefined)
          : undefined;
        const previewSize = hasProcessed
          ? (currentEntry?.processedSize ?? null)
          : (currentEntry?.file?.size ?? 0);
        return (
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
          >
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
        <Suspense
          fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
        >
          <MediaPlayerView />
        </Suspense>
      );
    }

    // Document viewer: pdf.js canvas with pagination
    if (displayMode === "document" && hasFile) {
      // A document tool can replace the read-only viewer with an editor. For
      // one file that is always eligible; the multi-tool editor ingests the
      // extra documents itself, so it is eligible for multi-file selections
      // too. A batch (or previously run) result keeps the read-only viewer.
      const Panel =
        !hasProcessed && (files.length === 1 || docCanvas)
          ? registryEntry?.ResultsPanel
          : undefined;
      return (
        <Suspense
          fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
        >
          {Panel ? <Panel /> : <DocumentView />}
        </Suspense>
      );
    }

    // Show error state for failed batch files (before interactive canvas blocks,
    // which also match !hasProcessed and would show the canvas instead of the error).
    // interactive-sign keeps its canvas: its panel shows the error, and swapping
    // the canvas out would throw away the signatures the user placed (#1969).
    // interactive-eraser also keeps its canvas so painted masks aren't lost (#1639).
    if (
      hasFile &&
      !hasProcessed &&
      currentEntry?.status === "failed" &&
      displayMode !== "interactive-sign" &&
      displayMode !== "interactive-eraser"
    ) {
      return (
        // Bounded by the image area and scrolling inside it; m-auto centres the card
        // only while it fits, so a tall one is never clipped at its top (#2192).
        <div className="flex min-h-0 max-h-full flex-1 overflow-auto p-6">
          <div className="m-auto text-center max-w-sm">
            <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-3" />
            <p className="font-medium text-foreground mb-1">
              {displayStoredError(currentEntry.error, t.tools.processing.canceled) ||
                t.toolPage.processingFailed}
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
              <button
                type="button"
                onClick={() => setFailedFeedbackOpen(true)}
                className="px-4 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center justify-center gap-2"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t.feedback.reportIssue}
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
            enablePaste={false}
            bulkModalOpen={bulkModalOpen}
            onBulkModalOpenChange={handleBulkModalOpenChange}
          />
        );
      const ResultsPanel = registryEntry.ResultsPanel;
      return (
        <Suspense
          fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
        >
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
          onCropChange={handleCropChange}
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
          mode={eraserMode}
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

    if (displayMode === "interactive-sign" && hasFile && originalBlobUrl) {
      return (
        <SignCanvas
          ref={signCanvasRef}
          fileUrl={originalBlobUrl}
          onSelectionChange={setSignHasSelection}
          onCountChange={setSignPlacementCount}
          onPlacementsChange={handleSignPlacementsChange}
        />
      );
    }

    if (displayMode === "interactive-split" && hasFile && originalBlobUrl) {
      if (registryEntry?.ResultsPanel) {
        const Panel = registryEntry.ResultsPanel;
        return (
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
          >
            <Panel />
          </Suspense>
        );
      }
    }

    if (
      resultOwnsImageArea &&
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

    if (resultOwnsImageArea && originalBlobUrl && displayMode === "no-comparison") {
      return (
        <ImageViewer
          src={displayUrl}
          filename={processedFileName}
          fileSize={processedSize}
          resultContext={{ toolId }}
        />
      );
    }

    // For live-preview tools: keep showing the CSS-styled original so WYSIWYG.
    // The server-rendered result is available via download. Tools whose
    // overlay is an input control (pixelate's selection box) get the opposite
    // treatment: the style simulates nothing, so show the server result and
    // keep the overlay on top for the next region (#713).
    if (
      resultOwnsImageArea &&
      originalBlobUrl &&
      displayMode === "live-preview" &&
      imageWrapperStyle
    ) {
      const overlayIsInput = toolId ? LIVE_PREVIEW_INPUT_OVERLAY_TOOLS.has(toolId) : false;
      if (overlayIsInput) {
        // Never substitute the original for the result here: pixelate
        // redacts, and a missing result preview rendered as the untouched
        // original would show unredacted content under the processed
        // filename. Without a renderable result, show the success card.
        const resultSrc = processedPreviewUrl ?? (isProcessedPreviewable ? processedUrl : null);
        if (!resultSrc) {
          return conversionCompleteCard;
        }
        return (
          <ImageViewer
            src={resultSrc}
            filename={processedFileName}
            fileSize={processedSize}
            resultContext={{ toolId }}
            imageWrapperStyle={imageWrapperStyle}
            imageWrapperChildren={imageWrapperChildren}
          />
        );
      }
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

    if (resultOwnsImageArea && originalBlobUrl && displayMode === "live-preview") {
      return (
        <ImageViewer
          src={displayUrl}
          filename={processedFileName}
          fileSize={processedSize}
          resultContext={{ toolId }}
        />
      );
    }

    if (resultOwnsImageArea && originalBlobUrl) {
      return (
        <BeforeAfterSlider
          beforeSrc={originalBlobUrl}
          afterSrc={liveComparisonOverride?.url ?? displayUrl}
          beforeSize={
            showSizeComparison
              ? (liveComparisonOverride?.originalSize ?? originalSize ?? undefined)
              : undefined
          }
          afterSize={
            showSizeComparison
              ? (liveComparisonOverride?.processedSize ?? processedSize ?? undefined)
              : undefined
          }
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

    if (hasFile && originalBlobUrl && activeComparisonPreview) {
      return (
        <BeforeAfterSlider
          beforeSrc={originalBlobUrl}
          afterSrc={activeComparisonPreview.url}
          beforeSize={showSizeComparison ? activeComparisonPreview.originalSize : undefined}
          afterSize={showSizeComparison ? activeComparisonPreview.processedSize : undefined}
        />
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
            <Suspense
              fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
            >
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
              <p className="text-xs text-muted-foreground">{t.toolPage.previewUnavailable}</p>
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
        enablePaste={false}
        bulkModalOpen={bulkModalOpen}
        onBulkModalOpenChange={handleBulkModalOpenChange}
      />
    );
  }

  // Navigation arrows (shared between mobile/desktop)
  function renderNavArrows() {
    return (
      <>
        {hasBatchUi && hasPrev && (
          <button
            type="button"
            onClick={navigatePrev}
            className="absolute left-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label={t.a11y.previousImage}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {hasBatchUi && hasNext && (
          <button
            type="button"
            onClick={navigateNext}
            className="absolute right-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label={t.a11y.nextImage}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {hasBatchUi && (
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
        {!isNoDropzone && !docCanvas && (
          <div className="space-y-2">
            <FileSelectionInfo
              files={files}
              fileEntries={entries}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onClear={handleClearAll}
              onAddMore={handleAddMore}
            />
          </div>
        )}

        <LibrarySaveModeSelector toolId={tool?.id ?? ""} />

        <div className="border-t border-border" />

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t.common.settings}</h3>
          {canReorder && hasMultiple && (
            <p className="text-xs text-muted-foreground">{t.dropzone.reorderHint}</p>
          )}
          <Suspense
            fallback={<div className="text-xs text-muted-foreground">{t.common.loading}</div>}
          >
            <ToolSettings {...settingsProps} />
          </Suspense>
        </div>

        {currentEntry?.status === "failed" && (
          <button
            type="button"
            onClick={() => setFailedFeedbackOpen(true)}
            className="w-full py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-medium flex items-center justify-center gap-2"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t.feedback.reportIssue}
          </button>
        )}

        {/* Batch download — shown right after settings for easy access */}
        {entries.length > 1 && hasProcessed && batchZipBlob && !docCanvas && (
          <button
            type="button"
            onClick={handleDownloadAll}
            className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
          >
            <Download className="h-4 w-4" />
            {t.toolPage.downloadAllZip}
          </button>
        )}

        {resultOwnsImageArea && (processedSize != null || batchTotal > 1) && (
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
              savedLibraryFileId={lastSavedLibraryFileId}
            />
          </div>
        )}
      </>
    );
  }

  const urlImportModal = bulkModalOpen ? (
    <UrlImportModal
      key={tool.id}
      onClose={() => handleBulkModalOpenChange(false)}
      fileFilter={toolFileFilter ?? (() => true)}
      unsupportedMessage={toolFormatsDisplay || t.dropzone.unsupportedFileType}
      onImport={(importedFiles) => {
        for (const file of importedFiles) {
          if (handleUrlImport(file) === false) {
            return false;
          }
        }
      }}
    />
  ) : null;

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
                bulkModalOpen={bulkModalOpen}
                onBulkModalOpenChange={handleBulkModalOpenChange}
              />
            </div>
          </div>
          {urlImportModal}
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

          {/* Tool header. relative z-20 keeps it, and the Settings button, above any
              preview content that overflows the image area (#2192); the nav arrows
              inside the area are z-10 and the sheet and its backdrop z-40/z-50. */}
          <div className="relative z-20 flex items-center gap-3 p-4 border-b border-border shrink-0 bg-background [@media(max-height:500px)]:hidden">
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
            // An inset focus ring: the default outline is drawn outside the section,
            // under the z-20 header and peek bar and the clipped sides (#2192).
            className="flex-1 flex flex-col min-h-0 min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            onKeyDown={hasBatchUi ? handleImageKeyDown : undefined}
            tabIndex={hasBatchUi ? 0 : undefined}
          >
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {liveMessage}
            </div>
            <div
              key={imageAreaKey}
              className={`flex-1 relative flex items-center justify-center p-4 min-h-0 min-w-0${isProcessing ? " animate-pulse" : ""}`}
            >
              {renderNavArrows()}
              {renderImageArea()}
            </div>
            {hasBatchUi && (
              <ThumbnailStrip
                entries={entries}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                onReorder={canReorder ? reorderFiles : undefined}
                onReverse={canReorder ? reverseFiles : undefined}
              />
            )}
          </section>

          {/* Peek bar -- visible when bottom sheet is collapsed */}
          {!mobileSettingsOpen && (
            <button
              type="button"
              onClick={() => setMobileSettingsOpen(true)}
              className="relative z-20 shrink-0 border-t border-border bg-background px-4 py-3 flex items-center justify-between"
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
            // A run's request, progress stream and timers live in the settings
            // panel, so closing the sheet mid-run must not unmount it (#1974).
            keepMounted
          >
            <div className="settings-container space-y-3">{renderSettingsContent()}</div>
          </BottomSheet>
          <FeedbackDialog
            open={failedFeedbackOpen}
            source="failed_job"
            toolId={tool?.id}
            jobStatus="failed"
            errorCategory={failedFeedbackCategory}
            initialSentiment="issue"
            onClose={() => setFailedFeedbackOpen(false)}
          />
        </div>
        {urlImportModal}
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
              bulkModalOpen={bulkModalOpen}
              onBulkModalOpenChange={handleBulkModalOpenChange}
            />
          </div>
        </div>
        {urlImportModal}
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
          onKeyDown={hasBatchUi ? handleImageKeyDown : undefined}
          tabIndex={hasBatchUi ? 0 : undefined}
        >
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {liveMessage}
          </div>
          <div
            key={imageAreaKey}
            className={`flex-1 relative flex items-center justify-center p-6 min-h-0 min-w-0 ${resultOwnsImageArea ? "animate-fade-in" : ""}${isProcessing ? " animate-pulse" : ""}`}
          >
            {renderNavArrows()}
            {renderImageArea()}
          </div>
          {hasBatchUi && (
            <ThumbnailStrip
              entries={entries}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onReorder={canReorder ? reorderFiles : undefined}
              onReverse={canReorder ? reverseFiles : undefined}
            />
          )}
        </section>
        <FeedbackDialog
          open={failedFeedbackOpen}
          source="failed_job"
          toolId={tool?.id}
          jobStatus="failed"
          errorCategory={failedFeedbackCategory}
          initialSentiment="issue"
          onClose={() => setFailedFeedbackOpen(false)}
        />
      </div>
      {urlImportModal}
    </AppLayout>
  );
}
