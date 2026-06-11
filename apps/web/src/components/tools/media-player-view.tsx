import { useTranslation } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

/**
 * Native <video>/<audio> playback over the Range-capable download endpoint
 * (spec 4.6). Shows the processed result when present, else the source file.
 */
export function MediaPlayerView() {
  const { t } = useTranslation();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  if (!entry) return null;
  const src = entry.processedUrl ?? entry.blobUrl;
  const isAudio = entry.modality === "audio";
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      {isAudio ? (
        <audio controls src={src} className="w-full max-w-xl" data-testid="media-player-audio">
          <track kind="captions" />
        </audio>
      ) : (
        <video
          controls
          src={src}
          className="max-h-full max-w-full rounded-lg"
          data-testid="media-player-video"
        >
          <track kind="captions" />
          {t.tools.mediaPlayer.unsupported}
        </video>
      )}
    </div>
  );
}
