import type { Tool } from "@snapotter/shared";
import { CATEGORIES, SECTIONS, TOOLS, toolSection } from "@snapotter/shared";
import { ChevronDown, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ToolCard } from "@/components/common/tool-card.js";
import { AppLayout } from "@/components/layout/app-layout.js";
import { useTranslation } from "@/contexts/i18n-context";
import { useFuseSearch } from "@/hooks/use-fuse-search.js";
import { usePageTitle } from "@/hooks/use-page-title.js";
import { useRecentTools } from "@/hooks/use-recent-tools.js";
import { format } from "@/lib/format.js";
import { ICON_MAP } from "@/lib/icon-map.js";
import { getCategoryName, getToolName } from "@/lib/tool-i18n.js";
import { cn } from "@/lib/utils.js";
import { useSettingsStore } from "@/stores/settings-store";

interface TabDef {
  key: string;
  label: string;
}

const COLLAPSE_STORAGE_KEY = "snapotter-collapsed-sections";

function getCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedSections(collapsed: Set<string>) {
  localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...collapsed]));
}

const SECTION_TABS = new Set<string>(["all", ...SECTIONS.map((s) => s.id)]);

export function HomePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { fetch: fetchSettings, disabledTools, experimentalEnabled, loaded } = useSettingsStore();
  const recentToolIds = useRecentTools();
  const location = useLocation();
  const navigate = useNavigate();

  usePageTitle();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Open a specific section tab when arriving via a breadcrumb link
  // (/?section=<sectionId>), then clean the URL so refresh/back doesn't re-pin it.
  useEffect(() => {
    const s = new URLSearchParams(location.search).get("section");
    if (s && SECTION_TABS.has(s)) {
      setActiveTab(s);
      navigate("/", { replace: true });
    }
  }, [location.search, navigate]);

  const tabs: TabDef[] = useMemo(
    () => [
      { key: "all", label: t.homePage.all },
      ...SECTIONS.map((s) => ({
        key: s.id,
        label: s.id === "pdf" ? t.homePage.pdf : s.id === "files" ? t.homePage.files : s.name,
      })),
    ],
    [t],
  );

  const visibleTools = useMemo(() => {
    if (!loaded) return [];
    return TOOLS.filter((tool) => {
      if (tool.disabled) return false;
      if (disabledTools.includes(tool.id)) return false;
      if (tool.experimental && !experimentalEnabled) return false;
      return true;
    });
  }, [disabledTools, experimentalEnabled, loaded]);

  const searchResults = useFuseSearch(visibleTools, search);

  const tabTools = useMemo(() => {
    if (activeTab === "all") return visibleTools;
    return visibleTools.filter((tool) => toolSection(tool) === activeTab);
  }, [visibleTools, activeTab]);

  const groupedTools = useMemo(() => {
    const map = new Map<string, Tool[]>();
    for (const tool of tabTools) {
      const existing = map.get(tool.category);
      if (existing) {
        existing.push(tool);
      } else {
        map.set(tool.category, [tool]);
      }
    }
    return map;
  }, [tabTools]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: visibleTools.length };
    for (const tool of visibleTools) {
      const sec = toolSection(tool);
      counts[sec] = (counts[sec] ?? 0) + 1;
    }
    return counts;
  }, [visibleTools]);

  const recentTools = useMemo(
    () =>
      recentToolIds
        .map((id) => visibleTools.find((tool) => tool.id === id))
        .filter((tool): tool is Tool => tool != null),
    [recentToolIds, visibleTools],
  );

  return (
    <AppLayout>
      <div>
        <h1 className="sr-only">{t.homePage.heading}</h1>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <HomeSearchBar
            value={search}
            onChange={setSearch}
            placeholder={format(t.homePage.searchPlaceholder, {
              count: visibleTools.length,
            })}
          />

          <ModalityTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={tabCounts}
          />

          {search ? (
            <SearchResults results={searchResults} query={search} onClear={() => setSearch("")} />
          ) : activeTab === "all" ? (
            <AllTabContent recentTools={recentTools} visibleTools={visibleTools} />
          ) : (
            <CategoryGrid groupedTools={groupedTools} />
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Search Bar ───────────────────────────────────────────────────

function HomeSearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("focus") === "search") {
      inputRef.current?.focus();
      navigate("/", { replace: true });
    }
  }, [location.search, navigate]);

  return (
    <div className="relative mb-8">
      <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        data-search-input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full ps-11 pe-20 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-shadow"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      ) : (
        <kbd className="absolute end-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-border bg-muted/50 text-[11px] text-muted-foreground font-mono">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      )}
    </div>
  );
}

// ── Modality Tabs ────────────────────────────────────────────────

function ModalityTabs({
  tabs,
  activeTab,
  onTabChange,
  counts,
}: {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (key: string) => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="mb-8 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1.5 min-w-max">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
            <span className={cn("ms-1", activeTab === tab.key ? "opacity-80" : "opacity-50")}>
              {counts[tab.key] ?? 0}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Search Results ───────────────────────────────────────────────

function SearchResults({
  results,
  query,
  onClear,
}: {
  results: Tool[];
  query: string;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  if (results.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{format(t.homePage.noToolsMatch, { query })}</p>
        <button
          type="button"
          onClick={onClear}
          className="mt-3 text-sm text-primary hover:underline"
        >
          {t.homePage.clearSearch}
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {results.map((tool) => (
        <ToolCard key={tool.id} tool={tool} variant="descriptive" showModalityBadge />
      ))}
    </div>
  );
}

// ── All Tab: Grouped by section, then by category ───────────────

function AllTabContent({
  recentTools,
  visibleTools,
}: {
  recentTools: Tool[];
  visibleTools: Tool[];
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(getCollapsedSections);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      saveCollapsedSections(next);
      return next;
    });
  }, []);

  const toolsBySection = useMemo(() => {
    const map = new Map<string, Map<string, Tool[]>>();
    for (const tool of visibleTools) {
      const sec = toolSection(tool);
      let catMap = map.get(sec);
      if (!catMap) {
        catMap = new Map();
        map.set(sec, catMap);
      }
      const existing = catMap.get(tool.category);
      if (existing) existing.push(tool);
      else catMap.set(tool.category, [tool]);
    }
    return map;
  }, [visibleTools]);

  return (
    <div className="space-y-6">
      {/* Recent */}
      {recentTools.length > 0 && (
        <section>
          <h2 className="text-[11px] font-semibold uppercase text-muted-foreground/70 tracking-widest mb-2">
            {t.homePage.recent}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {recentTools.map((tool) => (
              <Link
                key={tool.id}
                to={tool.route}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm text-muted-foreground border border-border/60 hover:border-border hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {getToolName(t, tool.id, tool.name)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Section groups */}
      {SECTIONS.map((sec) => {
        const categoryMap = toolsBySection.get(sec.id);
        if (!categoryMap || categoryMap.size === 0) return null;

        const totalCount = [...categoryMap.values()].reduce((sum, arr) => sum + arr.length, 0);
        const isCollapsed = collapsed.has(sec.id);
        const SectionIcon = ICON_MAP[sec.icon] as
          | React.ComponentType<{ className?: string }>
          | undefined;

        return (
          <section key={sec.id}>
            <button
              type="button"
              onClick={() => toggleSection(sec.id)}
              className="w-full flex items-center gap-2 py-2 mb-2 border-b border-border/40 group cursor-pointer"
            >
              {SectionIcon && (
                <div
                  className="p-1 rounded"
                  style={{
                    backgroundColor: `${sec.color}15`,
                    color: sec.color,
                  }}
                >
                  <SectionIcon className="h-4 w-4" />
                </div>
              )}
              <span className="text-sm font-semibold text-foreground">{sec.name}</span>
              <span className="text-xs text-muted-foreground">{totalCount}</span>
              <div className="flex-1" />
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isCollapsed && "-rotate-90",
                )}
              />
            </button>

            {!isCollapsed && (
              <div className="space-y-5 ps-1">
                {CATEGORIES.filter((cat) => categoryMap.has(cat.id)).map((category) => {
                  const tools = categoryMap.get(category.id) ?? [];
                  return (
                    <div key={category.id}>
                      <h3 className="text-[11px] font-semibold uppercase text-muted-foreground/50 tracking-widest mb-1.5">
                        {getCategoryName(t, category.id, category.name)}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {tools.map((tool) => (
                          <ToolCard key={tool.id} tool={tool} variant="descriptive" />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── Category Grid (used by modality tabs) ────────────────────────

function CategoryGrid({ groupedTools }: { groupedTools: Map<string, Tool[]> }) {
  const { t } = useTranslation();

  if (groupedTools.size === 0) {
    return (
      <p className="text-center text-muted-foreground py-16">{t.fullscreenGrid.noToolsFound}</p>
    );
  }

  return (
    <div className="space-y-6">
      {CATEGORIES.filter((cat) => groupedTools.has(cat.id)).map((category) => {
        const tools = groupedTools.get(category.id) ?? [];
        return (
          <section key={category.id}>
            <h2 className="text-[11px] font-semibold uppercase text-muted-foreground/70 tracking-widest mb-2 pb-1.5 border-b border-border/40">
              {getCategoryName(t, category.id, category.name)}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} variant="descriptive" />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
