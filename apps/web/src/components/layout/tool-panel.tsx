import { CATEGORIES, TOOLS } from "@snapotter/shared";
import { useEffect, useMemo, useState } from "react";
import { useFeaturesStore } from "@/stores/features-store";
import { useSettingsStore } from "@/stores/settings-store";
import { SearchBar } from "../common/search-bar";
import { ToolCard } from "../common/tool-card";

export function ToolPanel() {
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

  const groupedTools = useMemo(() => {
    const groups = new Map<string, typeof TOOLS>();
    for (const tool of filteredTools) {
      const list = groups.get(tool.category) || [];
      list.push(tool);
      groups.set(tool.category, list);
    }
    return groups;
  }, [filteredTools]);

  return (
    <div className="w-72 border-r border-border bg-background overflow-y-auto flex flex-col shrink-0">
      <div className="p-3 sticky top-0 bg-background z-10">
        <SearchBar value={search} onChange={setSearch} />
      </div>
      <div className="px-3 pb-4 flex-1">
        {CATEGORIES.filter((cat) => groupedTools.has(cat.id)).map((category) => (
          <div key={category.id} className="mb-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
              {category.name}
            </h3>
            <div className="space-y-0.5">
              {groupedTools.get(category.id)?.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </div>
        ))}
        {filteredTools.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No tools found</p>
        )}
      </div>
    </div>
  );
}
