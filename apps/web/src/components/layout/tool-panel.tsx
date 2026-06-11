import { CATEGORIES, MODALITIES, TOOLS } from "@snapotter/shared";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { ICON_MAP } from "@/lib/icon-map";
import { getCategoryName, getModalityName } from "@/lib/tool-i18n";
import { useFeaturesStore } from "@/stores/features-store";
import { useSettingsStore } from "@/stores/settings-store";
import { SearchBar } from "../common/search-bar";
import { ToolCard } from "../common/tool-card";

export function ToolPanel() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { disabledTools, experimentalEnabled, loaded, fetch } = useSettingsStore();
  const fetchFeatures = useFeaturesStore((s) => s.fetch);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  const visibleTools = useMemo(() => {
    if (!loaded) return [];
    return TOOLS.filter((t) => {
      if (disabledTools.includes(t.id)) return false;
      if (t.experimental && !experimentalEnabled) return false;
      return true;
    });
  }, [disabledTools, experimentalEnabled, loaded]);

  const filteredTools = useMemo(() => {
    if (!search) return visibleTools;
    const q = search.toLowerCase();
    return visibleTools.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [search, visibleTools]);

  const groupedByModality = useMemo(() => {
    const byModality = new Map<string, Map<string, typeof TOOLS>>();
    for (const tool of filteredTools) {
      const key = tool.modality === "file" ? "document" : tool.modality;
      const cats = byModality.get(key) ?? new Map<string, typeof TOOLS>();
      const list = cats.get(tool.category) ?? [];
      list.push(tool);
      cats.set(tool.category, list);
      byModality.set(key, cats);
    }
    return byModality;
  }, [filteredTools]);

  return (
    <div className="w-72 border-r border-border bg-background overflow-y-auto flex flex-col shrink-0">
      <div className="p-3 sticky top-0 bg-background z-10">
        <SearchBar value={search} onChange={setSearch} />
      </div>
      <div className="px-3 pb-4 flex-1">
        {MODALITIES.filter((m) => m.id !== "file" && groupedByModality.has(m.id)).map(
          (modality) => {
            const ModalityIcon = ICON_MAP[modality.icon] as React.ComponentType<{
              className?: string;
            }>;
            const categoryMap = groupedByModality.get(modality.id);
            if (!categoryMap) return null;
            return (
              <div key={modality.id} className="mb-5">
                <div className="flex items-center gap-1.5 mb-2">
                  {ModalityIcon && <ModalityIcon className="h-4 w-4 text-foreground/70 shrink-0" />}
                  <h2 className="text-xs font-bold uppercase text-foreground/70 tracking-wider">
                    {getModalityName(
                      t,
                      modality.id,
                      modality.id === "document" ? "Documents & Files" : modality.name,
                    )}
                  </h2>
                </div>
                {CATEGORIES.filter((cat) => categoryMap.has(cat.id)).map((category) => (
                  <div key={category.id} className="mb-4">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
                      {getCategoryName(t, category.id, category.name)}
                    </h3>
                    <div className="space-y-0.5">
                      {categoryMap.get(category.id)?.map((tool) => (
                        <ToolCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          },
        )}
        {filteredTools.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No tools found</p>
        )}
      </div>
    </div>
  );
}
