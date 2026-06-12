import type { FastifyInstance } from "fastify";
import Papa from "papaparse";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  kind: z.enum(["bar", "line", "pie"]).default("bar"),
  title: z.string().max(120).optional(),
  width: z.number().int().min(320).max(2048).default(960),
  height: z.number().int().min(240).max(1536).default(540),
});

const PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
];

/** XML-escape user-supplied text before embedding in SVG. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface DataPoint {
  label: string;
  value: number;
}

function parseInput(buf: Buffer, filename: string): DataPoint[] {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".json")) {
    const raw: unknown = JSON.parse(buf.toString("utf8"));
    // Array of {label, value}
    if (Array.isArray(raw)) {
      return raw.map((item: Record<string, unknown>) => ({
        label: String(item.label ?? ""),
        value: Number(item.value),
      }));
    }
    // Object: key -> number
    if (raw && typeof raw === "object") {
      return Object.entries(raw as Record<string, unknown>).map(([label, value]) => ({
        label,
        value: Number(value),
      }));
    }
    throw new Error("JSON must be an array of {label,value} or an object");
  }

  // CSV: column 1 = label, column 2 = numeric value
  const parsed = Papa.parse<string[]>(buf.toString("utf8"), {
    header: false,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
  }

  const rows = parsed.data;
  // Skip header row if first row col2 is non-numeric
  let start = 0;
  if (rows.length > 1 && Number.isNaN(Number(rows[0][1]))) {
    start = 1;
  }

  return rows.slice(start).map((row) => ({
    label: String(row[0] ?? ""),
    value: Number(row[1]),
  }));
}

function renderBarSvg(data: DataPoint[], w: number, h: number, title: string | undefined): string {
  const margin = { top: title ? 40 : 20, right: 20, bottom: 60, left: 50 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barW = plotW / data.length;
  const rotateLabels = data.length > 8;

  let bars = "";
  let labels = "";
  for (let i = 0; i < data.length; i++) {
    const barH = (data[i].value / maxVal) * plotH;
    const x = margin.left + i * barW + barW * 0.1;
    const y = margin.top + plotH - barH;
    const bw = barW * 0.8;
    bars += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" fill="${PALETTE[i % PALETTE.length]}"/>`;
    const lx = margin.left + i * barW + barW / 2;
    const ly = margin.top + plotH + 14;
    if (rotateLabels) {
      labels += `<text x="${lx}" y="${ly}" text-anchor="end" font-size="10" font-family="sans-serif" transform="rotate(-45,${lx},${ly})">${escapeXml(data[i].label)}</text>`;
    } else {
      labels += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="10" font-family="sans-serif">${escapeXml(data[i].label)}</text>`;
    }
  }

  // Axis line
  const axisLine = `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`;

  const titleSvg = title
    ? `<text x="${w / 2}" y="24" text-anchor="middle" font-size="14" font-weight="bold" font-family="sans-serif">${escapeXml(title)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/>${titleSvg}${axisLine}${bars}${labels}</svg>`;
}

function renderLineSvg(data: DataPoint[], w: number, h: number, title: string | undefined): string {
  const margin = { top: title ? 40 : 20, right: 20, bottom: 60, left: 50 };
  const plotW = w - margin.left - margin.right;
  const plotH = h - margin.top - margin.bottom;
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  const points: string[] = [];
  let dots = "";
  let labels = "";
  const rotateLabels = data.length > 8;

  for (let i = 0; i < data.length; i++) {
    const x = margin.left + (i / Math.max(data.length - 1, 1)) * plotW;
    const y = margin.top + plotH - (data[i].value / maxVal) * plotH;
    points.push(`${x},${y}`);
    dots += `<circle cx="${x}" cy="${y}" r="3" fill="${PALETTE[0]}"/>`;

    const ly = margin.top + plotH + 14;
    if (rotateLabels) {
      labels += `<text x="${x}" y="${ly}" text-anchor="end" font-size="10" font-family="sans-serif" transform="rotate(-45,${x},${ly})">${escapeXml(data[i].label)}</text>`;
    } else {
      labels += `<text x="${x}" y="${ly}" text-anchor="middle" font-size="10" font-family="sans-serif">${escapeXml(data[i].label)}</text>`;
    }
  }

  const polyline = `<polyline points="${points.join(" ")}" fill="none" stroke="${PALETTE[0]}" stroke-width="2"/>`;
  const axisLine = `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#333" stroke-width="1"/>`;

  const titleSvg = title
    ? `<text x="${w / 2}" y="24" text-anchor="middle" font-size="14" font-weight="bold" font-family="sans-serif">${escapeXml(title)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/>${titleSvg}${axisLine}${polyline}${dots}${labels}</svg>`;
}

function renderPieSvg(data: DataPoint[], w: number, h: number, title: string | undefined): string {
  const cx = w / 2 - 60;
  const cy = h / 2 + (title ? 10 : 0);
  const r = Math.min(cx, cy) - 30;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let angle = -Math.PI / 2;
  let slices = "";
  let legend = "";
  const legendX = cx + r + 30;

  for (let i = 0; i < data.length; i++) {
    const fraction = data[i].value / total;
    const endAngle = angle + fraction * Math.PI * 2;

    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;

    slices += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z" fill="${PALETTE[i % PALETTE.length]}"/>`;

    const ly = 40 + i * 18;
    legend += `<rect x="${legendX}" y="${ly - 8}" width="10" height="10" fill="${PALETTE[i % PALETTE.length]}"/>`;
    legend += `<text x="${legendX + 14}" y="${ly}" font-size="10" font-family="sans-serif">${escapeXml(data[i].label)}</text>`;

    angle = endAngle;
  }

  const titleSvg = title
    ? `<text x="${w / 2}" y="24" text-anchor="middle" font-size="14" font-weight="bold" font-family="sans-serif">${escapeXml(title)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/>${titleSvg}${slices}${legend}</svg>`;
}

export function registerChartMaker(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "chart-maker",
    settingsSchema,
    process: async () => {
      throw new Error("chart-maker is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");

      let data: DataPoint[];
      try {
        data = parseInput(input.buffer, input.filename);
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : "Failed to parse input");
      }

      if (data.length === 0) {
        throw new Error("No data points found in input");
      }
      if (data.length > 100) {
        throw new Error("Too many data points (max 100)");
      }

      // Validate numeric values
      for (const point of data) {
        if (Number.isNaN(point.value)) {
          throw new Error("Column 2 must be numeric");
        }
      }

      let svg: string;
      switch (settings.kind) {
        case "bar":
          svg = renderBarSvg(data, settings.width, settings.height, settings.title);
          break;
        case "line":
          svg = renderLineSvg(data, settings.width, settings.height, settings.title);
          break;
        case "pie":
          svg = renderPieSvg(data, settings.width, settings.height, settings.title);
          break;
      }

      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

      return {
        buffer: pngBuffer,
        filename: `${base}_chart.png`,
        contentType: "image/png",
      };
    },
  });
}
