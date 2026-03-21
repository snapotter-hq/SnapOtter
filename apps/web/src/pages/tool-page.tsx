import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { TOOLS } from "@stirling-image/shared";
import { AppLayout } from "@/components/layout/app-layout";
import { Dropzone } from "@/components/common/dropzone";
import * as icons from "lucide-react";

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const tool = useMemo(() => TOOLS.find((t) => t.id === toolId), [toolId]);

  if (!tool) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Tool not found
        </div>
      </AppLayout>
    );
  }

  const IconComponent = (icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[tool.icon] || icons.FileImage;

  return (
    <AppLayout showToolPanel={false}>
      <div className="flex h-full w-full">
        {/* Tool Settings Panel */}
        <div className="w-72 border-r border-border p-4 space-y-4 overflow-y-auto shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <IconComponent className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg text-foreground">{tool.name}</h2>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Files</h3>
            <button className="flex items-center gap-2 text-sm text-primary hover:underline">
              <icons.Upload className="h-4 w-4" />
              Upload
            </button>
          </div>

          <div className="border-t border-border" />

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Settings</h3>
            <p className="text-xs text-muted-foreground italic">{tool.description}</p>
          </div>

          <div className="border-t border-border" />

          <button
            disabled
            className="w-full py-2.5 rounded-lg bg-muted text-muted-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tool.name}
          </button>
        </div>

        {/* Dropzone */}
        <div className="flex-1 flex items-center justify-center p-6">
          <Dropzone />
        </div>
      </div>
    </AppLayout>
  );
}
