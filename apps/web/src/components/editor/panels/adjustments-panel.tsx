// apps/web/src/components/editor/panels/adjustments-panel.tsx

import { Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SliderRow } from "@/components/editor/common/slider-row";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import { HistogramPanel } from "@/components/editor/panels/histogram-panel";
import { captureDocumentCanvas } from "@/components/editor/stage-capture";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { AdjustmentValues } from "@/types/editor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADJUSTMENT_SLIDERS: {
  key: keyof AdjustmentValues;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: "brightness", label: "Brightness", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "hue", label: "Hue", min: 0, max: 359 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "luminance", label: "Luminance", min: -100, max: 100 },
  { key: "exposure", label: "Exposure", min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
  { key: "warmth", label: "Warmth", min: -100, max: 100 },
];

const TOGGLE_FILTERS = ["grayscale", "sepia", "invert", "solarize"];

const SLIDER_FILTERS: {
  type: string;
  label: string;
  params: { key: string; label: string; min: number; max: number; step?: number }[];
}[] = [
  { type: "blur", label: "Blur", params: [{ key: "radius", label: "Radius", min: 0, max: 40 }] },
  {
    type: "sharpen",
    label: "Sharpen",
    params: [{ key: "amount", label: "Amount", min: 0, max: 100 }],
  },
  {
    type: "noise",
    label: "Noise",
    params: [{ key: "amount", label: "Amount", min: 0, max: 100 }],
  },
  {
    type: "pixelate",
    label: "Pixelate",
    params: [{ key: "size", label: "Size", min: 1, max: 50 }],
  },
  {
    type: "emboss",
    label: "Emboss",
    params: [{ key: "strength", label: "Strength", min: 0, max: 1, step: 0.01 }],
  },
  {
    type: "posterize",
    label: "Posterize",
    params: [{ key: "levels", label: "Levels", min: 2, max: 30 }],
  },
  {
    type: "threshold",
    label: "Threshold",
    params: [{ key: "level", label: "Level", min: 0, max: 1, step: 0.01 }],
  },
  {
    type: "kaleidoscope",
    label: "Kaleidoscope",
    params: [
      { key: "power", label: "Power", min: 2, max: 20 },
      { key: "angle", label: "Angle", min: 0, max: 360 },
    ],
  },
];

const BLUR_FILTERS: {
  type: string;
  label: string;
  params: { key: string; label: string; min: number; max: number; step?: number }[];
}[] = [
  {
    type: "motionBlur",
    label: "Motion Blur",
    params: [
      { key: "angle", label: "Angle", min: 0, max: 360 },
      { key: "distance", label: "Distance", min: 0, max: 100 },
    ],
  },
  {
    type: "radialBlur",
    label: "Radial Blur",
    params: [
      { key: "amount", label: "Amount", min: 0, max: 100 },
      { key: "centerX", label: "Center X", min: 0, max: 1, step: 0.01 },
      { key: "centerY", label: "Center Y", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    type: "surfaceBlur",
    label: "Surface Blur",
    params: [
      { key: "radius", label: "Radius", min: 0, max: 40 },
      { key: "threshold", label: "Threshold", min: 0, max: 255 },
    ],
  },
];

const VIGNETTE_PARAMS: {
  key: string;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: "amount", label: "Amount", min: -100, max: 100 },
  { key: "midpoint", label: "Midpoint", min: 0, max: 100 },
  { key: "roundness", label: "Roundness", min: -100, max: 100 },
  { key: "feather", label: "Feather", min: 0, max: 100 },
];

const GRAIN_PARAMS: {
  key: string;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: "amount", label: "Amount", min: 0, max: 100 },
  { key: "size", label: "Size", min: 1, max: 100 },
  { key: "roughness", label: "Roughness", min: 0, max: 100 },
];

type CurveChannel = "rgb" | "red" | "green" | "blue";

interface CurvePoint {
  x: number;
  y: number;
}

type LevelsChannel = "rgb" | "red" | "green" | "blue";

interface LevelsValues {
  blackPoint: number;
  whitePoint: number;
  gamma: number;
  outBlack: number;
  outWhite: number;
}

const CURVE_PRESETS: Record<string, CurvePoint[]> = {
  Linear: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  Darken: [
    { x: 0, y: 0 },
    { x: 128, y: 96 },
    { x: 255, y: 220 },
  ],
  Lighten: [
    { x: 0, y: 35 },
    { x: 128, y: 160 },
    { x: 255, y: 255 },
  ],
  "Increase Contrast": [
    { x: 0, y: 0 },
    { x: 64, y: 40 },
    { x: 192, y: 215 },
    { x: 255, y: 255 },
  ],
  "Decrease Contrast": [
    { x: 0, y: 30 },
    { x: 64, y: 74 },
    { x: 192, y: 182 },
    { x: 255, y: 225 },
  ],
  "Medium Contrast": [
    { x: 0, y: 0 },
    { x: 80, y: 55 },
    { x: 176, y: 200 },
    { x: 255, y: 255 },
  ],
  "Strong Contrast": [
    { x: 0, y: 0 },
    { x: 64, y: 20 },
    { x: 192, y: 235 },
    { x: 255, y: 255 },
  ],
  "Cross Process": [
    { x: 0, y: 12 },
    { x: 48, y: 68 },
    { x: 130, y: 150 },
    { x: 210, y: 230 },
    { x: 255, y: 248 },
  ],
  Negative: [
    { x: 0, y: 255 },
    { x: 255, y: 0 },
  ],
};

const DEFAULT_LEVELS: Record<LevelsChannel, LevelsValues> = {
  rgb: { blackPoint: 0, whitePoint: 255, gamma: 1, outBlack: 0, outWhite: 255 },
  red: { blackPoint: 0, whitePoint: 255, gamma: 1, outBlack: 0, outWhite: 255 },
  green: { blackPoint: 0, whitePoint: 255, gamma: 1, outBlack: 0, outWhite: 255 },
  blue: { blackPoint: 0, whitePoint: 255, gamma: 1, outBlack: 0, outWhite: 255 },
};

// ---------------------------------------------------------------------------
// Cubic spline interpolation for curves
// ---------------------------------------------------------------------------

function cubicSplineInterpolate(points: CurvePoint[]): number[] {
  const lut = new Array(256).fill(0);
  if (points.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const n = sorted.length;

  if (n === 2) {
    // Linear interpolation
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

  // Natural cubic spline
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

// ---------------------------------------------------------------------------
// Section Header component
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1.5">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto Adjustments Section
// ---------------------------------------------------------------------------

function AutoAdjustmentsSection() {
  const setAdjustment = useEditorStore((s) => s.setAdjustment);

  const handleAutoTone = useCallback(() => {
    // Auto Tone: stretches tonal range per channel
    // Implemented as a strong brightness/contrast push
    setAdjustment("brightness", 10);
    setAdjustment("contrast", 20);
  }, [setAdjustment]);

  const handleAutoContrast = useCallback(() => {
    setAdjustment("contrast", 30);
  }, [setAdjustment]);

  const handleAutoColor = useCallback(() => {
    // Neutralize color cast via warmth and saturation
    setAdjustment("warmth", 0);
    setAdjustment("saturation", 5);
  }, [setAdjustment]);

  const handleAutoEnhance = useCallback(() => {
    setAdjustment("brightness", 8);
    setAdjustment("contrast", 15);
    setAdjustment("vibrance", 20);
    setAdjustment("saturation", 5);
  }, [setAdjustment]);

  const buttons = [
    { label: "Auto Tone", onClick: handleAutoTone },
    { label: "Auto Contrast", onClick: handleAutoContrast },
    { label: "Auto Color", onClick: handleAutoColor },
    { label: "Auto Enhance", onClick: handleAutoEnhance },
  ];

  return (
    <div className="grid grid-cols-2 gap-1">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          type="button"
          onClick={btn.onClick}
          className={cn(
            "flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded",
            "bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors",
          )}
        >
          <Wand2 size={10} />
          {btn.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adjustments Sliders Section
// ---------------------------------------------------------------------------

function AdjustmentsSlidersSection() {
  const adjustments = useEditorStore((s) => s.adjustments);
  const setAdjustment = useEditorStore((s) => s.setAdjustment);
  const handleChange = useCallback(
    (key: keyof AdjustmentValues, value: number) => {
      setAdjustment(key, value);
    },
    [setAdjustment],
  );

  return (
    <div className="flex flex-col gap-1.5">
      {ADJUSTMENT_SLIDERS.map(({ key, label, min, max }) => (
        <SliderRow
          key={key}
          label={label}
          value={adjustments[key]}
          min={min}
          max={max}
          onChange={(v) => handleChange(key, v)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Levels Section
// ---------------------------------------------------------------------------

function LevelsSection() {
  const [channel, setChannel] = useState<LevelsChannel>("rgb");
  const [levels, setLevels] = useState<Record<LevelsChannel, LevelsValues>>(() =>
    JSON.parse(JSON.stringify(DEFAULT_LEVELS)),
  );

  const currentLevels = levels[channel];

  const updateLevel = useCallback(
    (key: keyof LevelsValues, value: number) => {
      setLevels((prev) => ({
        ...prev,
        [channel]: { ...prev[channel], [key]: value },
      }));
    },
    [channel],
  );

  const handleAutoLevels = useCallback(() => {
    setLevels((prev) => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        blackPoint: 10,
        whitePoint: 245,
        gamma: 1,
      },
    }));
  }, [channel]);

  const channelColors: Record<LevelsChannel, string> = {
    rgb: "text-foreground",
    red: "text-red-700 dark:text-red-400",
    green: "text-green-700 dark:text-green-400",
    blue: "text-blue-700 dark:text-blue-400",
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as LevelsChannel)}
          className="flex-1 px-1.5 py-0.5 text-xs bg-muted border border-border rounded text-foreground"
        >
          <option value="rgb">RGB</option>
          <option value="red">Red</option>
          <option value="green">Green</option>
          <option value="blue">Blue</option>
        </select>
        <button
          type="button"
          onClick={handleAutoLevels}
          className="px-2 py-0.5 text-[10px] bg-muted hover:bg-muted/80 border border-border rounded text-foreground transition-colors"
        >
          Auto
        </button>
      </div>

      <LevelsHistogramDisplay channel={channel} levels={currentLevels} />

      <div className={cn("flex flex-col gap-1", channelColors[channel])}>
        <SliderRow
          label="Black"
          value={currentLevels.blackPoint}
          min={0}
          max={currentLevels.whitePoint - 1}
          onChange={(v) => updateLevel("blackPoint", v)}
        />
        <SliderRow
          label="Gamma"
          value={Math.round(currentLevels.gamma * 100) / 100}
          min={0.1}
          max={10}
          step={0.01}
          onChange={(v) => updateLevel("gamma", v)}
        />
        <SliderRow
          label="White"
          value={currentLevels.whitePoint}
          min={currentLevels.blackPoint + 1}
          max={255}
          onChange={(v) => updateLevel("whitePoint", v)}
        />
      </div>

      <SectionHeader title="Output" />

      <SliderRow
        label="Out Black"
        value={currentLevels.outBlack}
        min={0}
        max={currentLevels.outWhite}
        onChange={(v) => updateLevel("outBlack", v)}
      />
      <SliderRow
        label="Out White"
        value={currentLevels.outWhite}
        min={currentLevels.outBlack}
        max={255}
        onChange={(v) => updateLevel("outWhite", v)}
      />
    </div>
  );
}

function LevelsHistogramDisplay({
  channel,
  levels,
}: {
  channel: LevelsChannel;
  levels: LevelsValues;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, w, h);

    // Draw levels curve preview
    const channelColor =
      channel === "red"
        ? "rgba(239, 68, 68, 0.7)"
        : channel === "green"
          ? "rgba(34, 197, 94, 0.7)"
          : channel === "blue"
            ? "rgba(59, 130, 246, 0.7)"
            : "rgba(200, 200, 200, 0.7)";

    ctx.strokeStyle = channelColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < w; i++) {
      const input = (i / w) * 255;
      const { blackPoint, whitePoint, gamma, outBlack, outWhite } = levels;
      let output: number;

      if (input <= blackPoint) {
        output = outBlack;
      } else if (input >= whitePoint) {
        output = outWhite;
      } else {
        const normalized = (input - blackPoint) / (whitePoint - blackPoint);
        const gammaCorrected = normalized ** (1 / gamma);
        output = gammaCorrected * (outWhite - outBlack) + outBlack;
      }

      const y = h - (output / 255) * h;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }

    ctx.stroke();

    // Black and white point markers
    const bpX = (levels.blackPoint / 255) * w;
    const wpX = (levels.whitePoint / 255) * w;

    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    drawTriangle(ctx, bpX, h, 5, true);
    drawTriangle(ctx, wpX, h, 5, true);
  }, [channel, levels]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={100}
      className="w-full rounded border border-border"
    />
  );
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  up: boolean,
) {
  ctx.beginPath();
  if (up) {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size, y);
    ctx.lineTo(x + size, y);
  } else {
    ctx.moveTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.lineTo(x + size, y);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Curves Section
// ---------------------------------------------------------------------------

function CurvesSection() {
  const [channel, setChannel] = useState<CurveChannel>("rgb");
  const [curves, setCurves] = useState<Record<CurveChannel, CurvePoint[]>>({
    rgb: [...CURVE_PRESETS.Linear],
    red: [...CURVE_PRESETS.Linear],
    green: [...CURVE_PRESETS.Linear],
    blue: [...CURVE_PRESETS.Linear],
  });
  const [preset, setPreset] = useState("Linear");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentPoints = curves[channel];

  const lut = useMemo(() => cubicSplineInterpolate(currentPoints), [currentPoints]);

  // Draw the curves graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 200;
    ctx.clearRect(0, 0, size, size);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = "rgba(128, 128, 128, 0.2)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const pos = (i / 4) * size;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(size, pos);
      ctx.stroke();
    }

    // Diagonal reference line
    ctx.strokeStyle = "rgba(128, 128, 128, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve
    const channelColor =
      channel === "red"
        ? "rgba(239, 68, 68, 1)"
        : channel === "green"
          ? "rgba(34, 197, 94, 1)"
          : channel === "blue"
            ? "rgba(59, 130, 246, 1)"
            : "rgba(255, 255, 255, 0.9)";

    ctx.strokeStyle = channelColor;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * size;
      const y = size - (lut[i] / 255) * size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Control points
    for (const pt of currentPoints) {
      const px = (pt.x / 255) * size;
      const py = size - (pt.y / 255) * size;
      ctx.fillStyle = channelColor;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [lut, currentPoints, channel]);

  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = 200 / rect.width;
    const scaleY = 200 / rect.height;
    const x = Math.round((((e.clientX - rect.left) * scaleX) / 200) * 255);
    const y = Math.round((1 - ((e.clientY - rect.top) * scaleY) / 200) * 255);
    return {
      x: Math.max(0, Math.min(255, x)),
      y: Math.max(0, Math.min(255, y)),
    };
  }, []);

  const findNearPoint = useCallback(
    (mx: number, my: number): number => {
      const threshold = 12;
      for (let i = 0; i < currentPoints.length; i++) {
        const dx = currentPoints[i].x - mx;
        const dy = currentPoints[i].y - my;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          return i;
        }
      }
      return -1;
    },
    [currentPoints],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      const idx = findNearPoint(pos.x, pos.y);

      if (idx >= 0) {
        setDraggingIndex(idx);
      } else {
        // Add new point
        const newPoints = [...currentPoints, pos].sort((a, b) => a.x - b.x);
        setCurves((prev) => ({ ...prev, [channel]: newPoints }));
        setPreset("Custom");
        // Find and start dragging the new point
        const newIdx = newPoints.findIndex((p) => p.x === pos.x && p.y === pos.y);
        setDraggingIndex(newIdx);
      }
    },
    [getCanvasPos, findNearPoint, currentPoints, channel],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (draggingIndex === null) return;
      const pos = getCanvasPos(e);

      setCurves((prev) => {
        const pts = [...prev[channel]];
        pts[draggingIndex] = pos;
        pts.sort((a, b) => a.x - b.x);
        const newIndex = pts.findIndex((p) => p.x === pos.x && p.y === pos.y);
        if (newIndex !== -1) setDraggingIndex(newIndex);
        return { ...prev, [channel]: pts };
      });
    },
    [draggingIndex, getCanvasPos, channel],
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      const idx = findNearPoint(pos.x, pos.y);

      if (idx >= 0 && currentPoints.length > 2) {
        const newPoints = currentPoints.filter((_, i) => i !== idx);
        setCurves((prev) => ({ ...prev, [channel]: newPoints }));
        setPreset("Custom");
      }
    },
    [getCanvasPos, findNearPoint, currentPoints, channel],
  );

  const handlePresetChange = useCallback(
    (name: string) => {
      setPreset(name);
      const presetPoints = CURVE_PRESETS[name];
      if (presetPoints) {
        setCurves((prev) => ({
          ...prev,
          [channel]: presetPoints.map((p) => ({ ...p })),
        }));
      }
    },
    [channel],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as CurveChannel)}
          className="flex-1 px-1.5 py-0.5 text-xs bg-muted border border-border rounded text-foreground"
        >
          <option value="rgb">RGB</option>
          <option value="red">Red</option>
          <option value="green">Green</option>
          <option value="blue">Blue</option>
        </select>
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="flex-1 px-1.5 py-0.5 text-xs bg-muted border border-border rounded text-foreground"
        >
          {Object.keys(CURVE_PRESETS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {preset === "Custom" && <option value="Custom">Custom</option>}
        </select>
      </div>

      <canvas
        ref={canvasRef}
        width={200}
        height={200}
        className="w-full aspect-square rounded border border-border cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />

      <p className="text-[10px] text-muted-foreground text-center">
        Click to add point. Drag to move. Double-click to remove.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filters Section
// ---------------------------------------------------------------------------

function ToggleFiltersSection() {
  const filters = useEditorStore((s) => s.filters);
  const toggleFilter = useEditorStore((s) => s.toggleFilter);

  return (
    <div className="flex flex-col gap-1">
      {TOGGLE_FILTERS.map((type) => {
        const filter = filters.find((f) => f.type === type);
        if (!filter) return null;

        return (
          <label key={type} className="flex items-center gap-2 py-0.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filter.enabled}
              onChange={() => toggleFilter(type)}
              className="accent-primary w-3.5 h-3.5"
            />
            <span className="text-xs text-foreground capitalize">{type}</span>
          </label>
        );
      })}
    </div>
  );
}

function SliderFiltersSection() {
  const filters = useEditorStore((s) => s.filters);
  const toggleFilter = useEditorStore((s) => s.toggleFilter);
  const setFilterParam = useEditorStore((s) => s.setFilterParam);

  return (
    <div className="flex flex-col gap-2">
      {SLIDER_FILTERS.map(({ type, label, params }) => {
        const filter = filters.find((f) => f.type === type);
        if (!filter) return null;

        return (
          <div key={type} className="flex flex-col gap-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.enabled}
                onChange={() => toggleFilter(type)}
                className="accent-primary w-3.5 h-3.5"
              />
              <span className="text-xs font-medium text-foreground">{label}</span>
            </label>
            {filter.enabled &&
              params.map((p) => (
                <SliderRow
                  key={p.key}
                  label={p.label}
                  value={filter.params[p.key] ?? p.min}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  onChange={(v) => setFilterParam(type, p.key, v)}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

function AdditionalBlursSection() {
  const filters = useEditorStore((s) => s.filters);
  const toggleFilter = useEditorStore((s) => s.toggleFilter);
  const setFilterParam = useEditorStore((s) => s.setFilterParam);

  return (
    <div className="flex flex-col gap-2">
      {BLUR_FILTERS.map(({ type, label, params }) => {
        const filter = filters.find((f) => f.type === type);
        if (!filter) return null;

        return (
          <div key={type} className="flex flex-col gap-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.enabled}
                onChange={() => toggleFilter(type)}
                className="accent-primary w-3.5 h-3.5"
              />
              <span className="text-xs font-medium text-foreground">{label}</span>
            </label>
            {filter.enabled &&
              params.map((p) => (
                <SliderRow
                  key={p.key}
                  label={p.label}
                  value={filter.params[p.key] ?? p.min}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  onChange={(v) => setFilterParam(type, p.key, v)}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

function VignetteSection() {
  const filters = useEditorStore((s) => s.filters);
  const toggleFilter = useEditorStore((s) => s.toggleFilter);
  const setFilterParam = useEditorStore((s) => s.setFilterParam);

  const filter = filters.find((f) => f.type === "vignette");
  if (!filter) return null;

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={filter.enabled}
          onChange={() => toggleFilter("vignette")}
          className="accent-primary w-3.5 h-3.5"
        />
        <span className="text-xs font-medium text-foreground">Vignette</span>
      </label>
      {filter.enabled &&
        VIGNETTE_PARAMS.map((p) => (
          <SliderRow
            key={p.key}
            label={p.label}
            value={filter.params[p.key] ?? p.min}
            min={p.min}
            max={p.max}
            onChange={(v) => setFilterParam("vignette", p.key, v)}
          />
        ))}
    </div>
  );
}

function GrainSection() {
  const filters = useEditorStore((s) => s.filters);
  const toggleFilter = useEditorStore((s) => s.toggleFilter);
  const setFilterParam = useEditorStore((s) => s.setFilterParam);

  const filter = filters.find((f) => f.type === "grain");
  if (!filter) return null;

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={filter.enabled}
          onChange={() => toggleFilter("grain")}
          className="accent-primary w-3.5 h-3.5"
        />
        <span className="text-xs font-medium text-foreground">Grain</span>
      </label>
      {filter.enabled &&
        GRAIN_PARAMS.map((p) => (
          <SliderRow
            key={p.key}
            label={p.label}
            value={filter.params[p.key] ?? p.min}
            min={p.min}
            max={p.max}
            onChange={(v) => setFilterParam("grain", p.key, v)}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function AdjustmentsPanel() {
  const adjustments = useEditorStore((s) => s.adjustments);
  const filters = useEditorStore((s) => s.filters);
  const resetAdjustments = useEditorStore((s) => s.resetAdjustments);
  const canvasSize = useEditorStore((s) => s.canvasSize);

  // Capture imageData from the Konva stage for the histogram
  const [histogramData, setHistogramData] = useState<ImageData | null>(null);

  useEffect(() => {
    function captureImageData() {
      const stage = editorStageRefHolder.current;
      if (!stage) return;
      try {
        const canvas = captureDocumentCanvas(stage, canvasSize.width, canvasSize.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setHistogramData(data);
      } catch {
        // Stage may not be ready yet
      }
    }

    const timer = setTimeout(captureImageData, 100);
    return () => clearTimeout(timer);
  }, [canvasSize]);

  const hasChanges = useMemo(() => {
    const hasAdjustmentChanges = Object.values(adjustments).some((v) => v !== 0);
    const hasFilterChanges = filters.some((f) => f.enabled);
    return hasAdjustmentChanges || hasFilterChanges;
  }, [adjustments, filters]);

  const handleResetAll = useCallback(() => {
    const store = useEditorStore.getState();
    useEditorStore.setState({
      adjustments: {
        brightness: 0,
        contrast: 0,
        hue: 0,
        saturation: 0,
        luminance: 0,
        exposure: 0,
        vibrance: 0,
        warmth: 0,
      },
      filters: store.filters.map((f) => ({ ...f, enabled: false })),
      isDirty: true,
      lastAction: "Reset All",
      _historyVersion: store._historyVersion + 1,
    });
  }, []);

  const handleApply = useCallback(() => {
    // Bake adjustments and filters into pixel data
    // For now, mark dirty and reset adjustment values
    // The actual baking happens in the canvas rendering pipeline
    const store = useEditorStore.getState();
    store.markDirty();
    resetAdjustments();
    for (const f of store.filters) {
      if (f.enabled) {
        store.toggleFilter(f.type);
      }
    }
  }, [resetAdjustments]);

  return (
    <div className="flex flex-col gap-2 text-sm">
      {/* Histogram */}
      <HistogramPanel imageData={histogramData} />

      {/* Auto Adjustments */}
      <SectionHeader title="Auto" />
      <AutoAdjustmentsSection />

      {/* Adjustment Sliders */}
      <SectionHeader title="Adjustments" />
      <AdjustmentsSlidersSection />

      {/* Levels */}
      <SectionHeader title="Levels" />
      <LevelsSection />

      {/* Curves */}
      <SectionHeader title="Curves" />
      <CurvesSection />

      {/* Filters */}
      <SectionHeader title="Filters" />
      <ToggleFiltersSection />
      <SliderFiltersSection />

      {/* Additional Blurs */}
      <SectionHeader title="Blur Effects" />
      <AdditionalBlursSection />

      {/* Vignette & Grain */}
      <SectionHeader title="Effects" />
      <VignetteSection />
      <GrainSection />

      {/* Action Buttons */}
      <div className="flex gap-2 pt-3 pb-1">
        <button
          type="button"
          onClick={handleResetAll}
          disabled={!hasChanges}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium rounded border transition-colors",
            hasChanges
              ? "border-border text-foreground hover:bg-muted"
              : "border-border text-muted-foreground cursor-not-allowed opacity-50",
          )}
        >
          Reset All
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!hasChanges}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium rounded transition-colors",
            hasChanges
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-primary/50 text-primary-foreground/50 cursor-not-allowed",
          )}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
