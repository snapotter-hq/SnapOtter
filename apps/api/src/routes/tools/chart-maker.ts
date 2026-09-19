import { isToolInputError, ToolInputError } from "@snapotter/shared";
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

/**
 * A grid of raw cells plus, when the source had them, the column names.
 * CSV builds one from the parsed rows and JSON from the object keys, so both
 * go through the same column detection below.
 */
interface Table {
  /** Column names, used to name columns back to the user in errors. */
  header?: string[];
  rows: string[][];
}

const JSON_SHAPES =
  'Chart Maker reads JSON as an array of objects ([{"label": "Q1", "value": 12}]), ' +
  'an object of name to number ({"Q1": 12}), or an array wrapped in a single ' +
  'property ({"data": [...]}).';

/** A column carries the values only if MORE than half its rows hold a number. */
const NUMERIC_MAJORITY = 0.5;

/**
 * Error messages wider than friendlyError's 280-character limit collapse to a
 * generic "Processing failed", which would throw away the column names that
 * are the point of this message. Stay well under it.
 */
function noNumericColumnMessage(header: string[] | undefined, width: number): string {
  const lead = "Chart Maker needs a numeric column to plot, and ";
  if (header?.length) {
    const shown = header.slice(0, 6).map((name) => name.trim().slice(0, 24));
    const rest = header.length - shown.length;
    const names = shown.join(", ") + (rest > 0 ? `, and ${rest} more` : "");
    const message = `${lead}none of these have numbers: ${names}.`;
    if (message.length <= 260) return message;
  }
  return `${lead}none of the ${width} columns in this file have numbers.`;
}

/**
 * Read one cell as a chart value, or null when it holds no number.
 *
 * The null cases carry the weight here. Number("") and Number(" ") are both 0,
 * so without the blank guard an empty column would win the vote below and
 * render a chart of zeros. Number("Infinity") is Infinity, which renders as a
 * degenerate SVG that Sharp drops on the floor.
 */
function numericCell(cell: unknown): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  const trimmed = cell.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCell(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Work out which column holds the labels and which holds the numbers, then
 * read the points off.
 *
 * Spreadsheets put dimensions on the left and measures on the right, so the
 * value is the RIGHTMOST column that parses as a number in most rows and the
 * label is the LEFTMOST column that does not. Rightmost beats leftmost for the
 * value because a leading "id" or "year" column is numeric but is never the
 * measure anyone wants plotted. The tradeoff runs the other way for a file
 * ending in a numeric column nobody wants charted (name,score,year); that one
 * is genuinely ambiguous, and picking left would break the far more common
 * leading-id shape instead.
 */
function tableToPoints({ header, rows }: Table): DataPoint[] {
  if (rows.length === 0) return [];

  // Counted in a loop, not Math.max(...spread): the row cap is applied after
  // parsing, so a large CSV reaches here and would blow the argument limit.
  let width = header?.length ?? 0;
  for (const row of rows) {
    if (row.length > width) width = row.length;
  }

  const numericShare: number[] = [];
  const hasNegative: boolean[] = [];
  for (let col = 0; col < width; col++) {
    let numeric = 0;
    let negative = false;
    for (const row of rows) {
      const cell = numericCell(row[col]);
      if (cell === null) continue;
      numeric += 1;
      if (cell < 0) negative = true;
    }
    numericShare.push(numeric / rows.length);
    hasNegative.push(negative);
  }

  // Skip past a rightmost column that holds negatives: the renderers cannot
  // draw a negative bar or arc, so a growth or delta column on the right is
  // not a chartable column. Keep it as the fallback so a file whose only
  // numbers are negative still gets the specific message further down rather
  // than "no numeric column".
  let valueCol = -1;
  let negativeCol = -1;
  for (let col = width - 1; col >= 0; col--) {
    if (numericShare[col] <= NUMERIC_MAJORITY) continue;
    if (negativeCol < 0) negativeCol = col;
    if (!hasNegative[col]) {
      valueCol = col;
      break;
    }
  }
  if (valueCol < 0) valueCol = negativeCol;
  if (valueCol < 0) throw new ToolInputError(noNumericColumnMessage(header, width));

  let labelCol = -1;
  for (let col = 0; col < width; col++) {
    if (col !== valueCol && numericShare[col] <= NUMERIC_MAJORITY) {
      labelCol = col;
      break;
    }
  }
  // Every other column is numeric too (a year/sales pair, say). Fall back to
  // the leftmost column that is not the value, and to row numbers when the
  // file has only the one column.
  if (labelCol < 0 && width > 1) labelCol = valueCol === 0 ? 1 : 0;

  const points: DataPoint[] = [];
  for (const row of rows) {
    // A row with no number in the value column is not a data row. Blank cells
    // are the common case. Numbers written the way a spreadsheet displays them
    // ("1,200", "$40") are not read as numbers and are dropped here too, which
    // is issue #1198.
    const value = numericCell(row[valueCol]);
    if (value === null) continue;
    points.push({
      label: labelCol < 0 ? String(points.length + 1) : toCell(row[labelCol]).trim(),
      value,
    });
  }
  return points;
}

function parseCsv(text: string): Table {
  // "greedy" also drops rows of bare commas, which every spreadsheet export
  // trails. Plain `true` keeps them as [""] cells that drag the numeric vote
  // below the majority and rejected the file.
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
  const rows = parsed.data;

  // A one-column CSV always reports UndetectableDelimiter and Papa hands back
  // the rows anyway, so treating that as fatal rejected single-column files
  // outright. Forgive it only when the parse really did yield one column:
  // the same code fires when detection failed and the comma fallback split
  // the data, and "sales / 1,200 / 2,400" must stay an error rather than
  // become a chart of 200 and 400.
  const singleColumn = rows.every((row) => row.length === 1);
  const fatal = parsed.errors.filter(
    (err) => !(err.code === "UndetectableDelimiter" && singleColumn),
  );
  if (fatal.length > 0) {
    throw new ToolInputError(`CSV parse failed: ${fatal[0].message}`);
  }
  // The first row is a header when nothing in it is a number. This replaces
  // the old probe, which asked only whether column 2 was numeric and so read
  // the wrong thing for every file whose numbers live elsewhere.
  const hasHeader = rows.length > 1 && rows[0].every((cell) => numericCell(cell) === null);
  return hasHeader ? { header: rows[0], rows: rows.slice(1) } : { rows };
}

function pointsFromJsonArray(items: unknown[]): DataPoint[] {
  if (items.length === 0) return [];

  const objects = items.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
  if (objects.length !== items.length) throw new ToolInputError(JSON_SHAPES);

  // An explicit {label, value} shape wins: the file named its fields, so don't
  // second-guess it by sniffing the other keys.
  if (objects.every((item) => "value" in item)) {
    return objects.map((item) => {
      const value = numericCell(item.value);
      if (value === null) {
        // Sliced: the value can be an arbitrarily large nested object, and a
        // message over 280 characters collapses to a generic one.
        const shown = JSON.stringify(item.value) ?? "undefined";
        throw new ToolInputError(
          `Chart Maker needs every "value" to be a number, and ${shown.slice(0, 60)} is not.`,
        );
      }
      return { label: toCell(item.label).trim(), value };
    });
  }

  // Union of every object's keys, not just the first one's: records that omit
  // an optional field would otherwise read as blank and be dropped.
  const keys = [...new Set(objects.flatMap((item) => Object.keys(item)))];
  if (keys.length === 0) throw new ToolInputError(JSON_SHAPES);
  return tableToPoints({
    header: keys,
    rows: objects.map((item) => keys.map((key) => toCell(item[key]))),
  });
}

function isNumericEntry(entry: { label: string; value: number | null }): entry is DataPoint {
  return entry.value !== null;
}

function pointsFromJson(raw: unknown): DataPoint[] {
  if (Array.isArray(raw)) return pointsFromJsonArray(raw);
  if (typeof raw !== "object" || raw === null) throw new ToolInputError(JSON_SHAPES);

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) throw new ToolInputError(JSON_SHAPES);

  const flat = entries.map(([label, value]) => ({ label, value: numericCell(value) }));
  if (flat.every(isNumericEntry)) return flat;

  // Exports wrap their rows: {"data": [...]}, {"results": [...]}, and friends.
  const wrapped = entries.filter(([, value]) => Array.isArray(value));
  if (wrapped.length === 1) return pointsFromJsonArray(wrapped[0][1] as unknown[]);

  throw new ToolInputError(JSON_SHAPES);
}

function parseInput(buf: Buffer): DataPoint[] {
  // Strip a UTF-8 BOM. JS counts U+FEFF as whitespace so the sniff below still
  // matches, but JSON.parse rejects it, which killed every BOM'd export.
  // Papa strips it from CSV on its own.
  const text = buf.toString("utf8").replace(/^﻿/, "");

  // Sniff the content instead of trusting the extension. Dispatching on the
  // filename sent every .json file holding CSV, and the reverse, into the
  // wrong parser, where it died on a syntax error about the wrong format.
  if (/^\s*[[{]/.test(text)) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new ToolInputError(
        `This file starts like JSON but does not parse: ${err instanceof Error ? err.message : "invalid JSON"}`,
      );
    }
    return pointsFromJson(raw);
  }

  return tableToPoints(parseCsv(text));
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
        data = parseInput(input.buffer);
      } catch (err) {
        // Every throw inside parseInput is already a ToolInputError. Blanket
        // rewrapping anything else as one told the user their file was at
        // fault and, because worker.ts skips logger.error for input errors,
        // kept our own bugs out of Sentry entirely.
        if (isToolInputError(err)) throw err;
        if (err instanceof RangeError) {
          throw new ToolInputError("This file is too large for Chart Maker to read as text.");
        }
        throw err;
      }

      if (data.length === 0) {
        throw new ToolInputError("No data points found in input");
      }
      if (data.length > 100) {
        throw new ToolInputError("Too many data points (max 100)");
      }

      // Every parse path above returns finite numbers or throws, so there is
      // no NaN left to screen for here.
      // Negative values render as invalid/degenerate SVG (negative bar heights,
      // backward pie arcs that Sharp silently drops); reject with a clear message.
      if (data.some((point) => point.value < 0)) {
        throw new ToolInputError("Chart values must be zero or greater");
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
