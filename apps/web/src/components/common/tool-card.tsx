import type { Tool } from "@snapotter/shared";
import { PYTHON_SIDECAR_TOOLS, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import { Download, FileImage, Star } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ICON_MAP } from "@/lib/icon-map";
import { cn } from "@/lib/utils";
import { useFeaturesStore } from "@/stores/features-store";

interface ToolCardProps {
  tool: Tool;
}

export function ToolCard({ tool }: ToolCardProps) {
  const IconComponent =
    (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;

  const isAiTool = (PYTHON_SIDECAR_TOOLS as readonly string[]).includes(tool.id);
  const bundles = useFeaturesStore((s) => s.bundles);
  const isInstalled = useMemo(() => {
    if (!isAiTool) return true;
    const bundleId = TOOL_BUNDLE_MAP[tool.id];
    if (!bundleId) return true;
    const bundle = bundles.find((b) => b.id === bundleId);
    return bundle?.status === "installed";
  }, [isAiTool, tool.id, bundles]);
  const showDownloadBadge = isAiTool && !isInstalled;

  return (
    <div className="group flex items-center gap-3 relative">
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 transition-opacity absolute -left-5"
        title="Add to favourites"
      >
        <Star className="h-3 w-3 text-muted-foreground hover:text-yellow-500" />
      </button>
      <Link
        to={tool.route}
        className={cn(
          "flex items-center gap-3 py-2 px-3 rounded-lg w-full transition-colors",
          "hover:bg-muted",
          tool.disabled && "opacity-50 pointer-events-none",
        )}
      >
        <IconComponent className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{tool.name}</span>
        {tool.experimental && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">
            Experimental
          </span>
        )}
        {showDownloadBadge && <Download className="h-3.5 w-3.5 text-muted-foreground" />}
      </Link>
    </div>
  );
}
