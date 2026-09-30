import { useRef, useState } from "react";
import { NonNativePreview } from "@/components/common/non-native-preview";
import { useTranslation } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

/**
 * Native <video>/<audio> playback over the Range-capable download endpoint
 * (spec 4.6). Shows the processed result when present, else the source file.
 * Falls back to NonNativePreview (server transcode) when the browser cannot
 * decode the codec (e.g. Theora in .ogv -- videoWidth is 0).
 */
export function MediaPlayerView() {
  const { t } = useTranslation();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const videoRef = useRef<HTMLVideoElement>(null);
  // The source that failed to decode, not a bare flag: Automate keeps this
  // component mounted across selections, so the verdict has to belong to the
  // file it was made for (#1709).
  const [unplayableSrc, setUnplayableSrc] = useState<string | null>(null);

  if (!entry) return null;
  const src = entry.processedUrl ?? entry.blobUrl;
  const isAudio = entry.modality === "audio";
  const unsupportedCodec = unplayableSrc === src;

  // F7: if the browser loaded the container but cannot decode the codec,
  // videoWidth will be 0. Fall back to the server-transcode preview.
  if (!isAudio && unsupportedCodec) {
    const hasResult = !!entry.processedUrl;
    // Single-file results leave processedFilename null; the name is the last
    // segment of the download URL, as in tool-page.
    const resultName =
      entry.processedFilename ??
      decodeURIComponent(entry.processedUrl?.split("/").pop() || "video");
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <NonNativePreview
          file={hasResult ? undefined : entry.file}
          src={hasResult ? (entry.processedUrl ?? undefined) : undefined}
          filename={hasResult ? resultName : (entry.file?.name ?? "video")}
          fileSize={hasResult ? (entry.processedSize ?? null) : (entry.file?.size ?? 0)}
          modality="video"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      {isAudio ? (
        <audio controls src={src} className="w-full max-w-xl" data-testid="media-player-audio">
          <track kind="captions" />
        </audio>
      ) : (
        <video
          ref={videoRef}
          controls
          src={src}
          className="max-h-full max-w-full rounded-lg"
          data-testid="media-player-video"
          onLoadedMetadata={() => {
            if (videoRef.current && videoRef.current.videoWidth === 0) {
              setUnplayableSrc(src);
            }
          }}
        >
          <track kind="captions" />
          {t.tools.mediaPlayer.unsupported}
        </video>
      )}
    </div>
  );
}
