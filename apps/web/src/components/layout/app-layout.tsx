import { useEffect, useState } from "react";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { useSettingsStore } from "@/stores/settings-store";
import { FeedbackDialog } from "../feedback/feedback-dialog";
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const isMobile = useMobile();
  const connectionStatus = useConnectionStore((s) => s.status);
  const bannerVisible = connectionStatus !== "connected";

  // Load global settings (disabled tools, experimental flag, default theme) on
  // every authenticated page, not just the home grid. Without this, navigating
  // directly to a tool URL leaves disabledTools empty, so an admin-disabled tool
  // renders normally instead of showing the disabled message. fetch() is a
  // no-op once loaded, so this is cheap on subsequent navigations.
  const fetchSettings = useSettingsStore((s) => s.fetch);
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    // h-dvh (dynamic viewport height), not h-screen/100vh: on mobile browsers
    // 100vh is the *tall* viewport (URL bar retracted), so with overflow-hidden
    // the fixed bottom nav and the in-flow "Process" peek bar render below the
    // visible area and can't be scrolled to after a file is uploaded. dvh tracks
    // the actual visible viewport, keeping the bottom controls reachable.
    <div
      className={cn(
        "flex flex-col h-dvh bg-background text-foreground overflow-hidden",
        bannerVisible && "pt-9",
      )}
    >
      {/* Top navigation bar */}
      <TopNav
        variant={navVariant}
        breadcrumb={breadcrumb}
        onHelpClick={() => setHelpOpen(true)}
        onFeedbackClick={() => setFeedbackOpen(true)}
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

      {/* Feedback dialog */}
      <FeedbackDialog open={feedbackOpen} source="global" onClose={() => setFeedbackOpen(false)} />

      {/* Global AI install progress */}
      <AiInstallIndicator />
    </div>
  );
}
