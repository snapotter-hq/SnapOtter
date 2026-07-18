// apps/web/src/components/editor/panels/histogram-panel.tsx

import { useCallback, useEffect, useRef, useState } from "react";

const HIST_WIDTH = 256;
const HIST_HEIGHT = 80;
const DEBOUNCE_MS = 300;

interface HistogramStats {
  mean: [number, number, number];
  stdDev: [number, number, number];
  median: [number, number, number];
}

function computeHistogram(imageData: ImageData) {
  const rBins = new Uint32Array(256);
  const gBins = new Uint32Array(256);
  const bBins = new Uint32Array(256);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    rBins[data[i]]++;
    gBins[data[i + 1]]++;
    bBins[data[i + 2]]++;
  }

  return { rBins, gBins, bBins };
}

function computeStats(rBins: Uint32Array, gBins: Uint32Array, bBins: Uint32Array): HistogramStats {
  const channelStats = (bins: Uint32Array): [number, number, number] => {
    let total = 0;
    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < 256; i++) {
      total += bins[i];
      sum += i * bins[i];
      sumSq += i * i * bins[i];
    }

    if (total === 0) return [0, 0, 0];

    const mean = sum / total;
    const variance = sumSq / total - mean * mean;
    const stdDev = Math.sqrt(Math.max(0, variance));

    // Median
    let cumulative = 0;
    const half = total / 2;
    let median = 0;
    for (let i = 0; i < 256; i++) {
      cumulative += bins[i];
      if (cumulative >= half) {
        median = i;
        break;
      }
    }

    return [Math.round(mean * 10) / 10, Math.round(stdDev * 10) / 10, median];
  };

  const [rMean, rStdDev, rMedian] = channelStats(rBins);
  const [gMean, gStdDev, gMedian] = channelStats(gBins);
  const [bMean, bStdDev, bMedian] = channelStats(bBins);

  return {
    mean: [rMean, gMean, bMean],
    stdDev: [rStdDev, gStdDev, bStdDev],
    median: [rMedian, gMedian, bMedian],
  };
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  bins: Uint32Array,
  maxVal: number,
  color: string,
) {
  if (maxVal === 0) return;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(0, HIST_HEIGHT);

  for (let i = 0; i < 256; i++) {
    const h = (bins[i] / maxVal) * HIST_HEIGHT;
    ctx.lineTo(i, HIST_HEIGHT - h);
  }

  ctx.lineTo(255, HIST_HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let i = 0; i < 256; i++) {
    const h = (bins[i] / maxVal) * HIST_HEIGHT;
    if (i === 0) {
      ctx.moveTo(i, HIST_HEIGHT - h);
    } else {
      ctx.lineTo(i, HIST_HEIGHT - h);
    }
  }

  ctx.stroke();
  ctx.globalAlpha = 1;
}

interface HistogramPanelProps {
  stageRef?: React.RefObject<HTMLCanvasElement | null>;
  imageData?: ImageData | null;
}

// Issue #2: When no imageData is provided, show a placeholder message
export function HistogramPanel({ imageData }: HistogramPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<HistogramStats | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const renderHistogram = useCallback((data: ImageData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { rBins, gBins, bBins } = computeHistogram(data);
    const newStats = computeStats(rBins, gBins, bBins);
    setStats(newStats);

    // Find max for normalization
    let maxVal = 0;
    for (let i = 0; i < 256; i++) {
      maxVal = Math.max(maxVal, rBins[i], gBins[i], bBins[i]);
    }

    ctx.clearRect(0, 0, HIST_WIDTH, HIST_HEIGHT);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, HIST_WIDTH, HIST_HEIGHT);

    drawChannel(ctx, rBins, maxVal, "rgba(239, 68, 68, 1)");
    drawChannel(ctx, gBins, maxVal, "rgba(34, 197, 94, 1)");
    drawChannel(ctx, bBins, maxVal, "rgba(59, 130, 246, 1)");
  }, []);

  useEffect(() => {
    if (!imageData) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      renderHistogram(imageData);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [imageData, renderHistogram]);

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvasRef}
        width={HIST_WIDTH}
        height={HIST_HEIGHT}
        className="w-full rounded border border-border"
        style={{ imageRendering: "pixelated" }}
      />
      {!imageData && !stats && (
        <p className="text-[10px] text-muted-foreground text-center py-1">
          No histogram data available
        </p>
      )}
      {stats && (
        <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
          <div>
            <span className="font-medium">Mean</span>
            <br />
            <span className="text-red-700 dark:text-red-400">{stats.mean[0]}</span>{" "}
            <span className="text-green-700 dark:text-green-400">{stats.mean[1]}</span>{" "}
            <span className="text-blue-700 dark:text-blue-400">{stats.mean[2]}</span>
          </div>
          <div>
            <span className="font-medium">StdDev</span>
            <br />
            <span className="text-red-700 dark:text-red-400">{stats.stdDev[0]}</span>{" "}
            <span className="text-green-700 dark:text-green-400">{stats.stdDev[1]}</span>{" "}
            <span className="text-blue-700 dark:text-blue-400">{stats.stdDev[2]}</span>
          </div>
          <div>
            <span className="font-medium">Median</span>
            <br />
            <span className="text-red-700 dark:text-red-400">{stats.median[0]}</span>{" "}
            <span className="text-green-700 dark:text-green-400">{stats.median[1]}</span>{" "}
            <span className="text-blue-700 dark:text-blue-400">{stats.median[2]}</span>
          </div>
        </div>
      )}
    </div>
  );
}
