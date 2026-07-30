// Campaign master-20260724, AI lane (cells AI-001 / AI-002 / PRIOR-001).
//
// Runs a real modality fixture through EVERY tool a feature bundle enables and
// asserts a tool-specific oracle on the artifact, against a running container.
// The bundle -> tool mapping is read from the live shared exports, never from a
// hand-maintained list, so a new bundle or a new `enablesTools` entry shows up
// here automatically.
//
// Usage:
//   QA_BASE_URL=http://localhost:13601 QA_USERNAME=admin QA_PASSWORD=... \
//   QA_PROFILE=ubuntu-gpu-amd64 QA_OUT=/path/results.jsonl \
//   [QA_BUNDLES=face-detection,transcription] [QA_EXPECT=gated|installed] \
//     apps/api/node_modules/.bin/tsx tests/qa/verify-ai-tool-matrix.mts
//
// QA_EXPECT=gated inverts the assertion: every tool must be REFUSED because its
// bundle is not installed. That is how the uninstall/reset path is proven.

import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { apiToolPath } from "../../packages/shared/src/constants.js";
import { FEATURE_BUNDLES, getRequiredBundlesForTool } from "../../packages/shared/src/features.js";
import { buildCenteredRectMask, meanAbsoluteDifference } from "../helpers/ai-fixture-builders.js";
import {
  expectAnimatedFrames,
  expectBackgroundBlurEnergyReduced,
  expectBackgroundCutOut,
  expectCanvasExpanded,
  expectColorAdded,
  expectConfiguredBackground,
  expectForegroundPreserved,
  expectHighFrequencyEnergyReduced,
  expectJapaneseScript,
  expectKnownTranscript,
  expectNonDegenerateImage,
  expectObservablePixelChange,
  expectRecognizedTerms,
  expectRedPixelsReduced,
  expectRegionRewritten,
  expectSameSizeButChanged,
  expectSrtArtifact,
  expectUpscaled,
} from "../helpers/installed-ai-output-oracles.js";

const BASE = (process.env.QA_BASE_URL ?? "").replace(/\/$/u, "");
const USERNAME = process.env.QA_USERNAME ?? "admin";
const PASSWORD = process.env.QA_PASSWORD ?? "";
const PROFILE = process.env.QA_PROFILE ?? "unknown-profile";
const OUT = process.env.QA_OUT ?? "";
const EXPECT = process.env.QA_EXPECT === "gated" ? "gated" : "installed";
const JOB_TIMEOUT_MS = Number(process.env.QA_JOB_TIMEOUT_MS ?? 20 * 60_000);
const REQUEST_TIMEOUT_MS = Number(process.env.QA_REQUEST_TIMEOUT_MS ?? 180_000);
if (!BASE || !PASSWORD) throw new Error("QA_BASE_URL and QA_PASSWORD are required");

const FIXTURES = "tests/fixtures";

/** Terminal or intermediate frame on the job SSE stream. */
interface ProgressFrame {
  error?: string;
  jobId?: string;
  phase?: string;
  result?: { downloadUrl?: string; processedSize?: number };
  type?: string;
}

/** The body of a 200 or 202 tool submission. */
interface AcceptedPayload {
  downloadUrl?: string;
  jobId?: string;
}

interface ToolCase {
  /**
   * Tools whose real work sits behind a sub-route (passport-photo) or that need
   * a second request to form an oracle (smart-crop) supply their own runner.
   */
  customRun?: (ctx: { input: Buffer; post: PostFn; token: string }) => Promise<void>;
  /** Extra multipart parts beyond `file`, e.g. the eraser mask. */
  extraFiles?: { contentType: string; field: string; path: string }[];
  contentType: string;
  expectedMime?: string | string[];
  fixture: string;
  /** Human note recorded in the evidence row. */
  oracle: string;
  settings: Record<string, unknown>;
  toolId: string;
  verify: (output: Buffer, input: Buffer) => Promise<void> | void;
}

const PORTRAIT = `${FIXTURES}/image/valid/portrait-color.jpg`;
const PORTRAIT_BW = `${FIXTURES}/image/valid/portrait-bw.jpeg`;
const MULTI_FACE = `${FIXTURES}/image/valid/multi-face.webp`;
const RED_EYE = `${FIXTURES}/image/valid/red-eye.jpg`;
const SAMPLE = `${FIXTURES}/image/valid/sample-photo.jpg`;
const ISOLATED = `${FIXTURES}/image/valid/portrait-isolated.png`;
const OCR_CLEAN = `${FIXTURES}/image/valid/ocr-clean.png`;
const OCR_JA = `${FIXTURES}/image/valid/ocr-japanese.png`;
// animated.gif is a flat synthetic gradient with no subject, so a cut-out
// legitimately erases every pixel. The Simpsons clip has a real subject.
const ANIMATED = `${FIXTURES}/image/valid/animated-simpsons.gif`;
const SPEECH_WAV = `${FIXTURES}/audio/valid/speech-10s.wav`;
const SPEECH_MP4 = `${FIXTURES}/video/valid/speech-10s.mp4`;

/** The English OCR fixture's known answer, checked word by word. */
// ocr-clean.png literally reads "The quick brown fox 12345"; the oracle must
// demand the fixture's words, not the full pangram (#677).
const OCR_ENGLISH_TERMS = ["the", "quick", "brown", "fox", "12345"] as const;
// ocr-scanned.pdf is a chat screenshot about Redis scaling.
const OCR_PDF_TERMS = ["redis", "replicas", "cache", "bottleneck"] as const;

const CASES: ToolCase[] = [
  {
    toolId: "remove-background",
    fixture: PORTRAIT,
    contentType: "image/jpeg",
    settings: { backgroundType: "transparent", format: "png" },
    expectedMime: "image/png",
    oracle: "border >50% transparent, subject centre >80% opaque, non-degenerate",
    verify: async (out) => {
      await expectNonDegenerateImage(out);
      await expectBackgroundCutOut(out);
    },
  },
  {
    toolId: "background-replace",
    fixture: PORTRAIT,
    contentType: "image/jpeg",
    settings: { backgroundType: "color", color: "#ff0000", format: "png" },
    expectedMime: "image/png",
    oracle: "solid red visible at border, subject preserved, pixels changed",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectObservablePixelChange(input, out);
      await expectConfiguredBackground(out, "solid-red");
      await expectForegroundPreserved(input, out);
    },
  },
  {
    toolId: "blur-background",
    fixture: PORTRAIT,
    contentType: "image/jpeg",
    settings: { intensity: 75, feather: 3, format: "webp" },
    expectedMime: "image/webp",
    oracle: "background HF energy ratio < 0.7, subject preserved",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectObservablePixelChange(input, out);
      await expectBackgroundBlurEnergyReduced(input, out);
      await expectForegroundPreserved(input, out);
    },
  },
  {
    toolId: "transparency-fixer",
    fixture: ISOLATED,
    contentType: "image/png",
    settings: { defringe: 50, outputFormat: "png" },
    expectedMime: "image/png",
    oracle: "decodes, non-degenerate, alpha retained",
    verify: async (out) => {
      const stats = await expectNonDegenerateImage(out);
      if (stats.transparentFraction < 0.01) {
        throw new Error("transparency-fixer output carries no transparent pixels at all");
      }
    },
  },
  {
    // The AI work (face landmarks + background removal) lives behind /analyze;
    // the base route deliberately 400s with a pointer to the sub-routes.
    toolId: "passport-photo",
    fixture: PORTRAIT,
    contentType: "image/jpeg",
    settings: {},
    oracle: "analyze returns >=4 landmarks and a non-degenerate cut-out preview",
    verify: () => {},
    customRun: async ({ input, post }) => {
      const { status, body } = await post(
        "/api/v1/tools/image/passport-photo/analyze",
        input,
        "portrait-color.jpg",
        "image/jpeg",
        {},
      );
      if (status !== 200)
        throw new Error(`passport-photo analyze HTTP ${status}: ${body.slice(0, 300)}`);
      const payload = JSON.parse(body) as Record<string, unknown>;
      const landmarks = payload.landmarks as Record<string, unknown> | undefined;
      if (!landmarks || Object.keys(landmarks).length < 4) {
        throw new Error(
          `passport-photo analyze returned ${Object.keys(landmarks ?? {}).length} landmark groups`,
        );
      }
      if (typeof payload.preview !== "string" || payload.preview.length < 1000) {
        throw new Error("passport-photo analyze returned no usable preview");
      }
      const preview = Buffer.from(payload.preview, "base64");
      await expectNonDegenerateImage(preview);
      await expectBackgroundCutOut(preview);
    },
  },
  {
    toolId: "remove-gif-background",
    fixture: ANIMATED,
    contentType: "image/gif",
    settings: { outputFormat: "webp", backgroundType: "transparent" },
    oracle: "still animated (>=2 frames) and non-degenerate",
    verify: async (out) => {
      await expectNonDegenerateImage(out);
      await expectAnimatedFrames(out, 2);
    },
  },
  {
    toolId: "blur-faces",
    fixture: MULTI_FACE,
    contentType: "image/webp",
    settings: { blurRadius: 40, sensitivity: 0.5 },
    oracle: "same size, >=1% of pixels rewritten, HF energy falls",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectSameSizeButChanged(input, out, 0.01);
      await expectHighFrequencyEnergyReduced(input, out, 0.99);
    },
  },
  {
    toolId: "red-eye-removal",
    fixture: RED_EYE,
    contentType: "image/jpeg",
    settings: { sensitivity: 50, strength: 80, quality: 95 },
    oracle: "saturated-red pixel count strictly reduced",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectRedPixelsReduced(input, out);
    },
  },
  {
    // A bare `mode: face` crop can legitimately be LARGER than the input (the
    // route pads to the requested aspect), so size alone proves nothing. Pin an
    // explicit output size and prove the face-guided window differs from the
    // geometry-only trim window on the same fixture.
    toolId: "smart-crop",
    fixture: MULTI_FACE,
    contentType: "image/webp",
    settings: { mode: "face", width: 256, height: 256, padding: 10 },
    oracle: "exactly 256x256, non-degenerate, and different from the mode=trim crop",
    verify: () => {},
    customRun: async ({ input, post }) => {
      const run = async (settings: Record<string, unknown>): Promise<Buffer> => {
        const { status, body } = await post(
          apiToolPath("smart-crop"),
          input,
          "multi-face.webp",
          "image/webp",
          settings,
        );
        if (status !== 200 && status !== 202) {
          throw new Error(`smart-crop HTTP ${status}: ${body.slice(0, 300)}`);
        }
        return downloadArtifact(JSON.parse(body), status);
      };
      const face = await run({ mode: "face", width: 256, height: 256, padding: 10 });
      const trim = await run({ mode: "trim", width: 256, height: 256, padding: 10 });
      const stats = await expectNonDegenerateImage(face);
      if (stats.width !== 256 || stats.height !== 256) {
        throw new Error(
          `smart-crop returned ${stats.width}x${stats.height}, not the requested 256x256`,
        );
      }
      const delta = await meanAbsoluteDifference(face, trim);
      if (!(delta > 2)) {
        throw new Error(
          `face-guided and geometry-only crops are near identical (mean abs diff ${delta.toFixed(3)})`,
        );
      }
    },
  },
  {
    toolId: "erase-object",
    fixture: SAMPLE,
    contentType: "image/jpeg",
    settings: { format: "png", quality: 95, qualityMode: "fast" },
    expectedMime: "image/png",
    oracle: "masked rectangle >35% rewritten, same dimensions (fast LaMa and hq diffusion)",
    verify: () => {},
    customRun: async ({ input, post }) => {
      const { mask, region } = await buildCenteredRectMask(input, 0.3);
      const artifacts: Record<string, Buffer> = {};
      // The hq (diffusion) leg only applies where the optional inpaint-hq pack
      // is installed; elsewhere the route correctly refuses it.
      const modes = installedBundleIds.has("inpaint-hq")
        ? (["fast", "hq"] as const)
        : (["fast"] as const);
      for (const qualityMode of modes) {
        const { status, body } = await post(
          apiToolPath("erase-object"),
          input,
          "sample-photo.jpg",
          "image/jpeg",
          { format: "png", quality: 95, qualityMode },
          [{ field: "mask", bytes: mask, filename: "mask.png", contentType: "image/png" }],
          true,
        );
        if (status !== 200 && status !== 202) {
          throw new Error(`erase-object[${qualityMode}] HTTP ${status}: ${body.slice(0, 300)}`);
        }
        const artifact = await downloadArtifact(JSON.parse(body), status);
        await expectNonDegenerateImage(artifact);
        await expectRegionRewritten(input, artifact, region);
        artifacts[qualityMode] = artifact;
      }
      // A diffusion result that is byte-identical to the LaMa result means the
      // hq path silently no-opped, which the API would otherwise report as a
      // clean success.
      if (artifacts.hq) {
        const hqDelta = await meanAbsoluteDifference(artifacts.fast, artifacts.hq);
        if (!(hqDelta > 1)) {
          throw new Error(
            `erase-object qualityMode=hq is indistinguishable from fast (mean abs diff ${hqDelta.toFixed(3)}), so the diffusion path did not run`,
          );
        }
      }
    },
  },
  {
    toolId: "colorize",
    fixture: PORTRAIT_BW,
    contentType: "image/jpeg",
    settings: { intensity: 1, model: "auto" },
    oracle: "input chroma < 12, output chroma > input + 6",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectColorAdded(input, out);
    },
  },
  {
    toolId: "ai-canvas-expand",
    fixture: PORTRAIT,
    contentType: "image/jpeg",
    settings: {
      extendTop: 0,
      extendRight: 64,
      extendBottom: 0,
      extendLeft: 64,
      tier: "fast",
      format: "png",
      quality: 95,
    },
    oracle: "width == input + 128, height unchanged",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectCanvasExpanded(input, out, { top: 0, right: 64, bottom: 0, left: 64 });
    },
  },
  {
    toolId: "upscale",
    fixture: `${FIXTURES}/image/valid/test-100x100.jpg`,
    contentType: "image/jpeg",
    settings: { scale: 2 },
    oracle: "output width >= 2x input width, aspect preserved",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectUpscaled(input, out, 2);
    },
  },
  {
    toolId: "enhance-faces",
    fixture: PORTRAIT,
    contentType: "image/jpeg",
    settings: { model: "auto", strength: 0.8, onlyCenterFace: false, sensitivity: 0.5 },
    oracle: "same size, >=0.5% pixels rewritten",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectSameSizeButChanged(input, out, 0.005);
    },
  },
  {
    toolId: "noise-removal",
    fixture: SAMPLE,
    contentType: "image/jpeg",
    settings: { tier: "balanced", strength: 60, format: "png" },
    expectedMime: "image/png",
    oracle: "high-frequency energy ratio < 0.95",
    verify: async (out, input) => {
      await expectNonDegenerateImage(out);
      await expectHighFrequencyEnergyReduced(input, out, 0.95);
    },
  },
  {
    toolId: "restore-photo",
    fixture: PORTRAIT_BW,
    contentType: "image/jpeg",
    settings: { scratchRemoval: true, faceEnhancement: true, denoise: true, colorize: false },
    oracle: "non-degenerate, >=0.5% pixels rewritten at the same or larger size",
    verify: async (out, input) => {
      const after = await expectNonDegenerateImage(out);
      const before = await expectNonDegenerateImage(input);
      if (after.width === before.width && after.height === before.height) {
        await expectSameSizeButChanged(input, out, 0.005);
      }
    },
  },
  {
    toolId: "ocr",
    fixture: OCR_CLEAN,
    contentType: "image/png",
    settings: { quality: "fast", language: "en", enhance: false },
    oracle: "recognizes >=4 of the 5 words printed in the fixture",
    verify: (out) => {
      const text = out.toString("utf8");
      expectRecognizedTerms(text, OCR_ENGLISH_TERMS, 4);
    },
  },
  {
    toolId: "ocr-pdf",
    fixture: `${FIXTURES}/document/valid/ocr-scanned.pdf`,
    contentType: "application/pdf",
    settings: { quality: "fast", language: "en", enhance: false },
    // The tool's contract is text extraction (it writes <name>_ocr.txt); a
    // searchable-PDF output would be a feature, not this oracle (#677).
    oracle: "extracts the known scanned text as plain text",
    verify: (out) => {
      const text = out.toString("utf8");
      expectRecognizedTerms(text, OCR_PDF_TERMS, 3);
    },
  },
  {
    toolId: "transcribe-audio",
    fixture: SPEECH_WAV,
    contentType: "audio/wav",
    settings: { language: "auto", outputFormat: "txt" },
    expectedMime: "text/plain",
    oracle: ">=3 known fixture terms in the transcript",
    verify: (out) => expectKnownTranscript(out.toString("utf8")),
  },
  {
    toolId: "auto-subtitles",
    fixture: SPEECH_MP4,
    contentType: "video/mp4",
    settings: { language: "auto", format: "srt" },
    expectedMime: "application/x-subrip",
    oracle: "valid first SRT cue plus >=3 known fixture terms",
    verify: (out) => {
      const text = out.toString("utf8");
      expectSrtArtifact(text);
      expectKnownTranscript(text);
    },
  },
];

/** Extra OCR probes that only make sense once the tool itself is reachable. */
const OCR_EXTRA_CASES: ToolCase[] = [
  {
    toolId: "ocr",
    fixture: OCR_JA,
    contentType: "image/png",
    settings: { quality: "fast", language: "ja", enhance: false },
    oracle: ">=4 Japanese codepoints in the transcript",
    verify: (out) => expectJapaneseScript(out.toString("utf8"), 4),
  },
];

function record(row: Record<string, unknown>): void {
  const line = `${JSON.stringify({ ts: new Date().toISOString(), profile: PROFILE, ...row })}\n`;
  if (OUT) appendFileSync(OUT, line);
  process.stdout.write(line);
}

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed: HTTP ${r.status}`);
  const body = (await r.json()) as { token?: string };
  if (!body.token) throw new Error("login returned no token");
  return body.token;
}

async function readTerminal(
  token: string,
  jobId: string,
): Promise<{ downloadUrl: string; processedSize?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}/api/v1/jobs/${encodeURIComponent(jobId)}/progress`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (response.status !== 200 || !response.body) {
      throw new Error(`job progress HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = done ? "" : (lines.pop() ?? "");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const frame = JSON.parse(line.slice(5).trim()) as ProgressFrame;
        if (frame.type === "heartbeat") continue;
        if (frame.phase === "failed") throw new Error(`job failed: ${frame.error ?? "unknown"}`);
        if (frame.phase === "complete") {
          await reader.cancel().catch(() => {});
          const url = frame.result?.downloadUrl;
          if (typeof url !== "string") throw new Error("terminal frame omitted downloadUrl");
          return { downloadUrl: url, processedSize: frame.result?.processedSize };
        }
      }
      if (done) throw new Error("progress stream ended without a terminal frame");
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Shared token for the module-level `post` / `downloadArtifact` helpers. */
let sessionToken = "";
/** Bundles the live API reports as installed, for conditional legs. */
const installedBundleIds = new Set<string>();

export type PostFn = (
  path: string,
  file: Buffer,
  filename: string,
  contentType: string,
  settings: Record<string, unknown>,
  extras?: { bytes: Buffer; contentType: string; field: string; filename: string }[],
  /**
   * erase-object's hand-written route reads DISCRETE multipart fields and
   * ignores a `settings` JSON blob entirely, so a caller following the usual
   * convention silently gets defaults. Send both when this is set.
   */
  discreteFields?: boolean,
) => Promise<{ body: string; status: number }>;

const post: PostFn = async (
  path,
  file,
  filename,
  contentType,
  settings,
  extras,
  discreteFields,
) => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file)], { type: contentType }), filename);
  for (const extra of extras ?? []) {
    form.append(
      extra.field,
      new Blob([new Uint8Array(extra.bytes)], { type: extra.contentType }),
      extra.filename,
    );
  }
  if (discreteFields) {
    for (const [key, value] of Object.entries(settings)) form.append(key, String(value));
  }
  form.append("settings", JSON.stringify(settings));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}` },
      body: form,
      signal: controller.signal,
    });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
};

/** Resolve a 200 or 202 submission into the artifact bytes. */
async function downloadArtifact(accepted: AcceptedPayload, status: number): Promise<Buffer> {
  const { bytes } = await downloadArtifactWithMime(accepted, status);
  return bytes;
}

async function downloadArtifactWithMime(
  accepted: AcceptedPayload,
  status: number,
): Promise<{ bytes: Buffer; mime: string }> {
  let downloadUrl: string;
  if (status === 202) {
    if (typeof accepted.jobId !== "string") throw new Error("202 response without a jobId");
    ({ downloadUrl } = await readTerminal(sessionToken, accepted.jobId));
  } else {
    downloadUrl = accepted.downloadUrl;
    if (typeof downloadUrl !== "string") throw new Error("200 response without a downloadUrl");
  }
  const response = await fetch(new URL(downloadUrl, BASE), {
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  if (!response.ok) throw new Error(`artifact download HTTP ${response.status}`);
  const mime = (response.headers.get("content-type") ?? "").split(";", 1)[0];
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("artifact is empty");
  return { bytes, mime };
}

async function runCase(token: string, spec: ToolCase): Promise<void> {
  const started = Date.now();
  const input = await readFile(spec.fixture);

  if (EXPECT === "gated") {
    // A gated tool must refuse before doing any work, and say why. The refusal
    // is asserted on the tool's OWN route, including the base route of tools
    // whose real work sits behind a sub-route.
    const { status, body } = await post(
      apiToolPath(spec.toolId),
      input,
      spec.fixture.split("/").pop() ?? "input",
      spec.contentType,
      spec.settings,
    );
    const gated =
      (status === 402 || status === 403 || status === 409 || status === 428 || status === 501) &&
      /not installed|FEATURE_NOT_INSTALLED|FEATURE_INCOMPATIBLE/i.test(body);
    record({
      cell: "gate",
      toolId: spec.toolId,
      bundles: getRequiredBundlesForTool(spec.toolId),
      httpStatus: status,
      body: body.slice(0, 400),
      status: gated ? "pass" : "fail",
      durationS: Number(((Date.now() - started) / 1000).toFixed(1)),
    });
    if (!gated)
      throw new Error(`${spec.toolId} was NOT gated: HTTP ${status} ${body.slice(0, 200)}`);
    return;
  }

  if (spec.customRun) {
    await spec.customRun({ input, post, token });
    record({
      cell: "tool",
      toolId: spec.toolId,
      bundles: getRequiredBundlesForTool(spec.toolId),
      inputBytes: input.length,
      oracle: spec.oracle,
      settings: spec.settings,
      status: "pass",
      durationS: Number(((Date.now() - started) / 1000).toFixed(1)),
    });
    return;
  }

  const { status, body } = await post(
    apiToolPath(spec.toolId),
    input,
    spec.fixture.split("/").pop() ?? "input",
    spec.contentType,
    spec.settings,
  );
  if (status !== 200 && status !== 202) {
    throw new Error(`${spec.toolId} submission HTTP ${status}: ${body.slice(0, 400)}`);
  }
  const { bytes: artifact, mime } = await downloadArtifactWithMime(JSON.parse(body), status);
  if (spec.expectedMime) {
    const allowed = Array.isArray(spec.expectedMime) ? spec.expectedMime : [spec.expectedMime];
    if (!allowed.includes(mime)) {
      throw new Error(`${spec.toolId} MIME ${mime || "missing"} not in ${allowed.join("/")}`);
    }
  }
  await spec.verify(artifact, input);
  record({
    cell: "tool",
    toolId: spec.toolId,
    bundles: getRequiredBundlesForTool(spec.toolId),
    httpStatus: status,
    mime,
    inputBytes: input.length,
    outputBytes: artifact.length,
    oracle: spec.oracle,
    settings: spec.settings,
    status: "pass",
    durationS: Number(((Date.now() - started) / 1000).toFixed(1)),
  });
}

async function main(): Promise<void> {
  const token = await login();
  sessionToken = token;
  const featuresResponse = await fetch(`${BASE}/api/v1/features`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const inventory = (await featuresResponse.json()) as {
    bundles: { id: string; status: string }[];
  };
  const installed = new Set(
    inventory.bundles.filter((b) => b.status === "installed").map((b) => b.id),
  );
  for (const id of installed) installedBundleIds.add(id);

  const requested = process.env.QA_BUNDLES
    ? process.env.QA_BUNDLES.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : EXPECT === "gated"
      ? Object.keys(FEATURE_BUNDLES)
      : [...installed];

  const unknown = requested.filter((id) => !FEATURE_BUNDLES[id]);
  if (unknown.length) throw new Error(`unknown bundle id(s): ${unknown.join(", ")}`);

  // The bundle -> tool mapping comes from the live shared export.
  const wanted = new Set<string>();
  for (const bundleId of requested) {
    for (const toolId of FEATURE_BUNDLES[bundleId].enablesTools) wanted.add(toolId);
  }

  const runnable: ToolCase[] = [];
  const skipped: { reason: string; toolId: string }[] = [];
  for (const spec of [...CASES, ...(EXPECT === "installed" ? OCR_EXTRA_CASES : [])]) {
    if (!wanted.has(spec.toolId)) continue;
    const required = getRequiredBundlesForTool(spec.toolId);
    if (EXPECT === "gated" && required.length === 0) {
      // OCR's Fast tier ships inside the image and the `ocr` bundle is only an
      // OPTIONAL pack (TOOL_OPTIONAL_BUNDLE_MAP), so ocr/ocr-pdf must stay
      // reachable with nothing installed. Refusal of the optional Balanced and
      // Best tiers is asserted separately.
      skipped.push({ toolId: spec.toolId, reason: "no required bundle: tool is never gated" });
      continue;
    }
    if (EXPECT === "installed") {
      const missing = required.filter((id) => !installed.has(id));
      if (missing.length) {
        skipped.push({ toolId: spec.toolId, reason: `requires ${missing.join(", ")}` });
        continue;
      }
    }
    runnable.push(spec);
  }

  const missingCases = [...wanted].filter((t) => !CASES.some((c) => c.toolId === t));
  if (missingCases.length) {
    throw new Error(
      `no oracle case defined for tool(s): ${missingCases.join(", ")}. Add one before claiming coverage.`,
    );
  }

  record({
    cell: "plan",
    expect: EXPECT,
    requestedBundles: requested,
    installedBundles: [...installed],
    toolCount: runnable.length,
    skipped,
  });

  let failures = 0;
  for (const spec of runnable) {
    try {
      await runCase(token, spec);
    } catch (error) {
      failures += 1;
      record({
        cell: EXPECT === "gated" ? "gate" : "tool",
        toolId: spec.toolId,
        bundles: getRequiredBundlesForTool(spec.toolId),
        status: "fail",
        error: String(error).slice(0, 900),
        settings: spec.settings,
      });
    }
  }
  record({ cell: "summary", expect: EXPECT, ran: runnable.length, failures, skipped });
  if (failures > 0) process.exitCode = 1;
}

await main();
