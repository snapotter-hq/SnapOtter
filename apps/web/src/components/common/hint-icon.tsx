import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Info tooltip that opens on hover (mouse), focus (keyboard), and tap toggle
 * (touch; iOS Safari does not focus buttons on tap, so hover/focus alone
 * leaves touch users with no way in). The hint text doubles as the trigger's
 * accessible name, so screen readers get the content without opening it.
 */
export function HintIcon({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  // Tap-to-open needs tap-elsewhere-to-close: the same iOS Safari behavior
  // that motivates the toggle (no focus on tap) also means onBlur alone never
  // fires there, stranding the tooltip open. Escape covers WCAG 1.4.13.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative group inline-flex">
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
        // Padding with negative margin: a 28px tap target (WCAG 2.5.8) with
        // zero layout shift in the dense settings rows this sits in.
        className="inline-flex items-center p-2 -m-2"
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
