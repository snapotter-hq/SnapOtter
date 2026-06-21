import { useState } from "react";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { HelpDialog } from "../help/help-dialog";
import { SettingsDialog } from "../settings/settings-dialog";
import { AiInstallIndicator } from "./ai-install-indicator";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { TopNav } from "./top-nav.js";

interface AppLayoutProps {
  children?: React.ReactNode;
  breadcrumb?: { modality?: string; modalityTab?: string; toolName?: string };
  navVariant?: "light" | "dark";
}

export function AppLayout({ children, breadcrumb, navVariant }: AppLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const isMobile = useMobile();
  const connectionStatus = useConnectionStore((s) => s.status);
  const bannerVisible = connectionStatus !== "connected";

  return (
    <div
      className={cn(
        "flex flex-col h-screen bg-background text-foreground overflow-hidden",
        bannerVisible && "pt-9",
      )}
    >
      {/* Top navigation bar */}
      <TopNav
        variant={navVariant}
        breadcrumb={breadcrumb}
        onHelpClick={() => setHelpOpen(true)}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      {/* Main content area */}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn("flex-1 overflow-y-auto", isMobile && "pb-20")}
      >
        {children}
      </main>

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
