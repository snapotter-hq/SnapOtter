import { useParams } from "react-router-dom";
import { useMemo, useCallback } from "react";
import { TOOLS } from "@stirling-image/shared";
import { AppLayout } from "@/components/layout/app-layout";
import { Dropzone } from "@/components/common/dropzone";
import { useFileStore } from "@/stores/file-store";
import { ResizeSettings } from "@/components/tools/resize-settings";
import { CropSettings } from "@/components/tools/crop-settings";
import { RotateSettings } from "@/components/tools/rotate-settings";
import { ConvertSettings } from "@/components/tools/convert-settings";
import { CompressSettings } from "@/components/tools/compress-settings";
import { StripMetadataSettings } from "@/components/tools/strip-metadata-settings";
import { ColorSettings } from "@/components/tools/color-settings";
import * as icons from "lucide-react";

const COLOR_TOOL_IDS = new Set([
  "brightness-contrast",
  "saturation",
  "color-channels",
  "color-effects",
]);

function ToolSettingsPanel({ toolId }: { toolId: string }) {
  if (toolId === "resize") return <ResizeSettings />;
  if (toolId === "crop") return <CropSettings />;
  if (toolId === "rotate") return <RotateSettings />;
  if (toolId === "convert") return <ConvertSettings />;
  if (toolId === "compress") return <CompressSettings />;
  if (toolId === "strip-metadata") return <StripMetadataSettings />;
  if (COLOR_TOOL_IDS.has(toolId)) return <ColorSettings toolId={toolId} />;

  return (
    <p className="text-xs text-muted-foreground italic">
      Settings for this tool are coming soon.
    </p>
  );
}

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const tool = useMemo(() => TOOLS.find((t) => t.id === toolId), [toolId]);
  const { files, setFiles, reset } = useFileStore();

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      reset();
      setFiles(newFiles);
    },
    [setFiles, reset],
  );

  if (!tool) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Tool not found
        </div>
      </AppLayout>
    );
  }

  const IconComponent =
    (
      icons as unknown as Record<
        string,
        React.ComponentType<{ className?: string }>
      >
    )[tool.icon] || icons.FileImage;

  const hasFile = files.length > 0;

  return (
    <AppLayout showToolPanel={false}>
      <div className="flex h-full w-full">
        {/* Tool Settings Panel */}
        <div className="w-72 border-r border-border p-4 space-y-4 overflow-y-auto shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <IconComponent className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg text-foreground">
              {tool.name}
            </h2>
          </div>

          {/* File info */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Files
            </h3>
            {hasFile ? (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs text-foreground bg-muted rounded px-2 py-1"
                  >
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => reset()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Drop or upload an image to get started
              </p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Tool-specific settings */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Settings
            </h3>
            <ToolSettingsPanel toolId={tool.id} />
          </div>
        </div>

        {/* Dropzone / Preview */}
        <div className="flex-1 flex items-center justify-center p-6">
          <Dropzone
            onFiles={handleFiles}
            accept="image/*"
            multiple={false}
          />
        </div>
      </div>
    </AppLayout>
  );
}
