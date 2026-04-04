import type { Tool } from "@stirling-image/shared";
import * as icons from "lucide-react";
import { FileImage, Sparkles, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  tool: Tool;
  variantUnavailable?: boolean;
}

export function ToolCard({ tool, variantUnavailable }: ToolCardProps) {
  const iconsMap = icons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const IconComponent = iconsMap[tool.icon] || FileImage;

  if (variantUnavailable) {
    return (
      <div className="group flex items-center gap-3 relative">
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 transition-opacity absolute -left-5"
          title="Add to favourites"
        >
          <Star className="h-3 w-3 text-muted-foreground hover:text-yellow-500" />
        </button>
        <button
          type="button"
          onClick={() =>
            toast("This tool requires the full image.", {
              description:
                "Pull stirlingimage/stirling-image:latest for all features including AI tools.",
              action: {
                label: "Learn more",
                onClick: () =>
                  window.open(
                    "https://stirling-image.github.io/stirling-image/guide/docker-tags",
                    "_blank",
                  ),
              },
            })
          }
          className="flex items-center gap-3 py-2 px-3 rounded-lg w-full transition-colors hover:bg-muted/50 opacity-50 cursor-pointer"
        >
          <IconComponent className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{tool.name}</span>
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
            <Sparkles className="h-2.5 w-2.5" />
            AI
          </span>
        </button>
      </div>
    );
  }

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
      </Link>
    </div>
  );
}
