import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FolderOpen,
  Layers,
  Play,
  Plus,
  Save,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { Dropzone } from "@/components/common/dropzone";
import { FileLibraryModal } from "@/components/common/file-library-modal";
import { ImageViewer } from "@/components/common/image-viewer";
import { ProgressCard } from "@/components/common/progress-card";
import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { AppLayout } from "@/components/layout/app-layout";
import { PipelineBuilder } from "@/components/tools/pipeline-builder";
import { ToolPalette } from "@/components/tools/tool-palette";
import { useMobile } from "@/hooks/use-mobile";
import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { formatHeaders, getFileDownloadUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/download";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";
import { type SavedPipeline, usePipelineStore } from "@/stores/pipeline-store";

export function AutomatePage() {
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

  const hasFile = files.length > 0;
  const hasProcessed = !!processedUrl;
  const hasMultiple = entries.length > 1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < entries.length - 1;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/pipeline/list", {
          headers: formatHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setSavedPipelines(data.pipelines || []);
        }
      } catch {
        // Silently fail
      }
    })();
  }, [setSavedPipelines]);

  useEffect(() => {
    const state = location.state as { libraryFileIds?: string[] } | null;
    if (!state?.libraryFileIds || libraryImportHandled.current) return;
    const fileIds = state.libraryFileIds;
    libraryImportHandled.current = true;
    navigate(location.pathname, { replace: true, state: null });

    (async () => {
      const downloaded = await Promise.all(
        fileIds.map(async (id) => {
          try {
            const res = await fetch(getFileDownloadUrl(id), { headers: formatHeaders() });
            if (!res.ok) return null;
            const blob = await res.blob();
            const name =
              res.headers.get("content-disposition")?.match(/filename="?(.+?)"?$/)?.[1] ??
              `file-${id}`;
            return new File([blob], name, { type: blob.type });
          } catch {
            return null;
          }
        }),
      );
      const valid = downloaded.filter((f): f is File => f !== null);
      if (valid.length > 0) {
        resetFiles();
        setFiles(valid);
      }
    })();
  }, [location.state, location.pathname, navigate, resetFiles, setFiles]);

  const handleLibraryImport = useCallback(
    (imported: File[]) => {
      if (files.length === 0) {
        resetFiles();
        setFiles(imported);
      } else {
        addFiles(imported);
      }
    },
    [files.length, resetFiles, setFiles, addFiles],
  );

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      resetFiles();
      setFiles(newFiles);
    },
    [setFiles, resetFiles],
  );

  const handleAddMore = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.heic,.heif,.hif";
    input.onchange = (e) => {
      const picked = Array.from((e.target as HTMLInputElement).files || []);
      if (picked.length > 0) addFiles(picked);
    };
    input.click();
  }, [addFiles]);

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
    try {
      const res = await fetch("/api/v1/pipeline/save", {
        method: "POST",
        headers: formatHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: saveName.trim(),
          description: saveDescription.trim() || undefined,
          steps: steps.map((s) => ({ toolId: s.toolId, settings: s.settings })),
        }),
      });
      if (res.ok) {
        const listRes = await fetch("/api/v1/pipeline/list", {
          headers: formatHeaders(),
        });
        if (listRes.ok) {
          const data = await listRes.json();
          setSavedPipelines(data.pipelines || []);
        }
        setSaveName("");
        setSaveDescription("");
        setShowSaveForm(false);
      }
    } catch {
      // Save failed silently
    } finally {
      setSaving(false);
    }
  }, [saveName, saveDescription, steps, setSavedPipelines]);

  const handleDeletePipeline = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/v1/pipeline/${id}`, {
          method: "DELETE",
          headers: formatHeaders(),
        });
        const listRes = await fetch("/api/v1/pipeline/list", {
          headers: formatHeaders(),
        });
        if (listRes.ok) {
          const data = await listRes.json();
          setSavedPipelines(data.pipelines || []);
        }
      } catch {
        // ignore
      }
    },
    [setSavedPipelines],
  );

  const handleLoadPipeline = useCallback(
    (pipeline: SavedPipeline) => {
      loadSteps(pipeline.steps);
    },
    [loadSteps],
  );

  const handleDownloadAll = useCallback(() => {
    if (!batchZipBlob) return;
    const url = URL.createObjectURL(batchZipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = batchZipFilename ?? "batch-pipeline.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [batchZipBlob, batchZipFilename]);

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

  const handleAddStep = useCallback(
    (toolId: string) => {
      addStep(toolId);
      if (isMobile) setMobileToolPaletteOpen(false);
    },
    [addStep, isMobile],
  );

  /* ------------------------------------------------------------------ */
  /*  Mobile Layout                                                      */
  /* ------------------------------------------------------------------ */
  if (isMobile) {
    return (
      <AppLayout showToolPanel={false}>
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Mobile header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
            <Workflow className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold text-foreground flex-1">Automate</h1>
            {hasFile && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {files.length} file{files.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Mobile pipeline steps */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {!hasFile && (
              <div className="mb-4 space-y-2">
                <Dropzone onFiles={handleFiles} accept="image/*" multiple currentFiles={files} />
                <button
                  type="button"
                  onClick={() => setLibraryModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-primary border border-dashed border-primary/40 rounded-lg hover:bg-primary/5 transition-colors"
                >
                  <FolderOpen className="h-4 w-4" />
                  Import from Library
                </button>
              </div>
            )}

            {hasFile && (
              <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span className="text-sm text-foreground truncate flex-1">
                  {selectedFileName ?? files[0].name}
                </span>
                <button
                  type="button"
                  onClick={handleAddMore}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  + Add
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryModalOpen(true)}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  Library
                </button>
                <button
                  type="button"
                  onClick={() => resetFiles()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Mobile image preview / result */}
            {hasFile && hasProcessed && originalBlobUrl && (
              <div className="mb-3 rounded-lg border border-border overflow-hidden">
                <div className="relative h-48">
                  <BeforeAfterSlider
                    beforeSrc={originalBlobUrl}
                    afterSrc={processedUrl as string}
                    beforeSize={originalSize ?? undefined}
                    afterSize={processedSize ?? undefined}
                  />
                </div>
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
                <ImageViewer
                  src={originalBlobUrl}
                  filename={selectedFileName ?? files[0].name}
                  fileSize={selectedFileSize ?? files[0].size}
                />
              </div>
            )}

            {hasFile && !hasProcessed && currentEntry?.status === "failed" && (
              <div className="mb-3 rounded-lg border border-border p-3 text-center">
                <p className="text-sm text-red-500">
                  {currentEntry.error ?? "Processing failed for this file"}
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
              onRemoveStep={removeStep}
              onReorderSteps={reorderSteps}
              onUpdateSettings={updateStepSettings}
              onToggleStep={setExpandedStep}
            />

            {error && (
              <div className="mt-3 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5 flex items-start gap-1.5">
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
                      ? `Processing ${files.length} files...`
                      : "Processing pipeline..."
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
              {files.length <= 1 ? "Process" : `Process (${files.length})`}
            </button>
            {hasProcessed && batchZipBlob && (
              <button
                type="button"
                onClick={handleDownloadAll}
                className="px-4 py-2.5 rounded-lg border border-primary text-primary"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Mobile FAB for tool palette */}
          <button
            type="button"
            onClick={() => setMobileToolPaletteOpen(true)}
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
              <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl shadow-xl max-h-[70vh] flex flex-col animate-in slide-in-from-bottom">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                  <h2 className="text-sm font-semibold text-foreground">Add Tool</h2>
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
    <AppLayout showToolPanel={false}>
      <div className="flex h-full w-full overflow-hidden">
        {/* LEFT PANE — Tool Palette */}
        <div className="w-72 border-r border-border flex flex-col shrink-0">
          {/* Palette header */}
          <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tool Palette</h2>
              <p className="text-xs text-muted-foreground">Click to add to pipeline</p>
            </div>
          </div>

          {/* Tool catalog */}
          <ToolPalette onAddStep={handleAddStep} className="flex-1 min-h-0" />

          {/* Saved pipelines */}
          {savedPipelines.length > 0 && (
            <div className="px-3 py-2 border-t border-border shrink-0">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1.5">
                Saved
              </h3>
              {showAllSaved ? (
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {savedPipelines.map((p) => (
                    <div key={p.id} className="flex items-center gap-1 group">
                      <button
                        type="button"
                        onClick={() => handleLoadPipeline(p)}
                        className="flex-1 text-left text-xs text-foreground hover:text-primary truncate py-1 px-2 rounded hover:bg-muted"
                      >
                        {p.name}
                        <span className="text-muted-foreground ml-1">
                          ({p.steps.length} step{p.steps.length !== 1 ? "s" : ""})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePipeline(p.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
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
                    Show less
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {savedPipelines.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleLoadPipeline(p)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground hover:bg-primary/10 hover:text-primary transition-colors truncate max-w-[110px]"
                    >
                      <Play className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                  {savedPipelines.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllSaved(true)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5"
                    >
                      +{savedPipelines.length - 3} more
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANE — Pipeline Canvas + Preview */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Canvas header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
            <Workflow className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground">Pipeline Builder</h1>
              <p className="text-xs text-muted-foreground">
                {steps.length === 0
                  ? "Add tools from the palette to get started"
                  : `${steps.length} step${steps.length !== 1 ? "s" : ""} configured`}
              </p>
            </div>

            {/* File badge */}
            {hasFile ? (
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-foreground max-w-[120px] truncate">
                    {files.length > 1
                      ? `${files.length} files`
                      : (selectedFileName ?? files[0].name)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatFileSize(selectedFileSize ?? files[0].size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddMore}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  + Add
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryModalOpen(true)}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  <FolderOpen className="h-3 w-3" />
                  Library
                </button>
                <button
                  type="button"
                  onClick={() => resetFiles()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground italic">No files loaded</span>
                <button
                  type="button"
                  onClick={() => setLibraryModalOpen(true)}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  <FolderOpen className="h-3 w-3" />
                  Import from Library
                </button>
              </div>
            )}
          </div>

          {/* Canvas body */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Pipeline steps area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              {error && (
                <div className="mb-3 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <PipelineBuilder
                steps={steps}
                expandedStepId={expandedStepId}
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
                        ? `Processing ${files.length} files...`
                        : "Processing pipeline..."
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
                {files.length <= 1 ? "Process" : `Process All (${files.length})`}
              </button>

              {hasProcessed && batchZipBlob && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  className="px-4 py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center gap-2 hover:bg-primary/5"
                >
                  <Download className="h-4 w-4" />
                  Download ZIP
                </button>
              )}

              <span className="flex-1" />

              {steps.length > 0 && !showSaveForm && (
                <button
                  type="button"
                  onClick={() => setShowSaveForm(true)}
                  className="px-4 py-2 rounded-lg border border-border text-muted-foreground font-medium flex items-center gap-2 hover:bg-muted hover:text-foreground text-sm"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
              )}

              {showSaveForm && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Pipeline name"
                    className="text-sm px-2.5 py-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground w-36"
                  />
                  <input
                    type="text"
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    placeholder="Description"
                    className="text-sm px-2.5 py-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground w-36"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!saveName.trim() || saving}
                    className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? "..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveForm(false);
                      setSaveName("");
                      setSaveDescription("");
                    }}
                    className="px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted"
                  >
                    Cancel
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
                  Preview
                </span>
                {hasFile && hasProcessed && processedSize != null && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatFileSize(originalSize ?? 0)} &rarr; {formatFileSize(processedSize)}
                  </span>
                )}
              </button>

              {/* Preview content */}
              {!previewCollapsed && (
                <section
                  aria-label="Image area"
                  className="flex-1 flex flex-col overflow-hidden min-h-0"
                  onKeyDown={hasMultiple ? handleImageKeyDown : undefined}
                  tabIndex={hasMultiple ? 0 : undefined}
                >
                  <div className="flex-1 relative flex items-center justify-center px-6 py-2 min-h-0">
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
                      <div className="absolute top-2 right-3 z-10 bg-background/80 border border-border px-2 py-0.5 rounded-full text-xs text-muted-foreground tabular-nums">
                        {selectedIndex + 1} / {entries.length}
                      </div>
                    )}

                    {!hasFile && (
                      <div className="flex flex-col items-center gap-3 w-full max-w-md">
                        <Dropzone
                          onFiles={handleFiles}
                          accept="image/*"
                          multiple
                          currentFiles={files}
                        />
                        <button
                          type="button"
                          onClick={() => setLibraryModalOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-primary border border-dashed border-primary/40 rounded-lg hover:bg-primary/5 transition-colors"
                        >
                          <FolderOpen className="h-4 w-4" />
                          Import from Library
                        </button>
                      </div>
                    )}

                    {hasFile && !hasProcessed && currentEntry?.status === "failed" && (
                      <div className="flex flex-col items-center justify-center gap-2 h-full text-center px-4">
                        <p className="text-sm text-red-500">
                          {currentEntry.error ?? "Processing failed for this file"}
                        </p>
                      </div>
                    )}

                    {hasFile && hasProcessed && originalBlobUrl && (
                      <BeforeAfterSlider
                        beforeSrc={originalBlobUrl}
                        afterSrc={processedUrl as string}
                        beforeSize={originalSize ?? undefined}
                        afterSize={processedSize ?? undefined}
                      />
                    )}

                    {hasFile &&
                      !hasProcessed &&
                      originalBlobUrl &&
                      currentEntry?.status !== "failed" && (
                        <ImageViewer
                          src={originalBlobUrl}
                          filename={selectedFileName ?? files[0].name}
                          fileSize={selectedFileSize ?? files[0].size}
                        />
                      )}
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
