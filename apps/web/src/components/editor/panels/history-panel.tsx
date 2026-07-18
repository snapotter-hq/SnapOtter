// apps/web/src/components/editor/panels/history-panel.tsx

import {
  ArrowDown,
  ArrowUp,
  Brush,
  Copy,
  Crop,
  Eraser,
  Layers,
  MousePointer2,
  Move,
  Paintbrush,
  Pencil,
  Redo2,
  RotateCcw,
  Scissors,
  Sliders,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

// Map action labels to icons for the history list
const ACTION_ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  "Brush Stroke": Brush,
  "Add Line": Pencil,
  "Eraser Stroke": Eraser,
  "Add Rect": Square,
  "Add Ellipse": Square,
  "Add Text": Type,
  "Add Arrow": ArrowUp,
  "Add Polygon": Square,
  "Add Star": Square,
  "Add Image": Square,
  Move: Move,
  Transform: Move,
  "Text Edit": Type,
  "Add Layer": Layers,
  "Delete Layer": Trash2,
  "Duplicate Layer": Copy,
  "Reorder Layers": ArrowDown,
  "Merge Down": Layers,
  "Flatten All": Layers,
  Crop: Crop,
  Delete: Trash2,
  Paste: Copy,
  "Paste in Place": Copy,
  Fill: Paintbrush,
  "Resize Canvas": Square,
  "Resize Image": Square,
  "Rotate Canvas 90": RotateCcw,
  "Rotate Canvas 180": RotateCcw,
  "Rotate Canvas 270": RotateCcw,
  "Flip Horizontal": ArrowUp,
  "Flip Vertical": ArrowDown,
  "Trim Canvas": Scissors,
  "Load Image": Square,
  "Bring to Front": ArrowUp,
  "Bring Forward": ArrowUp,
  "Send Backward": ArrowDown,
  "Send to Back": ArrowDown,
};

function getActionIcon(label: string): React.ComponentType<{ size?: number }> {
  if (ACTION_ICON_MAP[label]) return ACTION_ICON_MAP[label];
  if (label.startsWith("Add ")) return Square;
  if (label.includes("Layer")) return Layers;
  if (label.includes("Adjust") || label.includes("Filter")) return Sliders;
  return MousePointer2;
}

interface HistoryEntry {
  index: number;
  label: string;
}

export function HistoryPanel() {
  const { t } = useTranslation();
  const lastAction = useEditorStore((s) => s.lastAction);

  // Force re-render when history changes by subscribing to history version
  useEditorStore((s) => s._historyVersion);

  // Subscribe reactively to temporal state for undo/redo button disabled states
  const pastLength = useSyncExternalStore(
    (cb) => useEditorStore.temporal.subscribe(cb),
    () => useEditorStore.temporal.getState().pastStates.length,
  );
  const futureLength = useSyncExternalStore(
    (cb) => useEditorStore.temporal.subscribe(cb),
    () => useEditorStore.temporal.getState().futureStates.length,
  );
  const canUndo = pastLength > 0;
  const canRedo = futureLength > 0;

  const undo = useCallback(() => {
    useEditorStore.temporal.getState().undo();
  }, []);

  const redo = useCallback(() => {
    useEditorStore.temporal.getState().redo();
  }, []);

  // Build the history list from past states
  const entries = useMemo((): HistoryEntry[] => {
    const temporal = useEditorStore.temporal.getState();
    const past = temporal.pastStates as Array<{ lastAction?: string }>;
    const future = temporal.futureStates as Array<{ lastAction?: string }>;

    const result: HistoryEntry[] = [];

    // Future states (dimmed, above current in reverse order)
    for (let i = future.length - 1; i >= 0; i--) {
      result.push({
        index: -(i + 1),
        label: (future[i] as { lastAction?: string })?.lastAction || "Unknown",
      });
    }

    // Current state (highlighted)
    result.push({
      index: 0,
      label: lastAction,
    });

    // Past states (newest first, below current)
    for (let i = past.length - 1; i >= 0; i--) {
      result.push({
        index: past.length - i,
        label: (past[i] as { lastAction?: string })?.lastAction || "Unknown",
      });
    }

    return result;
    // pastStates and futureStates are intentionally not reactive deps;
    // we read them inside via getState(). lastAction triggers recalculation.
  }, [lastAction]);

  const jumpToState = useCallback((entry: HistoryEntry) => {
    const temporal = useEditorStore.temporal.getState();
    if (entry.index < 0) {
      // Future state: redo N times
      const steps = Math.abs(entry.index);
      for (let i = 0; i < steps; i++) {
        temporal.redo();
      }
    } else if (entry.index > 0) {
      // Past state: undo N times
      for (let i = 0; i < entry.index; i++) {
        temporal.undo();
      }
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Undo/Redo toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          className={cn(
            "p-1 rounded transition-colors",
            canUndo
              ? "text-muted-foreground hover:text-foreground hover:bg-muted"
              : "text-muted-foreground/30 cursor-not-allowed",
          )}
          aria-label={t.a11y.undo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          className={cn(
            "p-1 rounded transition-colors",
            canRedo
              ? "text-muted-foreground hover:text-foreground hover:bg-muted"
              : "text-muted-foreground/30 cursor-not-allowed",
          )}
          aria-label={t.a11y.redo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={14} />
        </button>
        <span className="ms-auto text-[10px] text-muted-foreground">{pastLength} / 50</span>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto">
        {entries.map((entry) => {
          const isCurrent = entry.index === 0;
          const isFuture = entry.index < 0;
          const Icon = getActionIcon(entry.label);

          return (
            <button
              key={`history-${entry.index}`}
              type="button"
              onClick={() => jumpToState(entry)}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 text-start text-xs transition-colors",
                isCurrent && "bg-primary/10 text-foreground font-medium",
                isFuture && "text-muted-foreground",
                !isCurrent &&
                  !isFuture &&
                  "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={12} />
              <span className="truncate">{entry.label}</span>
            </button>
          );
        })}
        {entries.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">No history yet</div>
        )}
      </div>
    </div>
  );
}
