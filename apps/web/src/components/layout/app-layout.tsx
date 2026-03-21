import { useState } from "react";
import { Sidebar } from "./sidebar";
import { ToolPanel } from "./tool-panel";
import { Footer } from "./footer";
import { Dropzone } from "../common/dropzone";

interface AppLayoutProps {
  children?: React.ReactNode;
  showToolPanel?: boolean;
}

export function AppLayout({ children, showToolPanel = true }: AppLayoutProps) {
  const [_settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar onSettingsClick={() => setSettingsOpen(true)} />
      {showToolPanel && <ToolPanel />}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
          {children || <Dropzone />}
        </div>
        <div className="text-center text-xs text-muted-foreground py-2 border-t border-border">
          Privacy Policy
        </div>
      </main>
      <Footer />
    </div>
  );
}
