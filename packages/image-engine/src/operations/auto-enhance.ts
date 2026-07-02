import sharp from "sharp";
import type {
  AnalysisResult,
  AnalysisScores,
  CorrectionParams,
  EnhancementMode,
  Sharp,
  SharpChannelStats,
  SharpMetadata,
} from "../types.js";

/**
 * Above this pixel count, CLAHE is skipped in applyCorrections() -- see the
 * comment at its call site for why.
 */
const MAX_CLAHE_PIXELS = 16_000_000;

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
    clahe: number;
    normalise: number;
  }
> = {
  auto: {
    brightness: 1.0,
    contrast: 1.0,
    temperature: 1.0,
    saturation: 1.0,
    sharpness: 1.0,
    denoise: 1.0,
    clahe: 1.0,
    normalise: 1.0,
  },
  portrait: {
    brightness: 0.8,
    contrast: 0.7,
    temperature: 1.2,
    saturation: 0.6,
    sharpness: 0.5,
    denoise: 1.5,
    clahe: 0.7,
    normalise: 0.8,
  },
  landscape: {
    brightness: 1.0,
    contrast: 1.3,
    temperature: 1.0,
    saturation: 1.4,
    sharpness: 1.5,
    denoise: 0.5,
    clahe: 1.3,
    normalise: 1.2,
  },
  "low-light": {
    brightness: 1.8,
    contrast: 1.5,
    temperature: 1.0,
    saturation: 0.8,
    sharpness: 1.2,
    denoise: 2.0,
    clahe: 1.5,
    normalise: 1.5,
  },
  food: {
    brightness: 0.8,
    contrast: 1.1,
    temperature: 1.3,
    saturation: 1.3,
    sharpness: 1.2,
    denoise: 0.5,
    clahe: 1.1,
    normalise: 1.0,
  },
  document: {
    brightness: 1.5,
    contrast: 2.0,
    temperature: 1.0,
    saturation: 0.0,
    sharpness: 2.0,
    denoise: 2.0,
    clahe: 2.0,
    normalise: 1.5,
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
  rCh: SharpChannelStats,
  gCh: SharpChannelStats,
  bCh: SharpChannelStats,
  meanLum: number,
  stdevLum: number,
  isGrayscale: boolean,
  entropy: number,
): AnalysisScores {
  const exposureScore = clamp(Math.round((meanLum / 255) * 100), 0, 100);

  // Linear mapping: stdev ~60 = score 50. Higher stdev = higher contrast.
  const contrastScore = clamp(Math.round(stdevLum / 1.2), 0, 100);

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
  const brightness = deadZoneCorrection(scores.exposure, 40, 60, 0.8);
  const contrast = deadZoneCorrection(scores.contrast, 40, 60, 0.6);
  const temperature = deadZoneCorrection(scores.whiteBalance, 40, 60, 0.5);

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

/**
 * Scores inside [lo, hi] produce zero correction.
 * Scores outside scale from the dead zone edge, not from 50.
 */
function deadZoneCorrection(score: number, lo: number, hi: number, factor: number): number {
  if (score >= lo && score <= hi) return 0;
  if (score < lo) return clamp(Math.round((lo - score) * factor), 0, 60);
  return clamp(Math.round((hi - score) * factor), -60, 0);
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

function suggestMode(scores: AnalysisScores, _meta: SharpMetadata): EnhancementMode {
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
  imageSize?: { width: number; height: number },
): Sharp {
  const presets = PRESET_MULTIPLIERS[mode];
  const scale = intensity / 50;

  let result = image;
  // Tracks whether .clahe() actually ran (not just whether the toggle allowed
  // it) -- Step 5 below applies a compensation boost keyed off this, and it
  // needs to stay correct now that CLAHE can also be skipped by image size.
  let claheApplied = false;

  // Step 1: CLAHE - adaptive local contrast enhancement
  // maxSlope must be an integer (Sharp requirement); skip for tiny images.
  // CLAHE's cost scales with total pixel count regardless of tile size (tile
  // size only bounds granularity, not the per-pixel histogram/interpolation
  // work), so it's also skipped above MAX_CLAHE_PIXELS -- a 5504x3672 (20MP)
  // real-world RAW photo measured 40+ seconds in this step alone versus ~1s
  // for every other correction combined. The other six corrections below
  // still apply at full resolution regardless of size.
  if (toggles.contrast !== false) {
    const maxSlope = clamp(Math.round(1.0 + (intensity / 100) * 4.0 * presets.clahe), 1, 10);
    const w = imageSize?.width ?? 64;
    const h = imageSize?.height ?? 64;
    const tileW = clamp(Math.round(w / 8), 8, 256);
    const tileH = clamp(Math.round(h / 8), 8, 256);
    if (maxSlope >= 2 && w >= tileW && h >= tileH && w * h <= MAX_CLAHE_PIXELS) {
      result = result.clahe({ width: tileW, height: tileH, maxSlope });
      claheApplied = true;
    }
  }

  // Step 2: Normalise - auto-levels histogram stretch
  // lower = percentile below which pixels are clipped to black (0-99)
  // upper = percentile above which pixels are clipped to white (1-100)
  if (toggles.exposure !== false) {
    const baseClip = 5 - (intensity / 100) * 4.5;
    const clipPct = clamp(Math.round(baseClip * presets.normalise), 0, 10);
    const lower = clipPct;
    const upper = 100 - clipPct;
    if (lower < upper) {
      result = result.normalise({ lower, upper });
    }
  }

  // Step 3: Gamma - perceptual exposure correction (only outside dead zone)
  if (toggles.exposure !== false) {
    const adj = corrections.brightness * presets.brightness * scale;
    if (Math.abs(adj) > 2) {
      const gamma = clamp(1 + adj / 100, 1.0, 3.0);
      result = result.gamma(gamma);
    }
  }

  // Step 4: White balance via per-channel linear scaling
  // Uses linear() instead of recomb() to avoid float-cast that breaks CLAHE
  if (toggles.whiteBalance !== false) {
    const adj = corrections.temperature * presets.temperature * scale;
    if (Math.abs(adj) > 2) {
      const t = adj / 100;
      result = result.linear([1 + t * 0.15, 1 + t * 0.05, 1 - t * 0.15], [0, 0, 0]);
    }
  }

  // Step 5: Saturation (with small CLAHE compensation boost)
  if (toggles.saturation !== false) {
    const adj = corrections.saturation * presets.saturation * scale;
    const claheCompensation = claheApplied && intensity > 10 ? 0.05 : 0;
    const satMul = 1 + adj / 100 + claheCompensation;
    if (Math.abs(satMul - 1) > 0.02) {
      result = result.modulate({ saturation: clamp(satMul, 0.2, 3.0) });
    }
  }

  // Step 6: Sharpen with flat parameter to avoid sharpening noise
  if (toggles.sharpness !== false) {
    const adj = corrections.sharpness * presets.sharpness * scale;
    if (adj > 2) {
      const sigma = 0.5 + (adj / 100) * 4;
      result = result.sharpen({ sigma, m1: 1.0 });
    }
  }

  // Denoise via median (kept for backward compat, Deep Enhance uses SCUNet)
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
