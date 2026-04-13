import sharp from "sharp";
import type {
  AnalysisResult,
  AnalysisScores,
  CorrectionParams,
  EnhancementMode,
  Sharp,
} from "../types.js";

/**
 * Preset multipliers applied to auto-computed corrections.
 * Each value scales the corresponding correction (1.0 = unchanged).
 */
const PRESET_MULTIPLIERS: Record<
  EnhancementMode,
  {
    brightness: number;
    contrast: number;
    temperature: number;
    saturation: number;
    sharpness: number;
    denoise: number;
  }
> = {
  auto: {
    brightness: 1.0,
    contrast: 1.0,
    temperature: 1.0,
    saturation: 1.0,
    sharpness: 1.0,
    denoise: 1.0,
  },
  portrait: {
    brightness: 0.8,
    contrast: 0.7,
    temperature: 1.2,
    saturation: 0.6,
    sharpness: 0.5,
    denoise: 1.5,
  },
  landscape: {
    brightness: 1.0,
    contrast: 1.3,
    temperature: 1.0,
    saturation: 1.4,
    sharpness: 1.5,
    denoise: 0.5,
  },
  "low-light": {
    brightness: 1.8,
    contrast: 1.5,
    temperature: 1.0,
    saturation: 0.8,
    sharpness: 1.2,
    denoise: 2.0,
  },
  food: {
    brightness: 0.8,
    contrast: 1.1,
    temperature: 1.3,
    saturation: 1.3,
    sharpness: 1.2,
    denoise: 0.5,
  },
  document: {
    brightness: 1.5,
    contrast: 2.0,
    temperature: 1.0,
    saturation: 0.0,
    sharpness: 2.0,
    denoise: 2.0,
  },
};

/**
 * Analyze an image buffer and return quality scores + computed corrections.
 * Uses Sharp's stats() for per-channel histogram statistics.
 */
export async function analyzeImage(buffer: Buffer): Promise<AnalysisResult> {
  const image = sharp(buffer);
  const stats = await image.stats();
  const meta = await image.metadata();

  const channels = stats.channels;
  const isGrayscale = channels.length === 1;

  const rCh = channels[0];
  const gCh = channels[Math.min(1, channels.length - 1)];
  const bCh = channels[Math.min(2, channels.length - 1)];

  // Overall luminance approximation (BT.601 weights)
  const meanLuminance = rCh.mean * 0.299 + gCh.mean * 0.587 + bCh.mean * 0.114;
  const stdevLuminance = rCh.stdev * 0.299 + gCh.stdev * 0.587 + bCh.stdev * 0.114;

  const scores = computeScores(
    rCh,
    gCh,
    bCh,
    meanLuminance,
    stdevLuminance,
    isGrayscale,
    stats.entropy,
  );
  const corrections = computeCorrections(scores);
  const issues = detectIssues(scores);
  const suggestedMode = suggestMode(scores, meta);

  return { scores, corrections, issues, suggestedMode };
}

function computeScores(
  rCh: sharp.ChannelStats,
  gCh: sharp.ChannelStats,
  bCh: sharp.ChannelStats,
  meanLum: number,
  stdevLum: number,
  isGrayscale: boolean,
  entropy: number,
): AnalysisScores {
  const exposureScore = clamp(Math.round((meanLum / 255) * 100), 0, 100);

  const idealStdev = 60;
  const contrastDeviation = Math.abs(stdevLum - idealStdev) / idealStdev;
  const contrastScore = clamp(Math.round((1 - contrastDeviation) * 50 + 25), 0, 100);

  const meanR = rCh.mean;
  const meanG = gCh.mean;
  const meanB = bCh.mean;
  const channelSpread = Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB);
  const wbScore = isGrayscale ? 50 : clamp(Math.round(50 - channelSpread * 0.8), 0, 100);

  const satScore = isGrayscale ? 50 : clamp(Math.round(channelSpread * 1.2 + 20), 0, 100);

  const sharpnessScore = clamp(Math.round(stdevLum * 0.8 + 10), 0, 100);

  const noiseScore = clamp(Math.round(100 - (entropy - 5) * 20), 0, 100);

  return {
    exposure: exposureScore,
    contrast: contrastScore,
    whiteBalance: wbScore,
    saturation: satScore,
    sharpness: sharpnessScore,
    noise: noiseScore,
  };
}

function computeCorrections(scores: AnalysisScores): CorrectionParams {
  const brightness = clamp(Math.round((50 - scores.exposure) * 1.2), -60, 60);
  const contrast = clamp(Math.round((50 - scores.contrast) * 0.8), -40, 40);
  const temperature = clamp(Math.round((50 - scores.whiteBalance) * 0.5), -30, 30);

  const saturation =
    scores.saturation < 40
      ? clamp(Math.round((40 - scores.saturation) * 0.6), 0, 30)
      : scores.saturation > 60
        ? clamp(Math.round((60 - scores.saturation) * 0.4), -20, 0)
        : 0;

  const sharpness =
    scores.sharpness < 40 ? clamp(Math.round((40 - scores.sharpness) * 1.0), 0, 50) : 0;

  const denoise = scores.noise < 25 ? 5 : scores.noise < 35 ? 3 : 0;

  return { brightness, contrast, temperature, saturation, sharpness, denoise };
}

function detectIssues(scores: AnalysisScores): string[] {
  const issues: string[] = [];
  if (scores.exposure < 35) issues.push("underexposed");
  if (scores.exposure > 70) issues.push("overexposed");
  if (scores.contrast < 35) issues.push("low-contrast");
  if (scores.whiteBalance < 35) issues.push("color-cast");
  if (scores.saturation < 30) issues.push("desaturated");
  if (scores.sharpness < 35) issues.push("soft-focus");
  if (scores.noise < 30) issues.push("noisy");
  return issues;
}

function suggestMode(scores: AnalysisScores, _meta: sharp.Metadata): EnhancementMode {
  if (scores.exposure < 30) return "low-light";
  if (scores.contrast > 60 && scores.saturation < 30) return "document";
  return "auto";
}

/**
 * Apply auto-enhancement corrections to a Sharp pipeline.
 */
export function applyCorrections(
  image: Sharp,
  corrections: CorrectionParams,
  mode: EnhancementMode,
  intensity: number,
  toggles: Record<string, boolean>,
): Sharp {
  const presets = PRESET_MULTIPLIERS[mode];
  const scale = intensity / 50;

  let result = image;

  if (toggles.exposure !== false) {
    const adj = corrections.brightness * presets.brightness * scale;
    if (Math.abs(adj) > 2) {
      const gamma = 1 / (1 + adj / 100);
      result = result.gamma(clamp(gamma, 0.33, 3.0));
    }
  }

  if (toggles.contrast !== false) {
    const adj = corrections.contrast * presets.contrast * scale;
    if (Math.abs(adj) > 2) {
      const slope = 1 + adj / 100;
      const intercept = 128 * (1 - slope);
      result = result.linear(slope, intercept);
    }
  }

  if (toggles.whiteBalance !== false) {
    const adj = corrections.temperature * presets.temperature * scale;
    if (Math.abs(adj) > 2) {
      const t = adj / 100;
      result = result.recomb([
        [1 + t * 0.15, 0, 0],
        [0, 1 + t * 0.05, 0],
        [0, 0, 1 - t * 0.15],
      ]);
    }
  }

  if (toggles.saturation !== false) {
    const adj = corrections.saturation * presets.saturation * scale;
    if (Math.abs(adj) > 2) {
      result = result.modulate({ saturation: 1 + adj / 100 });
    }
  }

  if (toggles.sharpness !== false) {
    const adj = corrections.sharpness * presets.sharpness * scale;
    if (adj > 2) {
      const sigma = 0.5 + (adj / 100) * 4;
      result = result.sharpen({ sigma });
    }
  }

  if (toggles.denoise !== false) {
    const adj = corrections.denoise * presets.denoise * scale;
    if (adj >= 2) {
      const kernel = adj >= 4 ? 5 : 3;
      result = result.median(kernel);
    }
  }

  return result;
}

/**
 * Scale corrections by intensity and preset multipliers, returning
 * CSS-compatible values for the frontend live preview.
 */
export function scaleCorrections(
  corrections: CorrectionParams,
  mode: EnhancementMode,
  intensity: number,
): CorrectionParams {
  const presets = PRESET_MULTIPLIERS[mode];
  const scale = intensity / 50;
  return {
    brightness: Math.round(corrections.brightness * presets.brightness * scale),
    contrast: Math.round(corrections.contrast * presets.contrast * scale),
    temperature: Math.round(corrections.temperature * presets.temperature * scale),
    saturation: Math.round(corrections.saturation * presets.saturation * scale),
    sharpness: Math.round(corrections.sharpness * presets.sharpness * scale),
    denoise: Math.round(corrections.denoise * presets.denoise * scale),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
