import { Globe, Menu, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { Dropzone } from "../common/dropzone";
import { OtterLogo } from "../common/otter-logo";
import { HelpDialog } from "../help/help-dialog";
import { SettingsDialog } from "../settings/settings-dialog";
import { AiInstallIndicator } from "./ai-install-indicator";
import { Footer } from "./footer";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { Sidebar } from "./sidebar";
import { ToolPanel } from "./tool-panel";

interface AppLayoutProps {
  children?: React.ReactNode;
  showToolPanel?: boolean;
  onFiles?: (files: File[]) => void;
  onUrlImport?: (file: File) => void;
}

export function AppLayout({
  children,
  showToolPanel = true,
  onFiles,
  onUrlImport,
}: AppLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mobileSidebarRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mobileSidebarRef, mobileSidebarOpen);
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const isMobile = useMobile();
  const connectionStatus = useConnectionStore((s) => s.status);
  const bannerVisible = connectionStatus !== "connected";

  return (
    <div
      className={cn(
        "flex h-screen bg-background text-foreground overflow-hidden",
        bannerVisible && "pt-9",
      )}
    >
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
          <div
            ref={mobileSidebarRef}
            role="dialog"
            aria-modal="true"
            aria-label={t.a11y.openSidebar}
            className="fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border shadow-xl animate-in slide-in-from-left"
          >
            <div className="flex items-center justify-between p-3 border-b border-border">
              <div className="flex items-center gap-2">
                <OtterLogo className="h-5 w-5 text-primary" />
                <span className="text-sm font-bold text-foreground">
                  <span className="text-primary">SnapOtter</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-2.5 rounded-lg hover:bg-muted"
                aria-label={t.a11y.closeSidebar}
              >
                <X className="h-5 w-5" />
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
            <div className="border-t border-border p-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground border-none outline-none"
                >
                  {supportedLocales.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.nativeName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </>
      )}

      {/* Mobile top bar */}
      {isMobile && (
        <div
          className={cn(
            "fixed left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2 flex items-center gap-3",
            bannerVisible ? "top-9" : "top-0",
          )}
        >
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2.5 -ms-1 rounded-lg hover:bg-muted"
            aria-label={t.a11y.openSidebar}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <OtterLogo className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold text-foreground">
              <span className="text-primary">SnapOtter</span>
            </span>
          </div>
        </div>
      )}

      {showToolPanel && !isMobile && <ToolPanel />}

      <main
        id="main-content"
        className={cn("flex-1 flex flex-col overflow-hidden", isMobile && "pt-12 pb-20")}
      >
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
          {children || <Dropzone onFiles={onFiles} onUrlImport={onUrlImport} accept="image/*" />}
        </div>
      </main>

      {!isMobile && <Footer />}

      {/* Mobile bottom nav */}
      {isMobile && <MobileBottomNav onSettingsClick={() => setSettingsOpen(true)} />}

      {/* Settings dialog */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Help dialog */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Global AI install progress */}
      <AiInstallIndicator />
    </div>
  );
}
