import type { CategoryInfo, Tool } from "@ashim/shared";
import { ANALYTICS_EVENTS, CATEGORIES, TOOLS } from "@ashim/shared";
import { Eye, EyeOff, FileImage, LayoutGrid, List, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GemLogo } from "@/components/common/gem-logo";
import { track } from "@/lib/analytics";
import { apiGet } from "@/lib/api";
import { ICON_MAP } from "@/lib/icon-map";
import { cn } from "@/lib/utils";
import { useFeaturesStore } from "@/stores/features-store";

export function FullscreenGridPage() {
  const [search, setSearch] = useState("");
  const [showDetails, setShowDetails] = useState(true);
  const navigate = useNavigate();
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [experimentalEnabled, setExperimentalEnabled] = useState(false);
  const fetchFeatures = useFeaturesStore((s) => s.fetch);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => {
        setDisabledTools(
          data.settings.disabledTools ? JSON.parse(data.settings.disabledTools) : [],
        );
        setExperimentalEnabled(data.settings.enableExperimentalTools === "true");
      })
      .catch(() => {});
  }, []);

  const visibleTools = useMemo(() => {
    return TOOLS.filter((t) => {
      if (disabledTools.includes(t.id)) return false;
      if (t.experimental && !experimentalEnabled) return false;
      return true;
    });
  }, [disabledTools, experimentalEnabled]);

  const filteredTools = useMemo(() => {
    if (!search) return visibleTools;
    const q = search.toLowerCase();
    return visibleTools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [search, visibleTools]);

  useEffect(() => {
    if (!search) return;
    const timer = setTimeout(() => {
      track(ANALYTICS_EVENTS.SEARCH, {
        query: search,
        results_count: filteredTools.length,
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [search, filteredTools.length]);

  const groupedTools = useMemo(() => {
    const groups = new Map<string, Tool[]>();
    for (const tool of filteredTools) {
      const list = groups.get(tool.category) || [];
      list.push(tool);
      groups.set(tool.category, list);
    }
    return groups;
  }, [filteredTools]);

  const activeCategories = CATEGORIES.filter((cat) => groupedTools.has(cat.id));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-bold text-foreground shrink-0"
          >
            <GemLogo className="h-6 w-6 text-primary" />
            <span className="text-primary">ashim</span>
          </Link>

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Toggle details */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm transition-colors",
              showDetails
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {showDetails ? "Hide Details" : "Show Details"}
            </span>
          </button>

          {/* Switch to sidebar view */}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            title="Switch to sidebar view"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Sidebar</span>
          </button>
        </div>
      </header>

      {/* Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeCategories.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No tools found</p>
            <p className="text-sm mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeCategories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                tools={groupedTools.get(category.id) || []}
                showDetails={showDetails}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CategoryCard({
  category,
  tools,
  showDetails,
}: {
  category: CategoryInfo;
  tools: Tool[];
  showDetails: boolean;
}) {
  const CategoryIcon =
    (ICON_MAP[category.icon] as React.ComponentType<{ className?: string }>) ?? LayoutGrid;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: `${category.color}15` }}
      >
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: `${category.color}25`, color: category.color }}
        >
          <CategoryIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground text-sm">{category.name}</h3>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${category.color}20`,
            color: category.color,
          }}
        >
          {tools.length}
        </span>
      </div>

      {/* Tool list */}
      <div className="p-2">
        {tools.map((tool) => {
          const ToolIcon =
            (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;
          return (
            <Link
              key={tool.id}
              to={tool.route}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <ToolIcon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{tool.name}</p>
                {showDetails && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {tool.description}
                  </p>
                )}
              </div>
              {tool.experimental && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-medium shrink-0">
                  Experimental
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
