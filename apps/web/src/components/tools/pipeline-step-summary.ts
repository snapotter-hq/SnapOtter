export function getSettingsSummary(toolId: string, settings: Record<string, unknown>): string {
  switch (toolId) {
    case "resize": {
      if (settings.percentage) return `${settings.percentage}%`;
      if (settings.width && settings.height) return `${settings.width} x ${settings.height}`;
      if (settings.width) return `${settings.width}px wide`;
      if (settings.height) return `${settings.height}px tall`;
      return "";
    }
    case "compress": {
      if (settings.mode === "targetSize" && settings.targetSizeKb)
        return `Target ${settings.targetSizeKb} KB`;
      if (settings.quality != null) return `Quality ${settings.quality}`;
      return "";
    }
    case "convert": {
      if (settings.format) return String(settings.format).toUpperCase();
      return "";
    }
    case "rotate": {
      if (settings.angle != null) return `${settings.angle}\u00B0`;
      return "";
    }
    case "watermark-text": {
      if (settings.text) {
        const t = String(settings.text);
        return t.length > 25 ? `${t.slice(0, 24)}...` : t;
      }
      return "";
    }
    case "text-overlay": {
      if (settings.text) {
        const t = String(settings.text);
        return t.length > 25 ? `${t.slice(0, 24)}...` : t;
      }
      return "";
    }
    case "crop": {
      if (settings.width && settings.height) return `${settings.width} x ${settings.height}`;
      return "";
    }
    case "border": {
      if (settings.width) return `${settings.width}px border`;
      return "";
    }
    case "blur-faces":
      return "Blur faces";
    case "remove-background":
      return "Remove BG";
    case "strip-metadata":
      return "Strip EXIF";
    case "upscale": {
      if (settings.scale) return `${settings.scale}x`;
      return "";
    }
    case "colorize": {
      const pct = settings.intensity != null ? Math.round(Number(settings.intensity) * 100) : 100;
      return `${pct}% intensity`;
    }
    case "convert-audio": {
      if (settings.format) return String(settings.format).toUpperCase();
      return "";
    }
    case "convert-video": {
      if (settings.format) return String(settings.format).toUpperCase();
      return "";
    }
    case "compress-video": {
      if (settings.quality) return String(settings.quality);
      return "";
    }
    case "trim-video": {
      if (settings.endS != null) return `${settings.startS ?? 0}-${settings.endS}s`;
      return "";
    }
    case "video-to-gif": {
      if (settings.fps) return `${settings.fps} fps`;
      return "";
    }
    case "video-to-webp": {
      if (settings.quality != null) return `Q${settings.quality}`;
      return "";
    }
    case "resize-video": {
      if (settings.preset && settings.preset !== "custom") return String(settings.preset);
      if (settings.width && settings.height) return `${settings.width}x${settings.height}`;
      if (settings.width) return `${settings.width}px wide`;
      if (settings.height) return `${settings.height}px tall`;
      return "";
    }
    case "crop-video": {
      if (settings.width && settings.height) return `${settings.width}x${settings.height}`;
      return "";
    }
    case "rotate-video": {
      if (settings.transform) return String(settings.transform);
      return "";
    }
    case "change-fps": {
      if (settings.fps) return `${settings.fps} fps`;
      return "";
    }
    case "video-color": {
      return "Adjusted";
    }
    case "video-speed": {
      if (settings.factor) return `${settings.factor}x`;
      return "";
    }
    case "aspect-pad": {
      if (settings.target) return String(settings.target);
      return "";
    }
    case "blur-pad": {
      if (settings.target) return String(settings.target);
      return "";
    }
    case "watermark-video": {
      if (settings.text) {
        const txt = String(settings.text);
        return txt.length > 25 ? `${txt.slice(0, 24)}...` : txt;
      }
      return "";
    }
    case "trim-audio": {
      if (settings.endS != null) return `${settings.startS ?? 0}-${settings.endS}s`;
      return "";
    }
    case "volume-adjust": {
      if (settings.gainDb != null) return `${settings.gainDb} dB`;
      return "";
    }
    case "audio-speed": {
      if (settings.factor != null) return `${settings.factor}x`;
      return "";
    }
    case "pitch-shift": {
      if (settings.semitones != null) return `${settings.semitones} st`;
      return "";
    }
    case "audio-channels": {
      if (settings.mode) return String(settings.mode);
      return "";
    }
    case "ringtone-maker": {
      if (settings.durationS != null) return `${settings.durationS}s`;
      return "";
    }
    case "audio-metadata": {
      if (settings.strip) return "Strip";
      return "";
    }
    case "rotate-pdf": {
      if (settings.angle != null) return `${settings.angle}°`;
      return "";
    }
    case "convert-document":
    case "convert-presentation":
    case "convert-spreadsheet":
    case "epub-convert": {
      if (settings.format) return String(settings.format).toUpperCase();
      return "";
    }
    case "extract-pages": {
      return String(settings.range || "");
    }
    case "remove-pages": {
      return String(settings.pages || "");
    }
    case "organize-pdf": {
      return String(settings.order || "");
    }
    case "nup-pdf": {
      if (settings.perSheet != null) return `${settings.perSheet}-up`;
      return "";
    }
    case "watermark-pdf": {
      if (settings.text) {
        const txt = String(settings.text);
        return txt.length > 25 ? `${txt.slice(0, 24)}...` : txt;
      }
      return "";
    }
    case "redact-pdf": {
      const terms = settings.terms as string[] | undefined;
      if (terms && terms.length > 0) return `${terms.length} terms`;
      return "";
    }
    case "pdf-metadata": {
      if (settings.title || settings.author || settings.subject || settings.keywords)
        return "Metadata";
      return "";
    }
    case "compress-pdf": {
      if (settings.mode === "targetSize" && settings.targetSizeKb)
        return `Target ${settings.targetSizeKb} KB`;
      if (settings.quality != null) return `Quality ${settings.quality}`;
      return "";
    }
    case "chart-maker": {
      if (settings.kind) return String(settings.kind);
      return "";
    }
    default:
      return "";
  }
}
