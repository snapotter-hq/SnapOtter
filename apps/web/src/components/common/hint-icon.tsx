import { Info } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Info tooltip that opens on hover (mouse), focus (keyboard), and tap toggle
 * (touch; iOS Safari does not focus buttons on tap, so hover/focus alone
 * leaves touch users with no way in). The hint text doubles as the trigger's
 * accessible name, so screen readers get the content without opening it.
 */
export function HintIcon({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative group inline-flex">
      <button
        type="button"
        aria-label={text}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center"
      >
        <Info className="h-3 w-3 text-muted-foreground" />
      </button>
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 rounded bg-foreground px-2 py-1.5 text-[11px] leading-tight text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 z-10",
          open && "opacity-100",
        )}
      >
        {text}
      </span>
    </span>
  );
}
