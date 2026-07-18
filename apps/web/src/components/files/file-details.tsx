import { TOOLS } from "@snapotter/shared";
import { FileImage, FileText, ImageIcon, Music, Play, Video } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";
import {
  apiGetFileDetails,
  formatHeaders,
  getFileDownloadUrl,
  getFilePreviewUrl,
  getFileThumbnailUrl,
  type UserFileDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";
import { useFilesPageStore } from "@/stores/files-page-store";

const WaveformPlayer = lazy(() =>
  import("@/components/common/waveform-player").then((m) => ({ default: m.WaveformPlayer })),
);

function AuthImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    fetch(src, { headers: formatHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });
    return () => {
      revoked = true;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [src]);

  if (failed) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/50", className)}>
        <ImageIcon className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/30", className)}>
        <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <img src={blobUrl} alt={alt} className={className} />;
}

const NATIVE_VIDEO = new Set(["mp4", "webm", "ogg", "ogv", "m4v"]);
const NATIVE_AUDIO = new Set(["mp3", "wav", "ogg", "oga", "opus", "aac", "m4a", "flac", "webm"]);

const OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

function isNativePlayable(mimeType: string, filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType.startsWith("video/")) return NATIVE_VIDEO.has(ext);
  if (mimeType.startsWith("audio/")) return NATIVE_AUDIO.has(ext);
  return false;
}

function FilePreview({
  fileId,
  mimeType,
  name,
}: {
  fileId: string;
  mimeType: string;
  name: string;
}) {
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const isMedia = mimeType.startsWith("video/") || mimeType.startsWith("audio/");
  const nativePlayable = isMedia && isNativePlayable(mimeType, name);
  const isPdf = mimeType === "application/pdf";
  const isOfficeDoc = OFFICE_MIMES.has(mimeType);

  // Fetch native-playable media or PDF directly from the download endpoint.
  // Also resets server-side preview state when the file changes.
  useEffect(() => {
    // Reset server-side preview state on every file change
    setPreviewSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewLoading(false);
    setPreviewError(false);

    if (isPdf) {
      let revoked = false;
      fetch(getFileDownloadUrl(fileId), { headers: formatHeaders() })
        .then((res) => res.blob())
        .then((blob) => {
          if (!revoked) setMediaSrc(URL.createObjectURL(blob));
        })
        .catch(() => {});
      return () => {
        revoked = true;
        setMediaSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      };
    }

    if (!isMedia || !nativePlayable) return;
    let revoked = false;
    const url = getFileDownloadUrl(fileId);
    fetch(url, { headers: formatHeaders() })
      .then((res) => res.blob())
      .then((blob) => {
        if (!revoked) setMediaSrc(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => {
      revoked = true;
      setMediaSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [isMedia, nativePlayable, isPdf, fileId]);

  const handleGeneratePreview = useCallback(() => {
    setPreviewLoading(true);
    setPreviewError(false);
    fetch(getFilePreviewUrl(fileId), { headers: formatHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error("Preview generation failed");
        return res.blob();
      })
      .then((blob) => {
        setPreviewSrc(URL.createObjectURL(blob));
      })
      .catch(() => {
        setPreviewError(true);
      })
      .finally(() => {
        setPreviewLoading(false);
      });
  }, [fileId]);

  // PDF files -- render inline in iframe
  if (isPdf) {
    return mediaSrc ? (
      <iframe src={mediaSrc} className="w-full h-48 rounded-lg border border-border" title={name} />
    ) : (
      <div className="w-full h-48 rounded-lg bg-muted flex items-center justify-center">
        <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Office documents -- convert to PDF via preview endpoint
  if (isOfficeDoc) {
    if (previewSrc) {
      return (
        <iframe
          src={previewSrc}
          className="w-full h-48 rounded-lg border border-border"
          title={name}
        />
      );
    }

    if (previewLoading) {
      return (
        <div className="w-full rounded-lg bg-muted flex flex-col items-center justify-center gap-3 p-6">
          <div className="w-full max-w-48 h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full w-1/3 rounded-full bg-primary"
              style={{ animation: "shimmer 1.5s ease-in-out infinite" }}
            />
          </div>
          <span className="text-xs text-muted-foreground">Generating preview...</span>
        </div>
      );
    }

    return (
      <div className="w-full h-32 rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleGeneratePreview}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Play className="h-4 w-4" />
          Generate Preview
        </button>
        {previewError && (
          <span className="text-xs text-muted-foreground">
            Preview generation failed. Try again.
          </span>
        )}
      </div>
    );
  }

  // Video files
  if (mimeType.startsWith("video/")) {
    // Native-playable: fetch and render directly
    if (nativePlayable) {
      return mediaSrc ? (
        <video src={mediaSrc} controls className="w-full rounded-lg max-h-48 bg-black">
          <track kind="captions" />
        </video>
      ) : (
        <div className="w-full h-32 rounded-lg bg-muted flex items-center justify-center">
          <Video className="h-8 w-8 text-muted-foreground animate-pulse" />
        </div>
      );
    }

    // Non-native: show preview button or server-generated preview
    if (previewSrc) {
      return (
        <video src={previewSrc} controls className="w-full rounded-lg max-h-48 bg-black">
          <track kind="captions" />
        </video>
      );
    }

    if (previewLoading) {
      return (
        <div className="w-full rounded-lg bg-muted flex flex-col items-center justify-center gap-3 p-6">
          <div className="w-full max-w-48 h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full w-1/3 rounded-full bg-primary"
              style={{ animation: "shimmer 1.5s ease-in-out infinite" }}
            />
          </div>
          <span className="text-xs text-muted-foreground">Generating preview...</span>
        </div>
      );
    }

    return (
      <div className="w-full h-32 rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleGeneratePreview}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Play className="h-4 w-4" />
          Generate Preview
        </button>
        {previewError && (
          <span className="text-xs text-muted-foreground">
            Preview generation failed. Try again.
          </span>
        )}
      </div>
    );
  }

  // Audio files
  if (mimeType.startsWith("audio/")) {
    // Native-playable: fetch and render directly
    if (nativePlayable) {
      return mediaSrc ? (
        <Suspense fallback={<div className="w-full h-24 rounded-lg bg-muted animate-pulse" />}>
          <WaveformPlayer src={mediaSrc} className="w-full" />
        </Suspense>
      ) : (
        <div className="w-full h-24 rounded-lg bg-muted flex items-center justify-center">
          <Music className="h-8 w-8 text-muted-foreground animate-pulse" />
        </div>
      );
    }

    // Non-native: show preview button or server-generated preview
    if (previewSrc) {
      return (
        <Suspense fallback={<div className="w-full h-24 rounded-lg bg-muted animate-pulse" />}>
          <WaveformPlayer src={previewSrc} className="w-full" />
        </Suspense>
      );
    }

    if (previewLoading) {
      return (
        <div className="w-full rounded-lg bg-muted flex flex-col items-center justify-center gap-3 p-6">
          <div className="w-full max-w-48 h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full w-1/3 rounded-full bg-primary"
              style={{ animation: "shimmer 1.5s ease-in-out infinite" }}
            />
          </div>
          <span className="text-xs text-muted-foreground">Generating preview...</span>
        </div>
      );
    }

    return (
      <div className="w-full h-32 rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleGeneratePreview}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Play className="h-4 w-4" />
          Generate Preview
        </button>
        {previewError && (
          <span className="text-xs text-muted-foreground">
            Preview generation failed. Try again.
          </span>
        )}
      </div>
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <AuthImage
        src={getFileThumbnailUrl(fileId)}
        alt={name}
        className="w-full rounded-lg object-contain max-h-48 bg-muted"
      />
    );
  }

  return (
    <div className="w-full h-32 rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
      <FileText className="h-8 w-8 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        {mimeType.split("/").pop()?.toUpperCase()}
      </span>
    </div>
  );
}

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
  const { t } = useTranslation();
  const { selectedFileId } = useFilesPageStore();
  const setFiles = useFileStore((s) => s.setFiles);
  const navigate = useNavigate();
  const location = useLocation();
  const selectForTool = (location.state as { selectForTool?: string } | null)?.selectForTool;

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

    if (selectForTool) {
      const tool = TOOLS.find((t) => t.id === selectForTool);
      navigate(tool?.route ?? "/", { state: { fromLibrary: true } });
    } else {
      navigate("/", { state: { fromLibrary: true } });
    }

    // Set serverFileId on each entry so tool processing auto-saves the result
    // to the library: an independent new file by default, or a superseding
    // version when the user picks overwrite (#495)
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
            : "w-60 border-s border-border p-4 shrink-0 hidden lg:flex flex-col",
        )}
      >
        <FileImage className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">{t.files.selectFilePrompt}</p>
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
            : "w-60 border-s border-border p-4 shrink-0 hidden lg:flex flex-col",
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
          : "w-60 border-s border-border p-4 shrink-0 hidden lg:flex flex-col",
      )}
    >
      {/* Preview */}
      <div className={cn("border-b border-border", mobile ? "" : "pb-4")}>
        <FilePreview fileId={details.id} mimeType={details.mimeType} name={details.originalName} />
      </div>

      {/* Details card */}
      <div className="flex-1">
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-primary/10 border-b border-border px-3 py-2">
            <h4 className="text-sm font-semibold text-primary-ink">{t.files.fileDetailsHeading}</h4>
          </div>
          <div className="divide-y divide-border">
            <DetailRow label={t.files.name} value={details.originalName} />
            <DetailRow
              label={t.files.format}
              value={details.mimeType.split("/").pop()?.toUpperCase() ?? ""}
            />
            <DetailRow label={t.files.size} value={formatSize(details.size)} />
            <DetailRow
              label={t.files.dimensions}
              value={details.width && details.height ? `${details.width} × ${details.height}` : "—"}
            />
            <DetailRow label={t.files.version} value={`V${details.version}`} />
            <DetailRow
              label={t.files.toolsUsed}
              value={
                details.toolChain.length > 0
                  ? details.toolChain.map(toolName).join(", ")
                  : t.files.none
              }
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className={cn("border-t border-border flex flex-col gap-2", mobile ? "pt-3" : "pt-4")}>
        <button
          type="button"
          onClick={handleOpenFile}
          className="w-full px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          {selectForTool ? t.files.selectFile : t.files.openFile}
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2 px-3 py-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-foreground text-end break-all">{value}</span>
    </div>
  );
}
