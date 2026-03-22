import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutGrid,
  Workflow,
  FolderOpen,
  Settings as SettingsIcon,
  Menu,
  X,
} from "lucide-react";
import { Sidebar } from "./sidebar";
import { ToolPanel } from "./tool-panel";
import { Footer } from "./footer";
import { Dropzone } from "../common/dropzone";
import { SettingsDialog } from "../settings/settings-dialog";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children?: React.ReactNode;
  showToolPanel?: boolean;
  onFiles?: (files: File[]) => void;
}

export function AppLayout({ children, showToolPanel = true, onFiles }: AppLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useMobile();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sidebar onSettingsClick={() => setSettingsOpen(true)} />
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border shadow-xl animate-in slide-in-from-left">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="text-sm font-bold text-foreground">
                Stirling <span className="text-primary">Image</span>
              </span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div onClick={() => setMobileSidebarOpen(false)}>
              <Sidebar
                onSettingsClick={() => {
                  setMobileSidebarOpen(false);
                  setSettingsOpen(true);
                }}
                expanded
              />
            </div>
          </div>
        </>
      )}

      {/* Mobile top bar */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2 flex items-center gap-3">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-muted"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-foreground">
            Stirling <span className="text-primary">Image</span>
          </span>
        </div>
      )}

      {showToolPanel && !isMobile && <ToolPanel />}

      <main
        className={cn(
          "flex-1 flex flex-col overflow-hidden",
          isMobile && "pt-12 pb-16"
        )}
      >
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
            onClick={() => setSettingsOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground"
          >
            <SettingsIcon className="h-5 w-5" />
            <span className="text-[10px]">Settings</span>
          </button>
        </nav>
      )}

      {/* Settings dialog */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
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
