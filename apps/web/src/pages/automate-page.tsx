import { useState, useEffect, useCallback } from "react";
import {
  Workflow,
  Trash2,
  Play,
  Zap,
  ShieldOff,
  Globe,
  User,
  Stamp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  PipelineBuilder,
  type PipelineStep,
} from "@/components/tools/pipeline-builder";
import { cn } from "@/lib/utils";

/** Pipeline template definition. */
interface PipelineTemplate {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  steps: Array<{ toolId: string; settings: Record<string, unknown> }>;
}

const TEMPLATES: PipelineTemplate[] = [
  {
    name: "Social Media Ready",
    description: "Resize 1080x1080, compress 200KB, strip metadata, convert to WebP",
    icon: Globe,
    color: "bg-blue-500/10 text-blue-500",
    steps: [
      { toolId: "resize", settings: { width: 1080, height: 1080, fit: "cover" } },
      { toolId: "compress", settings: { quality: 80 } },
      { toolId: "strip-metadata", settings: {} },
      { toolId: "convert", settings: { format: "webp" } },
    ],
  },
  {
    name: "Privacy Clean",
    description: "Strip all metadata and convert to JPG",
    icon: ShieldOff,
    color: "bg-green-500/10 text-green-500",
    steps: [
      { toolId: "strip-metadata", settings: {} },
      { toolId: "convert", settings: { format: "jpg" } },
    ],
  },
  {
    name: "Web Optimization",
    description: "Resize to 1920px, convert to WebP, compress to 80% quality",
    icon: Zap,
    color: "bg-yellow-500/10 text-yellow-500",
    steps: [
      { toolId: "resize", settings: { width: 1920, fit: "inside" } },
      { toolId: "convert", settings: { format: "webp" } },
      { toolId: "compress", settings: { quality: 80 } },
    ],
  },
  {
    name: "Profile Picture",
    description: "Resize to 400x400 and compress",
    icon: User,
    color: "bg-purple-500/10 text-purple-500",
    steps: [
      { toolId: "resize", settings: { width: 400, height: 400, fit: "cover" } },
      { toolId: "compress", settings: { quality: 85 } },
    ],
  },
  {
    name: "Watermark Batch",
    description: "Add text watermark, strip metadata, and compress",
    icon: Stamp,
    color: "bg-red-500/10 text-red-500",
    steps: [
      { toolId: "watermark-text", settings: { text: "SAMPLE", opacity: 0.3 } },
      { toolId: "strip-metadata", settings: {} },
      { toolId: "compress", settings: { quality: 85 } },
    ],
  },
];

interface SavedPipeline {
  id: string;
  name: string;
  description: string | null;
  steps: Array<{ toolId: string; settings: Record<string, unknown> }>;
  createdAt: string;
}

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
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

  // Load saved pipelines
  const loadPipelines = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/pipeline/list", {
        headers: { Authorization: `Bearer ${getToken()}` },
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
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            name,
            description: description || undefined,
            steps: steps.map((s) => ({ toolId: s.toolId, settings: s.settings })),
          }),
        });
        if (res.ok) {
          await loadPipelines();
        }
      } catch {
        // Error handling could be added
      } finally {
        setSaving(false);
      }
    },
    [steps, loadPipelines]
  );

  // Delete pipeline
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/v1/pipeline/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        await loadPipelines();
      } catch {
        // ignore
      }
    },
    [loadPipelines]
  );

  // Execute pipeline
  const handleExecute = useCallback(
    async (file: File) => {
      setExecuting(true);
      setExecutionResult(null);
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
          })
        );

        const res = await fetch("/api/v1/pipeline/execute", {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
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
        }
      } catch {
        // Error handling
      } finally {
        setExecuting(false);
      }
    },
    [steps]
  );

  // Load template into builder
  const loadTemplate = useCallback(
    (template: PipelineTemplate) => {
      const newSteps: PipelineStep[] = template.steps.map((s) => ({
        id: crypto.randomUUID(),
        toolId: s.toolId,
        settings: { ...s.settings },
      }));
      setSteps(newSteps);
      setExecutionResult(null);
    },
    []
  );

  // Load saved pipeline into builder
  const loadSaved = useCallback((pipeline: SavedPipeline) => {
    const newSteps: PipelineStep[] = pipeline.steps.map((s) => ({
      id: crypto.randomUUID(),
      toolId: s.toolId,
      settings: { ...s.settings },
    }));
    setSteps(newSteps);
    setExecutionResult(null);
  }, []);

  return (
    <AppLayout showToolPanel={false}>
      <div className="flex h-full w-full overflow-hidden">
        {/* Left sidebar: templates + saved */}
        <div className="w-72 border-r border-border overflow-y-auto p-4 space-y-6 shrink-0 hidden md:block">
          {/* Templates */}
          <div>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
              Templates
            </h3>
            <div className="space-y-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => loadTemplate(tpl)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn("p-1.5 rounded-md", tpl.color)}>
                      <tpl.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {tpl.name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {tpl.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Saved automations */}
          {savedPipelines.length > 0 && (
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
                        onClick={() => loadSaved(pipeline)}
                        className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1.5"
                      >
                        <Play className="h-3 w-3" />
                        {pipeline.name}
                      </button>
                      <button
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
          )}
        </div>

        {/* Main builder area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                <Workflow className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Automation Pipeline
                </h1>
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
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
