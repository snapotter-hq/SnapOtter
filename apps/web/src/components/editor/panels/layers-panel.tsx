// apps/web/src/components/editor/panels/layers-panel.tsx

import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Lock,
  MergeIcon,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { EditorLayer, ObjectEffects } from "@/types/editor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLEND_MODES = [
  { value: "source-over", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
  { value: "color-dodge", label: "Color Dodge" },
  { value: "color-burn", label: "Color Burn" },
  { value: "hard-light", label: "Hard Light" },
  { value: "soft-light", label: "Soft Light" },
  { value: "difference", label: "Difference" },
  { value: "exclusion", label: "Exclusion" },
  { value: "hue", label: "Hue" },
  { value: "saturation", label: "Saturation" },
  { value: "color", label: "Color" },
  { value: "luminosity", label: "Luminosity" },
] as const;

const DEFAULT_DROP_SHADOW: NonNullable<ObjectEffects["dropShadow"]> = {
  enabled: true,
  color: "#000000",
  opacity: 75,
  angle: 135,
  distance: 5,
  blur: 10,
  spread: 0,
};

const DEFAULT_INNER_SHADOW: NonNullable<ObjectEffects["innerShadow"]> = {
  enabled: true,
  color: "#000000",
  opacity: 75,
  angle: 135,
  distance: 5,
  blur: 10,
};

const DEFAULT_OUTER_GLOW: NonNullable<ObjectEffects["outerGlow"]> = {
  enabled: true,
  color: "#ffffff",
  opacity: 75,
  blur: 10,
  spread: 0,
};

const DEFAULT_STROKE: NonNullable<ObjectEffects["stroke"]> = {
  enabled: true,
  color: "#000000",
  width: 2,
  position: "outside",
};

// ---------------------------------------------------------------------------
// LayersPanel
// ---------------------------------------------------------------------------

export function LayersPanel() {
  const { t } = useTranslation();
  const layers = useEditorStore((s) => s.layers);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const objects = useEditorStore((s) => s.objects);
  const addLayer = useEditorStore((s) => s.addLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const reorderLayers = useEditorStore((s) => s.reorderLayers);
  const mergeDown = useEditorStore((s) => s.mergeDown);
  const flattenAll = useEditorStore((s) => s.flattenAll);

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    layerId: string;
  } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (contextMenu) {
      const handler = () => closeContextMenu();
      document.addEventListener("click", handler);
      document.addEventListener("contextmenu", handler);
      return () => {
        document.removeEventListener("click", handler);
        document.removeEventListener("contextmenu", handler);
      };
    }
  }, [contextMenu, closeContextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, layerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, layerId });
  }, []);

  // Active layer effects from objects
  const activeLayerObjects = objects.filter((o) => o.layerId === activeLayerId);
  const selectedObjectIds = useEditorStore((s) => s.selectedObjectIds);
  const updateObject = useEditorStore((s) => s.updateObject);

  // Get the first selected object on the active layer for effects editing
  const selectedObject = activeLayerObjects.find((o) => selectedObjectIds.includes(o.id));
  const objectEffects = selectedObject?.effects;

  const handleEffectChange = useCallback(
    (effectKey: keyof ObjectEffects, updates: Record<string, unknown>) => {
      if (!selectedObject) return;
      const currentEffects = selectedObject.effects || {};
      const currentEffect = currentEffects[effectKey] || {};
      updateObject(selectedObject.id, {
        effects: {
          ...currentEffects,
          [effectKey]: { ...currentEffect, ...updates },
        },
      } as never);
    },
    [selectedObject, updateObject],
  );

  // Displayed layers: newest (highest index) first
  const displayLayers = [...layers].reverse();

  return (
    <div className="flex flex-col h-full" data-testid="layers-panel">
      {/* Top row: blend mode + opacity for active layer */}
      <div className="space-y-2 pb-2 border-b border-border">
        <BlendModeSelect
          value={activeLayer?.blendMode ?? "source-over"}
          onChange={(mode) => {
            if (activeLayerId) updateLayer(activeLayerId, { blendMode: mode });
          }}
        />
        <OpacitySlider
          value={activeLayer?.opacity ?? 1}
          onChange={(opacity) => {
            if (activeLayerId) updateLayer(activeLayerId, { opacity });
          }}
        />
      </div>

      {/* Layer list */}
      <div
        className="flex-1 overflow-y-auto py-1 min-h-0"
        role="listbox"
        aria-label={t.a11y.layers}
      >
        {displayLayers.map((layer) => {
          const realIndex = layers.findIndex((l) => l.id === layer.id);
          return (
            <LayerRow
              key={layer.id}
              layer={layer}
              realIndex={realIndex}
              totalLayers={layers.length}
              isActive={layer.id === activeLayerId}
              onSelect={() => setActiveLayer(layer.id)}
              onToggleVisibility={() => updateLayer(layer.id, { visible: !layer.visible })}
              onToggleLock={() => updateLayer(layer.id, { locked: !layer.locked })}
              onRename={(name) => updateLayer(layer.id, { name })}
              onReorder={reorderLayers}
              onContextMenu={(e) => handleContextMenu(e, layer.id)}
            />
          );
        })}
      </div>

      {/* Layer effects section (only when an object is selected) */}
      {selectedObject && (
        <div className="border-t border-border pt-1">
          <LayerEffectsSection effects={objectEffects} onChange={handleEffectChange} />
        </div>
      )}

      {/* Bottom action bar */}
      <div className="flex items-center gap-1 pt-2 border-t border-border">
        <button
          type="button"
          onClick={addLayer}
          className="flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="New Layer (Ctrl+Shift+N)"
          aria-label={t.a11y.addLayer}
          data-testid="add-layer-btn"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeLayerId && layers.length > 1) {
              removeLayer(activeLayerId);
            }
          }}
          disabled={layers.length <= 1}
          className="flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Delete Layer"
          aria-label={t.a11y.deleteLayer}
          data-testid="delete-layer-btn"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <LayerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          layerId={contextMenu.layerId}
          layerCount={layers.length}
          layerIndex={layers.findIndex((l) => l.id === contextMenu.layerId)}
          onDuplicate={() => {
            duplicateLayer(contextMenu.layerId);
            closeContextMenu();
          }}
          onMergeDown={() => {
            mergeDown(contextMenu.layerId);
            closeContextMenu();
          }}
          onFlattenAll={() => {
            flattenAll();
            closeContextMenu();
          }}
          onDelete={() => {
            removeLayer(contextMenu.layerId);
            closeContextMenu();
          }}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlendModeSelect
// ---------------------------------------------------------------------------

function BlendModeSelect({ value, onChange }: { value: string; onChange: (mode: string) => void }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <label htmlFor="blend-mode-select" className="text-[10px] text-muted-foreground shrink-0">
        Blend
      </label>
      <select
        id="blend-mode-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 h-7 text-xs bg-muted border border-border rounded px-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        data-testid="blend-mode-select"
      >
        {BLEND_MODES.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OpacitySlider
// ---------------------------------------------------------------------------

function OpacitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const percent = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <label htmlFor="layer-opacity-slider" className="text-[10px] text-muted-foreground shrink-0">
        Opacity
      </label>
      <input
        id="layer-opacity-slider"
        type="range"
        min={0}
        max={100}
        value={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="flex-1 min-w-0"
        data-testid="layer-opacity-slider"
      />
      <span className="text-[10px] font-mono text-foreground tabular-nums shrink-0">
        {percent}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayerRow
// ---------------------------------------------------------------------------

interface LayerRowProps {
  layer: EditorLayer;
  realIndex: number;
  totalLayers: number;
  isActive: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onRename: (name: string) => void;
  onReorder: (from: number, to: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function LayerRow({
  layer,
  realIndex,
  totalLayers,
  isActive,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onRename,
  onReorder,
  onContextMenu,
}: LayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Drag reorder state
  const dragState = useRef<{
    startY: number;
    startIndex: number;
    currentIndex: number;
    dragging: boolean;
  } | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== layer.name) {
      onRename(trimmed);
    } else {
      setEditName(layer.name);
    }
    setEditing(false);
  }, [editName, layer.name, onRename]);

  // Timer-based single-click vs double-click differentiation for the name button
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNameClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (clickTimerRef.current) {
        // Second click within threshold: enter rename mode
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        setEditing(true);
      } else {
        // First click: start timer; if no second click, select the layer
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          onSelect();
        }, 250);
      }
    },
    [onSelect],
  );

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Handled by the timer-based approach in handleNameClick
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitRename();
      } else if (e.key === "Escape") {
        setEditName(layer.name);
        setEditing(false);
      }
    },
    [commitRename, layer.name],
  );

  // Pointer-based drag reorder
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editing || e.button !== 0) return;
      onSelect();

      const rowEl = rowRef.current;
      if (!rowEl) return;

      const startY = e.clientY;
      dragState.current = {
        startY,
        startIndex: realIndex,
        currentIndex: realIndex,
        dragging: false,
      };

      const handlePointerMove = (ev: PointerEvent) => {
        if (!dragState.current) return;
        const dy = ev.clientY - dragState.current.startY;
        if (!dragState.current.dragging && Math.abs(dy) < 4) return;
        dragState.current.dragging = true;
        rowEl.style.opacity = "0.6";

        // Compute target index based on vertical movement
        // Since display is reversed, moving down visually means moving to a lower real index
        const rowHeight = 44;
        const displayOffset = Math.round(dy / rowHeight);
        // Display is reversed: visual down = lower real index
        const newRealIndex = Math.max(0, Math.min(totalLayers - 1, realIndex - displayOffset));
        dragState.current.currentIndex = newRealIndex;
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        rowEl.style.opacity = "";

        if (
          dragState.current?.dragging &&
          dragState.current.currentIndex !== dragState.current.startIndex
        ) {
          onReorder(dragState.current.startIndex, dragState.current.currentIndex);
        }
        dragState.current = null;
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [editing, realIndex, totalLayers, onSelect, onReorder],
  );

  return (
    <div
      ref={rowRef}
      className={cn(
        "flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer select-none group",
        "hover:bg-muted/50 transition-colors",
        isActive && "bg-primary/10 border-s-2 border-primary",
        !isActive && "border-s-2 border-transparent",
      )}
      role="option"
      aria-selected={isActive}
      onPointerDown={handlePointerDown}
      onContextMenu={onContextMenu}
      data-testid={`layer-row-${layer.id}`}
      data-layer-id={layer.id}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Visibility toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title={layer.visible ? "Hide layer" : "Show layer"}
        aria-label={layer.visible ? "Hide layer" : "Show layer"}
      >
        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>

      {/* Lock toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title={layer.locked ? "Unlock layer" : "Lock layer"}
        aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
      >
        {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
      </button>

      {/* Thumbnail */}
      <div className="w-8 h-8 shrink-0 rounded border border-border bg-muted overflow-hidden flex items-center justify-center">
        {layer.thumbnail ? (
          <img
            src={layer.thumbnail}
            alt={`${layer.name} thumbnail`}
            className="w-full h-full object-cover"
          />
        ) : (
          <Layers size={12} className="text-muted-foreground" />
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full text-xs bg-muted border border-border rounded px-1 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
            data-testid={`layer-name-input-${layer.id}`}
          />
        ) : (
          <button
            type="button"
            className={cn(
              "block text-xs truncate text-start bg-transparent border-0 p-0 w-full cursor-pointer",
              isActive ? "text-foreground font-medium" : "text-muted-foreground",
            )}
            onClick={handleNameClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`layer-name-${layer.id}`}
          >
            {layer.name}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayerContextMenu
// ---------------------------------------------------------------------------

interface LayerContextMenuProps {
  x: number;
  y: number;
  layerId: string;
  layerCount: number;
  layerIndex: number;
  onDuplicate: () => void;
  onMergeDown: () => void;
  onFlattenAll: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function LayerContextMenu({
  x,
  y,
  layerCount,
  layerIndex,
  onDuplicate,
  onMergeDown,
  onFlattenAll,
  onDelete,
}: LayerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to stay within viewport
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const nx = x + rect.width > window.innerWidth ? x - rect.width : x;
      const ny = y + rect.height > window.innerHeight ? y - rect.height : y;
      setPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
    }
  }, [x, y]);

  const items = [
    {
      label: "Duplicate",
      icon: Copy,
      action: onDuplicate,
      disabled: false,
    },
    {
      label: "Merge Down",
      icon: MergeIcon,
      action: onMergeDown,
      disabled: layerIndex <= 0,
    },
    {
      label: "Flatten All",
      icon: Layers,
      action: onFlattenAll,
      disabled: layerCount <= 1,
    },
    {
      label: "Delete",
      icon: Trash2,
      action: onDelete,
      disabled: layerCount <= 1,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[140px] bg-card border border-border rounded-lg shadow-lg py-1"
      style={{ left: pos.x, top: pos.y }}
      data-testid="layer-context-menu"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation();
            item.action();
          }}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-start transition-colors",
            item.disabled
              ? "text-muted-foreground/40 cursor-not-allowed"
              : "text-foreground hover:bg-muted",
            item.label === "Delete" && !item.disabled && "text-red-500",
          )}
        >
          <item.icon size={14} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayerEffectsSection
// ---------------------------------------------------------------------------

function LayerEffectsSection({
  effects,
  onChange,
}: {
  effects: ObjectEffects | undefined;
  onChange: (key: keyof ObjectEffects, updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Layer Effects
      </p>

      <EffectToggleSection
        label="Drop Shadow"
        enabled={effects?.dropShadow?.enabled ?? false}
        onToggle={(enabled) =>
          onChange("dropShadow", {
            ...DEFAULT_DROP_SHADOW,
            ...effects?.dropShadow,
            enabled,
          })
        }
      >
        {effects?.dropShadow?.enabled && (
          <ShadowControls
            values={effects.dropShadow}
            onChange={(updates) => onChange("dropShadow", updates)}
            includeSpread
          />
        )}
      </EffectToggleSection>

      <EffectToggleSection
        label="Inner Shadow"
        enabled={effects?.innerShadow?.enabled ?? false}
        onToggle={(enabled) =>
          onChange("innerShadow", {
            ...DEFAULT_INNER_SHADOW,
            ...effects?.innerShadow,
            enabled,
          })
        }
      >
        {effects?.innerShadow?.enabled && (
          <ShadowControls
            values={effects.innerShadow}
            onChange={(updates) => onChange("innerShadow", updates)}
            includeSpread={false}
          />
        )}
      </EffectToggleSection>

      <EffectToggleSection
        label="Outer Glow"
        enabled={effects?.outerGlow?.enabled ?? false}
        onToggle={(enabled) =>
          onChange("outerGlow", {
            ...DEFAULT_OUTER_GLOW,
            ...effects?.outerGlow,
            enabled,
          })
        }
      >
        {effects?.outerGlow?.enabled && (
          <GlowControls
            values={effects.outerGlow}
            onChange={(updates) => onChange("outerGlow", updates)}
          />
        )}
      </EffectToggleSection>

      <EffectToggleSection
        label="Stroke"
        enabled={effects?.stroke?.enabled ?? false}
        onToggle={(enabled) =>
          onChange("stroke", {
            ...DEFAULT_STROKE,
            ...effects?.stroke,
            enabled,
          })
        }
      >
        {effects?.stroke?.enabled && (
          <StrokeControls
            values={effects.stroke}
            onChange={(updates) => onChange("stroke", updates)}
          />
        )}
      </EffectToggleSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EffectToggleSection
// ---------------------------------------------------------------------------

function EffectToggleSection({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/50 last:border-0">
      <div className="flex items-center gap-1.5 px-1 py-1">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <label className="flex items-center gap-1.5 flex-1 cursor-pointer text-xs text-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="rounded border-border"
          />
          {label}
        </label>
      </div>
      {expanded && <div className="px-2 pb-2 space-y-1.5">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShadowControls (Drop Shadow + Inner Shadow)
// ---------------------------------------------------------------------------

function ShadowControls({
  values,
  onChange,
  includeSpread,
}: {
  values: {
    color: string;
    opacity: number;
    angle: number;
    distance: number;
    blur: number;
    spread?: number;
  };
  onChange: (updates: Record<string, unknown>) => void;
  includeSpread: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <EffectColorInput
        label="Color"
        value={values.color}
        onChange={(color) => onChange({ color })}
      />
      <EffectSlider
        label="Opacity"
        value={values.opacity}
        min={0}
        max={100}
        suffix="%"
        onChange={(opacity) => onChange({ opacity })}
      />
      <EffectSlider
        label="Angle"
        value={values.angle}
        min={0}
        max={360}
        suffix="deg"
        onChange={(angle) => onChange({ angle })}
      />
      <EffectSlider
        label="Distance"
        value={values.distance}
        min={0}
        max={100}
        suffix="px"
        onChange={(distance) => onChange({ distance })}
      />
      <EffectSlider
        label="Blur"
        value={values.blur}
        min={0}
        max={100}
        suffix="px"
        onChange={(blur) => onChange({ blur })}
      />
      {includeSpread && values.spread !== undefined && (
        <EffectSlider
          label="Spread"
          value={values.spread}
          min={0}
          max={100}
          suffix="px"
          onChange={(spread) => onChange({ spread })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlowControls
// ---------------------------------------------------------------------------

function GlowControls({
  values,
  onChange,
}: {
  values: { color: string; opacity: number; blur: number; spread: number };
  onChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <EffectColorInput
        label="Color"
        value={values.color}
        onChange={(color) => onChange({ color })}
      />
      <EffectSlider
        label="Opacity"
        value={values.opacity}
        min={0}
        max={100}
        suffix="%"
        onChange={(opacity) => onChange({ opacity })}
      />
      <EffectSlider
        label="Blur"
        value={values.blur}
        min={0}
        max={100}
        suffix="px"
        onChange={(blur) => onChange({ blur })}
      />
      <EffectSlider
        label="Spread"
        value={values.spread}
        min={0}
        max={100}
        suffix="px"
        onChange={(spread) => onChange({ spread })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StrokeControls
// ---------------------------------------------------------------------------

function StrokeControls({
  values,
  onChange,
}: {
  values: {
    color: string;
    width: number;
    position: "inside" | "center" | "outside";
  };
  onChange: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <EffectColorInput
        label="Color"
        value={values.color}
        onChange={(color) => onChange({ color })}
      />
      <EffectSlider
        label="Width"
        value={values.width}
        min={1}
        max={20}
        suffix="px"
        onChange={(width) => onChange({ width })}
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground shrink-0 w-12">Position</span>
        <select
          value={values.position}
          onChange={(e) =>
            onChange({
              position: e.target.value as "inside" | "center" | "outside",
            })
          }
          className="flex-1 h-6 text-[10px] bg-muted border border-border rounded px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="inside">Inside</option>
          <option value="center">Center</option>
          <option value="outside">Outside</option>
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared effect sub-components
// ---------------------------------------------------------------------------

function EffectSlider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] text-muted-foreground shrink-0 w-12">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 min-w-0"
      />
      <span className="text-[10px] font-mono text-foreground tabular-nums w-11 text-end shrink-0">
        {value}
        {suffix}
      </span>
    </div>
  );
}

function EffectColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground shrink-0 w-12">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent p-0"
      />
      <span className="text-[10px] font-mono text-muted-foreground">{value}</span>
    </div>
  );
}
