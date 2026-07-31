/**
 * Container processing sweep for SnapOtter release QA.
 *
 * Drives a real production container over HTTP and classifies what comes back.
 * Every lane is a separate run so shared fixtures cannot be double counted as
 * distinct coverage:
 *
 *   canonical  one valid input per tool, oracle-verified
 *   formats    every accepted input format each tool declares
 *   settings   per-axis differential probes plus a pairwise covering array
 *   threeway   targeted three-way combinations for high-risk interactions
 *   invalid    invalid settings and boundary violations must be refused
 *   hostile    hostile, renamed and truncated inputs must be refused cleanly
 *   generators no-input generator routes
 *   multi      multi-input routes with their own fixtures and arity oracle
 *   archives   ZIP and JSON output routes, asserted on membership and shape
 *   controls   known-good and known-bad pairs
 *
 * Usage:
 *   QA_BASE_URL=http://localhost:13492 QA_PASSWORD=... \
 *     ./apps/api/node_modules/.bin/tsx tests/qa/api-sweep.mts <mode> [--tools a,b] [--limit N]
 *
 * The tool catalog, modalities, accepted inputs, execution hints, multi-input
 * arity and settings axes all come from tests/qa/tool-contract.json, which is
 * regenerated from live code by tests/qa/extract-tool-contract.mts. Nothing in
 * this file hard-codes a tool count.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "../../packages/shared/src/constants.js";
import { pairwise } from "../helpers/pairwise.js";
import type { PictAxis } from "../helpers/zod-pict.js";
import { login, QaClient, type SubmitOutcome } from "./lib/container.js";
import { fixturesFor, resolveFixture } from "./lib/fixture-index.js";
import { describeFacts, inspectOutput, type OutputFacts, SEMANTIC_ORACLES } from "./lib/oracles.js";

// ── Configuration ─────────────────────────────────────────────────

/* biome-ignore-start lint/suspicious/noUndeclaredEnvVars: QA harness runs outside Turbo. */
const BASE = process.env.QA_BASE_URL ?? "http://localhost:13492";
const USERNAME = process.env.QA_USERNAME ?? "admin";
const PASSWORD = process.env.QA_PASSWORD ?? "";
const CONCURRENCY = Number(process.env.QA_CONCURRENCY ?? 4);
const PAIRWISE_CAP = Number(process.env.QA_PAIRWISE_CAP ?? 6);
const FORMAT_WITNESSES = Number(process.env.QA_FORMAT_WITNESSES ?? 3);
// QA_OUT_DIR lets several machines sweep in parallel without clobbering each
// other's lane-<mode>.jsonl (#677).
const OUT_DIR_OVERRIDE = process.env.QA_OUT_DIR;
/* biome-ignore-end lint/suspicious/noUndeclaredEnvVars: QA harness runs outside Turbo. */

const REPO = join(import.meta.dirname, "..", "..");
const OUT_DIR =
  OUT_DIR_OVERRIDE ??
  join(REPO, "docs", "qa", "master-20260724", "evidence", "processing-ai", "final");

/** Class-aware hard timeouts. Exceeding one is a finding, never a silent skip. */
const TIMEOUT_MS: Record<string, number> = { fast: 240_000, long: 480_000, ai: 900_000 };

// ── Tool contract (generated from live code) ──────────────────────

interface ToolContract {
  id: string;
  name: string;
  modality: string;
  section: string;
  acceptedInputs: string[];
  executionHint: string;
  isAI: boolean;
  registered: boolean;
  maxInputs?: number;
  inputKinds?: string[];
  axes: PictAxis[];
  invalidProbes: Array<{ key: string; value: unknown; why: string }>;
}

const CONTRACT_PATH = join(import.meta.dirname, "tool-contract.json");
if (!existsSync(CONTRACT_PATH)) {
  console.error(
    `missing ${CONTRACT_PATH}; run ./apps/api/node_modules/.bin/tsx tests/qa/extract-tool-contract.mts first`,
  );
  process.exit(2);
}
const TOOLS: ToolContract[] = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

// ── Per-tool request shaping ──────────────────────────────────────

/**
 * Minimal settings that make a tool's canonical case meaningful. Schemas that
 * accept {} get {}; the rest state the smallest valid payload. Values are
 * chosen so the semantic oracles in lib/oracles.ts can assert on them.
 */
const CANONICAL_SETTINGS: Record<string, Record<string, unknown>> = {
  resize: { width: 64 },
  crop: { left: 0, top: 0, width: 8, height: 8 },
  rotate: { angle: 90 },
  convert: { format: "png" },
  "watermark-text": { text: "SnapOtter QA" },
  "text-overlay": { text: "SnapOtter QA" },
  "passport-photo": { countryCode: "US" },
  "content-aware-resize": { width: 50 },
  "ai-canvas-expand": { extendRight: 32 },
  collage: { templateId: "2-h-equal" },
  "trim-video": { startS: 0, endS: 1 },
  "trim-audio": { startS: 0, endS: 1 },
  "split-audio": { mode: "parts", parts: 2 },
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
  "convert-document": { format: "odt" },
  "epub-convert": { format: "html" },
  "convert-presentation": { format: "odp" },
  "convert-spreadsheet": { format: "ods" },
};

/** Generators take a JSON body and no file at all. */
const GENERATOR_BODIES: Record<string, Record<string, unknown>> = {
  "qr-generate": { text: "https://snapotter.com/qa" },
  "barcode-generate": { text: "SNAPOTTERQA", type: "code128" },
  "html-to-image": {
    html: "<html><body><h1>SnapOtter QA</h1><p>generator oracle</p></body></html>",
    format: "png",
  },
};

interface SecondarySpec {
  field: string;
  ext?: string;
  modality?: string;
  sameAsPrimary?: boolean;
  /** Repeat count when the route takes N files under one field name. */
  copies?: number;
}

const SECONDARY_INPUTS: Record<string, SecondarySpec[]> = {
  "watermark-image": [{ field: "watermark", ext: ".png", modality: "image" }],
  compose: [{ field: "overlay", ext: ".png", modality: "image" }],
  // erase-object needs a mask image as a discrete second file; without it the
  // route refuses with 400. The worker resizes the mask to the image, so any
  // valid PNG works.
  "erase-object": [{ field: "mask", ext: ".png", modality: "image" }],
  compare: [{ field: "file", sameAsPrimary: true }],
  "find-duplicates": [{ field: "file", sameAsPrimary: true }],
  collage: [{ field: "file", sameAsPrimary: true }],
  stitch: [{ field: "file", sameAsPrimary: true }],
  "sprite-sheet": [{ field: "file", sameAsPrimary: true }],
  "images-to-video": [{ field: "file", sameAsPrimary: true, copies: 2 }],
  "merge-videos": [{ field: "file", sameAsPrimary: true }],
  "merge-audio": [{ field: "file", sameAsPrimary: true }],
  "merge-pdf": [{ field: "file", sameAsPrimary: true }],
  "merge-csvs": [{ field: "file", sameAsPrimary: true }],
  "image-to-pdf": [{ field: "file", sameAsPrimary: true }],
  "bulk-rename": [{ field: "file", sameAsPrimary: true }],
  "create-zip": [{ field: "file", sameAsPrimary: true }],
  "replace-audio": [{ field: "file", ext: ".mp3", modality: "audio" }],
  "burn-subtitles": [{ field: "file", ext: ".srt", modality: "document" }],
  "embed-subtitles": [{ field: "file", ext: ".srt", modality: "document" }],
  "sign-pdf": [{ field: "sig0", ext: ".png", modality: "image" }],
};

const EXTRA_FIELDS: Record<string, Record<string, string>> = {
  "sign-pdf": {
    placements: JSON.stringify([{ sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.25, h: 0.12 }]),
  },
};

/** Fixtures a tool needs specifically, overriding extension resolution. */
const TOOL_FIXTURES: Record<string, Record<string, string>> = {
  "chart-maker": { ".json": join(REPO, "tests/fixtures/data/valid/chart.json") },
  "extract-subtitles": { ".mkv": join(REPO, "tests/fixtures/video/formats/tiny-subs.mkv") },
  // remove-gif-background rejects a still GIF by design; it needs an animated one.
  "remove-gif-background": {
    ".gif": join(REPO, "tests/fixtures/image/valid/animated-simpsons.gif"),
  },
  // Extraction tools emit an empty (but valid) artifact when the input has none
  // of the thing they extract, which the decodable-output oracle then reads as a
  // zero-byte failure. Pin fixtures that actually carry text and speech.
  ocr: { ".png": join(REPO, "tests/fixtures/image/valid/ocr-clean.png") },
  "transcribe-audio": { ".wav": join(REPO, "tests/fixtures/audio/valid/speech-10s.wav") },
  "auto-subtitles": { ".mp4": join(REPO, "tests/fixtures/video/valid/speech-10s.mp4") },
};

/**
 * Declared formats that are the meaningful canonical case for a tool. Without
 * this, extract-subtitles gets an MP4 with no subtitle track and its canonical
 * case is a correct refusal rather than a demonstration that it works.
 */
const CANONICAL_EXT: Record<string, string> = {
  "extract-subtitles": ".mkv",
  // ocr and transcribe-audio declare several formats but only the pinned
  // content fixture above exercises them, so force its extension over the
  // earlier-declared .jpg / .mp3 that would resolve to a content-free file.
  ocr: ".png",
  "transcribe-audio": ".wav",
};

/** Formats a multi-input tool only accepts on its SECONDARY field. */
const SECONDARY_ONLY: Record<string, RegExp> = {
  "replace-audio": /\.(mp3|wav|flac|aac|m4a|ogg|opus|wma|aiff|amr|ac3)$/,
  "burn-subtitles": /\.(srt|vtt|ass)$/,
  "embed-subtitles": /\.(srt|vtt|ass)$/,
};

/**
 * Tools that move bytes without decoding them (renaming, archiving, encoding).
 * Accepting a malformed image is their contract, not a validation gap.
 */
const PASSTHROUGH_TOOLS = new Set([
  "bulk-rename",
  "create-zip",
  "image-to-base64",
  // With no edits requested, edit-metadata echoes the input byte for byte, so
  // it never decodes the pixels and cannot be expected to reject corrupt ones.
  "edit-metadata",
]);

/** Extensions whose format has no structure to violate. */
const TEXTUAL_EXTS = new Set([
  ".md",
  ".markdown",
  ".csv",
  ".txt",
  ".html",
  ".htm",
  ".json",
  ".yaml",
  ".yml",
  ".srt",
  ".vtt",
  ".ass",
  ".tsv",
]);

/** Self-rejections that are correct behaviour, not defects. */
const EXPECTED_SELF_REJECT: Record<string, RegExp[]> = {
  "extract-subtitles": [/no subtitle track/i],
  "merge-csvs": [/different columns/i],
  "unlock-pdf": [/not (password[- ])?(protected|encrypted)/i, /incorrect password/i],
  "remove-pages": [/out of range/i, /only \d+ page/i],
  "extract-pages": [/out of range/i, /only \d+ page/i],
  "split-pdf": [/out of range/i, /only \d+ page/i, /single page/i],
  // The base passport-photo route is a dispatcher; the real work lives on its
  // /analyze and /generate sub-routes, so the bare tool path refuses by design.
  "passport-photo": [/\/analyze or \/generate/i],
};

/** High-risk axis triples worth explicit three-way coverage. */
const THREE_WAY_TOOLS = [
  "resize",
  "convert",
  "compress",
  "crop",
  "rotate",
  "watermark-text",
  "border",
  "adjust-colors",
  "convert-video",
  "compress-video",
  "convert-audio",
  "compress-pdf",
];

// ── Case model ────────────────────────────────────────────────────

type Verdict = "pass" | "fail" | "expected-reject" | "blocked" | "no-fixture" | "inert";

interface CaseResult {
  mode: string;
  tool: string;
  caseId: string;
  format?: string;
  settings?: unknown;
  httpStatus: number | null;
  async: boolean;
  verdict: Verdict;
  oracle: string;
  detail: string;
  facts?: string;
  durationMs: number;
  jobId?: string;
}

const results: CaseResult[] = [];

function record(result: CaseResult): void {
  results.push(result);
  const tag = result.verdict.toUpperCase().padEnd(15);
  const label = `${result.tool}${result.format ? ` x ${result.format}` : ""} ${result.caseId}`;
  console.log(`  [${tag}] ${label}: ${result.detail}`);
}

// ── Response classification ───────────────────────────────────────

const STACK_LEAK = /\n\s+at\s+[\w$.<>]+\s*\(|\/apps\/api\/src\/|\/node_modules\/|node:internal/;

interface Classification {
  verdict: Verdict;
  oracle: string;
  detail: string;
  facts?: OutputFacts;
}

/** Structured-error contract: JSON body with an error string and no stack. */
function classifyRejection(outcome: SubmitOutcome, expected: boolean): Classification {
  const body = outcome.bodyText ?? "";
  if (STACK_LEAK.test(body)) {
    return {
      verdict: "fail",
      oracle: "structured-error",
      detail: `${outcome.httpStatus} leaked a stack trace or internal path: ${body.slice(0, 200)}`,
    };
  }
  const message = ["error", "details", "message"]
    .map((key) => outcome.json?.[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" | ");
  if (!outcome.json || !message) {
    return {
      verdict: "fail",
      oracle: "structured-error",
      detail: `${outcome.httpStatus} returned an unstructured error body: ${body.slice(0, 160)}`,
    };
  }
  return {
    verdict: expected ? "expected-reject" : "fail",
    oracle: "structured-error",
    detail: `${outcome.httpStatus} ${message.slice(0, 160)}`,
  };
}

/**
 * Turns one container response into a verdict.
 *
 * `expectSuccess` false means the case was designed to be refused, so a clean
 * structured 4xx is the pass and a 200 is the failure.
 */
async function classify(
  tool: ToolContract,
  outcome: SubmitOutcome,
  expectSuccess: boolean,
  inputFacts: OutputFacts | null,
  options: { semantic?: boolean; allowRejection?: boolean } = {},
): Promise<Classification> {
  if (outcome.transportError) {
    return {
      verdict: "fail",
      oracle: "transport",
      detail: `transport failure: ${outcome.transportError.slice(0, 200)}`,
    };
  }
  const status = outcome.httpStatus;
  if (status === null) {
    return { verdict: "fail", oracle: "transport", detail: "no HTTP response" };
  }

  if (
    status === 501 &&
    (outcome.json?.code === "FEATURE_NOT_INSTALLED" ||
      outcome.json?.code === "FEATURE_INCOMPATIBLE")
  ) {
    const feature = String(outcome.json.featureName ?? outcome.json.feature ?? "AI bundle");
    const reason =
      outcome.json.code === "FEATURE_INCOMPATIBLE"
        ? `unavailable on this host (${String(outcome.json.compatibilityReason ?? "incompatible")})`
        : "not installed on this container";
    return {
      verdict: "blocked",
      oracle: "feature-gate",
      detail: `AI bundle ${reason}: ${feature}`,
    };
  }
  // 503 with a structured quota message is deliberate backpressure, not a
  // fault. It caps how much of the sweep can run at once; it is not a defect.
  if (status === 503 && /concurrent|quota|please wait/i.test(outcome.bodyText ?? "")) {
    return {
      verdict: "blocked",
      oracle: "quota-backpressure",
      detail: `refused by concurrency quota: ${(outcome.bodyText ?? "").slice(0, 160)}`,
    };
  }
  if (status >= 500) {
    return {
      verdict: "fail",
      oracle: "no-5xx",
      detail: `server error ${status}: ${(outcome.bodyText ?? "").slice(0, 200)}`,
    };
  }
  if (status === 404) {
    return {
      verdict: "fail",
      oracle: "route-exists",
      detail: `route ${outcome.path} is not served (404); the tool is unreachable at its catalog path`,
    };
  }
  if (status >= 400) {
    return classifyRejection(outcome, !expectSuccess || Boolean(options.allowRejection));
  }

  // 2xx from here on.
  if (!expectSuccess) {
    // A 202 only means the upload was queued. Rejecting bad input in the worker
    // rather than at ingress is a valid contract as long as the job reaches a
    // clean terminal failure, so judge the job, not the acknowledgement.
    if (outcome.async) {
      if (outcome.asyncOutcome === "failed") {
        return {
          verdict: "expected-reject",
          oracle: "deferred-rejection",
          detail: `queued at ingress, then refused by the worker: ${(outcome.asyncError ?? "").slice(0, 160)}`,
        };
      }
      if (outcome.asyncOutcome === "timeout") {
        return {
          verdict: "fail",
          oracle: "must-reject",
          detail: `bad input queued as job ${outcome.jobId} and never reached a terminal state`,
        };
      }
    }
    return {
      verdict: "fail",
      oracle: "must-reject",
      detail: `container accepted an input it should have refused (HTTP ${status})`,
    };
  }

  if (outcome.async) {
    if (outcome.asyncOutcome === "timeout") {
      return {
        verdict: "fail",
        oracle: "async-completion",
        detail: `async job ${outcome.jobId} never reached a terminal SSE frame`,
      };
    }
    if (outcome.asyncOutcome === "failed") {
      return {
        verdict: "fail",
        oracle: "async-completion",
        detail: `async job failed: ${(outcome.asyncError ?? "unknown").slice(0, 200)}`,
      };
    }
    const monotonic = checkMonotonic(outcome);
    if (monotonic) {
      return { verdict: "fail", oracle: "sse-monotonic", detail: monotonic };
    }
  }

  // JSON-result tools legitimately return data instead of an artifact.
  if (!outcome.bytes) {
    if (outcome.json && Object.keys(outcome.json).length > 0 && !outcome.json.downloadUrl) {
      return {
        verdict: "pass",
        oracle: "json-result",
        detail: `JSON result keys: ${Object.keys(outcome.json).join(",")}`,
      };
    }
    return {
      verdict: "fail",
      oracle: "output-retrievable",
      detail: `HTTP ${status} but no output bytes could be retrieved (downloadUrl=${outcome.downloadUrl ?? "none"})`,
    };
  }

  const facts = await inspectOutput(
    outcome.bytes,
    outcome.outputFilename ?? "output.bin",
    outcome.outputContentType ?? "",
  );
  if (facts.decodeError) {
    // The host decoder is weaker than the container's for several exotic
    // formats (bmp, ico, psd, some RAW). Blaming the container for a format
    // this machine cannot read either would be a false positive, so prove the
    // oracle can read the input before calling the output corrupt.
    if (inputFacts?.decodeError) {
      return {
        verdict: "blocked",
        oracle: "oracle-limit",
        detail: `host decoder cannot read this format on input either, so the output is unverifiable here: ${facts.decodeError}`,
        facts,
      };
    }
    return {
      verdict: "fail",
      oracle: "decodable-output",
      detail: `output did not decode: ${facts.decodeError}`,
      facts,
    };
  }

  if (options.semantic) {
    const semantic = SEMANTIC_ORACLES[tool.id];
    if (semantic) {
      const violation = semantic(facts, inputFacts);
      if (violation) {
        return { verdict: "fail", oracle: `semantic:${tool.id}`, detail: violation, facts };
      }
      return {
        verdict: "pass",
        oracle: `semantic:${tool.id}`,
        detail: describeFacts(facts),
        facts,
      };
    }
  }

  return { verdict: "pass", oracle: `decode:${facts.kind}`, detail: describeFacts(facts), facts };
}

/** SSE percentages must never move backwards within one job. */
function checkMonotonic(outcome: SubmitOutcome): string | null {
  let last = -1;
  for (const frame of outcome.sseFrames) {
    if (frame.data.type === "heartbeat") continue;
    const percent = frame.data.percent;
    if (typeof percent !== "number") continue;
    if (percent < last) {
      return `SSE percent went backwards: ${last} then ${percent} on job ${outcome.jobId}`;
    }
    last = percent;
  }
  return null;
}

// ── Request assembly ──────────────────────────────────────────────

function timeoutFor(tool: ToolContract): number {
  if (tool.isAI) return TIMEOUT_MS.ai;
  return TIMEOUT_MS[tool.executionHint] ?? TIMEOUT_MS.fast;
}

function fixtureFor(tool: ToolContract, ext: string): string | null {
  const specific = TOOL_FIXTURES[tool.id]?.[ext];
  if (specific && existsSync(specific)) return specific;
  return resolveFixture(ext, tool.modality);
}

function canonicalExtFor(tool: ToolContract): string | null {
  const preferred = CANONICAL_EXT[tool.id];
  if (preferred && fixtureFor(tool, preferred)) return preferred;
  // An empty acceptedInputs means "any file"; give those tools a real one.
  if (tool.acceptedInputs.length === 0) return ".png";
  for (const ext of tool.acceptedInputs) {
    if (SECONDARY_ONLY[tool.id]?.test(ext)) continue;
    if (fixtureFor(tool, ext)) return ext;
  }
  return null;
}

interface BuiltRequest {
  files: Array<{ field: string; path: string }>;
  fields?: Record<string, string>;
}

function buildFiles(tool: ToolContract, primary: string): BuiltRequest {
  const files = [{ field: "file", path: primary }];
  for (const spec of SECONDARY_INPUTS[tool.id] ?? []) {
    const copies = spec.copies ?? 1;
    for (let i = 0; i < copies; i++) {
      const path = spec.sameAsPrimary
        ? primary
        : resolveFixture(spec.ext ?? "", spec.modality ?? tool.modality);
      if (path) files.push({ field: spec.field, path });
    }
  }
  return { files, fields: EXTRA_FIELDS[tool.id] };
}

// ── Lanes ─────────────────────────────────────────────────────────

let client: QaClient;

async function runToolCase(
  tool: ToolContract,
  options: {
    mode: string;
    caseId: string;
    ext?: string;
    settings?: unknown;
    expectSuccess: boolean;
    /** Settings lanes: a typed settings rejection is a valid outcome. */
    allowSettingsRejection?: boolean;
    semantic?: boolean;
    fixturePath?: string;
    filenameOverride?: string;
    inputFacts?: OutputFacts | null;
  },
): Promise<CaseResult> {
  const ext = options.ext ?? canonicalExtFor(tool);
  const generatorBody = GENERATOR_BODIES[tool.id];

  if (!generatorBody && !ext) {
    const result: CaseResult = {
      mode: options.mode,
      tool: tool.id,
      caseId: options.caseId,
      httpStatus: null,
      async: false,
      verdict: "no-fixture",
      oracle: "fixture-available",
      detail: `no fixture for any of ${tool.acceptedInputs.join(",")}`,
      durationMs: 0,
    };
    record(result);
    return result;
  }

  const fixture = options.fixturePath ?? (ext ? fixtureFor(tool, ext) : null);
  if (!generatorBody && !fixture) {
    const result: CaseResult = {
      mode: options.mode,
      tool: tool.id,
      caseId: options.caseId,
      format: ext ?? undefined,
      httpStatus: null,
      async: false,
      verdict: "no-fixture",
      oracle: "fixture-available",
      detail: `no fixture for ${ext}`,
      durationMs: 0,
    };
    record(result);
    return result;
  }

  const built = fixture ? buildFiles(tool, fixture) : { files: [] };
  const files = options.filenameOverride
    ? built.files.map((file, index) =>
        index === 0 ? { ...file, filename: options.filenameOverride } : file,
      )
    : built.files;

  const settings =
    options.settings !== undefined ? options.settings : (CANONICAL_SETTINGS[tool.id] ?? {});

  // Differential oracles (rotate swapping axes, for instance) need to measure
  // the input too. Without it the comparison is against undefined and passes or
  // fails for the wrong reason.
  let inputFacts = options.inputFacts ?? null;
  if (!inputFacts && fixture && options.expectSuccess) {
    const { readFileSync } = await import("node:fs");
    inputFacts = await inspectOutput(readFileSync(fixture), fixture.split("/").pop() ?? "in.bin");
  }

  const outcome = await client.submit({
    path: apiToolPath(tool.id),
    files: generatorBody ? undefined : files,
    settings: generatorBody ? undefined : settings,
    fields: generatorBody ? undefined : built.fields,
    jsonBody: generatorBody ? { ...generatorBody, ...(settings as object) } : undefined,
    timeoutMs: timeoutFor(tool),
  });

  const classification = await classify(tool, outcome, options.expectSuccess, inputFacts, {
    semantic: options.semantic,
    allowRejection: options.allowSettingsRejection,
  });

  // A tool refusing a format it declares is only acceptable when the refusal is
  // one this catalog documents as correct. EXPECTED_SELF_REJECT decides both
  // directions: it rescues a documented refusal and condemns an undocumented one.
  let verdict = classification.verdict;
  let detail = classification.detail;
  const documented = EXPECTED_SELF_REJECT[tool.id]?.some((pattern) => pattern.test(detail));
  if (
    documented &&
    classification.oracle === "structured-error" &&
    (verdict === "fail" || verdict === "expected-reject")
  ) {
    verdict = "expected-reject";
    detail = `documented refusal: ${detail}`;
  } else if (
    verdict === "expected-reject" &&
    options.expectSuccess === true &&
    !options.allowSettingsRejection &&
    ext &&
    tool.acceptedInputs.includes(ext)
  ) {
    if (!documented) {
      verdict = "fail";
      detail = `tool refused ${ext}, a format it declares it accepts: ${detail}`;
    }
  }

  const result: CaseResult = {
    mode: options.mode,
    tool: tool.id,
    caseId: options.caseId,
    format: ext ?? "generator",
    settings: options.settings,
    httpStatus: outcome.httpStatus,
    async: outcome.async,
    verdict,
    oracle: classification.oracle,
    detail,
    facts: classification.facts ? describeFacts(classification.facts) : undefined,
    durationMs: outcome.durationMs,
    jobId: outcome.jobId,
  };
  record(result);
  return result;
}

/** Runs an array of thunks with bounded concurrency, preserving order. */
async function runPool<T>(jobs: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      out[index] = await jobs[index]();
    }
  });
  await Promise.all(workers);
  return out;
}

async function laneCanonical(tools: ToolContract[]): Promise<void> {
  await runPool(
    tools.map(
      (tool) => () =>
        runToolCase(tool, {
          mode: "canonical",
          caseId: "canonical",
          expectSuccess: true,
          semantic: true,
        }),
    ),
    CONCURRENCY,
  );
}

/**
 * Format coverage.
 *
 * The full tool x format cross product is 3021 cases, most of them redundant:
 * format support lives in the shared decode layer, so the hundredth image tool
 * reading a DNG proves little the third did not. QA_FORMAT_WITNESSES bounds it
 * by running each (modality, extension) pair through that many different tools,
 * with two guarantees that keep the claim honest:
 *
 *   - every extension any tool declares is exercised at least once, and
 *   - a tool that is the only declarer of an extension always runs it,
 *
 * so no declared format goes untested. Set QA_FORMAT_WITNESSES=0 for the
 * unbounded cross product.
 */
async function laneFormats(tools: ToolContract[]): Promise<void> {
  const jobs: Array<() => Promise<CaseResult>> = [];
  const witnessed = new Map<string, number>();

  // Extensions only one tool in the whole catalog declares must never be
  // dropped, whichever order the tools happen to come in.
  const declarers = new Map<string, number>();
  for (const tool of TOOLS) {
    for (const ext of new Set(tool.acceptedInputs)) {
      declarers.set(ext, (declarers.get(ext) ?? 0) + 1);
    }
  }

  for (const tool of tools) {
    const seen = new Set<string>();
    for (const ext of tool.acceptedInputs) {
      if (SECONDARY_ONLY[tool.id]?.test(ext)) continue;
      const fixture = fixtureFor(tool, ext);
      if (fixture && seen.has(fixture)) continue;
      if (fixture) seen.add(fixture);

      const key = `${tool.modality}:${ext}`;
      const count = witnessed.get(key) ?? 0;
      const rare = (declarers.get(ext) ?? 0) <= FORMAT_WITNESSES;
      if (FORMAT_WITNESSES > 0 && count >= FORMAT_WITNESSES && !rare) continue;
      witnessed.set(key, count + 1);

      jobs.push(() =>
        runToolCase(tool, { mode: "formats", caseId: `format${ext}`, ext, expectSuccess: true }),
      );
    }
  }
  console.log(
    `formats lane: ${jobs.length} cases covering ${witnessed.size} distinct modality/extension pairs`,
  );
  await runPool(jobs, CONCURRENCY);
}

/**
 * Differential settings coverage.
 *
 * For each axis, the same input is sent twice with two different values for
 * that axis and everything else held constant. If both runs produce byte
 * identical output the setting had no observable effect, which the release
 * contract treats as a finding rather than a pass.
 */
async function laneSettings(tools: ToolContract[]): Promise<void> {
  const jobs: Array<() => Promise<void>> = [];
  for (const tool of tools) {
    if (tool.axes.length === 0) continue;
    const ext = canonicalExtFor(tool);
    if (!ext) continue;
    const base = CANONICAL_SETTINGS[tool.id] ?? {};

    for (const axis of tool.axes) {
      const values = axis.values.filter((value) => value !== undefined).slice(0, 2);
      if (values.length < 2) continue;
      jobs.push(async () => {
        const hashes: string[] = [];
        const statuses: Array<number | null> = [];
        for (const value of values) {
          const outcome = await client.submit({
            path: apiToolPath(tool.id),
            files: buildFiles(tool, fixtureFor(tool, ext) as string).files,
            settings: { ...base, [axis.key]: value },
            fields: EXTRA_FIELDS[tool.id],
            timeoutMs: timeoutFor(tool),
          });
          statuses.push(outcome.httpStatus);
          if (outcome.bytes) {
            const facts = await inspectOutput(
              outcome.bytes,
              outcome.outputFilename ?? "output.bin",
              outcome.outputContentType ?? "",
            );
            hashes.push(facts.decodeError ? `undecodable:${facts.decodeError}` : facts.sha256);
          } else {
            hashes.push(`no-bytes:${outcome.httpStatus}:${(outcome.bodyText ?? "").slice(0, 80)}`);
          }
        }

        const bothSucceeded = statuses.every((s) => s !== null && s < 300);
        const gated = statuses.every((s) => s === 501 || s === 503);
        const observable = hashes[0] !== hashes[1];
        const undecodable = hashes.some((h) => h.startsWith("undecodable:"));

        let verdict: Verdict;
        let detail: string;
        if (gated) {
          verdict = "blocked";
          detail = `feature or quota gate returned ${statuses.join("/")} for ${axis.key}`;
        } else if (undecodable) {
          verdict = "fail";
          detail = `undecodable output for ${axis.key}: ${hashes.find((h) => h.startsWith("undecodable:"))}`;
        } else if (!bothSucceeded) {
          verdict = statuses.some((s) => s !== null && s >= 500) ? "fail" : "expected-reject";
          detail = `statuses ${statuses.join("/")} for ${axis.key}=${JSON.stringify(values)}`;
        } else if (observable) {
          verdict = "pass";
          detail = `${axis.key} changed the output across ${JSON.stringify(values)}`;
        } else {
          // Byte-identical output can mean the setting does nothing, or that it
          // does nothing under this base configuration (fit is inert when only
          // width is given; withoutEnlargement is inert when downscaling).
          // Reported for triage rather than asserted as a defect.
          verdict = "inert";
          detail = `${axis.key} produced byte identical output across ${JSON.stringify(values)} under base ${JSON.stringify(base)}`;
        }

        record({
          mode: "settings",
          tool: tool.id,
          caseId: `differential:${axis.key}`,
          format: ext,
          settings: { [axis.key]: values },
          httpStatus: statuses[0],
          async: false,
          verdict,
          oracle: "differential",
          detail,
          durationMs: 0,
        });
      });
    }

    // Pairwise covering array over the whole schema: every case must either
    // succeed with a decodable artifact or be refused through the typed error.
    const cases = pairwise(tool.axes).slice(0, PAIRWISE_CAP);
    for (const [index, combo] of cases.entries()) {
      const settings = { ...base, ...combo };
      for (const key of Object.keys(settings)) {
        if (settings[key] === undefined) delete settings[key];
      }
      jobs.push(async () => {
        await runToolCase(tool, {
          mode: "settings",
          caseId: `pairwise#${index}`,
          ext,
          settings,
          expectSuccess: true,
          allowSettingsRejection: true,
        });
      });
    }
  }
  await runPool(jobs, CONCURRENCY);
}

/** Targeted three-way combinations for tools whose axes interact. */
async function laneThreeWay(tools: ToolContract[]): Promise<void> {
  const jobs: Array<() => Promise<CaseResult>> = [];
  for (const tool of tools) {
    if (!THREE_WAY_TOOLS.includes(tool.id) || tool.axes.length < 3) continue;
    const ext = canonicalExtFor(tool);
    if (!ext) continue;
    const base = CANONICAL_SETTINGS[tool.id] ?? {};
    const triples = threeWayCases(tool.axes).slice(0, 18);
    for (const [index, combo] of triples.entries()) {
      const settings = { ...base, ...combo };
      for (const key of Object.keys(settings)) {
        if (settings[key] === undefined) delete settings[key];
      }
      jobs.push(() =>
        runToolCase(tool, {
          mode: "threeway",
          caseId: `threeway#${index}`,
          ext,
          settings,
          expectSuccess: true,
          allowSettingsRejection: true,
        }),
      );
    }
  }
  await runPool(jobs, CONCURRENCY);
}

/** Exhaustive triples over the first three axes, then pairwise for the rest. */
function threeWayCases(axes: PictAxis[]): Array<Record<string, unknown>> {
  const [a, b, c] = axes;
  const rest = axes.slice(3);
  const restCases = rest.length > 0 ? pairwise(rest) : [{}];
  const out: Array<Record<string, unknown>> = [];
  for (const av of a.values.slice(0, 3)) {
    for (const bv of b.values.slice(0, 3)) {
      for (const cv of c.values.slice(0, 3)) {
        out.push({
          [a.key]: av,
          [b.key]: bv,
          [c.key]: cv,
          ...restCases[out.length % restCases.length],
        });
      }
    }
  }
  return out;
}

async function laneInvalid(tools: ToolContract[]): Promise<void> {
  const jobs: Array<() => Promise<CaseResult>> = [];
  for (const tool of tools) {
    const ext = canonicalExtFor(tool);
    if (!ext) continue;
    const base = CANONICAL_SETTINGS[tool.id] ?? {};
    const probes = tool.invalidProbes.slice(0, 6);
    for (const probe of probes) {
      jobs.push(() =>
        runToolCase(tool, {
          mode: "invalid",
          caseId: `invalid:${probe.key}:${probe.why}`,
          ext,
          settings: { ...base, [probe.key]: probe.value },
          expectSuccess: false,
        }),
      );
    }
    // Structural garbage in the settings field itself. Only meaningful for a
    // tool that actually has settings; a route with none legitimately ignores
    // the field, and generators never read it because they take a JSON body.
    if (tool.axes.length === 0 || GENERATOR_BODIES[tool.id]) continue;
    jobs.push(() =>
      runToolCase(tool, {
        mode: "invalid",
        caseId: "invalid:settings-wrong-type",
        ext,
        settings: "this is not an object",
        expectSuccess: false,
      }),
    );
  }
  await runPool(jobs, CONCURRENCY);
}

/**
 * Hostile lane: malformed bytes, zero-byte files, decompression bombs, and
 * inputs renamed to a extension they are not. Every one must be refused
 * through the structured error contract with no 5xx and no stack leak.
 */
async function laneHostile(tools: ToolContract[]): Promise<void> {
  const hostileDirs: Record<string, string> = {
    image: join(REPO, "tests/fixtures/image/hostile"),
    video: join(REPO, "tests/fixtures/video/hostile"),
    audio: join(REPO, "tests/fixtures/audio/hostile"),
    document: join(REPO, "tests/fixtures/document/hostile"),
  };
  const { readdirSync } = await import("node:fs");
  const jobs: Array<() => Promise<CaseResult>> = [];

  for (const tool of tools) {
    // Generators never read the uploaded file, and passthrough tools do not
    // decode it. Feeding them corrupt pixels tests nothing.
    if (GENERATOR_BODIES[tool.id] || PASSTHROUGH_TOOLS.has(tool.id)) continue;

    const dir = hostileDirs[tool.modality];
    const ext = canonicalExtFor(tool);
    if (!ext) continue;

    if (dir && existsSync(dir)) {
      for (const filename of readdirSync(dir)) {
        // png-bytes.jpg is a genuine PNG wearing a .jpg name. Decoding by
        // content rather than by extension is the intended behaviour, so this
        // one is a positive control: refusing it would be the defect.
        // png-bytes.jpg is a real PNG named .jpg, so it is a valid image with a
        // lying extension. Both answers are defensible: decode it by content,
        // or refuse it because the declared extension does not match. The
        // catalog does both (jpg-to-png accepts, png-to-pdf refuses), so the
        // oracle here is only "no 5xx and no corrupt success". The split itself
        // is recorded as a consistency finding rather than asserted either way.
        const sniffControl = filename === "png-bytes.jpg";
        jobs.push(() =>
          runToolCase(tool, {
            mode: "hostile",
            caseId: `hostile:${filename}`,
            ext,
            fixturePath: join(dir, filename),
            filenameOverride: filename,
            expectSuccess: sniffControl,
            allowSettingsRejection: sniffControl,
          }),
        );
      }
    }

    // Renamed input: real bytes of one format wearing another extension. Only
    // meaningful where the target format has a structure to violate; .md, .csv,
    // .txt and .html have no magic bytes, so any byte stream is legal input.
    const wrong = tool.modality === "image" ? ".pdf" : ".png";
    const wrongFixture = resolveFixture(wrong, wrong === ".pdf" ? "document" : "image");
    // A tool that accepts .eps or .pdf carries a page rasterizer, so PDF bytes
    // under any name are legitimately decodable input for it.
    const rasterizes = tool.acceptedInputs.includes(".eps") || tool.acceptedInputs.includes(".pdf");
    if (wrongFixture && !TEXTUAL_EXTS.has(ext) && !rasterizes) {
      jobs.push(() =>
        runToolCase(tool, {
          mode: "hostile",
          caseId: "hostile:renamed",
          ext,
          fixturePath: wrongFixture,
          filenameOverride: `renamed${ext}`,
          expectSuccess: false,
        }),
      );
    }
  }
  await runPool(jobs, CONCURRENCY);
}

/** Generator routes: no file input at all, JSON body, oracle on the artifact. */
async function laneGenerators(): Promise<void> {
  const jobs: Array<() => Promise<CaseResult>> = [];
  for (const [toolId, body] of Object.entries(GENERATOR_BODIES)) {
    const tool = BY_ID.get(toolId);
    if (!tool) continue;
    jobs.push(() =>
      runToolCase(tool, { mode: "generators", caseId: "generate", expectSuccess: true }),
    );
    // A generator with no payload at all must refuse, not emit an empty artifact.
    jobs.push(async () => {
      const outcome = await client.submit({
        path: apiToolPath(toolId),
        jsonBody: {},
        timeoutMs: timeoutFor(tool),
      });
      const classification = await classify(tool, outcome, false, null);
      const result: CaseResult = {
        mode: "generators",
        tool: toolId,
        caseId: "generate:empty-body",
        format: "generator",
        httpStatus: outcome.httpStatus,
        async: outcome.async,
        verdict: classification.verdict,
        oracle: classification.oracle,
        detail: classification.detail,
        durationMs: outcome.durationMs,
      };
      record(result);
      return result;
    });
    void body;
  }
  await runPool(jobs, CONCURRENCY);
}

/** Multi-input routes: distinct fixtures per slot plus an arity oracle. */
async function laneMulti(): Promise<void> {
  const jobs: Array<() => Promise<CaseResult>> = [];
  for (const toolId of Object.keys(SECONDARY_INPUTS)) {
    const tool = BY_ID.get(toolId);
    if (!tool) continue;
    const ext = canonicalExtFor(tool);
    if (!ext) continue;

    // Two genuinely different files, not the same fixture twice, so a route
    // that silently drops the second input is visible.
    const candidates = fixturesFor(ext, tool.modality);
    const primary = TOOL_FIXTURES[tool.id]?.[ext] ?? candidates[0]?.path;
    const secondary = candidates[1]?.path ?? primary;
    if (!primary) continue;

    jobs.push(async () => {
      const spec = SECONDARY_INPUTS[toolId];
      const files = [{ field: "file", path: primary }];
      for (const entry of spec) {
        const copies = entry.copies ?? 1;
        for (let i = 0; i < copies; i++) {
          const path = entry.sameAsPrimary
            ? secondary
            : resolveFixture(entry.ext ?? "", entry.modality ?? tool.modality);
          if (path) files.push({ field: entry.field, path });
        }
      }
      const outcome = await client.submit({
        path: apiToolPath(toolId),
        files,
        settings: CANONICAL_SETTINGS[toolId] ?? {},
        fields: EXTRA_FIELDS[toolId],
        timeoutMs: timeoutFor(tool),
      });
      const classification = await classify(tool, outcome, true, null);
      // The multi lane feeds genuinely different files on purpose, which for
      // merge-csvs means incompatible schemas. Refusing that is correct.
      const documented = EXPECTED_SELF_REJECT[toolId]?.some((pattern) =>
        pattern.test(classification.detail),
      );
      const result: CaseResult = {
        mode: "multi",
        tool: toolId,
        caseId: `multi:${files.length}-inputs`,
        format: ext,
        httpStatus: outcome.httpStatus,
        async: outcome.async,
        verdict: documented ? "expected-reject" : classification.verdict,
        oracle: classification.oracle,
        detail: `${files.length} distinct inputs -> ${documented ? "documented refusal: " : ""}${classification.detail}`,
        facts: classification.facts ? describeFacts(classification.facts) : undefined,
        durationMs: outcome.durationMs,
        jobId: outcome.jobId,
      };
      record(result);
      return result;
    });

    // Single input where the route requires several: must refuse, not half-run.
    if (SECONDARY_INPUTS[toolId].some((entry) => entry.sameAsPrimary)) {
      jobs.push(async () => {
        const outcome = await client.submit({
          path: apiToolPath(toolId),
          files: [{ field: "file", path: primary }],
          settings: CANONICAL_SETTINGS[toolId] ?? {},
          fields: EXTRA_FIELDS[toolId],
          timeoutMs: timeoutFor(tool),
        });
        // Some routes legitimately accept one file; the oracle is that the
        // response is either a clean refusal or a valid artifact, never a 5xx.
        const classification = await classify(
          tool,
          outcome,
          outcome.httpStatus !== null && outcome.httpStatus < 400,
          null,
        );
        const result: CaseResult = {
          mode: "multi",
          tool: toolId,
          caseId: "multi:single-input",
          format: ext,
          httpStatus: outcome.httpStatus,
          async: outcome.async,
          verdict: classification.verdict,
          oracle: `arity:${classification.oracle}`,
          detail: `1 input -> ${classification.detail}`,
          durationMs: outcome.durationMs,
        };
        record(result);
        return result;
      });
    }
  }
  await runPool(jobs, CONCURRENCY);
}

/** ZIP and JSON output routes, asserted on membership and shape. */
/**
 * ZIP-output routes, with whatever it takes to reach their multi-output path.
 * split-pdf in range mode returns one PDF and svg-to-raster with one SVG
 * returns one image, so asserting "a ZIP came back" without driving them there
 * measures the harness rather than the route. sprite-sheet is not here: it is
 * a multi-input tool with a single image output, covered by the multi lane.
 */
const ARCHIVE_TOOLS = [
  "pdf-to-image",
  "svg-to-raster",
  "favicon",
  "split-pdf",
  "video-to-frames",
  "create-zip",
];

/** Settings, input counts and routes that reach an archive route's multi-output path. */
const ARCHIVE_DRIVE: Record<
  string,
  { settings?: Record<string, unknown>; extraInputs?: number; path?: string }
> = {
  "split-pdf": { settings: { mode: "every", everyN: 1 } },
  // The main svg-to-raster route always returns one image; the archive lives
  // behind its /batch sub-route.
  "svg-to-raster": { extraInputs: 1, path: "/api/v1/tools/image/svg-to-raster/batch" },
  "create-zip": { extraInputs: 1 },
};
const JSON_TOOLS = [
  "info",
  "color-palette",
  "image-to-base64",
  "barcode-read",
  "find-duplicates",
  "compare",
  "video-metadata",
  "audio-metadata",
  "pdf-metadata",
  "csv-json",
];

async function laneArchives(): Promise<void> {
  const jobs: Array<() => Promise<CaseResult>> = [];
  for (const toolId of [...ARCHIVE_TOOLS, ...JSON_TOOLS]) {
    const tool = BY_ID.get(toolId);
    if (!tool) continue;
    const ext = canonicalExtFor(tool);
    if (!ext) continue;
    jobs.push(async () => {
      const drive = ARCHIVE_DRIVE[toolId];
      const primary = fixtureFor(tool, ext) as string;
      const built = buildFiles(tool, primary);
      const files = [...built.files];
      for (let i = 0; i < (drive?.extraInputs ?? 0); i++) {
        files.push({ field: "file", path: primary });
      }
      const outcome = await client.submit({
        path: drive?.path ?? apiToolPath(toolId),
        files,
        settings: { ...(CANONICAL_SETTINGS[toolId] ?? {}), ...(drive?.settings ?? {}) },
        fields: built.fields,
        timeoutMs: timeoutFor(tool),
      });
      const classification = await classify(tool, outcome, true, null);
      let verdict = classification.verdict;
      let detail = classification.detail;
      let oracle = classification.oracle;

      if (verdict === "pass" && classification.facts) {
        const facts = classification.facts;
        if (ARCHIVE_TOOLS.includes(toolId)) {
          oracle = "archive-membership";
          if (!facts.zip) {
            verdict = "fail";
            detail = `expected a ZIP archive, got ${facts.kind}`;
          } else if (facts.zip.count === 0) {
            verdict = "fail";
            detail = "archive has zero members";
          } else {
            const empty = facts.zip.members.filter((member) => member.size === 0);
            if (empty.length > 0) {
              verdict = "fail";
              detail = `${empty.length} zero-byte member(s): ${empty
                .slice(0, 3)
                .map((m) => m.name)
                .join(",")}`;
            } else {
              detail = `${facts.zip.count} members, all non-empty: ${facts.zip.members
                .slice(0, 4)
                .map((m) => `${m.name}(${m.size}B)`)
                .join(", ")}`;
            }
          }
        } else {
          oracle = "json-shape";
          const payload = outcome.json ?? facts.json?.value;
          const keys = payload && typeof payload === "object" ? Object.keys(payload as object) : [];
          if (keys.length === 0) {
            verdict = "fail";
            detail = "JSON route returned an empty object";
          } else {
            detail = `JSON keys: ${keys.join(",")}`;
          }
        }
      }

      const result: CaseResult = {
        mode: "archives",
        tool: toolId,
        caseId: ARCHIVE_TOOLS.includes(toolId) ? "zip-output" : "json-output",
        format: ext,
        httpStatus: outcome.httpStatus,
        async: outcome.async,
        verdict,
        oracle,
        detail,
        facts: classification.facts ? describeFacts(classification.facts) : undefined,
        durationMs: outcome.durationMs,
        jobId: outcome.jobId,
      };
      record(result);
      return result;
    });
  }
  await runPool(jobs, CONCURRENCY);
}

/**
 * Controls. A known-good input must pass and a known-bad input must fail on
 * the same tool in the same run. If both pass, the lane's oracle is broken and
 * every other result in this campaign is worth less.
 */
async function laneControls(): Promise<void> {
  const good = join(REPO, "tests/fixtures/image/formats/sample.png");
  const bad = join(REPO, "tests/fixtures/image/hostile/garbage.jpg");
  const empty = join(REPO, "tests/fixtures/image/hostile/zero-byte.png");
  const tool = BY_ID.get("resize");
  if (!tool) return;

  await runToolCase(tool, {
    mode: "controls",
    caseId: "control:known-good",
    ext: ".png",
    fixturePath: good,
    settings: { width: 64 },
    expectSuccess: true,
    semantic: true,
  });
  await runToolCase(tool, {
    mode: "controls",
    caseId: "control:known-bad-garbage",
    ext: ".jpg",
    fixturePath: bad,
    filenameOverride: "garbage.jpg",
    settings: { width: 64 },
    expectSuccess: false,
  });
  await runToolCase(tool, {
    mode: "controls",
    caseId: "control:known-bad-empty",
    ext: ".png",
    fixturePath: empty,
    filenameOverride: "zero-byte.png",
    settings: { width: 64 },
    expectSuccess: false,
  });
  // Negative control on the oracle itself: a deliberately wrong expectation
  // must be reported as a failure, proving the semantic oracle can fail.
  const outcome = await client.submit({
    path: apiToolPath("resize"),
    files: [{ field: "file", path: good }],
    settings: { width: 128 },
    timeoutMs: TIMEOUT_MS.fast,
  });
  const facts = outcome.bytes
    ? await inspectOutput(outcome.bytes, outcome.outputFilename ?? "o.png", "image/png")
    : null;
  // Requires a real measurement: "undefined is not 64" would pass vacuously and
  // is exactly the false green this control exists to catch.
  const measured = facts?.image?.width;
  const oracleFires = typeof measured === "number" && measured !== 64;
  record({
    mode: "controls",
    tool: "resize",
    caseId: "control:oracle-negative",
    format: ".png",
    httpStatus: outcome.httpStatus,
    async: false,
    verdict: oracleFires ? "pass" : "fail",
    oracle: "oracle-self-test",
    detail: oracleFires
      ? `width oracle distinguishes 128 from 64 (measured ${facts?.image?.width})`
      : "width oracle could not tell 128 from 64; the oracle is not discriminating",
    durationMs: outcome.durationMs,
  });
}

// ── Entrypoint ────────────────────────────────────────────────────

const LANES: Record<string, (tools: ToolContract[]) => Promise<void>> = {
  canonical: laneCanonical,
  formats: laneFormats,
  settings: laneSettings,
  threeway: laneThreeWay,
  invalid: laneInvalid,
  hostile: laneHostile,
  generators: () => laneGenerators(),
  multi: () => laneMulti(),
  archives: () => laneArchives(),
  controls: () => laneControls(),
};

async function main(): Promise<void> {
  const [mode = "canonical", ...rest] = process.argv.slice(2);
  if (!LANES[mode]) {
    console.error(`unknown mode "${mode}"; expected one of ${Object.keys(LANES).join(", ")}`);
    process.exit(2);
  }
  const toolFilter = new Set(
    (rest.find((arg) => arg.startsWith("--tools="))?.slice(8) ?? "").split(",").filter(Boolean),
  );
  const limit = Number(rest.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? 0);

  if (!PASSWORD) {
    console.error("QA_PASSWORD is required; the container has auth enabled");
    process.exit(2);
  }

  const health = await fetch(`${BASE}/api/v1/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`container not reachable at ${BASE}`);
    process.exit(2);
  }

  const { token } = await login(BASE, USERNAME, PASSWORD);
  client = new QaClient({ baseUrl: BASE, token });

  let selected = TOOLS;
  if (toolFilter.size > 0) selected = selected.filter((tool) => toolFilter.has(tool.id));
  if (limit > 0) selected = selected.slice(0, limit);

  console.log(`=== lane "${mode}" over ${selected.length} tools at ${BASE} ===\n`);
  const started = Date.now();
  await LANES[mode](selected);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonlPath = join(OUT_DIR, `lane-${mode}.jsonl`);
  writeFileSync(jsonlPath, `${results.map((r) => JSON.stringify(r)).join("\n")}\n`);

  const counts = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.verdict] = (acc[result.verdict] ?? 0) + 1;
    return acc;
  }, {});
  const summary = {
    lane: mode,
    baseUrl: BASE,
    toolsSelected: selected.length,
    cases: results.length,
    elapsedSeconds: Number(elapsed),
    counts,
    failures: results
      .filter((result) => result.verdict === "fail")
      .map((result) => ({
        tool: result.tool,
        caseId: result.caseId,
        format: result.format,
        oracle: result.oracle,
        detail: result.detail,
      })),
  };
  writeFileSync(
    join(OUT_DIR, `lane-${mode}-summary.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  console.log(`\n${"=".repeat(64)}`);
  console.log(`lane ${mode}: ${results.length} cases in ${elapsed}s`);
  for (const [verdict, count] of Object.entries(counts)) console.log(`  ${verdict}: ${count}`);
  console.log(`results: ${jsonlPath}`);
  process.exit(counts.fail ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(2);
});
