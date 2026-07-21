// apps/web/src/components/editor/adjustment-lut.ts
//
// Shared lookup-table math for the Levels and Curves adjustments. The panel uses
// these to draw its graphs; SourceImage uses composeChannelLuts() to build the
// per-channel LUTs it feeds to a Konva filter so the adjustments actually reach
// the pixels.

export type ToneChannel = "rgb" | "red" | "green" | "blue";

export interface LevelsValues {
  blackPoint: number;
  whitePoint: number;
  gamma: number;
  outBlack: number;
  outWhite: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export type LevelsState = Record<ToneChannel, LevelsValues>;
export type CurvesState = Record<ToneChannel, CurvePoint[]>;

export const IDENTITY_LEVELS: LevelsValues = {
  blackPoint: 0,
  whitePoint: 255,
  gamma: 1,
  outBlack: 0,
  outWhite: 255,
};

export const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

export function defaultLevelsState(): LevelsState {
  return {
    rgb: { ...IDENTITY_LEVELS },
    red: { ...IDENTITY_LEVELS },
    green: { ...IDENTITY_LEVELS },
    blue: { ...IDENTITY_LEVELS },
  };
}

export function defaultCurvesState(): CurvesState {
  return {
    rgb: [...IDENTITY_CURVE],
    red: [...IDENTITY_CURVE],
    green: [...IDENTITY_CURVE],
    blue: [...IDENTITY_CURVE],
  };
}

/** Build a 256-entry LUT for one Levels channel. */
export function levelsLut(v: LevelsValues): number[] {
  const lut = new Array<number>(256);
  const range = Math.max(1, v.whitePoint - v.blackPoint);
  const invGamma = 1 / Math.max(0.01, v.gamma);
  for (let i = 0; i < 256; i++) {
    let t = (i - v.blackPoint) / range;
    t = Math.max(0, Math.min(1, t));
    t = t ** invGamma;
    const o = v.outBlack + t * (v.outWhite - v.outBlack);
    lut[i] = Math.max(0, Math.min(255, Math.round(o)));
  }
  return lut;
}

/** Build a 256-entry LUT for one Curves channel via natural cubic spline. */
export function curveLut(points: CurvePoint[]): number[] {
  const lut = new Array<number>(256).fill(0);
  if (points.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const n = sorted.length;

  if (n === 2) {
    const [p0, p1] = sorted;
    const dx = p1.x - p0.x;
    for (let i = 0; i < 256; i++) {
      if (i <= p0.x) {
        lut[i] = Math.round(p0.y);
      } else if (i >= p1.x) {
        lut[i] = Math.round(p1.y);
      } else {
        const t = (i - p0.x) / dx;
        lut[i] = Math.round(p0.y + t * (p1.y - p0.y));
      }
      lut[i] = Math.max(0, Math.min(255, lut[i]));
    }
    return lut;
  }

  const xs = sorted.map((p) => p.x);
  const ys = sorted.map((p) => p.y);
  const h: number[] = [];
  const alpha: number[] = [0];

  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
  }
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  }

  const c = new Array(n).fill(0);
  const l = new Array(n).fill(1);
  const mu = new Array(n).fill(0);
  const z = new Array(n).fill(0);

  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  const b = new Array(n).fill(0);
  const d = new Array(n).fill(0);

  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - (h[j] * (c[j + 1] + 2 * c[j])) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  for (let i = 0; i < 256; i++) {
    if (i <= xs[0]) {
      lut[i] = Math.round(ys[0]);
    } else if (i >= xs[n - 1]) {
      lut[i] = Math.round(ys[n - 1]);
    } else {
      let seg = 0;
      for (let j = 0; j < n - 1; j++) {
        if (i >= xs[j] && i <= xs[j + 1]) {
          seg = j;
          break;
        }
      }
      const dx = i - xs[seg];
      lut[i] = Math.round(ys[seg] + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx);
    }
    lut[i] = Math.max(0, Math.min(255, lut[i]));
  }

  return lut;
}

function isLevelsIdentity(v: LevelsValues): boolean {
  return (
    v.blackPoint === 0 &&
    v.whitePoint === 255 &&
    v.gamma === 1 &&
    v.outBlack === 0 &&
    v.outWhite === 255
  );
}

function isCurveIdentity(points: CurvePoint[]): boolean {
  return (
    points.length === 2 &&
    points[0].x === 0 &&
    points[0].y === 0 &&
    points[1].x === 255 &&
    points[1].y === 255
  );
}

export function hasLevelsAdjustments(levels: LevelsState): boolean {
  return (["rgb", "red", "green", "blue"] as ToneChannel[]).some(
    (c) => !isLevelsIdentity(levels[c]),
  );
}

export function hasCurvesAdjustments(curves: CurvesState): boolean {
  return (["rgb", "red", "green", "blue"] as ToneChannel[]).some(
    (c) => !isCurveIdentity(curves[c]),
  );
}

/**
 * Compose the full Levels+Curves pipeline into one LUT per output channel.
 * Order matches stacked Photoshop adjustment layers: RGB levels, then per-channel
 * levels, then RGB curve, then per-channel curve.
 */
export function composeChannelLuts(
  levels: LevelsState,
  curves: CurvesState,
): { r: number[]; g: number[]; b: number[] } {
  const lRgb = levelsLut(levels.rgb);
  const cRgb = curveLut(curves.rgb);
  const build = (channel: "red" | "green" | "blue") => {
    const lCh = levelsLut(levels[channel]);
    const cCh = curveLut(curves[channel]);
    const out = new Array<number>(256);
    for (let i = 0; i < 256; i++) {
      out[i] = cCh[cRgb[lCh[lRgb[i]]]];
    }
    return out;
  };
  return { r: build("red"), g: build("green"), b: build("blue") };
}
