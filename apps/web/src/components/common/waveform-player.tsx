import { Download, Pause, Play, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";

interface WaveformPlayerProps {
  src: string;
  className?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Timeout (ms) after which we assume WaveSurfer cannot decode the audio. */
const DECODE_TIMEOUT_MS = 15_000;

export function WaveformPlayer({ src, className }: WaveformPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [decodeError, setDecodeError] = useState(false);
  const readyRef = useRef(false);

  // Detect dark mode from the document class (toggled by useTheme)
  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const waveColor = isDark ? "#6B6560" : "#DDD6CC";
  const progressColor = "#E07832";

  useEffect(() => {
    if (!containerRef.current) return;

    readyRef.current = false;
    setDecodeError(false);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      cursorColor: progressColor,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 80,
      normalize: true,
    });

    wsRef.current = ws;

    // load() rejects with AbortError when destroy() runs mid-decode (route
    // change / src swap). That rejection is expected teardown, not an error.
    ws.load(src).catch(() => {});

    ws.on("ready", () => {
      readyRef.current = true;
      setDuration(ws.getDuration());
      setIsReady(true);
    });

    // F8: surface decode errors for formats WaveSurfer cannot handle
    // (wma, amr, ac3, etc.)
    ws.on("error", () => {
      if (!readyRef.current) {
        setDecodeError(true);
      }
    });

    ws.on("audioprocess", () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on("seeking", () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on("finish", () => {
      setIsPlaying(false);
    });

    ws.on("play", () => {
      setIsPlaying(true);
    });

    ws.on("pause", () => {
      setIsPlaying(false);
    });

    // Decode timeout: if WaveSurfer hasn't fired "ready" after a generous
    // window, the format is likely unsupported.
    const timer = setTimeout(() => {
      if (!readyRef.current) {
        setDecodeError(true);
      }
    }, DECODE_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      ws.destroy();
      wsRef.current = null;
      readyRef.current = false;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsReady(false);
    };
  }, [src, waveColor]);

  const togglePlayPause = useCallback(() => {
    wsRef.current?.playPause();
  }, []);

  // F8: graceful fallback when the browser cannot decode the audio
  if (decodeError) {
    return (
      <div className={cn("w-full max-w-2xl mx-auto", className)}>
        <div className="rounded-lg border border-border bg-background p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <Volume2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t.toolPage.audioDecodeUnsupported}</p>
            <a
              href={src}
              download
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="h-4 w-4" />
              {t.common.download}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full max-w-2xl mx-auto", className)}>
      <div className="rounded-lg border border-border bg-background p-4">
        {/* Waveform container */}
        <div
          ref={containerRef}
          className={cn(
            "w-full cursor-pointer rounded",
            !isReady && "flex items-center justify-center min-h-[80px]",
          )}
          data-testid="waveform-container"
        />

        {/* Controls */}
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!isReady}
            className="shrink-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40"
            aria-label={isPlaying ? "Pause" : "Play"}
            data-testid="waveform-play-pause"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ms-0.5" />}
          </button>
          <span className="text-sm tabular-nums text-muted-foreground select-none">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
