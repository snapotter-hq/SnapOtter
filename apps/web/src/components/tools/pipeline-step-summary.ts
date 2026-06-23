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
    default:
      return "";
  }
}
