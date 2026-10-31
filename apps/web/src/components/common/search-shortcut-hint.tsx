import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { isApplePlatform } from "@/lib/platform";

/**
 * The focus-search shortcut, drawn inside the home search box. It names the
 * modifier the global handler actually listens for: ⌘K on Apple platforms,
 * Ctrl+K everywhere else.
 */
export function SearchShortcutHint() {
  return (
    <kbd
      data-testid="search-shortcut-hint"
      className="absolute end-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-border bg-muted/50 text-[11px] text-muted-foreground font-mono"
    >
      {isApplePlatform() ? (
        <>
          <span className="text-xs">{formatShortcut("mod")}</span>K
        </>
      ) : (
        formatShortcut("mod+k")
      )}
    </kbd>
  );
}
