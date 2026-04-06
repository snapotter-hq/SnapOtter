import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export function CollapsibleSection({
  title,
  badge,
  warning,
  defaultOpen,
  children,
}: {
  title: string;
  badge?: string;
  warning?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="flex-1 text-left">{title}</span>
        {warning && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
        {badge && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}
