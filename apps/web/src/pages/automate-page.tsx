import {
  ANALYTICS_EVENTS,
  modalityForExtension,
  type PipelineTemplate,
  type TranslationKeys,
} from "@snapotter/shared";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  Save,
  Trash2,
  Upload,
  Workflow,
  X,
} from "lucide-react";
import { lazy, type RefObject, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { TemplatesSection } from "@/components/automate/templates-section";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { Dropzone } from "@/components/common/dropzone";
import { FileLibraryModal } from "@/components/common/file-library-modal";
import { ImageViewer } from "@/components/common/image-viewer";
import { ProgressCard } from "@/components/common/progress-card";
import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { AppLayout } from "@/components/layout/app-layout";
import { PipelineBuilder } from "@/components/tools/pipeline-builder";
import { ToolPalette } from "@/components/tools/tool-palette";
import { useTranslation } from "@/contexts/i18n-context";
import { useIntakeGuard } from "@/hooks/use-intake-guard";
import { useMobile } from "@/hooks/use-mobile";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { failedAnswerMessage, formatHeaders, getFileDownloadUrl } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { downloadBlob, formatFileSize, triggerDownload } from "@/lib/download";
import { format, plural } from "@/lib/format";
import { withAnalytics } from "@/lib/lazy-analytics";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { runEndWrites } from "@/lib/run-teardown";
import { cn } from "@/lib/utils";
import { displayStoredError, useFileStore } from "@/stores/file-store";
import { type SavedPipeline, usePipelineStore } from "@/stores/pipeline-store";

const MediaPlayerView = lazy(() =>
  import("@/components/tools/media-player-view").then((m) => ({ default: m.MediaPlayerView })),
);
const WaveformPlayer = lazy(() =>
  import("@/components/common/waveform-player").then((m) => ({ default: m.WaveformPlayer })),
);

function previewIcon(kind: string) {
  switch (kind) {
    case "image":
      return ImageIcon;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    case "document":
      return FileText;
    default:
      return FileArchive;
  }
}

/**
 * Resets the file store when AutomatePage unmounts (#2634).
 *
 * Rendered as a sibling after AutomatePageContent so React runs
 * usePipelineProcessor's unmount cleanup first (canceling any active server
 * job while `processing` is still true) and then wipes the file store clean on
 * the way out. In StrictMode, React's simulated unmount on initial mount runs
 * while the DOM node is still connected; skipping that simulated pass
 * preserves files being imported via `state: { libraryFileIds }`.
 */
function AutomatePageUnmountReset({
  libraryImportAbortRef,
}: {
  libraryImportAbortRef: RefObject<AbortController | null>;
}) {
  const probeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(
    () => () => {
      if (probeRef.current?.isConnected) return;
      const teardownError = runEndWrites([
        () => libraryImportAbortRef.current?.abort(),
        () => useFileStore.getState().reset(),
      ]);
      if (teardownError) {
        reportRunEndFailure(
          "Ending a pipeline run after its panel unmounted failed",
          teardownError.cause,
        );
      }
    },
    [libraryImportAbortRef],
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

export function AutomatePage() {
  const libraryImportAbortRef = useRef<AbortController | null>(null);
  return (
    <>
      <AutomatePageContent libraryImportAbortRef={libraryImportAbortRef} />
      <AutomatePageUnmountReset libraryImportAbortRef={libraryImportAbortRef} />
    </>
  );
}

function AutomatePageContent({
  libraryImportAbortRef,
}: {
  libraryImportAbortRef: RefObject<AbortController | null>;
}) {
  const { t } = useTranslation();
  usePageTitle(t.sidebar.automate);

  useEffect(() => {
    withAnalytics(({ track }) => track(ANALYTICS_EVENTS.PIPELINE_OPENED, {}));
  }, []);
  const {
    files,
    entries,
    setFiles,
    addFiles,
    reset: resetFiles,
    processedUrl,
    originalBlobUrl,
    originalSize,
    processedSize,
    selectedFileName,
    selectedFileSize,
    batchZipBlob,
    batchZipFilename,
    selectedIndex,
    setSelectedIndex,
    navigateNext,
    navigatePrev,
    currentEntry,
  } = useFileStore();

  const {
    steps,
    expandedStepId,
    savedPipelines,
    addStep,
    removeStep,
    reorderSteps,
    updateStepSettings,
    setExpandedStep,
    loadSteps,
    setSavedPipelines,
  } = usePipelineStore();

  const { processSingle, processAll, processing, error, progress } = usePipelineProcessor();
  const { allowIntake } = useIntakeGuard();
  const allowIntakeRef = useRef(allowIntake);
  allowIntakeRef.current = allowIntake;
  const isMobile = useMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const libraryImportHandled = useRef(false);

  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllSaved, setShowAllSaved] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [mobileToolPaletteOpen, setMobileToolPaletteOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [libraryImportFailed, setLibraryImportFailed] = useState<{
    failed: number;
    total: number;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listLoadFailed, setListLoadFailed] = useState(false);
  const listFetchSeqRef = useRef(0);
  const importErrorSeqRef = useRef(0);
  const initialLoadErrorRef = useRef<((tr: TranslationKeys) => string) | null>(null);
  const deletingIdsRef = useRef<Set<string>>(new Set());
  const tRef = useRef(t);
  tRef.current = t;

  const hasFile = files.length > 0;
  const hasProcessed = !!processedUrl || currentEntry?.status === "completed";
  const hasMultiple = entries.length > 1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < entries.length - 1;

  const firstEntry = entries[0];
  const uploadedModality = firstEntry
    ? (modalityForExtension(firstEntry.file.name.slice(firstEntry.file.name.lastIndexOf("."))) ??
      firstEntry.modality)
    : null;

  useEffect(() => {
    let cancelled = false;
    const seq = ++listFetchSeqRef.current;
    const recordInitialLoadError = (formatter: (tr: TranslationKeys) => string) => {
      setListLoadFailed(true);
      initialLoadErrorRef.current = formatter;
      if (importErrorSeqRef.current === 0) {
        setImportError(formatter(tRef.current));
      }
    };
    (async () => {
      let res: Response;
      try {
        res = await fetch(appUrl("/api/v1/pipeline/list"), {
          headers: formatHeaders(),
        });
      } catch {
        if (cancelled || seq !== listFetchSeqRef.current) return;
        recordInitialLoadError((tr) => tr.errors.networkError);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (cancelled || seq !== listFetchSeqRef.current) return;
        recordInitialLoadError((tr) =>
          failedAnswerMessage(tr, body, res.status, tr.automate.loadFailed),
        );
        return;
      }

      try {
        const data: unknown = await res.json();
        const pipelines = (data as { pipelines?: unknown } | null)?.pipelines;
        if (!Array.isArray(pipelines)) {
          if (cancelled || seq !== listFetchSeqRef.current) return;
          recordInitialLoadError((tr) => tr.automate.loadFailed);
          return;
        }
        if (cancelled || seq !== listFetchSeqRef.current) return;
        initialLoadErrorRef.current = null;
        setListLoadFailed(false);
        setSavedPipelines(pipelines);
      } catch {
        if (cancelled || seq !== listFetchSeqRef.current) return;
        recordInitialLoadError((tr) => tr.automate.loadFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSavedPipelines]);

  useEffect(() => {
    if (initialLoadErrorRef.current && importErrorSeqRef.current === 0) {
      setImportError(initialLoadErrorRef.current(t));
    }
  }, [t]);

  useEffect(() => {
    const state = location.state as { libraryFileIds?: string[] } | null;
    if (!state?.libraryFileIds || libraryImportHandled.current) return;
    const fileIds = state.libraryFileIds;
    libraryImportHandled.current = true;
    const controller = new AbortController();
    libraryImportAbortRef.current = controller;
    const { signal } = controller;
    navigate(location.pathname, { replace: true, state: null });

    (async () => {
      const outcomes = await Promise.allSettled(
        fileIds.map(async (id) => {
          const res = await fetch(getFileDownloadUrl(id), {
            headers: formatHeaders(),
            signal,
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const blob = await res.blob();
          if (signal.aborted) return null;
          const name =
            res.headers.get("content-disposition")?.match(/filename="?(.+?)"?$/)?.[1] ??
            `file-${id}`;
          return new File([blob], name, { type: blob.type });
        }),
      );
      if (signal.aborted) return;
      const valid: File[] = [];
      let failed = 0;
      for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        if (outcome.status === "fulfilled") {
          if (outcome.value) valid.push(outcome.value);
        } else {
          failed += 1;
          console.error(`[automate-page] failed to download file ${fileIds[i]}`, outcome.reason);
        }
      }
      resetFiles();
      if (valid.length > 0) {
        setFiles(valid);
      }
      if (failed > 0) {
        setLibraryImportFailed({ failed, total: fileIds.length });
      }
    })();
  }, [location.state, location.pathname, navigate, resetFiles, setFiles, libraryImportAbortRef]);

  // Arrive with a clean file store, the way tool-page does on every tool change.
  //
  // A tool page can hand this one a run that is already over: use-tool-processor
  // aborts and closes on unmount without clearing the store's processing flag,
  // and nothing on this page owns that flag afterwards. The navigation guard
  // counts /automate as owning the file store, so the leftovers would have it
  // asking about finished work on every navigation away and every tab close,
  // for as long as the tab stayed open (#1122).
  //
  // Not when the navigation carries a library import: those files are the point
  // of the visit, and the effect above owns the store from there.
  // biome-ignore lint/correctness/useExhaustiveDependencies: arrival only; a later state change must not wipe the page
  useEffect(() => {
    if (!(location.state as { libraryFileIds?: string[] } | null)?.libraryFileIds) resetFiles();
  }, []);

  useEffect(() => {
    if (steps.length === 0) {
      setShowSaveForm(false);
      setSaveName("");
      setSaveDescription("");
      setSaveError(null);
    }
  }, [steps.length]);

  useEffect(() => {
    if (savedPipelines.length <= 3) {
      setShowAllSaved(false);
    }
  }, [savedPipelines.length]);

  const handleOpenLibrary = useCallback(() => {
    if (!allowIntake()) return;
    setLibraryModalOpen(true);
  }, [allowIntake]);

  const handleLibraryImport = useCallback(
    (imported: File[]) => {
      if (!allowIntakeRef.current()) return false;
      libraryImportAbortRef.current?.abort();
      setLibraryImportFailed(null);
      if (files.length === 0) {
        resetFiles();
        setFiles(imported);
      } else {
        addFiles(imported);
      }
    },
    [libraryImportAbortRef, files.length, resetFiles, setFiles, addFiles],
  );

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      if (!allowIntakeRef.current()) return;
      libraryImportAbortRef.current?.abort();
      setLibraryImportFailed(null);
      resetFiles();
      setFiles(newFiles);
    },
    [libraryImportAbortRef, setFiles, resetFiles],
  );

  const handleAddMore = useCallback(() => {
    if (!allowIntake()) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = (e) => {
      const picked = Array.from((e.target as HTMLInputElement).files || []);
      if (picked.length > 0) {
        if (!allowIntakeRef.current()) return;
        libraryImportAbortRef.current?.abort();
        setLibraryImportFailed(null);
        addFiles(picked);
      }
    };
    input.click();
  }, [allowIntake, libraryImportAbortRef, addFiles]);

  const handleClearFiles = useCallback(() => {
    if (!allowIntake()) return;
    libraryImportAbortRef.current?.abort();
    setLibraryImportFailed(null);
    resetFiles();
  }, [allowIntake, libraryImportAbortRef, resetFiles]);

  const handleProcess = useCallback(() => {
    if (files.length === 0 || steps.length === 0) return;
    if (files.length === 1) {
      processSingle(files[0], steps);
    } else {
      processAll(files, steps);
    }
  }, [files, steps, processSingle, processAll]);

  const handleSave = useCallback(async () => {
    if (!saveName.trim() || steps.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      let res: Response;
      try {
        res = await fetch(appUrl("/api/v1/pipeline/save"), {
          method: "POST",
          headers: formatHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            name: saveName.trim(),
            description: saveDescription.trim() || undefined,
            steps: steps.map((s) => ({ toolId: s.toolId, settings: s.settings })),
          }),
        });
      } catch {
        setSaveError(t.errors.networkError);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setSaveError(failedAnswerMessage(t, body, res.status, t.automate.saveFailed));
        return;
      }

      withAnalytics(({ track }) =>
        track(ANALYTICS_EVENTS.PIPELINE_SAVED, { step_count: steps.length }),
      );
      setSaveName("");
      setSaveDescription("");
      setShowSaveForm(false);
      const seq = ++listFetchSeqRef.current;

      try {
        const listRes = await fetch(appUrl("/api/v1/pipeline/list"), {
          headers: formatHeaders(),
        });
        if (!listRes.ok) {
          if (seq !== listFetchSeqRef.current) return;
          setListLoadFailed(true);
          setSaveError(t.automate.saveListRefreshFailed);
          return;
        }
        const listData: unknown = await listRes.json();
        const pipelines = (listData as { pipelines?: unknown } | null)?.pipelines;
        if (!Array.isArray(pipelines)) {
          if (seq !== listFetchSeqRef.current) return;
          setListLoadFailed(true);
          setSaveError(t.automate.saveListRefreshFailed);
          return;
        }
        if (seq !== listFetchSeqRef.current) return;
        initialLoadErrorRef.current = null;
        setListLoadFailed(false);
        if (importErrorSeqRef.current === 0) {
          setImportError(null);
        }
        setSavedPipelines(pipelines);
      } catch {
        if (seq !== listFetchSeqRef.current) return;
        setListLoadFailed(true);
        setSaveError(t.automate.saveListRefreshFailed);
      }
    } finally {
      setSaving(false);
    }
  }, [saveName, saveDescription, steps, setSavedPipelines, t]);

  const handleDeletePipeline = useCallback(
    async (id: string) => {
      if (deletingIdsRef.current.has(id)) return;
      deletingIdsRef.current.add(id);
      const errorSeq = ++importErrorSeqRef.current;
      initialLoadErrorRef.current = null;
      setImportError(null);
      try {
        let res: Response;
        try {
          res = await fetch(appUrl(`/api/v1/pipeline/${id}`), {
            method: "DELETE",
            headers: formatHeaders(),
          });
        } catch {
          if (errorSeq === importErrorSeqRef.current) {
            setImportError(t.errors.networkError);
          }
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (errorSeq === importErrorSeqRef.current) {
            setImportError(failedAnswerMessage(t, body, res.status, t.automate.deleteFailed));
          }
          return;
        }

        const seq = ++listFetchSeqRef.current;
        try {
          const listRes = await fetch(appUrl("/api/v1/pipeline/list"), {
            headers: formatHeaders(),
          });
          if (!listRes.ok) {
            if (seq !== listFetchSeqRef.current) return;
            setListLoadFailed(true);
            if (errorSeq === importErrorSeqRef.current) {
              setImportError(t.automate.deleteListRefreshFailed);
            }
            return;
          }
          const listData: unknown = await listRes.json();
          const pipelines = (listData as { pipelines?: unknown } | null)?.pipelines;
          if (!Array.isArray(pipelines)) {
            if (seq !== listFetchSeqRef.current) return;
            setListLoadFailed(true);
            if (errorSeq === importErrorSeqRef.current) {
              setImportError(t.automate.deleteListRefreshFailed);
            }
            return;
          }
          if (seq !== listFetchSeqRef.current) return;
          setListLoadFailed(false);
          if (errorSeq === importErrorSeqRef.current) {
            setImportError(null);
          }
          setSavedPipelines(pipelines);
        } catch {
          if (seq !== listFetchSeqRef.current) return;
          setListLoadFailed(true);
          if (errorSeq === importErrorSeqRef.current) {
            setImportError(t.automate.deleteListRefreshFailed);
          }
        }
      } finally {
        deletingIdsRef.current.delete(id);
      }
    },
    [setSavedPipelines, t],
  );

  const handleLoadPipeline = useCallback(
    (pipeline: SavedPipeline) => {
      loadSteps(pipeline.steps);
    },
    [loadSteps],
  );

  const handleUseTemplate = useCallback(
    (template: PipelineTemplate) => {
      loadSteps(template.steps);
      withAnalytics(({ track }) =>
        track(ANALYTICS_EVENTS.PIPELINE_TEMPLATE_SELECTED, { template_id: template.id }),
      );
    },
    [loadSteps],
  );

  const handleExportPipeline = useCallback((pipeline: SavedPipeline) => {
    const exportData = {
      format: "snapotter-pipeline" as const,
      version: 1,
      name: pipeline.name,
      description: pipeline.description,
      steps: pipeline.steps,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const slug = pipeline.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "pipeline"}.snapotter.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportPipeline = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const errorSeq = ++importErrorSeqRef.current;
      initialLoadErrorRef.current = null;
      setImportError(null);
      // Each stage fails on its own and gets its own message (#1956): a file
      // that won't parse is a bad file, a save request that got no answer is
      // a network error, and a failed refresh after a good save must say
      // the list is stale rather than leave the new pipeline invisible.
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        if (errorSeq === importErrorSeqRef.current) {
          setImportError(t.automate.couldNotRead);
        }
        return;
      }
      if (errorSeq !== importErrorSeqRef.current) return;

      if (
        !data ||
        typeof data !== "object" ||
        (data as { format?: unknown }).format !== "snapotter-pipeline"
      ) {
        setImportError(t.automate.invalidPipelineFile);
        return;
      }
      const pipeline = data as {
        version?: unknown;
        name?: unknown;
        description?: unknown;
        steps?: unknown;
      };
      if (typeof pipeline.version !== "number" || pipeline.version > 1) {
        setImportError(t.automate.newerVersion);
        return;
      }
      if (!pipeline.name || typeof pipeline.name !== "string") {
        setImportError(t.automate.missingName);
        return;
      }
      if (!Array.isArray(pipeline.steps) || pipeline.steps.length === 0) {
        setImportError(t.automate.noSteps);
        return;
      }

      let res: Response;
      try {
        res = await fetch(appUrl("/api/v1/pipeline/save"), {
          method: "POST",
          headers: formatHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            name: pipeline.name,
            description: pipeline.description || undefined,
            steps: pipeline.steps,
          }),
        });
      } catch {
        if (errorSeq === importErrorSeqRef.current) {
          setImportError(t.errors.networkError);
        }
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (errorSeq === importErrorSeqRef.current) {
          setImportError(failedAnswerMessage(t, body, res.status, t.automate.importFailed));
        }
        return;
      }

      const seq = ++listFetchSeqRef.current;
      try {
        const listRes = await fetch(appUrl("/api/v1/pipeline/list"), {
          headers: formatHeaders(),
        });
        if (!listRes.ok) {
          if (seq !== listFetchSeqRef.current) return;
          setListLoadFailed(true);
          if (errorSeq === importErrorSeqRef.current) {
            setImportError(t.automate.importListRefreshFailed);
          }
          return;
        }
        const listData: unknown = await listRes.json();
        const pipelines = (listData as { pipelines?: unknown } | null)?.pipelines;
        if (!Array.isArray(pipelines)) {
          // An OK answer without the list (a proxy's `{}`) must not blank it.
          if (seq !== listFetchSeqRef.current) return;
          setListLoadFailed(true);
          if (errorSeq === importErrorSeqRef.current) {
            setImportError(t.automate.importListRefreshFailed);
          }
          return;
        }
        if (seq !== listFetchSeqRef.current) return;
        setListLoadFailed(false);
        if (errorSeq === importErrorSeqRef.current) {
          setImportError(null);
        }
        setSavedPipelines(pipelines);
      } catch {
        if (seq !== listFetchSeqRef.current) return;
        setListLoadFailed(true);
        if (errorSeq === importErrorSeqRef.current) {
          setImportError(t.automate.importListRefreshFailed);
        }
      }
    };
    input.click();
  }, [setSavedPipelines, t]);

  const handleDownloadAll = useCallback(() => {
    if (!batchZipBlob) return;
    downloadBlob(batchZipBlob, batchZipFilename ?? "batch-pipeline.zip");
    useFileStore.getState().markBatchClaimed();
  }, [batchZipBlob, batchZipFilename]);

  // The store owns processedUrl (an API download URL here, a blob URL after a
  // batch run) and revokes it in reset(). Hand the existing URL to
  // triggerDownload; downloadBlob would mint and revoke a URL this page
  // does not own.
  const handleDownloadSingle = useCallback(() => {
    if (!processedUrl) return;
    triggerDownload(processedUrl, currentEntry?.processedFilename ?? "result");
    useFileStore.getState().claimSelected();
  }, [processedUrl, currentEntry]);

  const handleNavKeyDown = useCallback(
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

  const handleAddStep = useCallback(
    (toolId: string) => {
      addStep(toolId);
      withAnalytics(({ track }) =>
        track(ANALYTICS_EVENTS.PIPELINE_STEP_ADDED, { tool_id: toolId }),
      );
      if (isMobile) setMobileToolPaletteOpen(false);
    },
    [addStep, isMobile],
  );

  /**
   * Render modality-aware preview for the pipeline result or source file.
   * Mirrors the previewKind switching in tool-page.tsx: images get
   * BeforeAfterSlider / ImageViewer, video gets MediaPlayerView, audio
   * gets WaveformPlayer, and document/data get a static info card.
   */
  function renderPipelinePreview(mode: "result" | "original") {
    const kind = currentEntry?.previewKind ?? "image";
    const sourceUrl = originalBlobUrl;
    if (!sourceUrl) return null;

    if (mode === "result") {
      // If we skipped extraction to save memory on a huge batch, there's no url to preview.
      // Show the success card instead of failing or staying blank.
      if (!processedUrl && currentEntry?.status === "completed") {
        const fname = currentEntry.processedFilename ?? selectedFileName ?? files[0]?.name ?? "";
        const ext = fname.split(".").pop()?.toUpperCase() ?? "";
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6 max-w-xs">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-7 w-7 text-success-ink" />
              </div>
              <p className="font-medium text-foreground mb-1">{fname}</p>
              {processedSize != null && (
                <p className="text-xs text-muted-foreground">
                  {ext} &middot; {formatFileSize(processedSize)}
                </p>
              )}
            </div>
          </div>
        );
      }

      if (!processedUrl) return null;
      if (kind === "image") {
        return (
          <BeforeAfterSlider
            beforeSrc={sourceUrl}
            afterSrc={processedUrl}
            beforeSize={originalSize ?? undefined}
            afterSize={processedSize ?? undefined}
          />
        );
      }
      if (kind === "video") {
        return (
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
          >
            <MediaPlayerView />
          </Suspense>
        );
      }
      if (kind === "audio") {
        return (
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
          >
            <WaveformPlayer
              src={processedUrl}
              onDownload={() => useFileStore.getState().claimSelected()}
            />
          </Suspense>
        );
      }
      // document / data: success card with filename + size
      const fname = currentEntry?.processedFilename ?? selectedFileName ?? files[0]?.name ?? "";
      const fsize = processedSize ?? 0;
      const ext = fname.split(".").pop()?.toUpperCase() ?? "";
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-6 max-w-xs">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-7 w-7 text-success-ink" />
            </div>
            <p className="font-medium text-foreground mb-1">{fname}</p>
            <p className="text-xs text-muted-foreground">
              {ext} &middot; {formatFileSize(fsize)}
            </p>
          </div>
        </div>
      );
    }

    // mode === "original"
    if (kind === "image") {
      return (
        <ImageViewer
          src={sourceUrl}
          filename={selectedFileName ?? files[0].name}
          fileSize={selectedFileSize ?? files[0].size}
        />
      );
    }
    if (kind === "video") {
      return (
        <Suspense
          fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
        >
          <MediaPlayerView />
        </Suspense>
      );
    }
    if (kind === "audio") {
      return (
        <Suspense
          fallback={<div className="text-sm text-muted-foreground">{t.common.loading}</div>}
        >
          <WaveformPlayer src={sourceUrl} />
        </Suspense>
      );
    }
    // document / data: placeholder card
    const fname = selectedFileName ?? files[0]?.name ?? "";
    const fsize = selectedFileSize ?? files[0]?.size ?? 0;
    const ext = fname.split(".").pop()?.toUpperCase() ?? "";
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-6 max-w-xs">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
            {(() => {
              const Icon = previewIcon(kind);
              return <Icon className="h-7 w-7 text-muted-foreground" />;
            })()}
          </div>
          <p className="font-medium text-foreground mb-1">{fname}</p>
          <p className="text-xs text-muted-foreground">
            {ext} &middot; {formatFileSize(fsize)}
          </p>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Mobile Layout                                                      */
  /* ------------------------------------------------------------------ */
  if (isMobile) {
    return (
      <AppLayout>
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Mobile header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
            <Workflow className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold text-foreground flex-1">{t.automate.title}</h1>
            {hasFile && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {format(plural(files.length, t.automate.fileCount, t.automate.fileCountPlural), {
                  count: files.length,
                })}
              </span>
            )}
          </div>

          {/* Mobile pipeline steps */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {libraryImportFailed && (
              <div
                role="alert"
                className="mb-3 text-xs text-destructive-ink bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5 flex items-start gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => setLibraryImportFailed(null)}
                  aria-label={t.common.close}
                  className="shrink-0 mt-0.5 hover:opacity-80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <span>{format(t.commonUi.fileLibrary.importFailed, libraryImportFailed)}</span>
              </div>
            )}
            {!hasFile && (
              <div className="mb-4 space-y-2">
                <Dropzone
                  onFiles={handleFiles}
                  multiple
                  currentFiles={files}
                  fileFilter={() => true}
                />
                <button
                  type="button"
                  onClick={handleOpenLibrary}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-primary-ink border border-dashed border-primary/40 rounded-lg hover:bg-primary/5 transition-colors"
                >
                  <FolderOpen className="h-4 w-4" />
                  {t.automate.importFromLibrary}
                </button>
              </div>
            )}

            {hasFile && (
              <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-4 w-4 text-success-ink shrink-0" />
                <span className="text-sm text-foreground truncate flex-1">
                  {selectedFileName ?? files[0].name}
                </span>
                <button
                  type="button"
                  onClick={handleAddMore}
                  className="text-xs text-primary-ink hover:text-primary-ink-strong"
                >
                  {t.automate.addButton}
                </button>
                <button
                  type="button"
                  onClick={handleOpenLibrary}
                  className="text-xs text-primary-ink hover:text-primary-ink-strong"
                >
                  {t.automate.libraryButton}
                </button>
                <button
                  type="button"
                  onClick={handleClearFiles}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t.automate.clearButton}
                </button>
              </div>
            )}

            {/* Mobile preview / result */}
            {hasFile && hasProcessed && originalBlobUrl && (
              <div className="mb-3 rounded-lg border border-border overflow-hidden">
                <div className="relative h-48">{renderPipelinePreview("result")}</div>
                {processedSize != null && (
                  <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
                    <span className="truncate">{selectedFileName ?? files[0].name}</span>
                    <span>
                      {formatFileSize(originalSize ?? 0)} &rarr; {formatFileSize(processedSize)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {hasFile && !hasProcessed && originalBlobUrl && currentEntry?.status !== "failed" && (
              <div className="mb-3 rounded-lg border border-border overflow-hidden h-40 flex items-center justify-center bg-muted/20">
                {renderPipelinePreview("original")}
              </div>
            )}

            {hasFile && !hasProcessed && currentEntry?.status === "failed" && (
              <div className="mb-3 rounded-lg border border-border p-3 text-center">
                <p className="text-sm text-destructive-ink">
                  {displayStoredError(currentEntry.error, t.tools.processing.canceled) ??
                    t.toolPage.processingFailed}
                </p>
              </div>
            )}

            {hasMultiple && (
              <div className="mb-3">
                <ThumbnailStrip
                  entries={entries}
                  selectedIndex={selectedIndex}
                  onSelect={setSelectedIndex}
                />
              </div>
            )}

            <PipelineBuilder
              steps={steps}
              expandedStepId={expandedStepId}
              uploadedModality={uploadedModality}
              onRemoveStep={removeStep}
              onReorderSteps={reorderSteps}
              onUpdateSettings={updateStepSettings}
              onToggleStep={setExpandedStep}
            />

            {error && (
              <div className="mt-3 text-xs text-destructive-ink bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5 flex items-start gap-1.5">
                <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {processing && (
              <div className="mt-3">
                <ProgressCard
                  active={progress.phase !== "idle"}
                  phase={progress.phase === "idle" ? "processing" : progress.phase}
                  label={
                    files.length > 1
                      ? format(t.automate.processingMultiple, { count: files.length })
                      : t.automate.processingPipeline
                  }
                  stage={progress.stage}
                  percent={progress.percent}
                  elapsed={progress.elapsed}
                />
              </div>
            )}
          </div>

          {/* Mobile action bar */}
          <div className="p-3 border-t border-border shrink-0 flex gap-2">
            <button
              type="button"
              onClick={handleProcess}
              disabled={!hasFile || steps.length === 0 || processing}
              className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-4 w-4" />
              {files.length <= 1 ? t.common.process : `${t.common.process} (${files.length})`}
            </button>
            {hasProcessed && batchZipBlob && (
              <button
                type="button"
                onClick={handleDownloadAll}
                className="px-4 py-2.5 rounded-lg border border-primary text-primary-ink"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            {hasProcessed && !batchZipBlob && processedUrl && (
              <button
                type="button"
                onClick={handleDownloadSingle}
                className="px-4 py-2.5 rounded-lg border border-primary text-primary-ink"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Mobile FAB for tool palette */}
          <button
            type="button"
            onClick={() => setMobileToolPaletteOpen(true)}
            aria-label={t.automate.addTool}
            className="fixed bottom-24 right-4 z-20 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-transform"
          >
            <Plus className="h-6 w-6" />
          </button>

          {/* Mobile tool palette bottom sheet */}
          {mobileToolPaletteOpen && (
            <>
              <div
                aria-hidden="true"
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                onClick={() => setMobileToolPaletteOpen(false)}
              />
              <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl shadow-xl max-h-[70dvh] flex flex-col animate-in slide-in-from-bottom">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                  <h2 className="text-sm font-semibold text-foreground">{t.automate.addTool}</h2>
                  <button
                    type="button"
                    onClick={() => setMobileToolPaletteOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <ToolPalette onAddStep={handleAddStep} className="flex-1 min-h-0" />
              </div>
            </>
          )}
          <FileLibraryModal
            open={libraryModalOpen}
            onClose={() => setLibraryModalOpen(false)}
            onImport={handleLibraryImport}
          />
        </div>
      </AppLayout>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Desktop Layout                                                     */
  /* ------------------------------------------------------------------ */
  return (
    <AppLayout>
      <div className="flex h-full w-full overflow-hidden">
        {/* LEFT PANE — Tool Palette */}
        <div className="w-72 border-r border-border flex flex-col shrink-0">
          {/* Palette header */}
          <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t.automate.toolPalette}</h2>
              <p className="text-xs text-muted-foreground">{t.automate.clickToAdd}</p>
            </div>
          </div>

          {/* Tool catalog */}
          <ToolPalette onAddStep={handleAddStep} className="flex-1 min-h-0" />

          {/* Pipeline templates */}
          <TemplatesSection onUse={handleUseTemplate} emphasized={steps.length === 0} />

          {/* Saved pipelines */}
          <div className="px-3 py-2 border-t border-border shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                {t.automate.savedLabel}
              </h3>
              <button
                type="button"
                onClick={handleImportPipeline}
                className="text-xs text-muted-foreground hover:text-primary-ink flex items-center gap-1 transition-colors"
              >
                <Upload className="h-3 w-3" />
                {t.automate.importButton}
              </button>
            </div>
            {importError && (
              <div className="text-xs text-destructive-ink bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5 mb-1.5 flex items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    importErrorSeqRef.current += 1;
                    initialLoadErrorRef.current = null;
                    setImportError(null);
                  }}
                  aria-label={t.common.close}
                  className="shrink-0 mt-0.5 hover:opacity-80"
                >
                  <X className="h-3 w-3" />
                </button>
                <span>{importError}</span>
              </div>
            )}
            {savedPipelines.length === 0 ? (
              !listLoadFailed && (
                <p className="text-xs text-muted-foreground italic">
                  {t.automate.noSavedPipelines}
                </p>
              )
            ) : showAllSaved && savedPipelines.length > 3 ? (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {savedPipelines.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => handleLoadPipeline(p)}
                      className="flex-1 text-start text-xs text-foreground hover:text-primary-ink truncate py-1 px-2 rounded hover:bg-muted"
                    >
                      {p.name}
                      <span className="text-muted-foreground ms-1">
                        {format(
                          plural(p.steps.length, t.automate.stepCount, t.automate.stepCountPlural),
                          { count: p.steps.length },
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportPipeline(p)}
                      className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary-ink transition-all shrink-0"
                      title={t.automate.exportPipeline}
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePipeline(p.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                      title={t.automate.deletePipeline}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setShowAllSaved(false)}
                  className="text-xs text-muted-foreground hover:text-foreground mt-1"
                >
                  {t.common.showLess}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {savedPipelines.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => handleLoadPipeline(p)}
                      className="flex-1 text-start text-xs text-foreground hover:text-primary-ink truncate py-1 px-2 rounded hover:bg-muted"
                    >
                      {p.name}
                      <span className="text-muted-foreground ms-1">
                        {format(
                          plural(p.steps.length, t.automate.stepCount, t.automate.stepCountPlural),
                          { count: p.steps.length },
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportPipeline(p)}
                      className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary-ink transition-all shrink-0"
                      title={t.automate.exportPipeline}
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePipeline(p.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                      title={t.automate.deletePipeline}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {savedPipelines.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllSaved(true)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5"
                  >
                    {format(t.automate.moreCount, { count: savedPipelines.length - 3 })}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE — Pipeline Canvas + Preview */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Canvas header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
            <Workflow className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground">
                {t.automate.pipelineBuilder}
              </h1>
              <p className="text-xs text-muted-foreground">
                {steps.length === 0
                  ? t.automate.addToolsPrompt
                  : format(
                      plural(
                        steps.length,
                        t.automate.stepsConfigured,
                        t.automate.stepsConfiguredPlural,
                      ),
                      { count: steps.length },
                    )}
              </p>
            </div>

            {/* File badge */}
            {hasFile ? (
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-ink" />
                  <span className="text-foreground max-w-[120px] truncate">
                    {files.length > 1
                      ? format(t.automate.fileCountPlural, { count: files.length })
                      : (selectedFileName ?? files[0].name)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatFileSize(selectedFileSize ?? files[0].size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddMore}
                  className="text-xs text-primary-ink hover:text-primary-ink-strong"
                >
                  {t.automate.addButton}
                </button>
                <button
                  type="button"
                  onClick={handleOpenLibrary}
                  className="text-xs text-primary-ink hover:text-primary-ink-strong flex items-center gap-1"
                >
                  <FolderOpen className="h-3 w-3" />
                  {t.automate.libraryButton}
                </button>
                <button
                  type="button"
                  onClick={handleClearFiles}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t.automate.clearButton}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground italic">
                  {t.automate.noFilesLoaded}
                </span>
                <button
                  type="button"
                  onClick={handleOpenLibrary}
                  className="text-xs text-primary-ink hover:text-primary-ink-strong flex items-center gap-1"
                >
                  <FolderOpen className="h-3 w-3" />
                  {t.automate.importFromLibrary}
                </button>
              </div>
            )}
          </div>

          {/* Canvas body */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Pipeline steps area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              {libraryImportFailed && (
                <div
                  role="alert"
                  className="mb-3 text-xs text-destructive-ink bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 flex items-start gap-1.5"
                >
                  <button
                    type="button"
                    onClick={() => setLibraryImportFailed(null)}
                    aria-label={t.common.close}
                    className="shrink-0 mt-0.5 hover:opacity-80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <span>{format(t.commonUi.fileLibrary.importFailed, libraryImportFailed)}</span>
                </div>
              )}
              {error && (
                <div className="mb-3 text-xs text-destructive-ink bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <PipelineBuilder
                steps={steps}
                expandedStepId={expandedStepId}
                uploadedModality={uploadedModality}
                onRemoveStep={removeStep}
                onReorderSteps={reorderSteps}
                onUpdateSettings={updateStepSettings}
                onToggleStep={setExpandedStep}
              />

              {processing && (
                <div className="mt-4">
                  <ProgressCard
                    active={progress.phase !== "idle"}
                    phase={progress.phase === "idle" ? "processing" : progress.phase}
                    label={
                      files.length > 1
                        ? format(t.automate.processingMultiple, { count: files.length })
                        : t.automate.processingPipeline
                    }
                    stage={progress.stage}
                    percent={progress.percent}
                    elapsed={progress.elapsed}
                  />
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="px-5 py-3 border-t border-border shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={handleProcess}
                disabled={!hasFile || steps.length === 0 || processing}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="h-4 w-4" />
                {files.length <= 1
                  ? t.common.process
                  : format(t.automate.processAllButton, { count: files.length })}
              </button>

              {hasProcessed && batchZipBlob && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  className="px-4 py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center gap-2 hover:bg-primary/5"
                >
                  <Download className="h-4 w-4" />
                  {t.automate.downloadZip}
                </button>
              )}
              {hasProcessed && !batchZipBlob && processedUrl && (
                <button
                  type="button"
                  onClick={handleDownloadSingle}
                  className="px-4 py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center gap-2 hover:bg-primary/5"
                >
                  <Download className="h-4 w-4" />
                  {t.common.download}
                </button>
              )}

              <span className="flex-1" />

              {saveError && (
                <div className="text-xs text-destructive-ink bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5 flex items-start gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSaveError(null)}
                    aria-label={t.common.close}
                    className="shrink-0 mt-0.5 hover:opacity-80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <span>{saveError}</span>
                </div>
              )}

              {steps.length > 0 && !showSaveForm && (
                <button
                  type="button"
                  onClick={() => {
                    setSaveError(null);
                    setShowSaveForm(true);
                  }}
                  className="px-4 py-2 rounded-lg border border-border text-muted-foreground font-medium flex items-center gap-2 hover:bg-muted hover:text-foreground text-sm"
                >
                  <Save className="h-4 w-4" />
                  {t.automate.saveButton}
                </button>
              )}

              {steps.length > 0 && showSaveForm && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => {
                      setSaveName(e.target.value);
                      setSaveError(null);
                    }}
                    placeholder={t.automate.pipelineName}
                    className="text-sm px-2.5 py-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground w-36"
                  />
                  <input
                    type="text"
                    value={saveDescription}
                    onChange={(e) => {
                      setSaveDescription(e.target.value);
                      setSaveError(null);
                    }}
                    placeholder={t.automate.descriptionPlaceholder}
                    className="text-sm px-2.5 py-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground w-36"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!saveName.trim() || saving}
                    className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? "..." : t.common.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveForm(false);
                      setSaveName("");
                      setSaveDescription("");
                      setSaveError(null);
                    }}
                    className="px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              )}
            </div>

            {/* Preview panel (collapsible) */}
            <div
              className={cn(
                "border-t border-border shrink-0 flex flex-col transition-all",
                previewCollapsed ? "h-10" : "h-[38%] min-h-[200px]",
              )}
            >
              {/* Preview header with toggle */}
              <button
                type="button"
                onClick={() => setPreviewCollapsed(!previewCollapsed)}
                className="flex items-center gap-2 px-5 py-2 shrink-0 hover:bg-muted/50 transition-colors"
              >
                {previewCollapsed ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t.automate.preview}
                </span>
                {hasFile && hasProcessed && processedSize != null && (
                  <span className="text-xs text-muted-foreground ms-auto">
                    {formatFileSize(originalSize ?? 0)} &rarr; {formatFileSize(processedSize)}
                  </span>
                )}
              </button>

              {/* Preview content */}
              {!previewCollapsed && (
                <section
                  aria-label={t.a11y.imageArea}
                  className="flex-1 flex flex-col overflow-hidden min-h-0"
                  onKeyDown={hasMultiple ? handleNavKeyDown : undefined}
                  tabIndex={hasMultiple ? 0 : undefined}
                >
                  <div className="flex-1 relative flex items-center justify-center px-6 py-2 min-h-0">
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
                      <div className="absolute top-2 right-3 z-10 bg-background/80 border border-border px-2 py-0.5 rounded-full text-xs text-muted-foreground tabular-nums">
                        {selectedIndex + 1} / {entries.length}
                      </div>
                    )}

                    {!hasFile && (
                      <div className="flex flex-col items-center gap-2 w-full max-w-sm mx-auto py-2 min-h-0 overflow-hidden">
                        <div className="w-full max-h-[120px] overflow-hidden">
                          <Dropzone
                            onFiles={handleFiles}
                            multiple
                            currentFiles={files}
                            compact
                            fileFilter={() => true}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenLibrary}
                          className="flex items-center gap-2 px-4 py-1.5 text-sm text-primary-ink border border-dashed border-primary/40 rounded-lg hover:bg-primary/5 transition-colors"
                        >
                          <FolderOpen className="h-4 w-4" />
                          {t.automate.importFromLibrary}
                        </button>
                      </div>
                    )}

                    {hasFile && !hasProcessed && currentEntry?.status === "failed" && (
                      <div className="flex flex-col items-center justify-center gap-2 h-full text-center px-4">
                        <p className="text-sm text-destructive-ink">
                          {displayStoredError(currentEntry.error, t.tools.processing.canceled) ??
                            t.toolPage.processingFailed}
                        </p>
                      </div>
                    )}

                    {hasFile && hasProcessed && originalBlobUrl && renderPipelinePreview("result")}

                    {hasFile &&
                      !hasProcessed &&
                      originalBlobUrl &&
                      currentEntry?.status !== "failed" &&
                      renderPipelinePreview("original")}
                  </div>

                  {hasMultiple && (
                    <ThumbnailStrip
                      entries={entries}
                      selectedIndex={selectedIndex}
                      onSelect={setSelectedIndex}
                    />
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
      <FileLibraryModal
        open={libraryModalOpen}
        onClose={() => setLibraryModalOpen(false)}
        onImport={handleLibraryImport}
      />
    </AppLayout>
  );
}
