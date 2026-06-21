import { Play, RefreshCw, Video, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatHeaders } from "@/lib/api";
import { formatFileSize } from "@/lib/download";
import { cn } from "@/lib/utils";

const PROGRESS_MESSAGES = [
  "Warming up the otter...",
  "Crunching pixels...",
  "Teaching the codec...",
  "Almost there...",
  "Brewing the preview...",
  "Convincing the frames...",
  "Polishing the output...",
  "Just a moment...",
];

type PreviewState = "idle" | "generating" | "ready" | "error";

export interface NonNativePreviewProps {
  file?: File;
  src?: string;
  filename: string;
  fileSize: number;
  modality: "video" | "audio";
}

export function NonNativePreview({
  file,
  src,
  filename,
  fileSize,
  modality,
}: NonNativePreviewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<PreviewState>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (intervalRef.current) clearInterval(intervalRef.current);
      abortRef.current?.abort();
    };
  }, [previewUrl]);

  const startMessageRotation = useCallback(() => {
    setMessageIndex(0);
    intervalRef.current = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROGRESS_MESSAGES.length);
    }, 2500);
  }, []);

  const stopMessageRotation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const generatePreview = useCallback(async () => {
    setState("generating");
    startMessageRotation();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let fileToUpload = file;
      if (!fileToUpload && src) {
        const res = await fetch(src);
        const blob = await res.blob();
        fileToUpload = new File([blob], filename, { type: blob.type });
      }
      if (!fileToUpload) {
        throw new Error("No file to generate preview from");
      }
      const formData = new FormData();
      formData.append("file", fileToUpload, filename);

      const response = await fetch("/api/v1/preview/generate", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Preview generation failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Revoke previous URL if any
      if (previewUrl) URL.revokeObjectURL(previewUrl);

      setPreviewUrl(url);
      setState("ready");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState("error");
      }
    } finally {
      stopMessageRotation();
    }
  }, [file, src, filename, previewUrl, startMessageRotation, stopMessageRotation]);

  const ext = filename.split(".").pop()?.toUpperCase() ?? "";
  const IconComponent = modality === "audio" ? Volume2 : Video;

  // Idle state: file info + generate button
  if (state === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8 max-w-xs">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <IconComponent className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">{filename}</p>
          <p className="text-sm text-muted-foreground mb-3">
            {ext} &middot; {formatFileSize(fileSize)}
          </p>
          <button
            type="button"
            onClick={generatePreview}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Play className="h-4 w-4" />
            {t.toolPage.generatePreview}
          </button>
        </div>
      </div>
    );
  }

  // Generating state: progress bar + rotating messages
  if (state === "generating") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8 max-w-xs w-full">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <IconComponent className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">{filename}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {ext} &middot; {formatFileSize(fileSize)}
          </p>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className={cn(
                "h-full w-1/4 bg-primary rounded-full",
                "animate-[shimmer_1.5s_ease-in-out_infinite]",
              )}
            />
          </div>
          <p className="text-sm text-muted-foreground">{PROGRESS_MESSAGES[messageIndex]}</p>
        </div>
      </div>
    );
  }

  // Error state: retry button
  if (state === "error") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8 max-w-xs">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <IconComponent className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">{t.toolPage.previewFailed}</p>
          <p className="text-sm text-muted-foreground mb-3">
            {filename} &middot; {formatFileSize(fileSize)}
          </p>
          <button
            type="button"
            onClick={generatePreview}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="h-4 w-4" />
            {t.common.retry}
          </button>
        </div>
      </div>
    );
  }

  // Ready state: show the player
  if (state === "ready" && previewUrl) {
    if (modality === "audio") {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            {/* biome-ignore lint/a11y/useMediaCaption: preview audio player */}
            <audio controls className="w-full" src={previewUrl} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex items-center justify-center p-2">
        {/* biome-ignore lint/a11y/useMediaCaption: preview video player */}
        <video controls className="max-h-full max-w-full rounded-md" src={previewUrl} />
      </div>
    );
  }

  return null;
}
