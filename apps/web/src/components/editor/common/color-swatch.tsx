// apps/web/src/components/editor/common/color-swatch.tsx

import { cn } from "@/lib/utils";

type SwatchSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<SwatchSize, string> = {
  sm: "w-5 h-5",
  md: "w-7 h-7",
  lg: "w-9 h-9",
};

// Checkerboard pattern for transparent colors
const CHECKERBOARD =
  "repeating-conic-gradient(rgba(128,128,128,0.3) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px";

interface ColorSwatchProps {
  color: string;
  size?: SwatchSize;
  active?: boolean;
  showBorder?: boolean;
  onClick?: () => void;
  className?: string;
  label?: string;
  "data-testid"?: string;
}

export function ColorSwatch({
  color,
  size = "md",
  active,
  showBorder = true,
  onClick,
  className,
  label,
  ...dataProps
}: ColorSwatchProps) {
  const isTransparent =
    color.length === 9 ||
    color.length === 5 ||
    color.toLowerCase().includes("rgba") ||
    color.toLowerCase().includes("hsla") ||
    color === "transparent";

  return (
    <button
      type="button"
      title={label ?? color}
      aria-label={label ?? `Color ${color}`}
      onClick={onClick}
      className={cn(
        "relative rounded transition-shadow shrink-0",
        SIZE_CLASSES[size],
        showBorder && "border border-border",
        active && "ring-2 ring-primary-ink ring-offset-1 ring-offset-card",
        onClick && "cursor-pointer hover:ring-1 hover:ring-primary/50",
        !onClick && "cursor-default",
        className,
      )}
      style={{
        background: isTransparent ? CHECKERBOARD : undefined,
      }}
      {...dataProps}
    >
      <span className="absolute inset-0 rounded" style={{ backgroundColor: color }} />
    </button>
  );
}
