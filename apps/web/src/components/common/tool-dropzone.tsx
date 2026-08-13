import type { Tool } from "@snapotter/shared";
import { FileImage, FolderOpen } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { toolAcceptsCameraPhotos } from "@/lib/camera-capture";
import { format } from "@/lib/format";
import { ICON_MAP } from "@/lib/icon-map";
import { MULTI_FILE_TOOLS } from "@/lib/tool-display-modes";
import { getToolDescription, getToolName } from "@/lib/tool-i18n";
import { Dropzone } from "./dropzone";

interface ToolDropzoneProps {
  tool: Tool;
  accept?: string;
  fileFilter?: (file: File) => boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  onUrlImport?: (file: File) => void;
}

const FORMATS_LIMIT = 8;

export function ToolDropzone({
  tool,
  accept,
  fileFilter,
  multiple,
  onFiles,
  onUrlImport,
}: ToolDropzoneProps) {
  const { t } = useTranslation();

  const IconComponent =
    (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ?? FileImage;

  const isMultiFile = MULTI_FILE_TOOLS.has(tool.id);
  const resolvedMultiple = multiple ?? isMultiFile;

  const formatsDisplay = useMemo(() => {
    const inputs = tool.acceptedInputs;
    if (!inputs || inputs.length === 0) return null;
    const formatted = inputs.map((ext) => ext.replace(/^\./, "").toUpperCase());
    if (formatted.length <= FORMATS_LIMIT) {
      return formatted.join(", ");
    }
    const visible = formatted.slice(0, FORMATS_LIMIT).join(", ");
    return `${visible} ${format(t.toolPage.andMore, { count: formatted.length - FORMATS_LIMIT })}`;
  }, [tool.acceptedInputs, t.toolPage.andMore]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg px-4 py-8">
      {/* Tool branding */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="p-3 rounded-xl bg-primary/10">
          <IconComponent className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          {getToolName(t, tool.id, tool.name)}
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          {getToolDescription(t, tool.id, tool.description)}
        </p>
      </div>

      {/* Dropzone */}
      <Dropzone
        onFiles={onFiles}
        onUrlImport={onUrlImport}
        accept={accept}
        multiple={resolvedMultiple}
        fileFilter={fileFilter}
        acceptDescription={formatsDisplay ?? undefined}
        cameraCapture={toolAcceptsCameraPhotos(tool.acceptedInputs)}
      />

      {/* Import from library */}
      <Link
        to="/files"
        state={{ selectForTool: tool.id, filterModality: tool.modality }}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <FolderOpen className="h-4 w-4" />
        {t.toolPage.importFromFiles}
      </Link>
    </div>
  );
}
