import { FolderOpen, LayoutGrid, Menu, Settings as SettingsIcon, Workflow, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMobile } from "@/hooks/use-mobile";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Dropzone } from "../common/dropzone";
import { HelpDialog } from "../help/help-dialog";
import { SettingsDialog } from "../settings/settings-dialog";
import { Footer } from "./footer";
import { Sidebar } from "./sidebar";
import { ToolPanel } from "./tool-panel";

function GemLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="70,16 100,48 70,60 40,48" fill="currentColor" opacity="1" />
      <polygon points="40,48 70,60 70,124 22,60" fill="currentColor" opacity="0.7" />
      <polygon points="100,48 70,60 70,124 118,60" fill="currentColor" opacity="0.5" />
      <polygon points="70,16 40,48 22,60" fill="currentColor" opacity="0.85" />
      <polygon points="70,16 100,48 118,60" fill="currentColor" opacity="0.65" />
      <polygon
        points="70,16 118,60 70,124 22,60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <line
        x1="40"
        y1="48"
        x2="100"
        y2="48"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.4"
      />
    </svg>
  );
}

interface AppLayoutProps {
  children?: React.ReactNode;
  showToolPanel?: boolean;
  onFiles?: (files: File[]) => void;
}

export function AppLayout({ children, showToolPanel = true, onFiles }: AppLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useMobile();
  const [customLogo, setCustomLogo] = useState(false);

  useEffect(() => {
    apiGet<{ settings: Record<string, string> }>("/v1/settings")
      .then((data) => setCustomLogo(data.settings.customLogo === "true"))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sidebar
          onSettingsClick={() => setSettingsOpen(true)}
          onHelpClick={() => setHelpOpen(true)}
        />
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && mobileSidebarOpen && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm cursor-default"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border shadow-xl animate-in slide-in-from-left">
            <div className="flex items-center justify-between p-3 border-b border-border">
              {customLogo ? (
                <img
                  src="/api/v1/settings/logo"
                  className="h-6 w-6 rounded object-contain"
                  alt="Logo"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <GemLogo className="h-5 w-5 text-primary" />
                  <span className="text-sm font-bold text-foreground">
                    Stirling <span className="text-primary">Image</span>
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Sidebar
              onSettingsClick={() => {
                setMobileSidebarOpen(false);
                setSettingsOpen(true);
              }}
              onHelpClick={() => {
                setMobileSidebarOpen(false);
                setHelpOpen(true);
              }}
              onNavClick={() => setMobileSidebarOpen(false)}
              expanded
            />
          </div>
        </>
      )}

      {/* Mobile top bar */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-muted"
          >
            <Menu className="h-5 w-5" />
          </button>
          {customLogo ? (
            <img
              src="/api/v1/settings/logo"
              className="h-6 w-6 rounded object-contain"
              alt="Logo"
            />
          ) : (
            <div className="flex items-center gap-2">
              <GemLogo className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-foreground">
                Stirling <span className="text-primary">Image</span>
              </span>
            </div>
          )}
        </div>
      )}

      {showToolPanel && !isMobile && <ToolPanel />}

      <main className={cn("flex-1 flex flex-col overflow-hidden", isMobile && "pt-12 pb-16")}>
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
          {children || <Dropzone onFiles={onFiles} accept="image/*" />}
        </div>
        {!isMobile && (
          <div className="text-center text-xs text-muted-foreground py-2 border-t border-border">
            Privacy Policy
          </div>
        )}
      </main>

      {!isMobile && <Footer />}

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border flex items-center justify-around px-2 py-1.5">
          <MobileNavItem icon={LayoutGrid} label="Tools" href="/" />
          <MobileNavItem icon={Workflow} label="Automate" href="/automate" />
          <MobileNavItem icon={FolderOpen} label="Files" href="/files" />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground"
          >
            <SettingsIcon className="h-5 w-5" />
            <span className="text-[10px]">Settings</span>
          </button>
        </nav>
      )}

      {/* Settings dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Help dialog */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function MobileNavItem({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px]">{label}</span>
    </Link>
  );
}
