import { TOOLS } from "@snapotter/shared";
import { ArrowRight, ChevronDown, ChevronRight, Download, FileImage, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatFileSize, triggerDownload } from "@/lib/download";
import { ICON_MAP } from "@/lib/icon-map";
import { getSuggestedTools } from "@/lib/suggested-tools";

interface ReviewPanelProps {
  filename: string;
  fileSize: number;
  fileType: string;
  downloadUrl: string;
  previewUrl?: string;
  onUndo: () => void;
  currentToolId: string;
}

export function ReviewPanel({
  filename,
  fileSize,
  fileType,
  downloadUrl,
  previewUrl,
  onUndo,
  currentToolId,
}: ReviewPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(true);
  const navigate = useNavigate();

  const suggestedToolIds = useMemo(() => getSuggestedTools(currentToolId), [currentToolId]);

  const suggestedTools = useMemo(
    () =>
      suggestedToolIds
        .map((id) => TOOLS.find((t) => t.id === id))
        .filter((t): t is (typeof TOOLS)[number] => t !== undefined),
    [suggestedToolIds],
  );

  const timestamp = useMemo(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, []);

  const handleDownload = () => {
    triggerDownload(downloadUrl, filename);
  };

  return (
    <div className="space-y-3">
      <div className="border-t border-border" />

      {/* Review header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span>Review</span>
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {isExpanded && (
        <div className="space-y-3">
          {/* Preview thumbnail */}
          {previewUrl && (
            <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
              <img
                src={previewUrl}
                alt="Processed result"
                className="w-full h-auto max-h-32 object-contain"
              />
            </div>
          )}

          {/* File metadata */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="truncate text-foreground font-medium">{filename}</p>
            <p>Size: {formatFileSize(fileSize)}</p>
            <p>Type: {fileType}</p>
            <p>Processed: {timestamp}</p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onUndo}
              className="flex-1 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center gap-1.5 text-xs font-medium"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>

          {/* Suggested tools */}
          {suggestedTools.length > 0 && (
            <div className="space-y-2">
              <div className="border-t border-border pt-2" />
              <button
                type="button"
                onClick={() => setIsSuggestionsExpanded(!isSuggestionsExpanded)}
                className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <span>Continue editing</span>
                {isSuggestionsExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>

              {isSuggestionsExpanded && (
                <div className="space-y-1">
                  {suggestedTools.map((tool) => {
                    const ToolIcon =
                      (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ??
                      FileImage;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => navigate(tool.route)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted group"
                      >
                        <ToolIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 text-left">{tool.name}</span>
                        <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
