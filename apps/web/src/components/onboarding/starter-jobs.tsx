import type { Tool } from "@snapotter/shared";
import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { useRecentTools } from "@/hooks/use-recent-tools";
import { ICON_MAP } from "@/lib/icon-map";
import { withAnalytics } from "@/lib/lazy-analytics";
import { getToolName } from "@/lib/tool-i18n";
import { useSettingsStore } from "@/stores/settings-store";

export const STARTER_DISMISSED_STORAGE_KEY = "snapotter-starter-jobs-dismissed";

type StarterJobKey = "starterImage" | "starterPdf" | "starterBackground";

// Job order is the one #4909 settled on. Within a job, tools are ordered by how
// many instances ran them (tool_used in PostHog, 60 days to 2026-11-19).
export const STARTER_JOBS: ReadonlyArray<{ key: StarterJobKey; toolIds: readonly string[] }> = [
  { key: "starterImage", toolIds: ["convert", "compress"] },
  { key: "starterPdf", toolIds: ["merge-pdf", "compress-pdf"] },
  { key: "starterBackground", toolIds: ["remove-background"] },
];

interface StarterVisibility {
  loaded: boolean;
  role: string | null;
  instanceHasProcessed: boolean;
  hasRecentTools: boolean;
  dismissed: boolean;
}

/**
 * Show the starter block to an admin on an instance that has never finished a
 * tool run. The processed marker is only readable by full admins, so other
 * roles never see it. Recent tools cover the same-tab case: the settings store
 * loads once, so after a first run the marker it holds is stale.
 */
export function shouldShowStarterJobs({
  loaded,
  role,
  instanceHasProcessed,
  hasRecentTools,
  dismissed,
}: StarterVisibility): boolean {
  return loaded && role === "admin" && !instanceHasProcessed && !hasRecentTools && !dismissed;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STARTER_DISMISSED_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function StarterJobs({ visibleTools }: { visibleTools: Tool[] }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const loaded = useSettingsStore((s) => s.loaded);
  const instanceHasProcessed = useSettingsStore((s) => s.instanceHasProcessed);
  const recentToolIds = useRecentTools();
  const [dismissed, setDismissed] = useState(readDismissed);

  const jobs = useMemo(() => {
    const byId = new Map(visibleTools.map((tool) => [tool.id, tool]));
    return STARTER_JOBS.map((job) => ({
      key: job.key,
      tools: job.toolIds.map((id) => byId.get(id)).filter((tool): tool is Tool => tool != null),
    })).filter((job) => job.tools.length > 0);
  }, [visibleTools]);

  const visible = shouldShowStarterJobs({
    loaded,
    role,
    instanceHasProcessed,
    hasRecentTools: recentToolIds.length > 0,
    dismissed,
  });
  if (!visible || jobs.length === 0) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STARTER_DISMISSED_STORAGE_KEY, new Date().toISOString());
    } catch {
      // Storage blocked: hide for this page view only.
    }
    setDismissed(true);
  };

  return (
    <section
      data-testid="starter-jobs"
      aria-labelledby="starter-jobs-heading"
      className="mb-8 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h2 id="starter-jobs-heading" className="text-sm font-semibold text-foreground">
            {t.homePage.gettingStarted}
          </h2>
          <p className="text-sm text-muted-foreground">{t.homePage.starterHint}</p>
        </div>
        <button
          type="button"
          data-testid="starter-jobs-dismiss"
          onClick={dismiss}
          aria-label={t.homePage.starterDismiss}
          title={t.homePage.starterDismiss}
          className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {jobs.map((job) => {
          const Icon = ICON_MAP[job.tools[0].icon] as
            | React.ComponentType<{ className?: string }>
            | undefined;
          return (
            <li key={job.key} className="rounded-md border border-border/60 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                {t.homePage[job.key]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {job.tools.map((tool) => (
                  <Link
                    key={tool.id}
                    to={tool.route}
                    data-testid={`starter-job-${tool.id}`}
                    onClick={() =>
                      withAnalytics(({ track }) =>
                        track(ANALYTICS_EVENTS.STARTER_JOB_CLICKED, { tool_id: tool.id }),
                      )
                    }
                    className="inline-flex items-center px-3 py-1 rounded-md text-sm text-muted-foreground border border-border/60 hover:border-border hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    {getToolName(t, tool.id, tool.name)}
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
