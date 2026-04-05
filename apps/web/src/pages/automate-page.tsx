import { Play, Trash2, Workflow } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { PipelineBuilder, type PipelineStep } from "@/components/tools/pipeline-builder";
import { formatHeaders } from "@/lib/api";
import { generateId } from "@/lib/utils";

interface SavedPipeline {
  id: string;
  name: string;
  description: string | null;
  steps: Array<{ toolId: string; settings: Record<string, unknown> }>;
  createdAt: string;
}
export function AutomatePage() {
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [savedPipelines, setSavedPipelines] = useState<SavedPipeline[]>([]);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    downloadUrl: string;
    originalSize: number;
    processedSize: number;
    stepsCompleted: number;
  } | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Load saved pipelines
  const loadPipelines = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/pipeline/list", {
        headers: formatHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedPipelines(data.pipelines || []);
      }
    } catch {
      // Silently fail — the list just won't show
    }
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  // Save pipeline
  const handleSave = useCallback(
    async (name: string, description: string) => {
      setSaving(true);
      try {
        const res = await fetch("/api/v1/pipeline/save", {
          method: "POST",
          headers: formatHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            name,
            description: description || undefined,
            steps: steps.map((s) => ({ toolId: s.toolId, settings: s.settings })),
          }),
        });
        if (res.ok) {
          await loadPipelines();
        } else {
          const data = await res.json().catch(() => ({}));
          setExecutionError(data.error || "Failed to save pipeline");
        }
      } catch {
        setExecutionError("Connection error while saving pipeline.");
      } finally {
        setSaving(false);
      }
    },
    [steps, loadPipelines],
  );

  // Delete pipeline
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/v1/pipeline/${id}`, {
          method: "DELETE",
          headers: formatHeaders(),
        });
        await loadPipelines();
      } catch {
        // ignore
      }
    },
    [loadPipelines],
  );

  // Execute pipeline
  const handleExecute = useCallback(
    async (file: File) => {
      setExecuting(true);
      setExecutionResult(null);
      setExecutionError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append(
          "pipeline",
          JSON.stringify({
            steps: steps.map((s) => ({
              toolId: s.toolId,
              settings: s.settings,
            })),
          }),
        );

        const res = await fetch("/api/v1/pipeline/execute", {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setExecutionResult({
            downloadUrl: data.downloadUrl,
            originalSize: data.originalSize,
            processedSize: data.processedSize,
            stepsCompleted: data.stepsCompleted,
          });
        } else {
          const data = await res.json().catch(() => ({}));
          setExecutionError(data.error || `Pipeline failed with status ${res.status}`);
        }
      } catch {
        setExecutionError("Connection error. Please try again.");
      } finally {
        setExecuting(false);
      }
    },
    [steps],
  );

  // Load saved pipeline into builder
  const loadSaved = useCallback((pipeline: SavedPipeline) => {
    const newSteps: PipelineStep[] = pipeline.steps.map((s) => ({
      id: generateId(),
      toolId: s.toolId,
      settings: { ...s.settings },
    }));
    setSteps(newSteps);
    setExecutionResult(null);
  }, []);

  return (
    <AppLayout showToolPanel={false}>
      <div className="flex h-full w-full overflow-hidden">
        {/* Left sidebar: saved automations */}
        {savedPipelines.length > 0 && (
          <div className="w-72 border-r border-border overflow-y-auto p-4 space-y-6 shrink-0 hidden md:block">
            <div>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
                Saved Automations
              </h3>
              <div className="space-y-2">
                {savedPipelines.map((pipeline) => (
                  <div
                    key={pipeline.id}
                    className="p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <button
                        type="button"
                        onClick={() => loadSaved(pipeline)}
                        className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1.5"
                      >
                        <Play className="h-3 w-3" />
                        {pipeline.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(pipeline.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {pipeline.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {pipeline.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {pipeline.steps.length} step{pipeline.steps.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main builder area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                <Workflow className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Automation Pipeline</h1>
                <p className="text-sm text-muted-foreground">
                  Chain multiple tools into a single workflow
                </p>
              </div>
            </div>

            <PipelineBuilder
              steps={steps}
              onStepsChange={setSteps}
              onSave={handleSave}
              onExecute={handleExecute}
              saving={saving}
              executing={executing}
              executionResult={executionResult}
              executionError={executionError}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
