import { useEffect, useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

export function AudioMetadataSettings() {
  const { t } = useTranslation();
  const s = t.toolSettings["audio-metadata"];
  const { files } = useFileStore();
  const { processFiles, processAllFiles, processing, error, progress } =
    useToolProcessor("audio-metadata");

  const [strip, setStrip] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");

  const hasFile = files.length > 0;
  const hasMultiple = files.length > 1;

  const handleProcess = () => {
    const settings: Record<string, unknown> = { strip };
    if (title) settings.title = title;
    if (artist) settings.artist = artist;
    if (album) settings.album = album;
    if (hasMultiple) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={strip}
          onChange={(e) => setStrip(e.target.checked)}
          className="rounded"
        />
        {s.strip}
      </label>

      <div>
        <label htmlFor="am-title" className="text-xs text-muted-foreground">
          {s.title}
        </label>
        <input
          id="am-title"
          type="text"
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="am-artist" className="text-xs text-muted-foreground">
          {s.artist}
        </label>
        <input
          id="am-artist"
          type="text"
          maxLength={500}
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      <div>
        <label htmlFor="am-album" className="text-xs text-muted-foreground">
          {s.album}
        </label>
        <input
          id="am-album"
          type="text"
          maxLength={500}
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={s.progressLabel}
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="audio-metadata-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasMultiple ? format(s.submitBatch, { count: files.length }) : s.submit}
        </button>
      )}
    </div>
  );
}

export interface AudioMetadataControlsProps {
  settings?: Record<string, unknown>;
  onChange?: (settings: Record<string, unknown>) => void;
}

export function AudioMetadataControls({ settings: initial, onChange }: AudioMetadataControlsProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["audio-metadata"];
  const [strip, setStrip] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initial || initializedRef.current) return;
    initializedRef.current = true;
    if (initial.strip != null) setStrip(Boolean(initial.strip));
    if (initial.title != null) setTitle(String(initial.title));
    if (initial.artist != null) setArtist(String(initial.artist));
    if (initial.album != null) setAlbum(String(initial.album));
  }, [initial]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const out: Record<string, unknown> = { strip };
    if (title) out.title = title;
    if (artist) out.artist = artist;
    if (album) out.album = album;
    onChangeRef.current?.(out);
  }, [strip, title, artist, album]);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={strip}
          onChange={(e) => setStrip(e.target.checked)}
          className="rounded"
        />
        {s.strip}
      </label>
      <div>
        <label htmlFor="amp-title" className="text-xs text-muted-foreground">
          {s.title}
        </label>
        <input
          id="amp-title"
          type="text"
          maxLength={500}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="amp-artist" className="text-xs text-muted-foreground">
          {s.artist}
        </label>
        <input
          id="amp-artist"
          type="text"
          maxLength={500}
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
      <div>
        <label htmlFor="amp-album" className="text-xs text-muted-foreground">
          {s.album}
        </label>
        <input
          id="amp-album"
          type="text"
          maxLength={500}
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        />
      </div>
    </div>
  );
}
