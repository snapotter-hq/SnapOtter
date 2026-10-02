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
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { format } from "@/lib/format";
import { hotkeysModIsMeta } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { HistoryAction } from "@/types/editor";

type IconComponent = React.ComponentType<{ size?: number }>;

const ACTION_ICONS: Partial<Record<HistoryAction["id"], IconComponent>> = {
  brushStroke: Brush,
  eraserStroke: Eraser,
  addLayer: Layers,
  deleteLayer: Trash2,
  duplicateLayer: Copy,
  reorderLayers: ArrowDown,
  mergeDown: Layers,
  flattenAll: Layers,
  layerEffect: Layers,
  crop: Crop,
  delete: Trash2,
  cut: Scissors,
  paste: Copy,
  pasteInPlace: Copy,
  resizeCanvas: Square,
  resizeImage: Square,
  rotateCanvas: RotateCcw,
  flipHorizontal: ArrowUp,
  flipVertical: ArrowDown,
  trimCanvas: Scissors,
  loadImage: Square,
  bringToFront: ArrowUp,
  bringForward: ArrowUp,
  sendBackward: ArrowDown,
  sendToBack: ArrowDown,
  nudge: Move,
  adjust: Sliders,
  toggleFilter: Sliders,
  setFilterParam: Sliders,
  levels: Sliders,
  curves: Sliders,
  resetAdjustments: Sliders,
  resetLevels: Sliders,
  resetCurves: Sliders,
  resetAll: Sliders,
};

const OBJECT_ICONS: Partial<Record<string, IconComponent>> = {
  line: Pencil,
  text: Type,
  arrow: ArrowUp,
};

function getActionIcon(action: HistoryAction | undefined): IconComponent {
  if (!action) return MousePointer2;
  if (action.id === "addObject") return OBJECT_ICONS[action.objectType] ?? Square;
  return ACTION_ICONS[action.id] ?? MousePointer2;
}

type Translations = ReturnType<typeof useTranslation>["t"];

/**
 * Display text for a history step. Filter and param names come from the
 * adjustments panel's own labels. Anything this build has no name for falls
 * back to its raw id (or to "Unknown" for an unrecognised action), never to
 * blank text or an unfilled placeholder.
 */
export function historyActionLabel(t: Translations, action: HistoryAction | undefined): string {
  const h = t.editor.panels.history;
  if (!action) return h.unknown;
  const adj = t.editor.panels.adjustments;
  const filterName = (filter: string) =>
    (adj.filters as Record<string, string>)[filter] ??
    (filter === "vignette" ? adj.vignette : filter === "grain" ? adj.grain : filter);
  switch (action.id) {
    case "rotateCanvas":
      return format(h.actions.rotateCanvas, { degrees: action.degrees });
    case "addObject":
      return format(h.actions.addObject, {
        type: h.objectTypes[action.objectType] ?? action.objectType,
      });
    case "adjust":
      return format(h.actions.adjust, { name: adj.sliders[action.key] ?? action.key });
    case "toggleFilter":
      return format(h.actions.toggleFilter, { name: filterName(action.filter) });
    case "setFilterParam":
      return format(h.actions.setFilterParam, {
        filter: filterName(action.filter),
        param: (adj.params as Record<string, string>)[action.param] ?? action.param,
      });
    default:
      return h.actions[action.id] ?? h.unknown;
  }
}

interface HistoryEntry {
  index: number;
  action: HistoryAction | undefined;
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
    const past = temporal.pastStates as Array<{ lastAction?: HistoryAction }>;
    const future = temporal.futureStates as Array<{ lastAction?: HistoryAction }>;

    const result: HistoryEntry[] = [];

    // Future states (dimmed, above current in reverse order)
    for (let i = future.length - 1; i >= 0; i--) {
      result.push({ index: -(i + 1), action: future[i]?.lastAction });
    }

    // Current state (highlighted)
    result.push({ index: 0, action: lastAction });

    // Past states (newest first, below current)
    for (let i = past.length - 1; i >= 0; i--) {
      result.push({ index: past.length - i, action: past[i]?.lastAction });
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
          title={format(t.editor.panels.history.undoTitle, {
            shortcut: formatShortcut("mod+z", hotkeysModIsMeta()),
          })}
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
          title={format(t.editor.panels.history.redoTitle, {
            shortcut: formatShortcut("mod+shift+z", hotkeysModIsMeta()),
          })}
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
          const Icon = getActionIcon(entry.action);

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
              <span className="truncate">{historyActionLabel(t, entry.action)}</span>
            </button>
          );
        })}
        {entries.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t.editor.panels.history.empty}
          </div>
        )}
      </div>
    </div>
  );
}
