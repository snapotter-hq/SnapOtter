import { TOOLS } from "@ashim/shared";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileImage, GripVertical, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SearchBar } from "@/components/common/search-bar";
import { apiGet } from "@/lib/api";
import { ICON_MAP } from "@/lib/icon-map";
import { cn } from "@/lib/utils";
import type { PipelineStep } from "@/stores/pipeline-store";
import { PipelineStepSettings } from "./pipeline-step-settings";
import { getSettingsSummary } from "./pipeline-step-summary";

/** Tools that can be used as pipeline steps (excludes pipeline/batch/multi-file tools). */
const PIPELINE_TOOLS_BASE = TOOLS.filter(
  (t) => !["pipeline", "compare", "find-duplicates", "collage", "compose"].includes(t.id),
);

interface PipelineBuilderProps {
  steps: PipelineStep[];
  expandedStepId: string | null;
  onAddStep: (toolId: string) => void;
  onRemoveStep: (id: string) => void;
  onReorderSteps: (activeId: string, overId: string) => void;
  onUpdateSettings: (id: string, settings: Record<string, unknown>) => void;
  onToggleStep: (id: string | null) => void;
}

/* ------------------------------------------------------------------ */
/*  SortableStep                                                       */
/* ------------------------------------------------------------------ */

interface SortableStepProps {
  step: PipelineStep;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdateSettings: (settings: Record<string, unknown>) => void;
}

function SortableStep({
  step,
  index,
  isExpanded,
  onToggle,
  onRemove,
  onUpdateSettings,
}: SortableStepProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const tool = TOOLS.find((t) => t.id === step.toolId);
  if (!tool) return null;

  const Icon = (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;
  const summary = getSettingsSummary(step.toolId, step.settings);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-background overflow-hidden transition-colors",
        isDragging && "opacity-50",
        isExpanded ? "border-primary" : "border-border",
      )}
    >
      {/* Header row - click to expand/collapse */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 p-3 w-full text-left"
      >
        {/* Drag handle */}
        {
          // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit drag handle spreads its own event handlers
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </span>
        }

        {/* Step number badge */}
        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
          {index + 1}
        </span>

        {/* Tool icon + name */}
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground">{tool.name}</span>

        {/* Settings summary when collapsed */}
        {!isExpanded && summary && (
          <span className="text-xs text-muted-foreground truncate ml-1">{summary}</span>
        )}

        <span className="flex-1" />

        {/* Remove button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove"
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </button>
      <div className={isExpanded ? "border-t border-border p-3 bg-muted/10 space-y-3" : "hidden"}>
        <PipelineStepSettings
          toolId={step.toolId}
          settings={step.settings}
          onChange={onUpdateSettings}
        />
      </div>
      ;
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PipelineBuilder                                                    */
/* ------------------------------------------------------------------ */

export function PipelineBuilder({
  steps,
  expandedStepId,
  onAddStep,
  onRemoveStep,
  onReorderSteps,
  onUpdateSettings,
  onToggleStep,
}: PipelineBuilderProps) {
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [experimentalEnabled, setExperimentalEnabled] = useState(false);
  const [pipelineToolIds, setPipelineToolIds] = useState<string[] | null>(null);

  /* Fetch settings + pipeline-compatible tool IDs on mount */
  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setDisabledTools(
          data.settings.disabledTools ? JSON.parse(data.settings.disabledTools) : [],
        );
        setExperimentalEnabled(data.settings.enableExperimentalTools === "true");
      })
      .catch(() => {});

    apiGet<{ toolIds: string[] }>("/v1/pipeline/tools")
      .then((data) => setPipelineToolIds(data.toolIds))
      .catch(() => {});
  }, []);

  const PIPELINE_TOOLS = useMemo(() => {
    const q = toolSearch.toLowerCase();
    return PIPELINE_TOOLS_BASE.filter((t) => {
      if (disabledTools.includes(t.id)) return false;
      if (t.experimental && !experimentalEnabled) return false;
      if (pipelineToolIds && !pipelineToolIds.includes(t.id)) return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [disabledTools, experimentalEnabled, pipelineToolIds, toolSearch]);

  /* dnd-kit sensors */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderSteps(String(active.id), String(over.id));
    }
  }

  function handleAddStep(toolId: string) {
    onAddStep(toolId);
    setShowToolPicker(false);
    setToolSearch("");
  }

  return (
    <div className="space-y-2">
      {/* Sortable step list */}
      {steps.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Add steps to build your pipeline
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  index={idx}
                  isExpanded={expandedStepId === step.id}
                  onToggle={() => onToggleStep(expandedStepId === step.id ? null : step.id)}
                  onRemove={() => onRemoveStep(step.id)}
                  onUpdateSettings={(s) => onUpdateSettings(step.id, s)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Tool picker */}
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
              const Icon =
                (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleAddStep(tool.id)}
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
    </div>
  );
}
