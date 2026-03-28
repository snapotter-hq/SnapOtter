import { TOOLS } from "@stirling-image/shared";
import * as icons from "lucide-react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileImage,
  Loader2,
  Play,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchBar } from "@/components/common/search-bar";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PipelineStepSettings } from "./pipeline-step-settings";

/** Tools that can be used as pipeline steps (excludes pipeline/batch/multi-file tools). */
const PIPELINE_TOOLS_BASE = TOOLS.filter(
  (t) => !["pipeline", "batch", "compare", "find-duplicates", "collage", "compose"].includes(t.id),
);

export interface PipelineStep {
  id: string;
  toolId: string;
  settings: Record<string, unknown>;
}

interface PipelineBuilderProps {
  steps: PipelineStep[];
  onStepsChange: (steps: PipelineStep[]) => void;
  onSave: (name: string, description: string) => void;
  onExecute: (file: File) => void;
  saving?: boolean;
  executing?: boolean;
  executionResult?: {
    downloadUrl: string;
    originalSize: number;
    processedSize: number;
    stepsCompleted: number;
  } | null;
  executionError?: string | null;
}

export function PipelineBuilder({
  steps,
  onStepsChange,
  onSave,
  onExecute,
  saving = false,
  executing = false,
  executionResult = null,
  executionError = null,
}: PipelineBuilderProps) {
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [experimentalEnabled, setExperimentalEnabled] = useState(false);
  const [pipelineToolIds, setPipelineToolIds] = useState<string[] | null>(null);
  const [toolSearch, setToolSearch] = useState("");

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setDisabledTools(
          data.settings.disabledTools ? JSON.parse(data.settings.disabledTools) : [],
        );
        setExperimentalEnabled(data.settings.enableExperimentalTools === "true");
      })
      .catch(() => {});

    // Fetch which tools actually support pipeline execution
    apiGet<{ toolIds: string[] }>("/v1/pipeline/tools")
      .then((data) => setPipelineToolIds(data.toolIds))
      .catch(() => {});
  }, []);

  const PIPELINE_TOOLS = useMemo(() => {
    const q = toolSearch.toLowerCase();
    return PIPELINE_TOOLS_BASE.filter((t) => {
      if (disabledTools.includes(t.id)) return false;
      if (t.experimental && !experimentalEnabled) return false;
      // Only show tools that are registered in the pipeline-compatible tool registry
      if (pipelineToolIds && !pipelineToolIds.includes(t.id)) return false;
      // Search filter
      if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [disabledTools, experimentalEnabled, pipelineToolIds, toolSearch]);

  const addStep = useCallback(
    (toolId: string) => {
      const step: PipelineStep = {
        id: crypto.randomUUID(),
        toolId,
        settings: {},
      };
      onStepsChange([...steps, step]);
      setShowToolPicker(false);
      setToolSearch("");
      setExpandedStep(step.id);
    },
    [steps, onStepsChange],
  );

  const removeStep = useCallback(
    (id: string) => {
      onStepsChange(steps.filter((s) => s.id !== id));
      if (expandedStep === id) setExpandedStep(null);
    },
    [steps, onStepsChange, expandedStep],
  );

  const moveStep = useCallback(
    (id: string, direction: "up" | "down") => {
      const idx = steps.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= steps.length) return;
      const newSteps = [...steps];
      [newSteps[idx], newSteps[newIdx]] = [newSteps[newIdx], newSteps[idx]];
      onStepsChange(newSteps);
    },
    [steps, onStepsChange],
  );

  const updateStepSettings = useCallback(
    (id: string, newSettings: Record<string, unknown>) => {
      onStepsChange(steps.map((s) => (s.id === id ? { ...s, settings: newSettings } : s)));
    },
    [steps, onStepsChange],
  );

  const handleFileSelect = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) setFile(f);
    };
    input.click();
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    onSave(saveName.trim(), saveDescription.trim());
    setSaveName("");
    setSaveDescription("");
    setShowSaveForm(false);
  }, [saveName, saveDescription, onSave]);

  const handleExecute = useCallback(() => {
    if (!file) return;
    onExecute(file);
  }, [file, onExecute]);

  const iconsMap = icons as unknown as Record<string, React.ComponentType<{ className?: string }>>;

  return (
    <div className="space-y-6">
      {/* File Upload Area */}
      <section
        aria-label="File upload area"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className={cn(
          "rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          file
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-muted/20 hover:border-primary/30",
        )}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileImage className="h-5 w-5 text-primary" />
            <div className="text-sm">
              <span className="font-medium text-foreground">{file.name}</span>
              <span className="text-muted-foreground ml-2">
                ({(file.size / 1024).toFixed(0)} KB)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleFileSelect}
            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary/5 transition-colors text-sm"
          >
            <Upload className="h-4 w-4" />
            Upload image to process
          </button>
        )}
      </section>

      {/* Pipeline Steps */}
      <div className="space-y-2">
        {steps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Add steps to build your automation pipeline
          </div>
        ) : (
          steps.map((step, idx) => {
            const tool = TOOLS.find((t) => t.id === step.toolId);
            if (!tool) return null;
            const Icon = iconsMap[tool.icon] || icons.FileImage;
            const isExpanded = expandedStep === step.id;

            return (
              <div
                key={step.id}
                className="rounded-lg border border-border bg-background overflow-hidden"
              >
                <div className="flex items-center gap-2 p-3">
                  {/* Step number */}
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>

                  {/* Tool icon + name */}
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground flex-1">{tool.name}</span>

                  {/* Controls */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                      title="Settings"
                    >
                      <ChevronRight
                        className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(step.id, "up")}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(step.id, "down")}
                      disabled={idx === steps.length - 1}
                      className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(step.id)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Settings panel - hidden when collapsed, never unmounted so state persists */}
                <div
                  className={
                    isExpanded ? "border-t border-border p-3 bg-muted/10 space-y-3" : "hidden"
                  }
                >
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                  <PipelineStepSettings
                    toolId={step.toolId}
                    settings={step.settings}
                    onChange={(s) => updateStepSettings(step.id, s)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Step */}
      {showToolPicker ? (
        <div className="rounded-lg border border-border bg-background p-3 space-y-2 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Add a step</span>
            <button
              type="button"
              onClick={() => {
                setShowToolPicker(false);
                setToolSearch("");
              }}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SearchBar value={toolSearch} onChange={setToolSearch} placeholder="Search tools..." />
          {PIPELINE_TOOLS.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No tools found</p>
          ) : (
            PIPELINE_TOOLS.map((tool) => {
              const Icon = iconsMap[tool.icon] || icons.FileImage;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => addStep(tool.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted text-sm text-left transition-colors"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{tool.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{tool.description}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowToolPicker(true);
            setToolSearch("");
          }}
          className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Step
        </button>
      )}

      {/* Execution error */}
      {executionError && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <icons.AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{executionError}</span>
          </div>
        </div>
      )}

      {/* Execution result */}
      {executionResult && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <icons.CheckCircle2 className="h-5 w-5" />
            <span className="font-medium text-sm">
              Pipeline completed ({executionResult.stepsCompleted} steps)
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Original: {(executionResult.originalSize / 1024).toFixed(0)} KB</span>
            <span>Processed: {(executionResult.processedSize / 1024).toFixed(0)} KB</span>
          </div>
          <a
            href={executionResult.downloadUrl}
            download
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download Result
          </a>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleExecute}
          disabled={steps.length === 0 || !file || executing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {executing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Process
            </>
          )}
        </button>

        {!showSaveForm ? (
          <button
            type="button"
            onClick={() => setShowSaveForm(true)}
            disabled={steps.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            Save Pipeline
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Pipeline name"
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground flex-1"
            />
            <input
              type="text"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              placeholder="Description (optional)"
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground flex-1 hidden sm:block"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveName.trim() || saving}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setShowSaveForm(false)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
