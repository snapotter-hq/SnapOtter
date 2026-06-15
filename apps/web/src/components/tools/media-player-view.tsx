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
  const [unsupportedCodec, setUnsupportedCodec] = useState(false);

  if (!entry) return null;
  const src = entry.processedUrl ?? entry.blobUrl;
  const isAudio = entry.modality === "audio";

  // F7: if the browser loaded the container but cannot decode the codec,
  // videoWidth will be 0. Fall back to the server-transcode preview.
  if (!isAudio && unsupportedCodec) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <NonNativePreview
          file={entry.file}
          src={src}
          filename={entry.file?.name ?? "video"}
          fileSize={entry.file?.size ?? 0}
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
              setUnsupportedCodec(true);
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
