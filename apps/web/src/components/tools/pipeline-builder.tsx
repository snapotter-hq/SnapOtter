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
import { type Modality, TOOLS } from "@snapotter/shared";
import { AlertTriangle, GripVertical, Workflow, X } from "lucide-react";
import { useTranslation } from "@/contexts/i18n-context";
import { format } from "@/lib/format";
import { ICON_MAP } from "@/lib/icon-map";
import { computeStepWarnings, type StepWarning } from "@/lib/pipeline-compat";
import { getToolName } from "@/lib/tool-i18n";
import { cn } from "@/lib/utils";
import type { PipelineStep } from "@/stores/pipeline-store";
import { PipelineStepSettings } from "./pipeline-step-settings";
import { getSettingsSummary } from "./pipeline-step-summary";

interface PipelineBuilderProps {
  steps: PipelineStep[];
  expandedStepId: string | null;
  uploadedModality?: Modality | null;
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
  warning?: StepWarning | null;
  onToggle: () => void;
  onRemove: () => void;
  onUpdateSettings: (settings: Record<string, unknown>) => void;
}

function SortableStep({
  step,
  index,
  isExpanded,
  warning,
  onToggle,
  onRemove,
  onUpdateSettings,
}: SortableStepProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const tool = TOOLS.find((t) => t.id === step.toolId);
  if (!tool) return null;

  const Icon = (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? Workflow;
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
      {
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by dnd-kit attributes
        // biome-ignore lint/a11y/useSemanticElements: div with role=button avoids invalid nested <button> in HTML
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          className="flex items-center gap-2 p-3 w-full text-start cursor-pointer"
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
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary-ink text-xs font-semibold flex items-center justify-center shrink-0">
            {index + 1}
          </span>

          {/* Tool icon + name */}
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground">
            {getToolName(t, tool.id, tool.name)}
          </span>

          {/* Modality mismatch warning */}
          {warning && (
            <span
              title={format(t.automate.modalityWarningTooltip, {
                expected: warning.expects,
                received: warning.receives,
              })}
              className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 ms-1"
            >
              <AlertTriangle className="h-3 w-3" />
              {t.automate.modalityWarning}
            </span>
          )}

          {/* Settings summary when collapsed */}
          {!isExpanded && summary && (
            <span className="text-xs text-muted-foreground truncate ms-1">{summary}</span>
          )}

          <span className="flex-1" />

          {/* Remove button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title={t.automate.removeStep}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
      <div className={isExpanded ? "border-t border-border p-3 bg-muted/10 space-y-3" : "hidden"}>
        <PipelineStepSettings
          toolId={step.toolId}
          settings={step.settings}
          onChange={onUpdateSettings}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PipelineBuilder                                                    */
/* ------------------------------------------------------------------ */

export function PipelineBuilder({
  steps,
  expandedStepId,
  uploadedModality,
  onRemoveStep,
  onReorderSteps,
  onUpdateSettings,
  onToggleStep,
}: PipelineBuilderProps) {
  const { t } = useTranslation();
  const warnings = computeStepWarnings(
    steps.map((s) => s.toolId),
    uploadedModality ?? null,
  );
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

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <Workflow className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">{t.automate.noStepsHeading}</h3>
        <p className="text-sm text-muted-foreground max-w-[240px]">{t.automate.addToolsPrompt}</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <SortableStep
              key={step.id}
              step={step}
              index={idx}
              isExpanded={expandedStepId === step.id}
              warning={warnings[idx]}
              onToggle={() => onToggleStep(expandedStepId === step.id ? null : step.id)}
              onRemove={() => onRemoveStep(step.id)}
              onUpdateSettings={(s) => onUpdateSettings(step.id, s)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
