// apps/web/src/components/editor/editor-right-panel.tsx
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import { AdjustmentsPanel } from "./panels/adjustments-panel";
import { ColorPanel } from "./panels/color-panel";
import { HistoryPanel } from "./panels/history-panel";
import { LayersPanel } from "./panels/layers-panel";
import { NavigatorPanel } from "./panels/navigator-panel";

const TABS = [
  { id: "layers" as const, label: "Layers" },
  { id: "adjustments" as const, label: "Adjustments" },
  { id: "history" as const, label: "History" },
];

// The panel is user-resizable so it never has to consume a fixed, excessive
// share of the viewport (issue #258). Width persists across reloads.
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 480;
const DEFAULT_PANEL_WIDTH = 280;
const PANEL_WIDTH_STORAGE_KEY = "snapotter-editor-right-panel-width";

function clampPanelWidth(w: number): number {
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, w));
}

export function EditorRightPanel() {
  const { t } = useTranslation();
  const visible = useEditorStore((s) => s.rightPanelVisible);
  const activeTab = useEditorStore((s) => s.rightPanelTab);
  const setTab = useEditorStore((s) => s.setRightPanelTab);
  const togglePanel = useEditorStore((s) => s.toggleRightPanel);
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    const stored = Number(window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
    return stored > 0 ? clampPanelWidth(stored) : DEFAULT_PANEL_WIDTH;
  });

  useEffect(() => {
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      // Panel is anchored to the right edge, so dragging left widens it.
      const onMove = (me: MouseEvent) =>
        setWidth(clampPanelWidth(startWidth + (startX - me.clientX)));
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  if (!visible) {
    return (
      <button
        type="button"
        onClick={togglePanel}
        className="flex items-center justify-center w-6 bg-card border-l border-border"
        aria-label={t.a11y.expandPanel}
      >
        <ChevronRight size={14} className="text-muted-foreground rotate-180" />
      </button>
    );
  }

  return (
    <div
      className="relative flex flex-col bg-card border-l border-border shrink-0"
      style={{ width }}
    >
      {/* Drag handle on the left edge to resize the panel. Mouse-only, matching
          the editor's other drag handles (rulers, navigator viewport). */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute -left-0.5 top-0 bottom-0 z-20 w-1 cursor-col-resize hover:bg-primary/40 transition-colors"
        data-testid="right-panel-resize-handle"
      />

      {/* Navigator always visible when image loaded */}
      {sourceImageUrl && <NavigatorPanel />}

      {/* Tabs */}
      <div className="flex items-center border-b border-border" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setTab(tab.id)}
            className={cn(
              "flex-1 py-2 text-xs font-medium text-center transition-colors",
              activeTab === tab.id
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={togglePanel}
          className="px-1.5 py-2 text-muted-foreground hover:text-foreground"
          aria-label={t.a11y.collapsePanel}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Tab content. `min-h-0` lets this flex child shrink so it scrolls
          internally instead of pushing the color panel below the viewport. */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2">
        {activeTab === "layers" && <LayersPanel />}
        {activeTab === "adjustments" && <AdjustmentsPanel />}
        {activeTab === "history" && <HistoryPanel />}
      </div>

      {/* Color panel always visible at bottom */}
      <div className="border-t border-border">
        <ColorPanel />
      </div>
    </div>
  );
}
