import { CATEGORIES, TOOLS } from "@snapotter/shared";
import { FileImage, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SearchBar } from "@/components/common/search-bar";
import { apiGet } from "@/lib/api";
import { ICON_MAP } from "@/lib/icon-map";
import { cn } from "@/lib/utils";

const EXCLUDED_TOOLS = new Set(["pipeline", "compare", "find-duplicates", "collage", "compose"]);

interface ToolPaletteProps {
  onAddStep: (toolId: string) => void;
  className?: string;
}

export function ToolPalette({ onAddStep, className }: ToolPaletteProps) {
  const [search, setSearch] = useState("");
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [experimentalEnabled, setExperimentalEnabled] = useState(false);
  const [pipelineToolIds, setPipelineToolIds] = useState<string[] | null>(null);

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

  const availableTools = useMemo(() => {
    const q = search.toLowerCase();
    return TOOLS.filter((t) => {
      if (EXCLUDED_TOOLS.has(t.id)) return false;
      if (disabledTools.includes(t.id)) return false;
      if (t.experimental && !experimentalEnabled) return false;
      if (pipelineToolIds && !pipelineToolIds.includes(t.id)) return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [disabledTools, experimentalEnabled, pipelineToolIds, search]);

  const groupedTools = useMemo(() => {
    const groups: Record<string, typeof availableTools> = {};
    for (const tool of availableTools) {
      const cat = tool.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tool);
    }
    return groups;
  }, [availableTools]);

  const isSearching = search.length > 0;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="px-3 pt-3 pb-2 shrink-0">
        <SearchBar value={search} onChange={setSearch} placeholder="Search tools..." />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {availableTools.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No tools found</p>
        ) : isSearching ? (
          <div className="space-y-1">
            {availableTools.map((tool) => (
              <ToolItem key={tool.id} tool={tool} onAdd={onAddStep} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const tools = groupedTools[cat.id];
              if (!tools || tools.length === 0) return null;
              const CatIcon =
                (ICON_MAP[cat.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;
              return (
                <div key={cat.id}>
                  <div className="flex items-center gap-1.5 mb-1.5 px-1">
                    <CatIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                      {cat.name}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {tools.map((tool) => (
                      <ToolItem key={tool.id} tool={tool} onAdd={onAddStep} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolItemProps {
  tool: { id: string; name: string; description: string; icon: string };
  onAdd: (toolId: string) => void;
}

function ToolItem({ tool, onAdd }: ToolItemProps) {
  const Icon = (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;

  return (
    <button
      type="button"
      onClick={() => onAdd(tool.id)}
      className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg hover:bg-muted text-left transition-colors group"
    >
      <div className="p-1.5 rounded-md bg-muted group-hover:bg-primary/10 transition-colors shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground leading-tight">{tool.name}</div>
        <div className="text-[11px] text-muted-foreground truncate leading-tight">
          {tool.description}
        </div>
      </div>
      <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}
