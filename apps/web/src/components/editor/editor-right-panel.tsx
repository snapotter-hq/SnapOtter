// apps/web/src/components/editor/editor-right-panel.tsx
import { ChevronRight } from "lucide-react";
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

export function EditorRightPanel() {
  const { t } = useTranslation();
  const visible = useEditorStore((s) => s.rightPanelVisible);
  const activeTab = useEditorStore((s) => s.rightPanelTab);
  const setTab = useEditorStore((s) => s.setRightPanelTab);
  const togglePanel = useEditorStore((s) => s.toggleRightPanel);
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);

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
    <div className="flex flex-col w-[280px] bg-card border-l border-border">
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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
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
