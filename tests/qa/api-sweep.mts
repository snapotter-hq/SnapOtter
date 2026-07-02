/**
 * Container API processing sweep for SnapOtter QA.
 *
 * For every (tool, accepted-format-with-fixture) combination, posts a file
 * to the real Docker container and verifies the output. Runs serially.
 *
 * Usage:
 *   ./apps/api/node_modules/.bin/tsx tests/qa/api-sweep.mts
 *
 * Expects: snapotter-qa container at QA_BASE_URL or http://localhost:13499, AUTH_ENABLED=false.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "../../packages/shared/src/constants.js";

// ── Config ────────────────────────────────────────────────────────
// biome-ignore lint/suspicious/noUndeclaredEnvVars: QA scripts are run directly, outside Turbo.
const BASE = process.env.QA_BASE_URL || "http://localhost:13499";
// biome-ignore lint/suspicious/noUndeclaredEnvVars: QA scripts are run directly, outside Turbo.
const TOOL_FILTER = new Set((process.env.QA_TOOL_FILTER || "").split(",").filter(Boolean));
// biome-ignore lint/suspicious/noUndeclaredEnvVars: QA scripts are run directly, outside Turbo.
const FORMAT_FILTER = new Set((process.env.QA_FORMAT_FILTER || "").split(",").filter(Boolean));
const REPO = join(import.meta.dirname, "..", "..");
const FIXTURES_FORMATS = join(REPO, "tests", "fixtures", "image", "formats");
const FIXTURES_MEDIA_VIDEO = join(REPO, "tests", "fixtures", "video", "formats");
const FIXTURES_MEDIA_AUDIO = join(REPO, "tests", "fixtures", "audio", "formats");
const FIXTURES_DOCS = join(REPO, "tests", "fixtures", "document", "formats");
const FIXTURES_DATA = join(REPO, "tests", "fixtures", "data", "valid");
const OUT_DIR = join(REPO, "docs", "qa");

const FAST_TIMEOUT_MS = 60_000;
const LONG_TIMEOUT_MS = 180_000;
const AI_TIMEOUT_MS = 300_000;
const SSE_POLL_INTERVAL_MS = 2_000;

// ── Types ─────────────────────────────────────────────────────────

interface ToolMeta {
  id: string;
  name?: string;
  modality: string;
  acceptedInputs: string[];
  executionHint: string;
  isAI: boolean;
}

interface SweepResult {
  tool: string;
  format: string;
  status: number | string;
  outputOk: boolean | null;
  note: string;
}

// ── Load tools + settings ─────────────────────────────────────────

const tools: ToolMeta[] = JSON.parse(
  readFileSync(join(REPO, "tests", "qa", "tools-meta.json"), "utf8"),
);

const TOOL_SETTINGS_OVERRIDES: Record<string, unknown> = {
  resize: { width: 64 },
  crop: { left: 0, top: 0, width: 4, height: 4 },
  convert: { format: "png" },
  "watermark-text": { text: "Test" },
  "text-overlay": { text: "Test" },
  "passport-photo": { countryCode: "us" },
  "content-aware-resize": { width: 64 },
  collage: { templateId: "2-h-equal" },
  "trim-video": { startS: 0, endS: 5 },
  "trim-audio": { startS: 0, endS: 5 },
  "split-pdf": { mode: "range", range: "1" },
  "extract-pages": { range: "1" },
  "remove-pages": { pages: "2" },
  "organize-pdf": { order: "1-z" },
  "protect-pdf": { userPassword: "test123" },
  "unlock-pdf": { password: "test123" },
  "watermark-pdf": { text: "CONFIDENTIAL" },
  "redact-pdf": { terms: ["test"] },
  "crop-video": { width: 32, height: 32 },
  "rotate-video": { transform: "cw90" },
  "resize-video": { preset: "720p" },
  "watermark-video": { text: "CONFIDENTIAL" },
  "audio-channels": { mode: "mono-to-stereo" },
  "split-audio": { mode: "parts", parts: 2 },
  "convert-document": { format: "odt" },
  "epub-convert": { format: "html" },
  "convert-presentation": { format: "odp" },
  "convert-spreadsheet": { format: "ods" },
};

function defaultSettingsFor(toolId: string): unknown {
  return TOOL_SETTINGS_OVERRIDES[toolId] ?? {};
}

const CUSTOM_BODY_SETTINGS: Record<string, unknown> = {
  "qr-generate": { text: "SnapOtter QA" },
  "barcode-generate": { text: "SnapOtter QA", type: "code128" },
  "html-to-image": { html: "<html><body><h1>SnapOtter QA</h1></body></html>", format: "png" },
};

interface SecondaryInput {
  fieldName: string;
  ext?: string;
  modality?: string;
  sameAsPrimary?: boolean;
}

const AUDIO_FORMATS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".ogg",
  ".opus",
  ".wma",
  ".aiff",
  ".amr",
  ".ac3",
]);
const SUBTITLE_FORMATS = new Set([".srt", ".vtt", ".ass"]);

const SECONDARY_INPUTS: Record<string, SecondaryInput[]> = {
  "watermark-image": [{ fieldName: "watermark", ext: ".png", modality: "image" }],
  compose: [{ fieldName: "overlay", ext: ".png", modality: "image" }],
  compare: [{ fieldName: "file", sameAsPrimary: true }],
  "find-duplicates": [{ fieldName: "file", sameAsPrimary: true }],
  collage: [{ fieldName: "file", sameAsPrimary: true }],
  stitch: [{ fieldName: "file", sameAsPrimary: true }],
  "sprite-sheet": [{ fieldName: "file", sameAsPrimary: true }],
  "images-to-video": [{ fieldName: "file", sameAsPrimary: true }],
  "merge-videos": [{ fieldName: "file", sameAsPrimary: true }],
  "merge-audio": [{ fieldName: "file", sameAsPrimary: true }],
  "merge-pdf": [{ fieldName: "file", sameAsPrimary: true }],
  "merge-csvs": [{ fieldName: "file", sameAsPrimary: true }],
  "replace-audio": [{ fieldName: "file", ext: ".mp3", modality: "audio" }],
  "burn-subtitles": [{ fieldName: "file", ext: ".srt", modality: "video" }],
  "embed-subtitles": [{ fieldName: "file", ext: ".srt", modality: "video" }],
  "sign-pdf": [{ fieldName: "sig0", ext: ".png", modality: "image" }],
};

const TOOL_SPECIFIC_FIXTURES: Record<string, Record<string, string>> = {
  "chart-maker": {
    ".json": join(FIXTURES_DATA, "chart.json"),
  },
};

const EXPECTED_SELF_REJECTS: Record<string, RegExp[]> = {
  "extract-subtitles": [/no subtitle track/i],
};

function resolveFixtureForTool(tool: ToolMeta, ext: string): string | null {
  const toolFixture = TOOL_SPECIFIC_FIXTURES[tool.id]?.[ext];
  if (toolFixture && existsSync(toolFixture)) {
    return toolFixture;
  }

  return resolveFixture(ext, tool.modality);
}

function isExpectedSelfReject(toolId: string, message: string): boolean {
  return EXPECTED_SELF_REJECTS[toolId]?.some((pattern) => pattern.test(message)) ?? false;
}

function isSecondaryOnlyFormat(toolId: string, ext: string): boolean {
  if (toolId === "replace-audio") return AUDIO_FORMATS.has(ext);
  if (toolId === "burn-subtitles" || toolId === "embed-subtitles") {
    return SUBTITLE_FORMATS.has(ext);
  }
  return false;
}

function secondaryInputsFor(
  tool: ToolMeta,
  ext: string,
): Array<{ fieldName: string; fixture: string }> {
  const inputs = SECONDARY_INPUTS[tool.id] ?? [];
  const resolved: Array<{ fieldName: string; fixture: string }> = [];

  for (const input of inputs) {
    const secondaryExt = input.sameAsPrimary ? ext : input.ext;
    const secondaryModality = input.sameAsPrimary
      ? tool.modality
      : (input.modality ?? tool.modality);
    if (!secondaryExt) continue;

    const fixture = resolveFixture(secondaryExt, secondaryModality);
    if (fixture) {
      resolved.push({ fieldName: input.fieldName, fixture });
    }
  }

  return resolved;
}

// ── Extension aliases ─────────────────────────────────────────────
const EXT_ALIASES: Record<string, string> = {
  ".jpeg": ".jpg",
  ".tif": ".tiff",
  ".htm": ".html",
  ".yml": ".yaml",
  ".markdown": ".md",
  ".heif": ".heic",
};

// ── Fixture resolution ────────────────────────────────────────────

function resolveFixture(ext: string, modality: string): string | null {
  // Normalize extension
  const canonical = EXT_ALIASES[ext] ?? ext;
  const bare = canonical.slice(1); // remove leading dot

  // Modality-based fixture dirs
  if (modality === "image") {
    // Images use sample.<ext> in formats/
    const p = join(FIXTURES_FORMATS, `sample.${bare}`);
    if (existsSync(p)) return p;
    // Special: apng is in formats
    if (bare === "apng") {
      const pa = join(FIXTURES_FORMATS, "sample.apng");
      if (existsSync(pa)) return pa;
    }
  }

  if (modality === "video") {
    const p = join(FIXTURES_MEDIA_VIDEO, `tiny.${bare}`);
    if (existsSync(p)) return p;
  }
  if (modality === "audio") {
    const p = join(FIXTURES_MEDIA_AUDIO, `tiny.${bare}`);
    if (existsSync(p)) return p;
  }

  if (modality === "document") {
    const p = join(FIXTURES_DOCS, `tiny.${bare}`);
    if (existsSync(p)) return p;
  }

  if (modality === "file" || modality === "data") {
    const p = join(FIXTURES_DATA, `tiny.${bare}`);
    if (existsSync(p)) return p;
  }

  // Fallback: try all dirs
  for (const dir of [
    FIXTURES_FORMATS,
    FIXTURES_MEDIA_VIDEO,
    FIXTURES_MEDIA_AUDIO,
    FIXTURES_DOCS,
    FIXTURES_DATA,
  ]) {
    for (const prefix of ["sample", "tiny"]) {
      const p = join(dir, `${prefix}.${bare}`);
      if (existsSync(p)) return p;
    }
  }

  return null;
}

// ── Output verification ───────────────────────────────────────────

/** Known file signatures (magic bytes). */
const SIGNATURES: Array<{ name: string; bytes: number[]; offset?: number }> = [
  { name: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "JPEG", bytes: [0xff, 0xd8, 0xff] },
  { name: "GIF87a", bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { name: "GIF89a", bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  { name: "BMP", bytes: [0x42, 0x4d] },
  { name: "TIFF-LE", bytes: [0x49, 0x49, 0x2a, 0x00] },
  { name: "TIFF-BE", bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { name: "WebP", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
  { name: "AVIF/HEIC", bytes: [0x00, 0x00, 0x00] }, // ftyp box (offset 4)
  { name: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { name: "ZIP", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "ICO", bytes: [0x00, 0x00, 0x01, 0x00] },
  { name: "MP4/MOV", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // ftyp at offset 4
  { name: "OGG", bytes: [0x4f, 0x67, 0x67, 0x53] },
  { name: "FLAC", bytes: [0x66, 0x4c, 0x61, 0x43] },
  { name: "WAV", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WAVE
  { name: "ID3/MP3", bytes: [0x49, 0x44, 0x33] },
  { name: "MP3-sync", bytes: [0xff, 0xfb] },
  { name: "MP3-sync2", bytes: [0xff, 0xf3] },
  { name: "MP3-sync3", bytes: [0xff, 0xf2] },
];

function detectSignature(data: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const off = sig.offset ?? 0;
    if (data.length < off + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (data[off + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.name;
  }
  return null;
}

function verifyOutput(data: Buffer, contentType: string): { ok: boolean; detail: string } {
  if (data.length === 0) {
    return { ok: false, detail: "empty output" };
  }

  const ct = (contentType || "").split(";")[0].trim().toLowerCase();

  // ZIP check
  if (ct === "application/zip" || ct === "application/x-zip-compressed") {
    if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b) {
      return { ok: true, detail: `valid ZIP (${data.length} bytes)` };
    }
    return { ok: false, detail: "ZIP content-type but invalid header" };
  }

  // JSON check
  if (ct === "application/json") {
    try {
      JSON.parse(data.toString("utf8"));
      return { ok: true, detail: `valid JSON (${data.length} bytes)` };
    } catch {
      return { ok: false, detail: "JSON content-type but unparseable" };
    }
  }

  // Text check
  if (ct.startsWith("text/")) {
    return data.length > 0
      ? { ok: true, detail: `text output (${data.length} bytes)` }
      : { ok: false, detail: "empty text" };
  }

  // SVG check
  if (ct === "image/svg+xml") {
    const str = data.toString("utf8").slice(0, 500);
    if (str.includes("<svg") || str.includes("<?xml")) {
      return { ok: true, detail: `valid SVG (${data.length} bytes)` };
    }
    return { ok: false, detail: "SVG content-type but no <svg tag" };
  }

  // PDF check
  if (ct === "application/pdf") {
    if (data.length >= 5 && data.toString("ascii", 0, 5) === "%PDF-") {
      return { ok: true, detail: `valid PDF (${data.length} bytes)` };
    }
    return { ok: false, detail: "PDF content-type but missing %PDF- header" };
  }

  // Binary: check file signature
  const sig = detectSignature(data);
  if (sig) {
    return { ok: true, detail: `${sig} signature (${data.length} bytes)` };
  }

  // Octet-stream / unknown: just check non-trivial size
  if (data.length >= 16) {
    return { ok: true, detail: `binary output (${data.length} bytes, no known signature)` };
  }

  return { ok: false, detail: `suspiciously small binary output (${data.length} bytes)` };
}

async function fetchAndVerifyDownload(
  downloadUrl: string,
): Promise<{ ok: boolean; detail: string }> {
  const dlRes = await fetch(`${BASE}${downloadUrl}`);
  if (!dlRes.ok) return { ok: false, detail: `downloadUrl returned ${dlRes.status}` };

  const outBuf = Buffer.from(await dlRes.arrayBuffer());
  const outCT = dlRes.headers.get("content-type") || "";
  return verifyOutput(outBuf, outCT);
}

// ── SSE polling for async jobs ────────────────────────────────────

async function pollJobSSE(
  jobId: string,
  timeoutMs: number,
): Promise<{
  status: "completed" | "failed" | "timeout";
  error?: string;
  result?: Record<string, unknown>;
}> {
  const deadline = Date.now() + timeoutMs;
  const url = `${BASE}/api/v1/jobs/${jobId}/progress`;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(
        () => controller.abort(),
        Math.min(30_000, deadline - Date.now()),
      );

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });
      clearTimeout(fetchTimeout);

      if (!res.ok || !res.body) {
        await sleep(SSE_POLL_INTERVAL_MS);
        continue;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (Date.now() < deadline) {
          const readTimeout = Math.min(30_000, deadline - Date.now());
          const readPromise = reader.read();
          const timeoutPromise = sleep(readTimeout).then(
            () => ({ done: true, value: undefined }) as const,
          );
          const chunk = await Promise.race([readPromise, timeoutPromise]);

          if (chunk.done) break;
          if (chunk.value) {
            buffer += decoder.decode(chunk.value as Uint8Array, { stream: true });
          }

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              // Single-file progress
              if (data.type === "single") {
                if (data.phase === "complete") {
                  reader.cancel().catch(() => {});
                  return { status: "completed", result: data.result };
                }
                if (data.phase === "failed") {
                  reader.cancel().catch(() => {});
                  return { status: "failed", error: data.error || "job failed" };
                }
              }
              // Batch progress
              if (data.type === "batch") {
                if (data.status === "completed") {
                  reader.cancel().catch(() => {});
                  return { status: "completed" };
                }
                if (data.status === "failed") {
                  reader.cancel().catch(() => {});
                  return {
                    status: "failed",
                    error:
                      data.errors?.map((e: { error: string }) => e.error).join("; ") ||
                      "batch failed",
                  };
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    } catch (_err) {
      if (Date.now() >= deadline) break;
      // Connection error -- retry after a short wait
      await sleep(SSE_POLL_INTERVAL_MS);
    }
  }

  return { status: "timeout" };
}

// ── Fetch output for a completed async job ────────────────────────

async function fetchAsyncOutput(jobId: string): Promise<{
  found: boolean;
  data?: Buffer;
  contentType?: string;
  downloadUrl?: string;
}> {
  // The download URL for async jobs follows the same pattern:
  // /api/v1/download/:jobId/:filename
  // But we don't know the filename. Try the files listing or guess from outputs.
  // Strategy: try HEAD on a known pattern, or use the job result if available.

  // First try: list outputs directory via download with a wildcard attempt
  // The container stores outputs at outputs/<jobId>/. Let's try to get the
  // download link by hitting the files endpoint.
  try {
    // Try fetching the output-meta that the worker wrote
    const metaRes = await fetch(`${BASE}/api/v1/download/${jobId}/output-meta.json`, {
      redirect: "follow",
    });
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { filename?: string };
      if (meta.filename) {
        const dlRes = await fetch(`${BASE}/api/v1/download/${jobId}/${meta.filename}`);
        if (dlRes.ok) {
          const buf = Buffer.from(await dlRes.arrayBuffer());
          return {
            found: true,
            data: buf,
            contentType: dlRes.headers.get("content-type") || "",
            downloadUrl: `/api/v1/download/${jobId}/${meta.filename}`,
          };
        }
      }
    }
  } catch {
    // fall through
  }

  // Fallback: try common output filenames
  const commonNames = [
    "output.mp4",
    "output.webm",
    "output.mkv",
    "output.avi",
    "output.mp3",
    "output.wav",
    "output.ogg",
    "output.png",
    "output.jpg",
    "output.webp",
    "output.pdf",
    "output.txt",
    "output.json",
    "output.zip",
  ];

  for (const name of commonNames) {
    try {
      const res = await fetch(`${BASE}/api/v1/download/${jobId}/${name}`);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0) {
          return {
            found: true,
            data: buf,
            contentType: res.headers.get("content-type") || "",
            downloadUrl: `/api/v1/download/${jobId}/${name}`,
          };
        }
      }
    } catch {}
  }

  return { found: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Representative format for AI tools ────────────────────────────

function aiRepresentativeFormat(tool: ToolMeta): string {
  if (tool.modality === "image") return ".png";
  if (tool.modality === "video") return ".mp4";
  if (tool.modality === "audio") return ".mp3";
  if (tool.modality === "document") return ".pdf";
  if (tool.modality === "file") return ".csv";
  // Fallback: first accepted input
  return tool.acceptedInputs[0] || ".png";
}

// ── Main sweep ────────────────────────────────────────────────────

async function main() {
  console.log("=== SnapOtter Container API Processing Sweep ===\n");

  // Verify container is up
  try {
    const health = await fetch(`${BASE}/api/v1/health`);
    if (!health.ok) throw new Error(`health check returned ${health.status}`);
    console.log("Container health: OK\n");
  } catch (_err) {
    console.error("ERROR: Cannot reach container at", BASE);
    process.exit(1);
  }

  const results: SweepResult[] = [];
  const bugs: SweepResult[] = [];
  const suspicious: SweepResult[] = [];
  let totalCombos = 0;
  let passes = 0;
  let expectedRejects = 0;
  let skipped = 0;
  let bugCount = 0;
  let suspiciousCount = 0;
  let needsReview = 0;

  const startTime = Date.now();

  const selectedTools =
    TOOL_FILTER.size > 0 ? tools.filter((tool) => TOOL_FILTER.has(tool.id)) : tools;

  for (const tool of selectedTools) {
    const formats = CUSTOM_BODY_SETTINGS[tool.id]
      ? [".custom-body"]
      : tool.isAI
        ? [aiRepresentativeFormat(tool)]
        : [...tool.acceptedInputs]; // clone to avoid mutation

    // Deduplicate aliases (e.g. .jpg and .jpeg resolve to same fixture)
    const seenFixtures = new Set<string>();

    for (const ext of formats) {
      if (FORMAT_FILTER.size > 0 && !FORMAT_FILTER.has(ext)) continue;
      totalCombos++;
      const customBodySettings = CUSTOM_BODY_SETTINGS[tool.id];

      if (customBodySettings) {
        console.log(`  [TEST] ${tool.id} x custom-body...`);
        try {
          const res = await fetch(`${BASE}${apiToolPath(tool.id)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(customBodySettings),
          });

          const statusCode = res.status;
          if (statusCode >= 400) {
            let body = "";
            try {
              body = await res.text();
            } catch {}
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: statusCode,
              outputOk: false,
              note: `BUG: custom body route returned ${statusCode} -- ${body.slice(0, 300)}`,
            };
            results.push(r);
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] ${statusCode}: ${body.slice(0, 100)}`);
            continue;
          }

          const json = (await res.json()) as Record<string, unknown>;
          const downloadUrl = json.downloadUrl as string | undefined;
          if (!downloadUrl) {
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: statusCode,
              outputOk: Object.keys(json).length > 0,
              note: `pass: JSON result (keys: ${Object.keys(json).join(",")})`,
            };
            results.push(r);
            passes++;
            console.log(`    [PASS] JSON result (${Object.keys(json).join(",")})`);
            continue;
          }

          const verification = await fetchAndVerifyDownload(downloadUrl);
          const r: SweepResult = {
            tool: tool.id,
            format: ext,
            status: statusCode,
            outputOk: verification.ok,
            note: verification.ok
              ? `pass: ${verification.detail}`
              : `BUG: corrupt success -- ${verification.detail}`,
          };
          results.push(r);
          if (verification.ok) {
            passes++;
            console.log(`    [PASS] ${verification.detail}`);
          } else {
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] corrupt output: ${verification.detail}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const r: SweepResult = {
            tool: tool.id,
            format: ext,
            status: "network-error",
            outputOk: false,
            note: `BUG: custom body request failed -- ${msg.slice(0, 200)}`,
          };
          results.push(r);
          bugs.push(r);
          bugCount++;
          console.log(`    [BUG] custom body request failed: ${msg.slice(0, 80)}`);
        }
        continue;
      }

      if (isSecondaryOnlyFormat(tool.id, ext)) {
        const r: SweepResult = {
          tool: tool.id,
          format: ext,
          status: "secondary-only",
          outputOk: null,
          note: "skipped: secondary-only format for multi-input route",
        };
        results.push(r);
        skipped++;
        console.log(`  [SKIP] ${tool.id} x ${ext}: secondary-only format`);
        continue;
      }

      const fixture = resolveFixtureForTool(tool, ext);

      if (!fixture) {
        const r: SweepResult = {
          tool: tool.id,
          format: ext,
          status: "no-fixture",
          outputOk: null,
          note: "skipped: no fixture file for this extension",
        };
        results.push(r);
        skipped++;
        console.log(`  [SKIP] ${tool.id} x ${ext}: no fixture`);
        continue;
      }

      // Deduplicate: if this fixture was already tested for this tool, skip
      if (seenFixtures.has(fixture)) {
        const r: SweepResult = {
          tool: tool.id,
          format: ext,
          status: "deduped-alias",
          outputOk: null,
          note: `skipped: alias for already-tested fixture`,
        };
        results.push(r);
        skipped++;
        continue;
      }
      seenFixtures.add(fixture);

      const timeoutMs = tool.isAI
        ? AI_TIMEOUT_MS
        : tool.executionHint === "long"
          ? LONG_TIMEOUT_MS
          : FAST_TIMEOUT_MS;
      const settings = defaultSettingsFor(tool.id);
      const filename = fixture.split("/").pop() ?? "input";

      console.log(`  [TEST] ${tool.id} x ${ext} (${filename})...`);

      try {
        const form = new FormData();
        const fileBytes = readFileSync(fixture);
        form.append("file", new Blob([fileBytes]), filename);
        for (const input of secondaryInputsFor(tool, ext)) {
          const secondaryFilename = input.fixture.split("/").pop() ?? "secondary";
          form.append(input.fieldName, new Blob([readFileSync(input.fixture)]), secondaryFilename);
        }
        if (tool.id === "sign-pdf") {
          form.append(
            "placements",
            JSON.stringify([{ sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.25, h: 0.12 }]),
          );
        } else {
          form.append("settings", JSON.stringify(settings));
        }

        const controller = new AbortController();
        const fetchTimer = setTimeout(() => controller.abort(), timeoutMs);

        let res: Response;
        try {
          res = await fetch(`${BASE}${apiToolPath(tool.id)}`, {
            method: "POST",
            body: form,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(fetchTimer);
        }

        const statusCode = res.status;
        const resContentType = (res.headers.get("content-type") || "").split(";")[0].trim();

        // ── 404: custom-route tool not on standard path ──────
        if (statusCode === 404) {
          const r: SweepResult = {
            tool: tool.id,
            format: ext,
            status: 404,
            outputOk: null,
            note: "skipped-custom-route: tool not on standard /api/v1/tools/ path",
          };
          results.push(r);
          skipped++;
          console.log(`    [SKIP] 404 -- custom route`);
          continue;
        }

        // ── 4xx: legitimate rejection ────────────────────────
        if (statusCode >= 400 && statusCode < 500) {
          let body = "";
          try {
            body = await res.text();
          } catch {}
          let parsed: { error?: string; details?: string } = {};
          try {
            parsed = JSON.parse(body);
          } catch {}
          const msg = parsed.error || parsed.details || body.slice(0, 200);
          const fullMsg =
            [parsed.error, parsed.details].filter(Boolean).join(" -- ") || body.slice(0, 300);

          // Check if this format is in the tool's own acceptedInputs
          const isSelfFormat = tool.acceptedInputs.includes(ext);
          const isExpected = !isSelfFormat || isExpectedSelfReject(tool.id, fullMsg);
          const classification = isExpected ? "expected-reject" : "suspicious-reject";

          const r: SweepResult = {
            tool: tool.id,
            format: ext,
            status: statusCode,
            outputOk: false,
            note: `${classification}: ${statusCode} ${msg}`,
          };
          results.push(r);

          if (!isExpected) {
            suspicious.push(r);
            suspiciousCount++;
            console.log(`    [SUSPICIOUS] ${statusCode}: ${msg}`);
          } else {
            expectedRejects++;
            console.log(`    [REJECT] ${statusCode}: ${msg.slice(0, 80)}`);
          }
          continue;
        }

        // ── 5xx: server error = BUG ──────────────────────────
        if (statusCode >= 500) {
          let body = "";
          try {
            body = await res.text();
          } catch {}

          let parsed: { code?: string; feature?: string; featureName?: string; error?: string } =
            {};
          try {
            parsed = JSON.parse(body);
          } catch {}

          if (statusCode === 501 && parsed.code === "FEATURE_NOT_INSTALLED") {
            const feature = parsed.featureName || parsed.feature || "AI feature";
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: statusCode,
              outputOk: null,
              note: `skipped-feature-not-installed: ${feature}`,
            };
            results.push(r);
            skipped++;
            console.log(`    [SKIP] feature not installed: ${feature}`);
            continue;
          }

          const r: SweepResult = {
            tool: tool.id,
            format: ext,
            status: statusCode,
            outputOk: false,
            note: `BUG: server error ${statusCode} -- ${body.slice(0, 300)}`,
          };
          results.push(r);
          bugs.push(r);
          bugCount++;
          console.log(`    [BUG] ${statusCode}: ${body.slice(0, 100)}`);
          continue;
        }

        // ── 200: streaming ZIP ───────────────────────────────
        if (statusCode === 200 && resContentType === "application/zip") {
          const buf = Buffer.from(await res.arrayBuffer());
          const isZip = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
          const r: SweepResult = {
            tool: tool.id,
            format: ext,
            status: 200,
            outputOk: isZip && buf.length > 2,
            note: isZip
              ? `pass: ZIP stream (${buf.length} bytes)`
              : "BUG: ZIP content-type but invalid header",
          };
          results.push(r);
          if (isZip && buf.length > 2) {
            passes++;
            console.log(`    [PASS] ZIP stream (${buf.length} bytes)`);
          } else {
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] invalid ZIP stream`);
          }
          continue;
        }

        // ── 200: JSON response (sync tool success) ───────────
        if (statusCode === 200 && resContentType === "application/json") {
          let json: Record<string, unknown>;
          try {
            json = (await res.json()) as Record<string, unknown>;
          } catch (_e) {
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: 200,
              outputOk: false,
              note: "BUG: 200 JSON but response unparseable",
            };
            results.push(r);
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] unparseable JSON response`);
            continue;
          }

          const downloadUrl = json.downloadUrl as string | undefined;

          // Some tools return JSON results directly (info, color-palette, barcode-read, image-to-base64, etc.)
          if (!downloadUrl) {
            // Check if it's a result-only response (no downloadUrl but has data)
            if (Object.keys(json).length > 0) {
              const r: SweepResult = {
                tool: tool.id,
                format: ext,
                status: 200,
                outputOk: true,
                note: `pass: JSON result (no download, keys: ${Object.keys(json).join(",")})`,
              };
              results.push(r);
              passes++;
              console.log(`    [PASS] JSON result (${Object.keys(json).join(",")})`);
              continue;
            }
            // Truly missing downloadUrl
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: 200,
              outputOk: false,
              note: `BUG: 200 JSON but no downloadUrl and no result data -- keys: ${Object.keys(json).join(",")}`,
            };
            results.push(r);
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] no downloadUrl in response`);
            continue;
          }

          // Fetch the output
          try {
            const dlRes = await fetch(`${BASE}${downloadUrl}`);
            if (!dlRes.ok) {
              const r: SweepResult = {
                tool: tool.id,
                format: ext,
                status: 200,
                outputOk: false,
                note: `BUG: downloadUrl returned ${dlRes.status}`,
              };
              results.push(r);
              bugs.push(r);
              bugCount++;
              console.log(`    [BUG] download failed: ${dlRes.status}`);
              continue;
            }

            const outBuf = Buffer.from(await dlRes.arrayBuffer());
            const outCT = dlRes.headers.get("content-type") || "";
            const verification = verifyOutput(outBuf, outCT);

            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: 200,
              outputOk: verification.ok,
              note: verification.ok
                ? `pass: ${verification.detail}`
                : `BUG: corrupt success -- ${verification.detail}`,
            };
            results.push(r);

            if (verification.ok) {
              passes++;
              console.log(`    [PASS] ${verification.detail}`);
            } else {
              bugs.push(r);
              bugCount++;
              console.log(`    [BUG] corrupt output: ${verification.detail}`);
            }
          } catch (err) {
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: 200,
              outputOk: false,
              note: `BUG: download fetch error -- ${err instanceof Error ? err.message : String(err)}`,
            };
            results.push(r);
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] download error: ${err instanceof Error ? err.message : err}`);
          }
          continue;
        }

        // ── 200: non-JSON, non-ZIP direct binary response ────
        if (statusCode === 200) {
          const buf = Buffer.from(await res.arrayBuffer());
          const verification = verifyOutput(buf, resContentType);
          const r: SweepResult = {
            tool: tool.id,
            format: ext,
            status: 200,
            outputOk: verification.ok,
            note: verification.ok
              ? `pass: direct binary -- ${verification.detail}`
              : `BUG: direct binary corrupt -- ${verification.detail}`,
          };
          results.push(r);
          if (verification.ok) {
            passes++;
            console.log(`    [PASS] direct binary: ${verification.detail}`);
          } else {
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] corrupt direct output: ${verification.detail}`);
          }
          continue;
        }

        // ── 202: async job ───────────────────────────────────
        if (statusCode === 202) {
          let json: { jobId?: string; async?: boolean } = {};
          try {
            json = (await res.json()) as typeof json;
          } catch {}

          const jobId = json.jobId;
          if (!jobId) {
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: 202,
              outputOk: false,
              note: "BUG: 202 but no jobId in response",
            };
            results.push(r);
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] 202 without jobId`);
            continue;
          }

          const asyncTimeoutMs = Math.max(timeoutMs, LONG_TIMEOUT_MS);
          console.log(`    [ASYNC] jobId=${jobId}, polling SSE...`);
          const jobResult = await pollJobSSE(jobId, asyncTimeoutMs);

          if (jobResult.status === "timeout") {
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: "202-timeout",
              outputOk: false,
              note: `BUG: async job timed out after ${asyncTimeoutMs}ms`,
            };
            results.push(r);
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] async timeout`);
            continue;
          }

          if (jobResult.status === "failed") {
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: "202-failed",
              outputOk: false,
              note: `BUG: async job failed -- ${jobResult.error || "unknown"}`,
            };
            results.push(r);
            bugs.push(r);
            bugCount++;
            console.log(`    [BUG] async failed: ${jobResult.error}`);
            continue;
          }

          // Job completed -- try to fetch the output
          // The SSE result might contain the downloadUrl in result payload
          if (jobResult.result && (jobResult.result as Record<string, unknown>).downloadUrl) {
            const dlUrl = (jobResult.result as Record<string, unknown>).downloadUrl as string;
            try {
              const dlRes = await fetch(`${BASE}${dlUrl}`);
              if (dlRes.ok) {
                const outBuf = Buffer.from(await dlRes.arrayBuffer());
                const outCT = dlRes.headers.get("content-type") || "";
                const verification = verifyOutput(outBuf, outCT);
                const r: SweepResult = {
                  tool: tool.id,
                  format: ext,
                  status: 202,
                  outputOk: verification.ok,
                  note: verification.ok
                    ? `pass: async completed -- ${verification.detail}`
                    : `BUG: async completed but corrupt -- ${verification.detail}`,
                };
                results.push(r);
                if (verification.ok) {
                  passes++;
                  console.log(`    [PASS] async: ${verification.detail}`);
                } else {
                  bugs.push(r);
                  bugCount++;
                  console.log(`    [BUG] async corrupt: ${verification.detail}`);
                }
                continue;
              }
            } catch {
              // Fall through to generic fetch
            }
          }

          // Try to fetch the output using the async output fetcher
          const asyncOut = await fetchAsyncOutput(jobId);
          if (asyncOut.found && asyncOut.data) {
            const verification = verifyOutput(asyncOut.data, asyncOut.contentType || "");
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: 202,
              outputOk: verification.ok,
              note: verification.ok
                ? `pass: async completed -- ${verification.detail}`
                : `BUG: async completed but corrupt -- ${verification.detail}`,
            };
            results.push(r);
            if (verification.ok) {
              passes++;
              console.log(`    [PASS] async: ${verification.detail}`);
            } else {
              bugs.push(r);
              bugCount++;
              console.log(`    [BUG] async corrupt: ${verification.detail}`);
            }
          } else {
            // Could not find the output -- record as needs-review
            const r: SweepResult = {
              tool: tool.id,
              format: ext,
              status: 202,
              outputOk: null,
              note: "needs-review: async job completed per SSE but output not retrievable",
            };
            results.push(r);
            needsReview++;
            console.log(`    [NEEDS-REVIEW] async completed but output not found`);
          }
          continue;
        }

        // ── Unexpected status code ───────────────────────────
        let body = "";
        try {
          body = await res.text();
        } catch {}
        const r: SweepResult = {
          tool: tool.id,
          format: ext,
          status: statusCode,
          outputOk: false,
          note: `BUG: unexpected status ${statusCode} -- ${body.slice(0, 200)}`,
        };
        results.push(r);
        bugs.push(r);
        bugCount++;
        console.log(`    [BUG] unexpected status ${statusCode}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.includes("abort") || msg.includes("timeout");
        const r: SweepResult = {
          tool: tool.id,
          format: ext,
          status: isTimeout ? "timeout" : "network-error",
          outputOk: false,
          note: `BUG: ${isTimeout ? "request timed out" : "network error"} -- ${msg.slice(0, 200)}`,
        };
        results.push(r);
        bugs.push(r);
        bugCount++;
        console.log(`    [BUG] ${isTimeout ? "timeout" : "network error"}: ${msg.slice(0, 80)}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Write results ─────────────────────────────────────────────

  mkdirSync(OUT_DIR, { recursive: true });

  writeFileSync(join(OUT_DIR, "api-sweep-results.json"), JSON.stringify(results, null, 2));

  // ── Write findings markdown ───────────────────────────────────

  let md = "# SnapOtter Container API Sweep Findings\n\n";
  md += `**Date**: ${new Date().toISOString().split("T")[0]}\n`;
  md += `**Container**: snapotter-qa at ${BASE}\n`;
  md += `**Elapsed**: ${elapsed}s\n\n`;
  md += "## Summary\n\n";
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Total combos tested | ${totalCombos} |\n`;
  md += `| Clean passes | ${passes} |\n`;
  md += `| Expected rejects | ${expectedRejects} |\n`;
  md += `| Skipped (no fixture / alias / custom route) | ${skipped} |\n`;
  md += `| Suspicious self-rejects | ${suspiciousCount} |\n`;
  md += `| Needs review | ${needsReview} |\n`;
  md += `| **BUGS** | **${bugCount}** |\n\n`;

  if (bugs.length > 0) {
    md += "## Bugs\n\n";

    // Group by tool
    const byTool = new Map<string, SweepResult[]>();
    for (const b of bugs) {
      if (!byTool.has(b.tool)) byTool.set(b.tool, []);
      byTool.get(b.tool)?.push(b);
    }

    for (const [toolId, toolBugs] of byTool) {
      md += `### ${toolId}\n\n`;
      for (const b of toolBugs) {
        md += `- **${b.format}** (status ${b.status}): ${b.note}\n`;
      }
      md += "\n";
    }
  }

  if (suspicious.length > 0) {
    md += "## Suspicious Self-Rejects\n\n";
    md += "These tools rejected a format that IS listed in their own acceptedInputs:\n\n";

    const byTool = new Map<string, SweepResult[]>();
    for (const s of suspicious) {
      if (!byTool.has(s.tool)) byTool.set(s.tool, []);
      byTool.get(s.tool)?.push(s);
    }

    for (const [toolId, toolSuspicious] of byTool) {
      md += `### ${toolId}\n\n`;
      for (const s of toolSuspicious) {
        md += `- **${s.format}** (status ${s.status}): ${s.note}\n`;
      }
      md += "\n";
    }
  }

  writeFileSync(join(OUT_DIR, "findings-api.md"), md);

  // ── Console summary ───────────────────────────────────────────

  console.log(`\n${"=".repeat(60)}`);
  console.log("SWEEP COMPLETE");
  console.log("=".repeat(60));
  console.log(`Total combos: ${totalCombos}`);
  console.log(`Passes: ${passes}`);
  console.log(`Expected rejects: ${expectedRejects}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Suspicious: ${suspiciousCount}`);
  console.log(`Needs review: ${needsReview}`);
  console.log(`BUGS: ${bugCount}`);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`\nResults: ${join(OUT_DIR, "api-sweep-results.json")}`);
  console.log(`Findings: ${join(OUT_DIR, "findings-api.md")}`);

  if (bugs.length > 0) {
    console.log("\n--- TOP BUGS ---");
    for (const b of bugs.slice(0, 20)) {
      console.log(`  ${b.tool} x ${b.format}: ${b.note.slice(0, 120)}`);
    }
  }

  process.exit(bugCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
