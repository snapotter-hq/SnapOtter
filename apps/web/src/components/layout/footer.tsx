import { Moon, Sun, Globe } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function Footer() {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 z-50">
      <button
        onClick={toggleTheme}
        className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
        title="Toggle Theme"
      >
        {resolvedTheme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </button>
      <button
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-sm"
        title="Language"
      >
        <Globe className="h-4 w-4" />
        English
      </button>
    </div>
  );
}
