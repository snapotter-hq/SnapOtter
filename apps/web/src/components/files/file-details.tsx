import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileImage } from "lucide-react";
import { TOOLS } from "@stirling-image/shared";
import {
  apiGetFileDetails,
  getFileThumbnailUrl,
  getFileDownloadUrl,
  type UserFileDetail,
} from "@/lib/api";
import { useFilesPageStore } from "@/stores/files-page-store";
import { useFileStore } from "@/stores/file-store";
import { cn } from "@/lib/utils";

function toolName(toolId: string): string {
  return TOOLS.find((t) => t.id === toolId)?.name ?? toolId;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileDetailsProps {
  mobile?: boolean;
}

export function FileDetails({ mobile = false }: FileDetailsProps) {
  const { selectedFileId } = useFilesPageStore();
  const setFiles = useFileStore((s) => s.setFiles);
  const navigate = useNavigate();

  const [details, setDetails] = useState<UserFileDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!selectedFileId) {
      setDetails(null);
      return;
    }
    setLoadingDetails(true);
    apiGetFileDetails(selectedFileId)
      .then(setDetails)
      .catch(() => setDetails(null))
      .finally(() => setLoadingDetails(false));
  }, [selectedFileId]);

  async function handleOpenFile() {
    if (!details) return;
    const res = await fetch(getFileDownloadUrl(details.id), {
      headers: { Authorization: `Bearer ${localStorage.getItem("stirling-token") || ""}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const file = new File([blob], details.originalName, { type: details.mimeType });
    setFiles([file]);
    navigate("/");
  }

  if (!selectedFileId) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center text-muted-foreground",
          mobile ? "flex-1" : "w-72 shrink-0 border-l border-border",
        )}
      >
        <FileImage className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">Select a file to view details</p>
      </div>
    );
  }

  if (loadingDetails) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          mobile ? "flex-1" : "w-72 shrink-0 border-l border-border",
        )}
      >
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!details) return null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-y-auto",
        mobile ? "flex-1" : "w-72 shrink-0 border-l border-border",
      )}
    >
      {/* Thumbnail */}
      <div className="p-4 border-b border-border">
        <img
          src={getFileThumbnailUrl(details.id)}
          alt={details.originalName}
          className="w-full rounded-lg object-contain max-h-48 bg-muted"
        />
      </div>

      {/* Details card */}
      <div className="flex-1 p-4">
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-blue-500/10 border-b border-border px-3 py-2">
            <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400">File Details</h4>
          </div>
          <div className="divide-y divide-border">
            <DetailRow label="Name" value={details.originalName} />
            <DetailRow label="Format" value={details.mimeType.replace("image/", "").toUpperCase()} />
            <DetailRow label="Size" value={formatSize(details.size)} />
            <DetailRow
              label="Dimensions"
              value={
                details.width && details.height
                  ? `${details.width} × ${details.height}`
                  : "—"
              }
            />
            <DetailRow label="Version" value={`V${details.version}`} />
            <DetailRow
              label="Tools Used"
              value={
                details.toolChain.length > 0
                  ? details.toolChain.map(toolName).join(", ")
                  : "None"
              }
            />
          </div>
        </div>
      </div>

      {/* Open File button */}
      <div className="p-4 border-t border-border">
        <button
          onClick={handleOpenFile}
          className="w-full px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Open File
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2 px-3 py-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-foreground text-right break-all">{value}</span>
    </div>
  );
}
