import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import {
  getCachedTesseractLanguages,
  getInstalledTesseractLanguages,
} from "./tesseract-languages.js";

export type TesseractLanguage = "auto" | "en" | "de" | "fr" | "es" | "zh" | "ja";

export const TESSERACT_LANGUAGE_MAP = {
  en: "eng",
  de: "deu",
  fr: "fra",
  es: "spa",
  zh: "chi_sim",
  ja: "jpn",
} as const satisfies Record<Exclude<TesseractLanguage, "auto">, string>;

const ALL_TESSERACT_LANGUAGES = Object.values(TESSERACT_LANGUAGE_MAP).join("+");

export function resolveTesseractLanguage(language: TesseractLanguage): string {
  if (language === "auto") return ALL_TESSERACT_LANGUAGES;

  const mapped = TESSERACT_LANGUAGE_MAP[language];
  if (!mapped) {
    throw new Error(`Unsupported OCR language "${language}"`);
  }
  return mapped;
}

export interface TesseractRuntimeMetadata {
  engine: "tesseract";
  provider: "native";
  device: "cpu";
}

export interface TesseractResult extends TesseractRuntimeMetadata {
  text: string;
}

export interface RunTesseractOptions {
  language?: TesseractLanguage;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
  /** Override for deployments where Tesseract is not on PATH. */
  tesseractPath?: string;
  /** Maximum bytes retained independently for stdout and stderr. */
  maxOutputBytes?: number;
  /** Maximum stdout bytes retained; overrides maxOutputBytes for stdout only. */
  maxStdoutBytes?: number;
  /** Maximum stderr bytes retained; overrides maxOutputBytes for stderr only. */
  maxStderrBytes?: number;
  /** Internal page segmentation override used by the bounded adaptive runner. */
  pageSegmentationMode?: 6 | 11;
  /** Internal renderer override used to obtain confidence-bearing TSV output. */
  outputFormat?: "text" | "tsv";
  /** Internal, whitelisted language family used by adaptive auto detection. */
  tesseractLanguages?: string;
  /** Internal process-ownership grace reserved by the aggregate adaptive deadline. */
  terminationGraceMs?: number;
  /** Internal preprocessed raster; auto script probing remains on inputPath. */
  recognitionInputPath?: string;
  /** Internal calibrated mode for dense, faint low-resolution documents. */
  blockLayoutOnly?: boolean;
  /** Internal pre-split scene rasters used only when primary CJK evidence is weak. */
  fallbackInputPaths?: readonly string[];
  /** Internal lazy provider that avoids splitting a strong or Latin primary image. */
  fallbackInputProvider?: () => Promise<readonly string[]>;
  /** Internal lazy provider for one bounded dense-CJK preprocessing candidate. */
  denseCjkInputProvider?: () => Promise<string>;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const FORCE_KILL_DELAY_MS = 1_000;
const AUTO_LATIN_LANGUAGES = "eng+deu+fra+spa";
const AUTO_CJK_LANGUAGES = "jpn+chi_sim";
const AUTO_LATIN_LANGUAGE_CODES = AUTO_LATIN_LANGUAGES.split("+");
const AUTO_CJK_LANGUAGE_CODES = AUTO_CJK_LANGUAGES.split("+");
const ALL_TESSERACT_LANGUAGE_CODES = ALL_TESSERACT_LANGUAGES.split("+");
// CJK packs can hallucinate ideographs on faint Latin receipts. Require a
// baseline script density, then either strong density or a material run whose
// confidence-weighted score beats the Latin probe. This retains genuine mixed
// CJK receipts dominated by addresses, prices, Latin text, and digits.
const AUTO_CJK_MIN_SCRIPT_RATIO = 0.18;
const AUTO_CJK_STRONG_SCRIPT_RATIO = 0.3;
const AUTO_CJK_COMPARATIVE_MIN_CHARACTERS = 5;
// Development-corpus calibration: smaller score gains were caused by sparse
// layout emitting extra low-value tokens. Only a substantial gain justifies
// replacing the stable block-layout result.
const SPARSE_LAYOUT_MIN_SCORE_GAIN = 0.25;
const CJK_SCENE_FALLBACK_MAX_PATHS = 2;
const CJK_SCENE_FALLBACK_MAX_PRIMARY_SCORE = 1.5;
const CJK_SCENE_FALLBACK_MAX_PRIMARY_CHARACTERS = 128;
const CJK_SCENE_FALLBACK_MIN_SCORE_GAIN = 0.5;
const CJK_SCENE_FALLBACK_MIN_CHARACTER_GAIN = 64;
// A development-only board cohort showed a narrow failure mode where sparse
// segmentation retained a confident fragment while losing most dense text.
// Only try one enhanced block pass for a moderately weak CJK primary, and only
// retain it when it carries both credible confidence and substantially more
// text. Strong pages and low-confidence noise remain byte-for-byte unchanged.
const CJK_DENSE_ENHANCEMENT_MAX_PRIMARY_SCORE = 2.2;
const CJK_DENSE_ENHANCEMENT_MIN_BLOCK_SCORE = 1.5;
const CJK_DENSE_ENHANCEMENT_MIN_CHARACTER_GAIN = 64;
const DEBIAN_TESSERACT_PACKAGE_SUFFIX: Readonly<Record<string, string>> = {
  chi_sim: "chi-sim",
};

function installedSubset(languageCodes: readonly string[], installed: ReadonlySet<string>): string {
  return languageCodes.filter((language) => installed.has(language)).join("+");
}

function isAllowedInternalLanguageSet(languageSet: string): boolean {
  const languages = languageSet.split("+");
  const isOrderedSubset = (allowed: readonly string[]) => {
    let previousIndex = -1;
    for (const language of languages) {
      const index = allowed.indexOf(language);
      if (index <= previousIndex) return false;
      previousIndex = index;
    }
    return true;
  };
  return (
    languages.length > 0 &&
    (isOrderedSubset(ALL_TESSERACT_LANGUAGE_CODES) ||
      isOrderedSubset(AUTO_LATIN_LANGUAGE_CODES) ||
      isOrderedSubset(AUTO_CJK_LANGUAGE_CODES))
  );
}

function missingLanguagePackError(
  requestedLanguage: TesseractLanguage,
  missingTraineddata: readonly string[],
): Error {
  if (requestedLanguage !== "auto" && missingTraineddata.length === 1) {
    const traineddata = missingTraineddata[0];
    const debianPackageSuffix = DEBIAN_TESSERACT_PACKAGE_SUFFIX[traineddata] ?? traineddata;
    return new Error(
      `Tesseract language "${requestedLanguage}" is unavailable: missing traineddata "${traineddata}". Install Debian/Ubuntu package tesseract-ocr-${debianPackageSuffix} or the equivalent traineddata pack (Homebrew: brew install tesseract-lang), then restart SnapOtter.`,
    );
  }
  return new Error(
    `Tesseract is missing required traineddata: ${missingTraineddata.join(", ")}. Install the matching tesseract-ocr-<lang> packages or the equivalent platform language pack, then restart SnapOtter.`,
  );
}

function requireSupportedAutoLanguages(installed: ReadonlySet<string>): {
  latin: string;
  cjk: string;
} {
  const latin = installedSubset(AUTO_LATIN_LANGUAGE_CODES, installed);
  const cjk = installedSubset(AUTO_CJK_LANGUAGE_CODES, installed);
  if (!latin && !cjk) {
    throw new Error(
      "Tesseract has no supported traineddata installed. Install at least tesseract-ocr-eng (or the equivalent platform language pack), then restart SnapOtter.",
    );
  }
  return { latin, cjk };
}

function requireInstalledExplicitLanguage(
  requestedLanguage: Exclude<TesseractLanguage, "auto">,
  installed: ReadonlySet<string>,
): string {
  const traineddata = resolveTesseractLanguage(requestedLanguage);
  if (!installed.has(traineddata)) {
    throw missingLanguagePackError(requestedLanguage, [traineddata]);
  }
  return traineddata;
}

interface TesseractLayoutCandidate {
  text: string;
  score: number;
  cjkCharacters: number;
  visibleCharacters: number;
}

interface TesseractLayoutSelection extends TesseractLayoutCandidate {
  pageSegmentationMode: 6 | 11;
}

function isCjkCharacter(character: string): boolean {
  return (
    (character >= "\u3040" && character <= "\u30ff") ||
    (character >= "\u3400" && character <= "\u9fff") ||
    (character >= "\uac00" && character <= "\ud7af") ||
    (character >= "\u1100" && character <= "\u11ff")
  );
}

function parseTesseractTsv(
  tsv: string,
  options: { stripStandaloneRuleArtifacts?: boolean } = {},
): TesseractLayoutCandidate {
  const rows = tsv.split(/\r?\n/u);
  if (
    rows[0] !==
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext"
  ) {
    throw new Error("Tesseract returned malformed TSV output");
  }
  const lines = new Map<string, string[]>();
  const words: Array<{ characters: number; confidence: number }> = [];
  for (const row of rows.slice(1)) {
    if (!row) continue;
    const fields = row.split("\t");
    if (
      fields.length < 12 ||
      !/^[1-5]$/u.test(fields[0]) ||
      fields.slice(1, 6).some((value) => !/^\d+$/u.test(value))
    ) {
      throw new Error("Tesseract returned malformed TSV output");
    }
    if (fields[0] !== "5") continue;
    const text = fields.slice(11).join("\t").trim();
    const confidence = Number(fields[10]);
    if (!text) continue;
    if (options.stripStandaloneRuleArtifacts && /^\|+$/u.test(text)) continue;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      throw new Error("Tesseract returned malformed TSV confidence");
    }
    const lineKey = fields.slice(1, 5).join(":");
    const line = lines.get(lineKey) ?? [];
    line.push(text);
    lines.set(lineKey, line);
    words.push({
      characters: Array.from(text.replace(/\s/gu, "")).length,
      confidence: confidence / 100,
    });
  }
  const text = Array.from(lines.values(), (line) => line.join(" ")).join("\n");
  const visible = Array.from(text).filter((character) => !/\s/u.test(character));
  const scriptEvidence = {
    cjkCharacters: visible.filter(isCjkCharacter).length,
    visibleCharacters: visible.length,
  };
  const characterCount = words.reduce((sum, word) => sum + word.characters, 0);
  if (characterCount === 0) return { text, score: 0, ...scriptEvidence };
  const confidenceCoverage =
    words.reduce((sum, word) => sum + word.characters * word.confidence, 0) / characterCount;
  const highConfidenceCharacters = words.reduce(
    (sum, word) => sum + word.characters * Math.max(0, Math.min(1, (word.confidence - 0.3) / 0.7)),
    0,
  );
  return {
    text,
    score: confidenceCoverage * Math.log1p(highConfidenceCharacters),
    ...scriptEvidence,
  };
}

export function selectTesseractLanguageFamily(
  latinTsv: string,
  cjkTsv: string,
): typeof AUTO_LATIN_LANGUAGES | typeof AUTO_CJK_LANGUAGES {
  const latin = parseTesseractTsv(latinTsv);
  const cjk = parseTesseractTsv(cjkTsv);
  const cjkRatio = cjk.cjkCharacters / Math.max(cjk.visibleCharacters, 1);
  const hasBaselineEvidence = cjk.cjkCharacters >= 2 && cjkRatio >= AUTO_CJK_MIN_SCRIPT_RATIO;
  const hasStrongDensity = cjkRatio >= AUTO_CJK_STRONG_SCRIPT_RATIO;
  const hasStrongerComparativeEvidence =
    cjk.cjkCharacters >= AUTO_CJK_COMPARATIVE_MIN_CHARACTERS && cjk.score >= latin.score;
  return hasBaselineEvidence && (hasStrongDensity || hasStrongerComparativeEvidence)
    ? AUTO_CJK_LANGUAGES
    : AUTO_LATIN_LANGUAGES;
}

export function selectTesseractLayout(
  blockTsv: string,
  sparseTsv: string,
): { pageSegmentationMode: 6 | 11; text: string } {
  const selected = selectTesseractLayoutCandidate(blockTsv, sparseTsv);
  return {
    pageSegmentationMode: selected.pageSegmentationMode,
    text: selected.text,
  };
}

function selectTesseractLayoutCandidate(
  blockTsv: string,
  sparseTsv: string,
): TesseractLayoutSelection {
  const block = parseTesseractTsv(blockTsv);
  const sparse = parseTesseractTsv(sparseTsv);
  return sparse.score >= block.score + SPARSE_LAYOUT_MIN_SCORE_GAIN
    ? { pageSegmentationMode: 11, ...sparse }
    : { pageSegmentationMode: 6, ...block };
}

function remainingTimeout(deadline: number, timeoutMs: number, terminationGraceMs: number): number {
  const remaining = deadline - performance.now() - terminationGraceMs;
  const bounded = Math.floor(remaining);
  if (bounded <= 0) {
    throw new Error(`Tesseract OCR timed out after ${timeoutMs}ms`);
  }
  return bounded;
}

/** Run bounded block and sparse-layout candidates and retain the calibrated winner. */
export async function runAdaptiveTesseract(
  inputPath: string,
  options: RunTesseractOptions = {},
): Promise<TesseractResult> {
  const requestedLanguage = options.language ?? "auto";
  resolveTesseractLanguage(requestedLanguage);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Tesseract timeout must be a positive number");
  }
  const maxTextBytes = options.maxStdoutBytes ?? options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isSafeInteger(maxTextBytes) || maxTextBytes <= 0) {
    throw new Error("Tesseract output limit must be a positive integer");
  }
  const maxTsvBytes = Math.max(1024 * 1024, Math.min(DEFAULT_MAX_OUTPUT_BYTES, maxTextBytes * 8));
  // Reserve the actual per-process SIGTERM-to-SIGKILL grace once against the
  // shared monotonic deadline. Every sequential candidate receives only the
  // execution time left before that reserve, so cleanup cannot stack one
  // second of overrun per candidate.
  const terminationGraceMs = Math.min(FORCE_KILL_DELAY_MS, Math.floor(timeoutMs / 4));
  const deadline = performance.now() + timeoutMs;
  const executable = options.tesseractPath ?? process.env.TESSERACT_PATH ?? "tesseract";
  const installedLanguages = await getInstalledTesseractLanguages({
    executable,
    timeoutMs: remainingTimeout(deadline, timeoutMs, terminationGraceMs),
    signal: options.signal,
  });
  const autoFamilies =
    requestedLanguage === "auto" ? requireSupportedAutoLanguages(installedLanguages) : undefined;
  const explicitLanguage =
    requestedLanguage === "auto"
      ? undefined
      : requireInstalledExplicitLanguage(requestedLanguage, installedLanguages);
  let fallbackInputPaths = options.fallbackInputPaths ?? [];
  if (
    !Array.isArray(fallbackInputPaths) ||
    fallbackInputPaths.length > CJK_SCENE_FALLBACK_MAX_PATHS ||
    fallbackInputPaths.some((path) => typeof path !== "string" || path.length === 0)
  ) {
    throw new Error("Tesseract scene fallback paths are invalid");
  }
  if (
    options.fallbackInputProvider !== undefined &&
    typeof options.fallbackInputProvider !== "function"
  ) {
    throw new Error("Tesseract scene fallback provider is invalid");
  }
  if (fallbackInputPaths.length > 0 && options.fallbackInputProvider) {
    throw new Error("Tesseract scene fallback inputs are ambiguous");
  }
  if (
    options.denseCjkInputProvider !== undefined &&
    typeof options.denseCjkInputProvider !== "function"
  ) {
    throw new Error("Tesseract dense CJK input provider is invalid");
  }
  const hasSceneFallback =
    fallbackInputPaths.length > 0 || options.fallbackInputProvider !== undefined;
  const hasFallback = hasSceneFallback || options.denseCjkInputProvider !== undefined;
  const primaryProgressScale = hasFallback ? 0.5 : 1;
  const runCandidate = (
    candidateInputPath: string,
    pageSegmentationMode: 6 | 11,
    progressBase: number,
    progressSpan: number,
    tesseractLanguages?: string,
  ) =>
    runTesseract(candidateInputPath, {
      ...options,
      timeoutMs: remainingTimeout(deadline, timeoutMs, terminationGraceMs),
      terminationGraceMs,
      maxStdoutBytes: maxTsvBytes,
      pageSegmentationMode,
      outputFormat: "tsv",
      ...(tesseractLanguages !== undefined && { tesseractLanguages }),
      onProgress: (progress, stage) =>
        options.onProgress?.(Math.min(100, progressBase + (progress / 100) * progressSpan), stage),
    });

  let block: TesseractResult;
  let sparse: TesseractResult;
  let selectedLanguages: string;
  const recognitionInputPath = options.recognitionInputPath ?? inputPath;
  if (!recognitionInputPath) throw new Error("Tesseract recognition input path is invalid");
  if (requestedLanguage === "auto") {
    if (!autoFamilies) throw new Error("Tesseract auto language inventory is unavailable");
    const separateRecognitionInput = recognitionInputPath !== inputPath;
    if (autoFamilies.latin && autoFamilies.cjk) {
      const probeSpan = separateRecognitionInput ? 25 : 33;
      const latinBlock = await runCandidate(
        inputPath,
        6,
        0,
        probeSpan * primaryProgressScale,
        autoFamilies.latin,
      );
      const cjkBlock = await runCandidate(
        inputPath,
        6,
        probeSpan * primaryProgressScale,
        probeSpan * primaryProgressScale,
        autoFamilies.cjk,
      );
      selectedLanguages =
        selectTesseractLanguageFamily(latinBlock.text, cjkBlock.text) === AUTO_CJK_LANGUAGES
          ? autoFamilies.cjk
          : autoFamilies.latin;
      if (separateRecognitionInput) {
        block = await runCandidate(
          recognitionInputPath,
          6,
          50 * primaryProgressScale,
          25 * primaryProgressScale,
          selectedLanguages,
        );
        sparse = options.blockLayoutOnly
          ? block
          : await runCandidate(
              recognitionInputPath,
              11,
              75 * primaryProgressScale,
              25 * primaryProgressScale,
              selectedLanguages,
            );
      } else {
        block = selectedLanguages === autoFamilies.cjk ? cjkBlock : latinBlock;
        sparse = options.blockLayoutOnly
          ? block
          : await runCandidate(
              inputPath,
              11,
              66 * primaryProgressScale,
              34 * primaryProgressScale,
              selectedLanguages,
            );
      }
    } else {
      selectedLanguages = autoFamilies.latin || autoFamilies.cjk;
      block = await runCandidate(
        recognitionInputPath,
        6,
        0,
        50 * primaryProgressScale,
        selectedLanguages,
      );
      sparse = options.blockLayoutOnly
        ? block
        : await runCandidate(
            recognitionInputPath,
            11,
            50 * primaryProgressScale,
            50 * primaryProgressScale,
            selectedLanguages,
          );
    }
  } else {
    if (!explicitLanguage) throw new Error("Tesseract explicit language inventory is unavailable");
    selectedLanguages = explicitLanguage;
    block = await runCandidate(
      recognitionInputPath,
      6,
      0,
      50 * primaryProgressScale,
      selectedLanguages,
    );
    sparse = options.blockLayoutOnly
      ? block
      : await runCandidate(
          recognitionInputPath,
          11,
          50 * primaryProgressScale,
          50 * primaryProgressScale,
          selectedLanguages,
        );
  }
  let selected = selectTesseractLayoutCandidate(block.text, sparse.text);
  const selectedCjkLanguages = selectedLanguages
    .split("+")
    .some((language) => AUTO_CJK_LANGUAGE_CODES.includes(language));
  let fallbackProgressBase = 50;
  const denseCjkInputProvider = options.denseCjkInputProvider;
  const weakDenseCjkScene =
    denseCjkInputProvider !== undefined &&
    selectedCjkLanguages &&
    selected.score < CJK_DENSE_ENHANCEMENT_MAX_PRIMARY_SCORE;
  if (weakDenseCjkScene) {
    const denseCjkInputPath = await denseCjkInputProvider();
    if (typeof denseCjkInputPath !== "string" || denseCjkInputPath.length === 0) {
      throw new Error("Tesseract dense CJK input path is invalid");
    }
    const denseProgressSpan = hasSceneFallback ? 20 : 50;
    const denseBlock = await runCandidate(
      denseCjkInputPath,
      6,
      fallbackProgressBase,
      denseProgressSpan,
      selectedLanguages,
    );
    fallbackProgressBase += denseProgressSpan;
    const denseCandidate = parseTesseractTsv(denseBlock.text, {
      stripStandaloneRuleArtifacts: true,
    });
    if (
      denseCandidate.score >= CJK_DENSE_ENHANCEMENT_MIN_BLOCK_SCORE &&
      denseCandidate.visibleCharacters >=
        selected.visibleCharacters + CJK_DENSE_ENHANCEMENT_MIN_CHARACTER_GAIN
    ) {
      selected = { pageSegmentationMode: 6, ...denseCandidate };
    }
  }
  const weakPrimaryCjkScene =
    hasSceneFallback &&
    selectedCjkLanguages &&
    selected.score < CJK_SCENE_FALLBACK_MAX_PRIMARY_SCORE &&
    selected.visibleCharacters < CJK_SCENE_FALLBACK_MAX_PRIMARY_CHARACTERS;
  if (weakPrimaryCjkScene) {
    if (options.fallbackInputProvider) {
      fallbackInputPaths = await options.fallbackInputProvider();
      if (
        !Array.isArray(fallbackInputPaths) ||
        fallbackInputPaths.length === 0 ||
        fallbackInputPaths.length > CJK_SCENE_FALLBACK_MAX_PATHS ||
        fallbackInputPaths.some((path) => typeof path !== "string" || path.length === 0)
      ) {
        throw new Error("Tesseract scene fallback paths are invalid");
      }
    }
    const tiledSelections: TesseractLayoutSelection[] = [];
    const tileProgressSpan = (100 - fallbackProgressBase) / fallbackInputPaths.length;
    for (const [index, fallbackInputPath] of fallbackInputPaths.entries()) {
      const tileProgressBase = fallbackProgressBase + index * tileProgressSpan;
      const tileBlock = await runCandidate(
        fallbackInputPath,
        6,
        tileProgressBase,
        tileProgressSpan / (options.blockLayoutOnly ? 1 : 2),
        selectedLanguages,
      );
      const tileSparse = options.blockLayoutOnly
        ? tileBlock
        : await runCandidate(
            fallbackInputPath,
            11,
            tileProgressBase + tileProgressSpan / 2,
            tileProgressSpan / 2,
            selectedLanguages,
          );
      tiledSelections.push(selectTesseractLayoutCandidate(tileBlock.text, tileSparse.text));
    }
    const tiledScore = tiledSelections.reduce((sum, candidate) => sum + candidate.score, 0);
    const tiledVisibleCharacters = tiledSelections.reduce(
      (sum, candidate) => sum + candidate.visibleCharacters,
      0,
    );
    if (
      tiledScore >= selected.score + CJK_SCENE_FALLBACK_MIN_SCORE_GAIN &&
      tiledVisibleCharacters >= selected.visibleCharacters + CJK_SCENE_FALLBACK_MIN_CHARACTER_GAIN
    ) {
      selected = {
        pageSegmentationMode: 6,
        text: tiledSelections
          .map((candidate) => candidate.text)
          .filter(Boolean)
          .join("\n"),
        score: tiledScore,
        cjkCharacters: tiledSelections.reduce((sum, candidate) => sum + candidate.cjkCharacters, 0),
        visibleCharacters: tiledVisibleCharacters,
      };
    }
  }
  if (Buffer.byteLength(selected.text, "utf8") > maxTextBytes) {
    throw new Error(`Tesseract stdout exceeded ${maxTextBytes} bytes`);
  }
  options.onProgress?.(100, "Tesseract OCR complete");
  return {
    text: selected.text,
    ...getTesseractRuntimeMetadata(),
  };
}

export function getTesseractRuntimeMetadata(): TesseractRuntimeMetadata {
  return {
    engine: "tesseract",
    provider: "native",
    device: "cpu",
  };
}

function abortError(): Error {
  const error = new Error("Tesseract OCR was canceled");
  error.name = "AbortError";
  return error;
}

/** Run the built-in Tesseract binary without involving the Python AI runtime. */
export function runTesseract(
  inputPath: string,
  options: RunTesseractOptions = {},
): Promise<TesseractResult> {
  if (options.signal?.aborted) return Promise.reject(abortError());

  const requestedLanguage = options.language ?? "auto";
  try {
    resolveTesseractLanguage(requestedLanguage);
  } catch (error) {
    return Promise.reject(error);
  }
  if (
    options.tesseractLanguages !== undefined &&
    !isAllowedInternalLanguageSet(options.tesseractLanguages)
  ) {
    return Promise.reject(new Error("Unsupported internal Tesseract language set"));
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error("Tesseract timeout must be a positive number"));
  }
  const terminationGraceMs = options.terminationGraceMs ?? FORCE_KILL_DELAY_MS;
  if (
    !Number.isSafeInteger(terminationGraceMs) ||
    terminationGraceMs < 0 ||
    terminationGraceMs > FORCE_KILL_DELAY_MS
  ) {
    return Promise.reject(new Error("Tesseract termination grace is invalid"));
  }
  const maxStdoutBytes =
    options.maxStdoutBytes ?? options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const maxStderrBytes =
    options.maxStderrBytes ?? options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (
    !Number.isSafeInteger(maxStdoutBytes) ||
    maxStdoutBytes <= 0 ||
    !Number.isSafeInteger(maxStderrBytes) ||
    maxStderrBytes <= 0
  ) {
    return Promise.reject(new Error("Tesseract output limit must be a positive integer"));
  }

  const executable = options.tesseractPath ?? process.env.TESSERACT_PATH ?? "tesseract";
  const installedLanguages = getCachedTesseractLanguages(executable);
  if (!installedLanguages) {
    const preflightStarted = performance.now();
    return getInstalledTesseractLanguages({
      executable,
      timeoutMs,
      signal: options.signal,
    }).then(() => {
      const remainingMs = Math.floor(timeoutMs - (performance.now() - preflightStarted));
      if (remainingMs <= 0) {
        throw new Error(`Tesseract OCR timed out after ${timeoutMs}ms`);
      }
      return runTesseract(inputPath, { ...options, timeoutMs: remainingMs });
    });
  }
  let language: string;
  if (options.tesseractLanguages !== undefined) {
    language = options.tesseractLanguages;
    const missing = language
      .split("+")
      .filter((traineddata) => !installedLanguages.has(traineddata));
    if (missing.length > 0) {
      return Promise.reject(missingLanguagePackError(requestedLanguage, missing));
    }
  } else if (requestedLanguage === "auto") {
    try {
      requireSupportedAutoLanguages(installedLanguages);
    } catch (error) {
      return Promise.reject(error);
    }
    language = installedSubset(ALL_TESSERACT_LANGUAGE_CODES, installedLanguages);
  } else {
    try {
      language = requireInstalledExplicitLanguage(requestedLanguage, installedLanguages);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  options.onProgress?.(0, "Starting Tesseract OCR");

  return new Promise((resolve, reject) => {
    const args = [inputPath, "stdout", "-l", language];
    if (options.pageSegmentationMode !== undefined) {
      args.push("--psm", String(options.pageSegmentationMode));
    }
    if (options.outputFormat === "tsv") args.push("tsv");
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let terminationError: Error | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const timeoutTimer = setTimeout(() => {
      terminate(new Error(`Tesseract OCR timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeoutTimer.unref();

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    const finish = (error?: Error, result?: TesseractResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(result as TesseractResult);
    };

    const finishTermination = () => {
      if (terminationError) finish(terminationError);
    };

    function terminate(error: Error) {
      if (settled || terminationError) return;
      terminationError = error;
      try {
        child.kill("SIGTERM");
      } catch {
        // A concurrent process exit owns settlement through close/error.
      }
      if (settled) return;
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Wait for close before releasing request-owned scratch state.
          }
        }
      }, terminationGraceMs);
      forceKillTimer.unref();
    }

    const onAbort = () => terminate(abortError());
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) terminate(abortError());

    child.stdout.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stdoutBytes += buffer.length;
      if (stdoutBytes > maxStdoutBytes) {
        terminate(new Error(`Tesseract stdout exceeded ${maxStdoutBytes} bytes`));
        return;
      }
      stdoutChunks.push(buffer);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stderrBytes += buffer.length;
      if (stderrBytes > maxStderrBytes) {
        terminate(new Error(`Tesseract stderr exceeded ${maxStderrBytes} bytes`));
        return;
      }
      stderrChunks.push(buffer);
    });

    child.once("error", (error: NodeJS.ErrnoException) => {
      if (terminationError) {
        return;
      }
      if (error.code === "ENOENT") {
        finish(
          new Error("Tesseract executable not found. Install Tesseract or set TESSERACT_PATH.", {
            cause: error,
          }),
        );
        return;
      }
      finish(new Error(`Unable to start Tesseract: ${error.message}`, { cause: error }));
    });

    child.once("close", (code, signal) => {
      if (terminationError) {
        finishTermination();
        return;
      }
      if (code !== 0) {
        const detail = Buffer.concat(stderrChunks).toString("utf8").trim();
        const status = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
        finish(new Error(`Tesseract exited with ${status}${detail ? `: ${detail}` : ""}`));
        return;
      }

      options.onProgress?.(100, "Tesseract OCR complete");
      finish(undefined, {
        text: Buffer.concat(stdoutChunks).toString("utf8"),
        ...getTesseractRuntimeMetadata(),
      });
    });
  });
}
