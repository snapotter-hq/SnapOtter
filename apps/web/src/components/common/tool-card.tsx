import type { Tool } from "@snapotter/shared";
import {
  getRequiredBundlesForTool,
  PYTHON_SIDECAR_TOOLS,
  SECTIONS,
  toolSection,
} from "@snapotter/shared";
import { Clock, Download, FileImage, Loader2, Pin } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";
import { ICON_MAP } from "@/lib/icon-map";
import { getToolDescription, getToolName } from "@/lib/tool-i18n";
import { cn } from "@/lib/utils";
import { useFeaturesStore } from "@/stores/features-store";
import { usePinnedToolsStore } from "@/stores/pinned-tools-store";

interface ToolCardProps {
  tool: Tool;
  variant?: "compact" | "descriptive";
  showModalityBadge?: boolean;
  showPin?: boolean;
  /** Fired when the card is clicked (before navigation), for search attribution. */
  onNavigate?: () => void;
}

function PinButton({ toolId }: { toolId: string }) {
  const { t } = useTranslation();
  const pinned = usePinnedToolsStore((s) => s.pinnedTools.includes(toolId));
  const pin = usePinnedToolsStore((s) => s.pin);
  const unpin = usePinnedToolsStore((s) => s.unpin);
  const label = pinned ? t.toolCard.unpin : t.toolCard.pin;
  return (
    <button
      type="button"
      data-testid={`pin-toggle-${toolId}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pinned) unpin(toolId);
        else pin(toolId);
      }}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      className={cn(
        "absolute top-2 end-2 z-10 p-1.5 rounded-md transition-colors",
        pinned
          ? "text-primary hover:bg-primary/10"
          : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted",
      )}
    >
      <Pin className={cn("h-4 w-4", pinned && "fill-current")} aria-hidden="true" />
    </button>
  );
}

const SECTION_COLOR_MAP: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s.color]),
);

// Darkened per-section text colors: the vivid section colors sit below the
// WCAG AA 4.5:1 floor as small text on the 12.5% tint chips (issue #557).
const SECTION_INK_MAP: Record<string, string> = {
  image: "#0B61ED",
  video: "#D31212",
  audio: "#0B7C57",
  pdf: "#7942F5",
  files: "#996306",
};

export function ToolCard({
  tool,
  variant = "compact",
  showModalityBadge,
  showPin,
  onNavigate,
}: ToolCardProps) {
  const { t } = useTranslation();
  const IconComponent =
    (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;

  const isAiTool = (PYTHON_SIDECAR_TOOLS as readonly string[]).includes(tool.id);
  const bundles = useFeaturesStore((s) => s.bundles);
  const installing = useFeaturesStore((s) => s.installing);
  const queued = useFeaturesStore((s) => s.queued);
  const aiStatus = useMemo(() => {
    if (!isAiTool) return "installed";
    const requiredBundleIds = getRequiredBundlesForTool(tool.id);
    if (requiredBundleIds.length === 0) return "installed";
    if (requiredBundleIds.some((bundleId) => queued.includes(bundleId))) return "queued";
    if (requiredBundleIds.some((bundleId) => installing[bundleId])) return "installing";
    return requiredBundleIds.every(
      (bundleId) => bundles.find((bundle) => bundle.id === bundleId)?.status === "installed",
    )
      ? "installed"
      : "not_installed";
  }, [isAiTool, tool.id, bundles, installing, queued]);

  const section = toolSection(tool);
  const sectionColor = SECTION_COLOR_MAP[section] ?? "#6B7280";

  const sectionBadge = showModalityBadge ? (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
      style={{
        backgroundColor: `${sectionColor}20`,
        color: SECTION_INK_MAP[section] ?? "#3D3832",
      }}
    >
      {SECTIONS.find((s) => s.id === section)?.name ?? section}
    </span>
  ) : null;

  const aiStatusIcon =
    aiStatus === "not_installed" ? (
      <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
    ) : aiStatus === "queued" ? (
      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
    ) : aiStatus === "installing" ? (
      <Loader2
        className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0"
        aria-hidden="true"
      />
    ) : null;

  if (variant === "descriptive") {
    const card = (
      <Link
        to={tool.route}
        onClick={onNavigate}
        className={cn(
          "flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-card transition-all",
          "hover:border-border hover:shadow-sm",
          showPin && "pe-10",
          tool.disabled && "opacity-50 pointer-events-none",
        )}
      >
        <div
          className="p-2 rounded-lg shrink-0 mt-0.5"
          style={{ backgroundColor: `${sectionColor}12`, color: sectionColor }}
        >
          <IconComponent className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {getToolName(t, tool.id, tool.name)}
            </span>
            {sectionBadge}
            {tool.experimental && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-subtle text-primary-ink font-medium">
                {t.common.experimental}
              </span>
            )}
            {aiStatusIcon}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {getToolDescription(t, tool.id, tool.description)}
          </p>
        </div>
      </Link>
    );

    if (!showPin) return card;

    return (
      <div className="relative">
        {card}
        <PinButton toolId={tool.id} />
      </div>
    );
  }

  return (
    <Link
      to={tool.route}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 p-2.5 px-3 rounded-lg transition-colors",
        "hover:bg-muted",
        tool.disabled && "opacity-50 pointer-events-none",
      )}
    >
      <IconComponent className="h-5 w-5 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium text-foreground">
        {getToolName(t, tool.id, tool.name)}
      </span>
      {sectionBadge}
      {tool.experimental && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-subtle text-primary-ink font-medium">
          {t.common.experimental}
        </span>
      )}
      {aiStatusIcon}
    </Link>
  );
}
