import { Globe, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useTheme } from "@/hooks/use-theme";

function LanguageSelector() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const current = supportedLocales.find((l) => l.code === locale);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-sm"
        title="Language"
      >
        <Globe className="h-4 w-4" />
        {current?.nativeName ?? "English"}
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 right-0 w-56 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg z-50">
          {supportedLocales.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
              className="w-full text-start px-3 py-2 text-sm hover:bg-muted flex items-center justify-between transition-colors"
            >
              <span className={l.code === locale ? "font-medium" : ""}>{l.nativeName}</span>
              {l.code === locale && (
                <svg
                  className="h-4 w-4 text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  role="img"
                  aria-label={t.a11y.selected}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Footer() {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 z-50">
      <button
        type="button"
        onClick={toggleTheme}
        className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
        title="Toggle Theme"
      >
        {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <LanguageSelector />
    </div>
  );
}
