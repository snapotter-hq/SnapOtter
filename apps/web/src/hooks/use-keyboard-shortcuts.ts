import { TOOLS } from "@snapotter/shared";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "./use-theme";

/**
 * Detect if the current platform uses Cmd (macOS) or Ctrl.
 */
function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/** A tool's section-prefixed page route (e.g. "/image/resize"), or "/" if unknown. */
const routeOf = (id: string): string => TOOLS.find((t) => t.id === id)?.route ?? "/";

interface ShortcutDef {
  /** Keys: "mod" = Cmd on Mac, Ctrl on others. Plus key names separated by "+" */
  keys: string;
  description: string;
  action: () => void;
}

/**
 * Check if a keyboard event matches a shortcut definition.
 */
function matchesShortcut(e: KeyboardEvent, keys: string): boolean {
  const parts = keys
    .toLowerCase()
    .split("+")
    .map((s) => s.trim());
  const mac = isMac();

  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  // The actual key is the last non-modifier part
  const key = parts.filter((p) => !["mod", "shift", "alt"].includes(p))[0];
  if (!key) return false;

  const modPressed = mac ? e.metaKey : e.ctrlKey;

  if (needsMod && !modPressed) return false;
  if (!needsMod && modPressed) return false;
  if (needsShift && !e.shiftKey) return false;
  if (!needsShift && e.shiftKey) return false;
  if (needsAlt && !e.altKey) return false;
  if (!needsAlt && e.altKey) return false;

  return e.key.toLowerCase() === key;
}

/**
 * Hook that registers global keyboard shortcuts.
 * Call once in the root App component.
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  const focusSearchBar = useCallback(() => {
    const searchInput = document.querySelector<HTMLInputElement>(
      '[data-search-input], input[placeholder*="Search"]',
    );
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    } else {
      // Navigate to home with focus param so the search input gets focused on mount
      navigate("/?focus=search");
    }
  }, [navigate]);

  const triggerProcess = useCallback(() => {
    // Try submitting a form inside the settings panel first
    const form = document.querySelector<HTMLFormElement>(".settings-container form");
    if (form) {
      form.requestSubmit();
      return;
    }
    // Fall back to clicking a submit-like button inside the settings panel
    const btn = document.querySelector<HTMLButtonElement>(
      '.settings-container button[data-testid$="-submit"]',
    );
    if (btn && !btn.disabled) {
      btn.click();
    }
  }, []);

  const triggerDownload = useCallback(() => {
    const el = document.querySelector<HTMLElement>("[data-download-button]");
    if (el) el.click();
  }, []);

  useEffect(() => {
    const shortcuts: ShortcutDef[] = [
      { keys: "mod+k", description: "Focus search bar", action: focusSearchBar },
      { keys: "mod+/", description: "Go to tools", action: () => navigate("/") },
      { keys: "mod+shift+d", description: "Toggle theme", action: toggleTheme },
      { keys: "mod+enter", description: "Process file", action: triggerProcess },
      { keys: "mod+s", description: "Download result", action: triggerDownload },
      { keys: "mod+alt+1", description: "Go to Resize", action: () => navigate(routeOf("resize")) },
      { keys: "mod+alt+2", description: "Go to Crop", action: () => navigate(routeOf("crop")) },
      {
        keys: "mod+alt+3",
        description: "Go to Compress",
        action: () => navigate(routeOf("compress")),
      },
      {
        keys: "mod+alt+4",
        description: "Go to Convert",
        action: () => navigate(routeOf("convert")),
      },
      {
        keys: "mod+alt+5",
        description: "Go to Remove Background",
        action: () => navigate(routeOf("remove-background")),
      },
      {
        keys: "mod+alt+6",
        description: "Go to Watermark Text",
        action: () => navigate(routeOf("watermark-text")),
      },
      {
        keys: "mod+alt+7",
        description: "Go to Strip Metadata",
        action: () => navigate(routeOf("strip-metadata")),
      },
      {
        keys: "mod+alt+8",
        description: "Go to Image Info",
        action: () => navigate(routeOf("info")),
      },
    ];

    // Shortcuts that should work even when focused on an input/textarea
    const inputSafeKeys = new Set(["mod+k", "mod+s", "mod+enter"]);

    function handler(e: KeyboardEvent) {
      // Don't intercept when typing in inputs/textareas (except input-safe shortcuts)
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      for (const shortcut of shortcuts) {
        if (matchesShortcut(e, shortcut.keys)) {
          if (isInput && !inputSafeKeys.has(shortcut.keys)) continue;
          e.preventDefault();
          e.stopPropagation();
          shortcut.action();
          return;
        }
      }
    }

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [navigate, toggleTheme, focusSearchBar, triggerProcess, triggerDownload]);
}

/**
 * Returns a human-readable label for a keyboard shortcut.
 */
export function formatShortcut(keys: string): string {
  const mac = isMac();
  return keys
    .split("+")
    .map((k) => {
      const lk = k.trim().toLowerCase();
      if (lk === "mod") return mac ? "\u2318" : "Ctrl";
      if (lk === "shift") return mac ? "\u21E7" : "Shift";
      if (lk === "alt") return mac ? "\u2325" : "Alt";
      if (lk === "enter") return mac ? "↩" : "Enter";
      if (lk === "/") return "/";
      return k.trim().toUpperCase();
    })
    .join(mac ? "" : "+");
}
