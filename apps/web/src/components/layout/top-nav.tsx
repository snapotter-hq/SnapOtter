import { ANALYTICS_EVENTS } from "@snapotter/shared";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Globe,
  Heart,
  HelpCircle,
  LayoutGrid,
  MessageSquare,
  Moon,
  Sun,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";
import { useMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { ImageEditIcon } from "../common/image-edit-icon";
import { OtterLogo } from "../common/otter-logo";
import { AvatarDropdown } from "./avatar-dropdown.js";

interface TopNavProps {
  variant?: "light" | "dark";
  breadcrumb?: { modality?: string; modalityTab?: string; toolName?: string };
  onHelpClick: () => void;
  onFeedbackClick?: () => void;
  onSettingsClick: () => void;
}

interface NavLinkItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

function useNavLinks(): NavLinkItem[] {
  const { t } = useTranslation();
  return [
    { label: t.sidebar.tools, href: "/", icon: LayoutGrid },
    { label: t.sidebar.automate, href: "/automate", icon: Workflow },
    { label: t.sidebar.editor, href: "/editor", icon: ImageEditIcon, badge: "Beta" },
    { label: t.sidebar.files, href: "/files", icon: FolderOpen },
  ];
}

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function TopNav({
  variant = "light",
  breadcrumb,
  onHelpClick,
  onFeedbackClick,
  onSettingsClick,
}: TopNavProps) {
  const location = useLocation();
  const isMobile = useMobile();
  const { t } = useTranslation();
  const navLinks = useNavLinks();

  const isDark = variant === "dark";

  // Mobile layout
  if (isMobile) {
    return (
      <header
        className={cn(
          "flex items-center h-12 px-4 border-b shrink-0",
          isDark ? "bg-[#222] border-[#333]" : "bg-background border-border",
        )}
      >
        {breadcrumb ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Link
              to="/"
              className={cn(
                "shrink-0",
                isDark
                  ? "text-[#aaa] hover:text-[#e0e0e0]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <span className={cn("text-sm truncate", isDark ? "text-[#e0e0e0]" : "text-foreground")}>
              {breadcrumb.modality && (
                <span className={isDark ? "text-[#aaa]" : "text-muted-foreground"}>
                  {breadcrumb.modalityTab ? (
                    <Link to={`/?section=${breadcrumb.modalityTab}`} className="hover:underline">
                      {breadcrumb.modality}
                    </Link>
                  ) : (
                    breadcrumb.modality
                  )}
                  {" / "}
                </span>
              )}
              <span className="font-medium">{breadcrumb.toolName}</span>
            </span>
          </div>
        ) : (
          <Link to="/" className="shrink-0" aria-label={t.a11y.homeLink}>
            <OtterLogo className="h-7 w-7" />
          </Link>
        )}

        <div className="flex-1" />

        {onFeedbackClick && (
          <button
            type="button"
            onClick={onFeedbackClick}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isDark
                ? "text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#333]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            aria-label={t.feedback.navLabel}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        )}

        <SponsorButton isDark={isDark} compact />

        <button
          type="button"
          onClick={onHelpClick}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            isDark
              ? "text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#333]"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
          aria-label={t.sidebar.help}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </header>
    );
  }

  // Desktop layout
  return (
    <header
      className={cn(
        "flex items-center h-12 px-4 border-b shrink-0",
        isDark ? "bg-[#222] border-[#333]" : "bg-background border-border",
      )}
    >
      {/* Left: Logo */}
      <Link to="/" className="shrink-0 me-4" aria-label={t.a11y.homeLink}>
        <OtterLogo className="h-7 w-7" />
      </Link>

      {/* Center-left: Breadcrumb or nav links */}
      {breadcrumb ? (
        <nav className="flex items-center gap-1 text-sm min-w-0" aria-label={t.a11y.navigationMenu}>
          <Link
            to="/"
            className={cn(
              "hover:underline shrink-0",
              isDark
                ? "text-[#aaa] hover:text-[#e0e0e0]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.sidebar.tools}
          </Link>
          {breadcrumb.modality && (
            <>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  isDark ? "text-[#666]" : "text-muted-foreground/50",
                )}
              />
              {breadcrumb.modalityTab ? (
                <Link
                  to={`/?section=${breadcrumb.modalityTab}`}
                  className={cn(
                    "shrink-0 hover:underline",
                    isDark
                      ? "text-[#aaa] hover:text-[#e0e0e0]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {breadcrumb.modality}
                </Link>
              ) : (
                <span className={cn("shrink-0", isDark ? "text-[#aaa]" : "text-muted-foreground")}>
                  {breadcrumb.modality}
                </span>
              )}
            </>
          )}
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isDark ? "text-[#666]" : "text-muted-foreground/50",
            )}
          />
          <span
            className={cn("font-medium truncate", isDark ? "text-[#e0e0e0]" : "text-foreground")}
          >
            {breadcrumb.toolName}
          </span>
        </nav>
      ) : (
        <nav className="flex items-center gap-1" aria-label={t.a11y.navigationMenu}>
          {navLinks.map((link) => {
            const active = isLinkActive(location.pathname, link.href);
            return (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? isDark
                      ? "bg-[#333] text-[#e0e0e0]"
                      : "bg-muted text-foreground"
                    : isDark
                      ? "text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#333]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {link.label}
                {link.badge && (
                  <span className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-primary/15 text-primary align-middle">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: theme + language + help + avatar */}
      <div className="flex items-center gap-0.5">
        {!isMobile && <ThemeToggle isDark={isDark} />}
        {!isMobile && <LanguageSelector isDark={isDark} />}

        {onFeedbackClick && (
          <button
            type="button"
            onClick={onFeedbackClick}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors",
              isDark
                ? "text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#333]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            aria-label={t.feedback.navLabel}
          >
            <MessageSquare className="h-4 w-4" />
            {t.feedback.navButtonLabel}
          </button>
        )}

        <button
          type="button"
          onClick={onHelpClick}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            isDark
              ? "text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#333]"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
          aria-label={t.sidebar.help}
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        <SponsorButton isDark={isDark} />

        {!isMobile && <AvatarDropdown onSettingsClick={onSettingsClick} variant={variant} />}
      </div>
    </header>
  );
}

const SPONSOR_URL = "https://github.com/sponsors/snapotter-hq";

function SponsorButton({ isDark, compact = false }: { isDark: boolean; compact?: boolean }) {
  const { t } = useTranslation();

  const handleClick = () => {
    import("@/lib/analytics").then(({ track }) => {
      track(ANALYTICS_EVENTS.SPONSOR_CLICKED);
    });
  };

  if (compact) {
    return (
      <a
        href={SPONSOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        aria-label={t.a11y.sponsorLink}
        title={t.a11y.sponsorLink}
        className={cn(
          "p-1.5 rounded-md transition-colors text-primary",
          isDark ? "hover:bg-[#333]" : "hover:bg-muted",
        )}
      >
        <Heart className="h-4 w-4 fill-current" />
      </a>
    );
  }

  return (
    <a
      href={SPONSOR_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="ms-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-[#1a1814] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
    >
      <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      {t.sidebar.sponsor}
    </a>
  );
}

function ThemeToggle({ isDark }: { isDark: boolean }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "p-1.5 rounded-md transition-colors",
        isDark
          ? "text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#333]"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
      title="Toggle theme"
    >
      {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function LanguageSelector({ isDark }: { isDark: boolean }) {
  const { locale, setLocale, supportedLocales } = useTranslation();
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
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors",
          isDark
            ? "text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#333]"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
        title="Language"
      >
        <Globe className="h-3.5 w-3.5" />
        {current?.nativeName ?? "English"}
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 end-0 w-48 max-h-72 overflow-y-auto rounded-lg border shadow-lg z-50",
            isDark ? "bg-[#2a2a2a] border-[#444]" : "bg-card border-border",
          )}
        >
          {supportedLocales.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
              className={cn(
                "w-full text-start px-3 py-1.5 text-sm transition-colors flex items-center justify-between",
                isDark ? "hover:bg-[#333] text-[#e0e0e0]" : "hover:bg-muted text-foreground",
              )}
            >
              <span className={l.code === locale ? "font-medium" : ""}>{l.nativeName}</span>
              {l.code === locale && (
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
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
