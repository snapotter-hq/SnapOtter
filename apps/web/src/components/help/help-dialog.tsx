import { APP_VERSION } from "@snapotter/shared";
import { BookOpen, ExternalLink, Github, Keyboard, X } from "lucide-react";
import { useEffect } from "react";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: "mod+k", description: "Focus search bar" },
  { keys: "mod+/", description: "Go to tools" },
  { keys: "mod+shift+d", description: "Toggle theme" },
  { keys: "mod+alt+1", description: "Go to Resize" },
  { keys: "mod+alt+2", description: "Go to Crop" },
  { keys: "mod+alt+3", description: "Go to Compress" },
  { keys: "mod+alt+4", description: "Go to Convert" },
  { keys: "mod+alt+5", description: "Go to Remove Background" },
  { keys: "mod+alt+6", description: "Go to Watermark Text" },
  { keys: "mod+alt+7", description: "Go to Strip Metadata" },
  { keys: "mod+alt+8", description: "Go to Image Info" },
];

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />

      <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-foreground">Help</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Getting started */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <BookOpen className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Getting Started</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select a tool from the sidebar or search for one with <Kbd keys="mod+k" />. Upload an
              image by dragging it onto the page or clicking the upload area. Adjust settings and
              download your result.
            </p>
          </section>

          {/* Keyboard shortcuts */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-foreground">
              <Keyboard className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              {SHORTCUTS.map((s, i) => (
                <div
                  key={s.keys}
                  className={`flex items-center justify-between px-3 py-2 text-sm ${
                    i !== SHORTCUTS.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <span className="text-muted-foreground">{s.description}</span>
                  <Kbd keys={s.keys} />
                </div>
              ))}
            </div>
          </section>

          {/* Links */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <Github className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Resources</h3>
            </div>
            <div className="flex flex-col gap-1.5">
              <a
                href="https://github.com/snapotter-hq/snapotter"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                GitHub Repository
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://github.com/snapotter-hq/snapotter/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Report an Issue
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://docs.snapotter.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="/api/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                API Reference (Swagger)
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </section>

          {/* Version */}
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            SnapOtter v{APP_VERSION}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kbd({ keys }: { keys: string }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-xs font-mono text-muted-foreground">
      {formatShortcut(keys)}
    </kbd>
  );
}
