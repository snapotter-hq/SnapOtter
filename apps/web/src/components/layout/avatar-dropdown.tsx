import { ExternalLink, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { clearToken } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AvatarDropdownProps {
  onSettingsClick: () => void;
  variant?: "light" | "dark";
}

export function AvatarDropdown({ onSettingsClick, variant = "light" }: AvatarDropdownProps) {
  const { t } = useTranslation();
  const { authEnabled } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const username = localStorage.getItem("snapotter-username") || "admin";
  const initial = username.charAt(0).toUpperCase();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      clearToken();
      localStorage.removeItem("snapotter-username");
      if (data.logoutUrl) {
        window.location.href = data.logoutUrl;
      } else {
        window.location.href = "/login";
      }
    } catch {
      clearToken();
      localStorage.removeItem("snapotter-username");
      window.location.href = "/login";
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-full bg-primary text-[#1a1814] flex items-center justify-center text-xs font-semibold hover:opacity-90 transition-opacity"
        aria-label={username}
        data-testid="user-menu"
      >
        {initial}
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 end-0 w-56 rounded-lg border shadow-lg z-50",
            variant === "dark"
              ? "bg-[#2a2a2a] border-[#444] text-[#e0e0e0]"
              : "bg-card border-border text-foreground",
          )}
        >
          {/* User info */}
          <div
            className={cn(
              "px-3 py-2.5 text-sm font-medium truncate",
              variant === "dark" ? "text-[#e0e0e0]" : "text-foreground",
            )}
          >
            {username}
          </div>

          <div className={cn("border-t", variant === "dark" ? "border-[#444]" : "border-border")} />

          {/* Settings */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSettingsClick();
            }}
            className={cn(
              "w-full text-start px-3 py-2 text-sm flex items-center gap-2 transition-colors",
              variant === "dark"
                ? "hover:bg-[#333] text-[#e0e0e0]"
                : "hover:bg-muted text-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            {t.common.settings}
          </button>

          {/* Docs */}
          <a
            href="https://docs.snapotter.com"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full text-start px-3 py-2 text-sm flex items-center gap-2 transition-colors",
              variant === "dark"
                ? "hover:bg-[#333] text-[#e0e0e0]"
                : "hover:bg-muted text-foreground",
            )}
          >
            <ExternalLink className="h-4 w-4" />
            {t.settings.about.docsLink}
          </a>

          {/* API Reference */}
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full text-start px-3 py-2 text-sm flex items-center gap-2 transition-colors",
              variant === "dark"
                ? "hover:bg-[#333] text-[#e0e0e0]"
                : "hover:bg-muted text-foreground",
            )}
          >
            <ExternalLink className="h-4 w-4" />
            {t.settings.about.apiRefLink}
          </a>

          {authEnabled && (
            <>
              <div
                className={cn("border-t", variant === "dark" ? "border-[#444]" : "border-border")}
              />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  handleLogout();
                }}
                className={cn(
                  "w-full text-start px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                  variant === "dark"
                    ? "hover:bg-[#333] text-[#e0e0e0]"
                    : "hover:bg-muted text-foreground",
                )}
              >
                <LogOut className="h-4 w-4" />
                {t.auth.logout}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
