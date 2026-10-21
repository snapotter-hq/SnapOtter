import { TOOLS } from "@snapotter/shared";
import { FileImage, FileText, ImageIcon, Music, Play, RefreshCw, Video } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import {
  apiGetFileDetails,
  formatHeaders,
  getFileDownloadUrl,
  getFilePreviewUrl,
  getFileThumbnailUrl,
  type UserFile,
  type UserFileDetail,
} from "@/lib/api";
import { fileFormatLabel } from "@/lib/file-format-label";
import { format } from "@/lib/format";
import { previewFailureEncoder } from "@/lib/preview-error";
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
    setFailed(false);
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

  return <img src={blobUrl} alt={alt} className={className} onError={() => setFailed(true)} />;
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

export function FilePreview({
  fileId,
  mimeType,
  name,
}: {
  fileId: string;
  mimeType: string;
  name: string;
}) {
  const { t } = useTranslation();
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [mediaRetry, setMediaRetry] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Set when generating a preview failed; `encoder` names what the server's
  // ffmpeg lacks, when that was the reason (#1290).
  const [previewError, setPreviewError] = useState<{ encoder: string | null } | null>(null);
  // Bumped on every file change and request, so a reply for a file that is no
  // longer shown is dropped instead of landing on the current one.
  const previewRequest = useRef(0);

  const isMedia = mimeType.startsWith("video/") || mimeType.startsWith("audio/");
  const nativePlayable = isMedia && isNativePlayable(mimeType, name);
  const isPdf = mimeType === "application/pdf";
  const isOfficeDoc = OFFICE_MIMES.has(mimeType);

  const handleRetryMedia = useCallback(() => {
    setMediaRetry((n) => n + 1);
  }, []);

  // Fetch native-playable media or PDF directly from the download endpoint.
  // Also resets server-side preview state when the file changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mediaRetry triggers a fresh download attempt
  useEffect(() => {
    // Reset server-side preview state on every file change
    previewRequest.current += 1;
    setPreviewSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewLoading(false);
    setPreviewError(null);
    setMediaError(false);

    if (!isPdf && !nativePlayable) {
      return () => {
        previewRequest.current += 1;
        setPreviewSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      };
    }

    let revoked = false;
    const controller = new AbortController();
    fetch(getFileDownloadUrl(fileId), {
      headers: formatHeaders(),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!revoked) setMediaSrc(URL.createObjectURL(blob));
      })
      .catch((err) => {
        if (revoked || controller.signal.aborted) return;
        console.error(`[file-preview] failed to load file ${fileId}`, err);
        setMediaError(true);
      });
    return () => {
      revoked = true;
      controller.abort();
      previewRequest.current += 1;
      setMediaError(false);
      setMediaSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [nativePlayable, isPdf, fileId, mediaRetry]);

  const handleGeneratePreview = useCallback(() => {
    const request = ++previewRequest.current;
    const current = () => previewRequest.current === request;
    setPreviewLoading(true);
    setPreviewError(null);
    let encoder: string | null = null;
    fetch(getFilePreviewUrl(fileId), { headers: formatHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          encoder = await previewFailureEncoder(res);
          throw new Error("Preview generation failed");
        }
        return res.blob();
      })
      .then((blob) => {
        if (!current()) return;
        setPreviewSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      })
      .catch((err) => {
        if (!current()) return;
        console.error(`[file-preview] failed to generate preview for file ${fileId}`, err);
        setPreviewError({ encoder });
      })
      .finally(() => {
        if (current()) setPreviewLoading(false);
      });
  }, [fileId]);

  const previewErrorText = previewError?.encoder
    ? format(t.toolPage.previewEncoderMissing, { encoder: previewError.encoder })
    : t.files.details.previewFailedRetry;

  // PDF files -- render inline in iframe
  if (isPdf) {
    if (mediaSrc) {
      return (
        <iframe
          src={mediaSrc}
          className="w-full h-48 rounded-lg border border-border"
          title={name}
        />
      );
    }
    if (mediaError) {
      return (
        <div className="w-full h-48 rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t.files.details.loadFailed}</span>
          <button
            type="button"
            onClick={handleRetryMedia}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t.common.retry}
          </button>
        </div>
      );
    }
    return (
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
          <span className="text-xs text-muted-foreground">{t.toolPage.generatingPreview}</span>
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
          {t.toolPage.generatePreview}
        </button>
        {previewError && <span className="text-xs text-muted-foreground">{previewErrorText}</span>}
      </div>
    );
  }

  // Video files
  if (mimeType.startsWith("video/")) {
    // Native-playable: fetch and render directly
    if (nativePlayable) {
      if (mediaSrc) {
        return (
          <video src={mediaSrc} controls className="w-full rounded-lg max-h-48 bg-black">
            <track kind="captions" />
          </video>
        );
      }
      if (mediaError) {
        return (
          <div className="w-full h-32 rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
            <Video className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t.files.details.loadFailed}</span>
            <button
              type="button"
              onClick={handleRetryMedia}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.common.retry}
            </button>
          </div>
        );
      }
      return (
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
          <span className="text-xs text-muted-foreground">{t.toolPage.generatingPreview}</span>
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
          {t.toolPage.generatePreview}
        </button>
        {previewError && <span className="text-xs text-muted-foreground">{previewErrorText}</span>}
      </div>
    );
  }

  // Audio files
  if (mimeType.startsWith("audio/")) {
    // Native-playable: fetch and render directly
    if (nativePlayable) {
      if (mediaSrc) {
        return (
          <Suspense fallback={<div className="w-full h-24 rounded-lg bg-muted animate-pulse" />}>
            <WaveformPlayer src={mediaSrc} className="w-full" />
          </Suspense>
        );
      }
      if (mediaError) {
        return (
          <div className="w-full h-24 rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
            <Music className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t.files.details.loadFailed}</span>
            <button
              type="button"
              onClick={handleRetryMedia}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.common.retry}
            </button>
          </div>
        );
      }
      return (
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
          <span className="text-xs text-muted-foreground">{t.toolPage.generatingPreview}</span>
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
          {t.toolPage.generatePreview}
        </button>
        {previewError && <span className="text-xs text-muted-foreground">{previewErrorText}</span>}
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
      <span className="text-xs text-muted-foreground">{fileFormatLabel(name, mimeType)}</span>
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

export function getFilesToOpen({
  details,
  files,
  knownFiles,
  checkedIds,
  filterMimePrefix,
}: {
  details: UserFileDetail;
  files: UserFile[];
  knownFiles?: ReadonlyMap<string, UserFile>;
  checkedIds: Set<string>;
  filterMimePrefix?: string;
}): UserFile[] {
  const isCompatible = (file: Pick<UserFile, "mimeType">) =>
    !filterMimePrefix || file.mimeType.startsWith(filterMimePrefix);

  if (!isCompatible(details)) return [];
  const byId = new Map<string, UserFile>(knownFiles);
  for (const file of files) {
    byId.set(file.id, file);
  }
  const compatibleChecked: UserFile[] = [];
  for (const id of checkedIds) {
    const file = byId.get(id);
    if (file && isCompatible(file)) {
      compatibleChecked.push(file);
    }
  }
  if (compatibleChecked.length > 1) return compatibleChecked;
  return [details];
}

interface FileDetailsProps {
  filterMimePrefix?: string;
  mobile?: boolean;
}

export function FileDetails({ filterMimePrefix, mobile = false }: FileDetailsProps) {
  const { t } = useTranslation();
  const { files, knownFiles, selectedFileId, checkedIds } = useFilesPageStore();
  const setFiles = useFileStore((s) => s.setFiles);
  const addFiles = useFileStore((s) => s.addFiles);
  const navigate = useNavigate();
  const location = useLocation();
  const selectForTool = (location.state as { selectForTool?: string } | null)?.selectForTool;

  const [details, setDetails] = useState<UserFileDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailRetry, setDetailRetry] = useState(0);
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState<{ failed: number; total: number } | null>(null);
  const latestOpenRef = useRef(0);
  const partialFailedIdsRef = useRef<Set<string> | null>(null);

  const selectedFile =
    files.find((file) => file.id === selectedFileId) ??
    (selectedFileId ? knownFiles.get(selectedFileId) : undefined);
  const selectedFileIsCompatible =
    !filterMimePrefix || selectedFile?.mimeType.startsWith(filterMimePrefix) === true;

  useEffect(() => {
    if (partialFailedIdsRef.current && checkedIds === partialFailedIdsRef.current) {
      return;
    }
    partialFailedIdsRef.current = null;
    setOpenFailed(null);
  }, [checkedIds]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: detailRetry triggers a fresh detail fetch attempt
  useEffect(() => {
    latestOpenRef.current += 1;
    partialFailedIdsRef.current = null;
    setOpening(false);
    setOpenFailed(null);

    if (!selectedFileId || !selectedFileIsCompatible) {
      setDetails(null);
      setDetailError(false);
      setLoadingDetails(false);
      return;
    }
    let cancelled = false;
    setDetails(null);
    setDetailError(false);
    setLoadingDetails(true);
    apiGetFileDetails(selectedFileId)
      .then((res) => {
        if (!cancelled) setDetails(res);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`[file-details] failed to load details for file ${selectedFileId}`, err);
        setDetails(null);
        setDetailError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });
    return () => {
      cancelled = true;
      latestOpenRef.current += 1;
    };
  }, [selectedFileId, selectedFileIsCompatible, detailRetry]);

  async function handleOpenFile() {
    if (!details || opening) return;

    const {
      checkedIds: currentCheckedIds,
      files: allFiles,
      knownFiles: allKnownFiles,
    } = useFilesPageStore.getState();

    const isCompatible = (file: Pick<UserFile, "mimeType">) =>
      !filterMimePrefix || file.mimeType.startsWith(filterMimePrefix);
    const isPartialRetry =
      partialFailedIdsRef.current !== null && currentCheckedIds === partialFailedIdsRef.current;

    let filesToOpen: UserFile[];
    if (isPartialRetry) {
      const byId = new Map<string, UserFile>(allKnownFiles);
      for (const file of allFiles) {
        byId.set(file.id, file);
      }
      filesToOpen = [];
      for (const id of currentCheckedIds) {
        const file = byId.get(id) ?? (id === details.id ? details : undefined);
        if (file && isCompatible(file)) {
          filesToOpen.push(file);
        }
      }
    } else {
      // If multiple files are checked, open all of them; otherwise just the selected one
      filesToOpen = getFilesToOpen({
        details,
        files: allFiles,
        knownFiles: allKnownFiles,
        checkedIds: currentCheckedIds,
        filterMimePrefix,
      });
    }

    if (filesToOpen.length === 0) return;

    const openRun = ++latestOpenRef.current;
    const isLatestOpen = () => openRun === latestOpenRef.current;
    setOpening(true);
    setOpenFailed(null);

    try {
      const outcomes = await Promise.allSettled(
        filesToOpen.map(async (f) => {
          const res = await fetch(getFileDownloadUrl(f.id), {
            headers: formatHeaders(),
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const blob = await res.blob();
          return { file: new File([blob], f.originalName, { type: f.mimeType }), serverId: f.id };
        }),
      );

      if (!isLatestOpen()) return;

      const valid: { file: File; serverId: string }[] = [];
      const failedIds = new Set<string>();
      for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        const source = filesToOpen[i];
        if (outcome.status === "fulfilled") {
          valid.push(outcome.value);
        } else {
          console.error(`[file-details] failed to download file ${source.id}`, outcome.reason);
          failedIds.add(source.id);
        }
      }

      if (valid.length > 0) {
        let entryIds: string[];
        if (isPartialRetry) {
          const prevCount = useFileStore.getState().entries.length;
          addFiles(valid.map((d) => d.file));
          entryIds = useFileStore
            .getState()
            .entries.slice(prevCount)
            .map((e) => e.id);
        } else {
          setFiles(valid.map((d) => d.file));
          entryIds = useFileStore.getState().entries.map((e) => e.id);
        }

        // Set serverFileId on each entry so tool processing auto-saves the result
        // to the library: an independent new file by default, or a superseding
        // version when the user picks overwrite (#495)
        setTimeout(() => {
          const store = useFileStore.getState();
          for (let i = 0; i < valid.length; i++) {
            if (entryIds[i]) {
              store.updateEntryById(entryIds[i], { serverFileId: valid[i].serverId });
            }
          }
        }, 0);
      }

      if (failedIds.size === 0) {
        partialFailedIdsRef.current = null;
        if (valid.length > 0) {
          if (selectForTool) {
            const tool = TOOLS.find((t) => t.id === selectForTool);
            navigate(tool?.route ?? "/", { state: { fromLibrary: true } });
          } else {
            navigate("/", { state: { fromLibrary: true } });
          }
        }
      } else {
        if ((valid.length > 0 || isPartialRetry) && currentCheckedIds.size > 0) {
          partialFailedIdsRef.current = failedIds;
          useFilesPageStore.setState({ checkedIds: failedIds });
        }
        setOpenFailed({ failed: failedIds.size, total: filesToOpen.length });
      }
    } finally {
      if (isLatestOpen()) setOpening(false);
    }
  }

  if (!selectedFileId || !selectedFileIsCompatible) {
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

  if (detailError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 text-muted-foreground",
          mobile
            ? "flex flex-col gap-4"
            : "w-60 border-s border-border p-4 shrink-0 hidden lg:flex flex-col",
        )}
      >
        <p role="alert" className="text-sm text-muted-foreground text-center">
          {t.files.details.loadFailed}
        </p>
        <button
          type="button"
          onClick={() => setDetailRetry((n) => n + 1)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t.common.retry}
        </button>
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
              value={fileFormatLabel(details.originalName, details.mimeType) || "—"}
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
        {openFailed && (
          <p role="alert" className="text-xs text-destructive">
            {format(t.commonUi.fileLibrary.importFailed, openFailed)}
          </p>
        )}
        <button
          type="button"
          onClick={handleOpenFile}
          disabled={opening}
          className="w-full px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
