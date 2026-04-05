import { TOOLS } from "@stirling-image/shared";
import { FileImage } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiGetFileDetails,
  formatHeaders,
  getFileDownloadUrl,
  getFileThumbnailUrl,
  type UserFileDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";
import { useFilesPageStore } from "@/stores/files-page-store";

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

    const { checkedIds, files: allFiles } = useFilesPageStore.getState();

    // If multiple files are checked, open all of them; otherwise just the selected one
    const filesToOpen =
      checkedIds.size > 1
        ? allFiles.filter((f) => checkedIds.has(f.id))
        : [{ id: details.id, originalName: details.originalName, mimeType: details.mimeType }];

    const downloaded = await Promise.all(
      filesToOpen.map(async (f) => {
        const res = await fetch(getFileDownloadUrl(f.id), {
          headers: formatHeaders(),
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return { file: new File([blob], f.originalName, { type: f.mimeType }), serverId: f.id };
      }),
    );

    const valid = downloaded.filter((d): d is NonNullable<typeof d> => d !== null);
    if (valid.length === 0) return;

    setFiles(valid.map((d) => d.file));
    navigate("/");

    // Set serverFileId on each entry so tool processing creates new versions
    setTimeout(() => {
      const store = useFileStore.getState();
      for (let i = 0; i < valid.length; i++) {
        if (store.entries[i]) {
          store.updateEntry(i, { serverFileId: valid[i].serverId });
        }
      }
    }, 0);
  }

  if (!selectedFileId) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center text-muted-foreground",
          mobile
            ? "flex flex-col gap-4"
            : "w-60 border-l border-border p-4 shrink-0 hidden lg:flex flex-col",
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
          mobile
            ? "flex flex-col gap-4"
            : "w-60 border-l border-border p-4 shrink-0 hidden lg:flex flex-col",
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
        "overflow-y-auto",
        mobile
          ? "flex flex-col gap-4"
          : "w-60 border-l border-border p-4 shrink-0 hidden lg:flex flex-col",
      )}
    >
      {/* Thumbnail */}
      <div className={cn("border-b border-border", mobile ? "" : "pb-4")}>
        <img
          src={getFileThumbnailUrl(details.id)}
          alt={details.originalName}
          className="w-full rounded-lg object-contain max-h-48 bg-muted"
        />
      </div>

      {/* Details card */}
      <div className="flex-1">
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-blue-500/10 border-b border-border px-3 py-2">
            <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400">File Details</h4>
          </div>
          <div className="divide-y divide-border">
            <DetailRow label="Name" value={details.originalName} />
            <DetailRow
              label="Format"
              value={details.mimeType.replace("image/", "").toUpperCase()}
            />
            <DetailRow label="Size" value={formatSize(details.size)} />
            <DetailRow
              label="Dimensions"
              value={details.width && details.height ? `${details.width} × ${details.height}` : "—"}
            />
            <DetailRow label="Version" value={`V${details.version}`} />
            <DetailRow
              label="Tools Used"
              value={
                details.toolChain.length > 0 ? details.toolChain.map(toolName).join(", ") : "None"
              }
            />
          </div>
        </div>
      </div>

      {/* Open File button */}
      <div className={cn("border-t border-border", mobile ? "pt-3" : "pt-4")}>
        <button
          type="button"
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
