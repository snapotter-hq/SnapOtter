import { SafeError } from "@snapotter/shared";
import { Play, RefreshCw, Video, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { formatFileSize } from "@/lib/download";
import { format } from "@/lib/format";
import { previewFailureEncoder } from "@/lib/preview-error";
import { cn } from "@/lib/utils";

type PreviewState = "idle" | "generating" | "ready" | "error";

export interface NonNativePreviewProps {
  file?: File;
  src?: string;
  filename: string;
  /** null = unknown; the size is omitted rather than shown as zero */
  fileSize: number | null;
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
  // Set when the server's ffmpeg lacks the encoder this preview needs (#1290).
  const [missingEncoder, setMissingEncoder] = useState<string | null>(null);
  // Set when the upload is over the server's size limit (#1280).
  const [tooLarge, setTooLarge] = useState(false);
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

  // A new file starts from scratch. Without this, the last file's preview, or
  // an error naming the encoder it needed, stayed on screen for the next one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets on a file change, which these props are
  useEffect(() => {
    abortRef.current?.abort();
    setState("idle");
    setMissingEncoder(null);
    setTooLarge(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [file, src, filename, modality]);

  const startMessageRotation = useCallback(() => {
    setMessageIndex(0);
    intervalRef.current = setInterval(() => {
      // Wrapped at render against the live locale's array, so a locale switch
      // mid-rotation can't leave the index past its end.
      setMessageIndex((prev) => prev + 1);
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
    let encoder: string | null = null;

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

      const response = await fetch(appUrl("/api/v1/preview/generate"), {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        encoder = await previewFailureEncoder(response);
        // The status goes in the message: Sentry's scrubber keeps a
        // SafeError's message but drops its code.
        throw new SafeError(`Media preview generation failed (HTTP ${response.status})`, {
          code: `preview-http-${response.status}`,
          statusCode: response.status,
        });
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Revoke previous URL if any
      if (previewUrl) URL.revokeObjectURL(previewUrl);

      setPreviewUrl(url);
      setState("ready");
    } catch (err) {
      // Checked on the signal, not the error: an abort while the error body
      // was being read surfaces as an ordinary failure.
      if (!controller.signal.aborted) {
        const status = err instanceof SafeError ? err.statusCode : undefined;
        setMissingEncoder(encoder);
        setTooLarge(status === 413);
        setState("error");
        // A 413 (over the upload limit) or 422 (ffmpeg couldn't decode it, or
        // lacks the encoder) is about the file, and the panel says so.
        // Anything else, whether a 5xx, an expired session, a rate limit, or a
        // failed request, is a fault nobody would otherwise hear about (#1280).
        if (status !== 413 && status !== 422) {
          void captureHandledError(
            err instanceof SafeError
              ? err
              : new SafeError("Media preview request failed", {
                  code: "preview-request",
                  cause: err,
                }),
            { error_class: "operational" },
          );
        }
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
            {ext}
            {fileSize != null && <> &middot; {formatFileSize(fileSize)}</>}
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
    const previewMessages = t.toolPage.previewProgressMessages;
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8 max-w-xs w-full">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <IconComponent className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">{filename}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {ext}
            {fileSize != null && <> &middot; {formatFileSize(fileSize)}</>}
          </p>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className={cn(
                "h-full w-1/4 bg-primary rounded-full",
                "animate-[shimmer_1.5s_ease-in-out_infinite]",
              )}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {previewMessages[messageIndex % previewMessages.length]}
          </p>
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
          <p className="font-medium text-foreground mb-1">
            {tooLarge
              ? t.errors.fileTooLarge
              : missingEncoder
                ? format(t.toolPage.previewEncoderMissing, { encoder: missingEncoder })
                : t.toolPage.previewFailed}
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            {filename}
            {fileSize != null && <> &middot; {formatFileSize(fileSize)}</>}
          </p>
          {/* The same file will hit the same limit, so a retry can't help. */}
          {!tooLarge && (
            <button
              type="button"
              onClick={generatePreview}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-4 w-4" />
              {t.common.retry}
            </button>
          )}
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
