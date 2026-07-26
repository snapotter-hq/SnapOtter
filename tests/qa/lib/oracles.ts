/**
 * Machine-checkable oracles for container QA output.
 *
 * "Non-empty bytes with a plausible magic number" is not an oracle: it passes
 * a truncated MP4, a one-page PDF that should have five, and a ZIP with zero
 * members. inspectOutput decodes the real artifact and reports facts a lane
 * can assert against exactly (dimensions, duration, page count, archive
 * membership, row count, transparency, stream codecs).
 *
 * Decoding runs on the host with sharp plus the ffprobe/qpdf binaries the QA
 * machine already carries. Anything undecodable is reported as such rather
 * than being quietly downgraded to "binary output, looks fine".
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type OutputKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "zip"
  | "json"
  | "csv"
  | "text"
  | "svg"
  | "binary"
  | "empty";

export interface MediaStream {
  type: string;
  codec: string;
  width?: number;
  height?: number;
  channels?: number;
  sampleRate?: number;
  frames?: number;
}

export interface OutputFacts {
  bytes: number;
  sha256: string;
  signature: string | null;
  kind: OutputKind;
  /** Populated when decoding failed; the lane must treat this as a defect. */
  decodeError?: string;
  image?: {
    width: number;
    height: number;
    format: string;
    channels: number;
    hasAlpha: boolean;
    pages: number;
  };
  media?: { formatName: string; durationS: number | null; streams: MediaStream[] };
  pdf?: { pages: number; encrypted: boolean };
  zip?: { count: number; members: Array<{ name: string; size: number }> };
  json?: { keys: string[]; value: unknown };
  csv?: { rows: number; columns: number };
  text?: { chars: number; lines: number; head: string };
}

const MAGIC: Array<{ name: string; bytes: number[]; offset?: number }> = [
  { name: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "JPEG", bytes: [0xff, 0xd8, 0xff] },
  { name: "GIF", bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: "BMP", bytes: [0x42, 0x4d] },
  { name: "TIFF-LE", bytes: [0x49, 0x49, 0x2a, 0x00] },
  { name: "TIFF-BE", bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { name: "RIFF", bytes: [0x52, 0x49, 0x46, 0x46] },
  { name: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] },
  { name: "ZIP", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "ICO", bytes: [0x00, 0x00, 0x01, 0x00] },
  { name: "ISOBMFF", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { name: "OGG", bytes: [0x4f, 0x67, 0x67, 0x53] },
  { name: "FLAC", bytes: [0x66, 0x4c, 0x61, 0x43] },
  { name: "ID3", bytes: [0x49, 0x44, 0x33] },
  { name: "MP3", bytes: [0xff, 0xfb] },
  { name: "MATROSKA", bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { name: "GZIP", bytes: [0x1f, 0x8b] },
  { name: "PSD", bytes: [0x38, 0x42, 0x50, 0x53] },
  { name: "AVI-RIFF", bytes: [0x52, 0x49, 0x46, 0x46] },
];

export function detectSignature(data: Buffer): string | null {
  for (const magic of MAGIC) {
    const offset = magic.offset ?? 0;
    if (data.length < offset + magic.bytes.length) continue;
    if (magic.bytes.every((byte, i) => data[offset + i] === byte)) return magic.name;
  }
  return null;
}

const IMAGE_SIGNATURES = new Set(["PNG", "JPEG", "GIF", "BMP", "TIFF-LE", "TIFF-BE", "ICO", "PSD"]);
const MEDIA_SIGNATURES = new Set(["ISOBMFF", "MATROSKA", "OGG", "FLAC", "ID3", "MP3", "RIFF"]);

function classify(data: Buffer, filename: string, contentType: string): OutputKind {
  if (data.length === 0) return "empty";
  const ct = contentType.split(";")[0].trim().toLowerCase();
  const ext = (filename.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const signature = detectSignature(data);

  if (ct === "application/zip" || ct === "application/x-zip-compressed" || ext === ".zip") {
    return "zip";
  }
  if (ct === "application/pdf" || signature === "PDF") return "pdf";
  if (ct === "image/svg+xml" || ext === ".svg") return "svg";
  if (ct === "application/json" || ext === ".json") return "json";
  if (ct === "text/csv" || ext === ".csv") return "csv";
  if (signature && IMAGE_SIGNATURES.has(signature)) return "image";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  if (signature === "ISOBMFF" || signature === "MATROSKA") return "video";
  if (signature && MEDIA_SIGNATURES.has(signature)) return "audio";
  if (ct.startsWith("text/") || ct.includes("xml") || ct.includes("markdown")) return "text";
  return "binary";
}

async function sha256(data: Buffer): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(data).digest("hex");
}

/** Decodes an artifact into assertable facts. Never throws. */
export async function inspectOutput(
  data: Buffer,
  filename = "output.bin",
  contentType = "",
): Promise<OutputFacts> {
  const facts: OutputFacts = {
    bytes: data.length,
    sha256: await sha256(data),
    signature: detectSignature(data),
    kind: classify(data, filename, contentType),
  };
  if (facts.kind === "empty") {
    facts.decodeError = "zero-byte output";
    return facts;
  }

  switch (facts.kind) {
    case "image":
      await decodeImage(data, facts);
      break;
    case "svg":
      decodeSvg(data, facts);
      break;
    case "video":
    case "audio":
      await decodeMedia(data, filename, facts);
      break;
    case "pdf":
      await decodePdf(data, facts);
      break;
    case "zip":
      await decodeZip(data, facts);
      break;
    case "json":
      decodeJson(data, facts);
      break;
    case "csv":
      decodeCsv(data, facts);
      break;
    case "text":
      decodeText(data, facts);
      break;
    default:
      if (data.length < 16) facts.decodeError = `binary output of only ${data.length} bytes`;
  }
  return facts;
}

/** pnpm only exposes sharp and adm-zip under the workspaces that depend on them. */
const API_NODE_MODULES = join(import.meta.dirname, "..", "..", "..", "apps", "api", "node_modules");
const ROOT_NODE_MODULES = join(import.meta.dirname, "..", "..", "..", "node_modules");

async function decodeImage(data: Buffer, facts: OutputFacts): Promise<void> {
  try {
    const sharpModule = await import(join(API_NODE_MODULES, "sharp", "dist", "index.mjs"));
    const sharp = sharpModule.default;
    const metadata = await sharp(data, { failOn: "none" }).metadata();
    if (!metadata.width || !metadata.height) {
      facts.decodeError = "image decoded without dimensions";
      return;
    }
    facts.image = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format ?? "unknown",
      channels: metadata.channels ?? 0,
      hasAlpha: Boolean(metadata.hasAlpha),
      pages: metadata.pages ?? 1,
    };
  } catch (error) {
    facts.decodeError = `image decode failed: ${(error as Error).message.slice(0, 200)}`;
  }
}

function decodeSvg(data: Buffer, facts: OutputFacts): void {
  const text = data.toString("utf8");
  if (!text.includes("<svg")) {
    facts.decodeError = "svg output has no <svg element";
    return;
  }
  const width = /\bwidth="([\d.]+)/.exec(text)?.[1];
  const height = /\bheight="([\d.]+)/.exec(text)?.[1];
  facts.text = { chars: text.length, lines: text.split("\n").length, head: text.slice(0, 120) };
  if (width && height) {
    facts.image = {
      width: Number(width),
      height: Number(height),
      format: "svg",
      channels: 4,
      hasAlpha: true,
      pages: 1,
    };
  }
}

async function decodeMedia(data: Buffer, filename: string, facts: OutputFacts): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "qa-probe-"));
  const file = join(dir, filename.replace(/[^\w.-]/g, "_") || "probe.bin");
  try {
    writeFileSync(file, data);
    const { stdout } = await run(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout) as {
      format?: { format_name?: string; duration?: string };
      streams?: Array<Record<string, unknown>>;
    };
    const streams: MediaStream[] = (probe.streams ?? []).map((stream) => ({
      type: String(stream.codec_type ?? "unknown"),
      codec: String(stream.codec_name ?? "unknown"),
      width: typeof stream.width === "number" ? stream.width : undefined,
      height: typeof stream.height === "number" ? stream.height : undefined,
      channels: typeof stream.channels === "number" ? stream.channels : undefined,
      sampleRate: stream.sample_rate ? Number(stream.sample_rate) : undefined,
      frames: stream.nb_frames ? Number(stream.nb_frames) : undefined,
    }));
    const duration = probe.format?.duration ? Number(probe.format.duration) : null;
    facts.media = {
      formatName: probe.format?.format_name ?? "unknown",
      durationS: Number.isFinite(duration) ? duration : null,
      streams,
    };
    if (streams.length === 0) facts.decodeError = "ffprobe found no streams";
  } catch (error) {
    facts.decodeError = `ffprobe failed: ${String((error as Error).message).slice(0, 200)}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function decodePdf(data: Buffer, facts: OutputFacts): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "qa-probe-"));
  const file = join(dir, "probe.pdf");
  try {
    writeFileSync(file, data);
    try {
      const { stdout } = await run("qpdf", ["--show-npages", file]);
      facts.pdf = { pages: Number(stdout.trim()), encrypted: false };
      return;
    } catch (error) {
      const message = String((error as { stderr?: string }).stderr ?? (error as Error).message);
      if (/password|encrypt/i.test(message)) {
        // An encrypted PDF is a valid artifact for protect-pdf; page count is
        // unavailable without the password, which is itself the assertion.
        facts.pdf = { pages: -1, encrypted: true };
        return;
      }
      facts.decodeError = `qpdf failed: ${message.slice(0, 200)}`;
    }
  } catch (error) {
    facts.decodeError = `pdf probe failed: ${(error as Error).message.slice(0, 200)}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function decodeZip(data: Buffer, facts: OutputFacts): Promise<void> {
  try {
    const AdmZipModule = await import(join(ROOT_NODE_MODULES, "adm-zip", "adm-zip.js"));
    const AdmZip = AdmZipModule.default;
    const zip = new AdmZip(data);
    const members = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => ({ name: entry.entryName, size: entry.header.size }));
    facts.zip = { count: members.length, members };
    if (members.length === 0) facts.decodeError = "archive contains no file members";
  } catch (error) {
    facts.decodeError = `zip parse failed: ${(error as Error).message.slice(0, 200)}`;
  }
}

function decodeJson(data: Buffer, facts: OutputFacts): void {
  try {
    const value = JSON.parse(data.toString("utf8")) as unknown;
    facts.json = {
      keys: value && typeof value === "object" ? Object.keys(value as object) : [],
      value,
    };
  } catch (error) {
    facts.decodeError = `json parse failed: ${(error as Error).message.slice(0, 200)}`;
  }
}

function decodeCsv(data: Buffer, facts: OutputFacts): void {
  const text = data.toString("utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  facts.csv = { rows: lines.length, columns: lines[0]?.split(",").length ?? 0 };
  facts.text = { chars: text.length, lines: lines.length, head: text.slice(0, 120) };
  if (lines.length === 0) facts.decodeError = "csv output has no rows";
}

function decodeText(data: Buffer, facts: OutputFacts): void {
  const text = data.toString("utf8");
  facts.text = {
    chars: text.length,
    lines: text.split("\n").length,
    head: text.slice(0, 120),
  };
  if (text.trim().length === 0) facts.decodeError = "text output is whitespace only";
}

/** Compact single-line rendering of the facts a lane asserted against. */
export function describeFacts(facts: OutputFacts): string {
  if (facts.image) {
    return `${facts.kind} ${facts.image.format} ${facts.image.width}x${facts.image.height} ch${facts.image.channels}${facts.image.hasAlpha ? " alpha" : ""}${facts.image.pages > 1 ? ` pages=${facts.image.pages}` : ""} ${facts.bytes}B`;
  }
  if (facts.media) {
    const streams = facts.media.streams.map((s) => `${s.type}:${s.codec}`).join("+");
    return `${facts.kind} ${facts.media.formatName} ${facts.media.durationS ?? "?"}s [${streams}] ${facts.bytes}B`;
  }
  if (facts.pdf) {
    return `pdf pages=${facts.pdf.pages}${facts.pdf.encrypted ? " encrypted" : ""} ${facts.bytes}B`;
  }
  if (facts.zip) return `zip members=${facts.zip.count} ${facts.bytes}B`;
  if (facts.json) return `json keys=[${facts.json.keys.slice(0, 6).join(",")}] ${facts.bytes}B`;
  if (facts.csv) return `csv rows=${facts.csv.rows} cols=${facts.csv.columns} ${facts.bytes}B`;
  if (facts.text) return `text ${facts.text.chars}chars ${facts.text.lines}lines`;
  return `${facts.kind} ${facts.signature ?? "no-signature"} ${facts.bytes}B`;
}

/**
 * Per-tool semantic expectations. Each returns null when satisfied or a
 * human-readable violation. Only tools whose contract states a checkable
 * invariant appear here; the generic oracle covers the rest.
 */
export type SemanticOracle = (facts: OutputFacts, input: OutputFacts | null) => string | null;

export const SEMANTIC_ORACLES: Record<string, SemanticOracle> = {
  resize: (out) => (out.image?.width === 64 ? null : `expected width 64, got ${out.image?.width}`),
  crop: (out) =>
    out.image?.width === 8 && out.image?.height === 8
      ? null
      : `expected 8x8, got ${out.image?.width}x${out.image?.height}`,
  "circle-crop": (out) => (out.image?.hasAlpha ? null : "circle crop produced no alpha channel"),
  "remove-bg": (out) => (out.image?.hasAlpha ? null : "background removal produced no alpha"),
  rotate: (out, input) =>
    input?.image && out.image && out.image.width === input.image.height
      ? null
      : `90 degree rotation did not swap axes: in ${input?.image?.width}x${input?.image?.height} out ${out.image?.width}x${out.image?.height}`,
  "protect-pdf": (out) => (out.pdf?.encrypted ? null : "protect-pdf returned an unencrypted PDF"),
  "extract-pages": (out) =>
    out.pdf?.pages === 1 ? null : `expected 1 page, got ${out.pdf?.pages}`,
  // Range mode returns one PDF; parts and every-page modes return an archive.
  "split-pdf": (out) =>
    out.zip
      ? out.zip.count > 0
        ? null
        : "split-pdf archive has no members"
      : out.pdf && out.pdf.pages === 1
        ? null
        : `split-pdf range "1" returned ${out.kind} with ${out.pdf?.pages ?? "?"} pages`,
  "mute-video": (out) =>
    out.media?.streams.some((s) => s.type === "audio")
      ? "mute-video left an audio stream in the output"
      : null,
  "extract-audio": (out) =>
    out.media?.streams.some((s) => s.type === "audio") &&
    !out.media?.streams.some((s) => s.type === "video")
      ? null
      : "extract-audio output is not audio-only",
  "video-to-gif": (out) =>
    out.image?.format === "gif" ? null : `expected gif, got ${out.image?.format}`,
  favicon: (out) =>
    out.zip && out.zip.count >= 2 ? null : "favicon archive has fewer than 2 members",
  "audio-channels": (out) =>
    out.media?.streams.find((s) => s.type === "audio")?.channels === 2
      ? null
      : "mono-to-stereo did not produce 2 channels",
};
