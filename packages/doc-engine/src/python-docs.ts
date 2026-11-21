import { runDocsScript } from "@snapotter/ai";
import {
  type FontFormat,
  isSafeMessageError,
  SafeError,
  type SignPlacement,
  ToolInputError,
} from "@snapotter/shared";

const MUPDF_DAMAGE_KEYWORDS = "(?:xref|syntax error|format error|repair|corrupt|page tree)";

/**
 * MuPDF's printer reports document damage as prefixed lines on the stream the
 * scripts should have redirected to stderr ("error:" / "warning:", or "MuPDF
 * error:" on newer releases): "error: cannot find object in xref (14 0 R)",
 * "MuPDF error: syntax error: invalid key in dict". When such lines reach the
 * JSON channel and nothing on it parses, the input PDF is broken (it passed
 * `qpdf --check` only via recovery, exit 3), not our code (#898, NODE-60).
 * The prefix requirement keeps Python tracebacks that merely mention these
 * words classified as bugs.
 */
const MUPDF_DAMAGE_NOISE = new RegExp(
  `(?:^|\\n)(?:MuPDF error:|error:|warning:).*${MUPDF_DAMAGE_KEYWORDS}`,
  "i",
);

const MUPDF_DAMAGE_ERROR = new RegExp(`(?:^|\\n)code=\\d+:\\s*.*${MUPDF_DAMAGE_KEYWORDS}`, "i");

const DAMAGED_PDF_MESSAGE =
  "This PDF is damaged (the PDF engine reported broken document structure). Run it through the Repair PDF tool, then try again.";

/**
 * Parse the JSON line the docs dispatcher prints on stdout. Every doc_* script
 * is contract-bound to emit a single JSON object, but a crashed interpreter, a
 * library warning, or a partial write can leave non-JSON on stdout. A bare
 * JSON.parse then throws an opaque SyntaxError that discards the real output;
 * wrap it so the failure carries a safe, authored message and the raw stdout
 * (in the cause) survives for triage instead of a context-free SyntaxError.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDocsJson<T>(script: string, stdout: string): T {
  const trimmed = stdout.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isJsonObject(parsed)) return parsed as T;
  } catch {
    // fall through to line-by-line salvage
  }
  // MuPDF's C-level printer writes "error: ..." lines to the same stdout the
  // JSON contract uses (pdf2docx and the PyMuPDF scripts both drive MuPDF),
  // ahead of the script's single JSON line. Walk the lines from the end and
  // take the last one that parses, so library noise cannot turn a completed
  // conversion into a failure (Sentry NODE-5M).
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isJsonObject(parsed)) return parsed as T;
    } catch {
      // fall through to the earlier lines
    }
  }
  if (MUPDF_DAMAGE_NOISE.test(trimmed)) {
    // Expected-class errors never reach Sentry or the worker's error log, so
    // keep the raw output on the cause: it is the only artifact left to
    // check when the classification itself is in question.
    throw new ToolInputError(DAMAGED_PDF_MESSAGE, {
      cause: new Error(`${script} stdout (first 200 chars): ${trimmed.slice(0, 200)}`),
      code: "PDF_DAMAGED",
    });
  }
  throw new SafeError("Document tool returned non-JSON output", {
    kind: "bug",
    code: script,
    cause: new Error(`${script} stdout (first 200 chars): ${trimmed.slice(0, 200)}`),
  });
}

function formatDocsError(error: unknown, stdout: string): string {
  const trimmed = typeof error === "string" ? error.trim() : "";
  return trimmed || stdout.slice(0, 200);
}

function withDamageClassification(err: unknown): never {
  if (isSafeMessageError(err) && MUPDF_DAMAGE_ERROR.test(err.message)) {
    throw new ToolInputError(DAMAGED_PDF_MESSAGE, { cause: err, code: "PDF_DAMAGED" });
  }
  throw err;
}

export interface DocsScriptOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

function buildDocsRunOpts(
  opts?: DocsScriptOptions,
  defaultTimeoutMs?: number,
): DocsScriptOptions | undefined {
  const timeoutMs = opts?.timeoutMs ?? defaultTimeoutMs;
  const signal = opts?.signal;
  if (timeoutMs === undefined && signal === undefined) return undefined;
  return {
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(signal !== undefined ? { signal } : {}),
  };
}

/** Page count via the docs-profile Python dispatcher (pikepdf). */
export async function pdfPageCountPy(absPath: string, opts?: DocsScriptOptions): Promise<number> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_pagecount",
    { path: absPath },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{ pages?: number; error?: string }>("doc_pagecount", stdout);
  if ("error" in parsed || typeof parsed.pages !== "number") {
    throw new Error(`doc_pagecount failed: ${formatDocsError(parsed.error, stdout)}`);
  }
  return parsed.pages;
}

/** Flatten forms/annotations into page content (PyMuPDF bake). */
export async function pdfFlattenPy(
  inPath: string,
  outPath: string,
  opts?: DocsScriptOptions,
): Promise<void> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_flatten",
    { path: inPath, out: outPath },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_flatten", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_flatten failed: ${formatDocsError(parsed.error, stdout)}`);
  }
}

/**
 * Stamp SnapOtter as Producer/Creator on a GENERATED PDF (PyMuPDF), replacing
 * the conversion engine's self-promotion (LibreOffice, Ghostscript, pdfcpu,
 * WeasyPrint, PDFKit). Encrypted files are copied through untouched.
 */
export async function pdfScrubProducerPy(
  inPath: string,
  outPath: string,
  opts?: DocsScriptOptions,
): Promise<void> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_scrub_meta",
    { path: inPath, out: outPath },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_scrub_meta", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_scrub_meta failed: ${formatDocsError(parsed.error, stdout)}`);
  }
}

/** True redaction with verification pass (PyMuPDF search + apply_redactions). */
export async function pdfRedactPy(
  inPath: string,
  outPath: string,
  terms: string[],
  caseSensitive: boolean,
  opts?: DocsScriptOptions,
): Promise<{ found: number }> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_redact",
    {
      path: inPath,
      out: outPath,
      terms,
      caseSensitive,
    },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{
    found?: number;
    verified?: boolean;
    error?: string;
  }>("doc_redact", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_redact failed: ${formatDocsError(parsed.error, stdout)}`);
  }
  if (typeof parsed.found !== "number") {
    throw new Error(`doc_redact failed: ${stdout.slice(0, 200)}`);
  }
  return { found: parsed.found };
}

/**
 * What doc_text reports. The page counts split the pages with no readable text
 * into ones that came back blank (a scan) and ones whose text failed the
 * readability test (fonts with no usable ToUnicode map), so the caller can say
 * which (#954). An older sidecar sends no counts.
 */
export interface PdfTextResult {
  chars: number;
  hasText: boolean;
  pages?: number;
  emptyPages?: number;
  unreadablePages?: number;
}

/** Extract plain text from a PDF (PyMuPDF get_text). */
export async function pdfTextPy(
  inPath: string,
  outTxtPath: string,
  opts?: DocsScriptOptions,
): Promise<PdfTextResult> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_text",
    { path: inPath, out: outTxtPath },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{
    chars?: number;
    hasText?: boolean;
    pages?: unknown;
    emptyPages?: unknown;
    unreadablePages?: unknown;
    error?: string;
  }>("doc_text", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_text failed: ${formatDocsError(parsed.error, stdout)}`);
  }
  if (typeof parsed.chars !== "number") {
    throw new Error(`doc_text failed: ${stdout.slice(0, 200)}`);
  }
  // Fall back to a chars>0 heuristic if an older sidecar omits hasText.
  const hasText = parsed.hasText ?? parsed.chars > 0;
  const { pages, emptyPages, unreadablePages } = parsed;
  if (
    typeof pages !== "number" ||
    typeof emptyPages !== "number" ||
    typeof unreadablePages !== "number"
  ) {
    return { chars: parsed.chars, hasText };
  }
  return { chars: parsed.chars, hasText, pages, emptyPages, unreadablePages };
}

/** PDF to Markdown with inferred headings, lists and tables (PyMuPDF). Long-running: 5 min timeout. */
export async function pdfToMarkdownPy(
  inPath: string,
  outMdPath: string,
  opts?: DocsScriptOptions,
): Promise<{ chars: number }> {
  const stdout = await runDocsScript(
    "doc_markdown",
    { path: inPath, out: outMdPath },
    buildDocsRunOpts(opts, 300_000),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{ chars?: number; error?: string }>("doc_markdown", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_markdown failed: ${formatDocsError(parsed.error, stdout)}`);
  }
  if (typeof parsed.chars !== "number") {
    throw new Error(`doc_markdown failed: ${stdout.slice(0, 200)}`);
  }
  return { chars: parsed.chars };
}

/** PDF to DOCX conversion (pdf2docx). Long-running: 5 min timeout. */
export async function pdfToWordPy(
  inPath: string,
  outPath: string,
  opts?: DocsScriptOptions,
): Promise<void> {
  const stdout = await runDocsScript(
    "doc_to_word",
    { path: inPath, out: outPath },
    buildDocsRunOpts(opts, 300_000),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_to_word", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_to_word failed: ${formatDocsError(parsed.error, stdout)}`);
  }
}

/** Read PDF document metadata (pikepdf docinfo). */
export async function pdfMetadataGetPy(
  inPath: string,
  opts?: DocsScriptOptions,
): Promise<Record<string, string>> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_metadata",
    { path: inPath, mode: "get" },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{ metadata?: Record<string, string>; error?: string }>(
    "doc_metadata",
    stdout,
  );
  if ("error" in parsed) {
    throw new Error(`doc_metadata get failed: ${formatDocsError(parsed.error, stdout)}`);
  }
  if (!parsed.metadata || typeof parsed.metadata !== "object") {
    throw new Error(`doc_metadata get failed: ${stdout.slice(0, 200)}`);
  }
  return parsed.metadata;
}

/** Write PDF document metadata (pikepdf docinfo). */
export async function pdfMetadataSetPy(
  inPath: string,
  outPath: string,
  metadata: Record<string, string>,
  opts?: DocsScriptOptions,
): Promise<void> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_metadata",
    {
      path: inPath,
      out: outPath,
      mode: "set",
      metadata,
    },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_metadata", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_metadata set failed: ${formatDocsError(parsed.error, stdout)}`);
  }
}

export interface PdfMetadataStripResult {
  /** Info dictionary keys that were present, without the leading slash. */
  removed: string[];
  xmpRemoved: boolean;
  /** PDF/A level the input declared in XMP (e.g. "2B"), null when none. */
  pdfa: string | null;
}

/**
 * Drop the whole Info dictionary and the catalog XMP stream, then write
 * `metadata` onto the clean document (pikepdf).
 */
export async function pdfMetadataStripPy(
  inPath: string,
  outPath: string,
  metadata: Record<string, string>,
  opts?: DocsScriptOptions,
): Promise<PdfMetadataStripResult> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_metadata",
    { path: inPath, out: outPath, mode: "strip", metadata },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{
    removed?: unknown;
    xmpRemoved?: unknown;
    pdfa?: unknown;
    error?: string;
  }>("doc_metadata", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_metadata strip failed: ${formatDocsError(parsed.error, stdout)}`);
  }
  if (!Array.isArray(parsed.removed)) {
    throw new Error(`doc_metadata strip failed: ${stdout.slice(0, 200)}`);
  }
  return {
    removed: parsed.removed.map(String),
    xmpRemoved: parsed.xmpRemoved === true,
    pdfa: typeof parsed.pdfa === "string" && parsed.pdfa ? parsed.pdfa : null,
  };
}

/** HTML or Markdown to PDF (WeasyPrint, SSRF-hardened). 2 min default timeout. */
export async function htmlToPdfPy(
  inPath: string,
  outPath: string,
  mode: "html" | "markdown",
  opts?: DocsScriptOptions,
): Promise<void> {
  const stdout = await runDocsScript(
    "doc_html_pdf",
    { path: inPath, out: outPath, mode },
    buildDocsRunOpts(opts, 120_000),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_html_pdf", stdout);
  if ("error" in parsed) {
    const detail = formatDocsError(parsed.error, stdout);
    if (detail.startsWith("remote resources are disabled")) {
      throw new ToolInputError(detail, { code: "REMOTE_RESOURCES_DISABLED" });
    }
    throw new Error(`doc_html_pdf failed: ${detail}`);
  }
}

/** Stamp signature images onto a PDF (PyMuPDF insert_image), flattened. */
export async function pdfSignPy(
  inPath: string,
  outPath: string,
  signatures: string[],
  placements: SignPlacement[],
  opts?: DocsScriptOptions,
): Promise<{ placed: number }> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "doc_sign",
    {
      input: inPath,
      output: outPath,
      signatures,
      placements,
    },
    ...(runOpts ? [runOpts] : []),
  ).catch(withDamageClassification);
  const parsed = parseDocsJson<{
    ok?: boolean;
    placed?: number;
    error?: string;
  }>("doc_sign", stdout);
  if ("error" in parsed) {
    throw new Error(`doc_sign failed: ${formatDocsError(parsed.error, stdout)}`);
  }
  if (typeof parsed.placed !== "number") {
    throw new Error(`doc_sign failed: ${stdout.slice(0, 200)}`);
  }
  return { placed: parsed.placed };
}

/**
 * Convert a font between TTF, OTF, WOFF and WOFF2 (fontTools). A file that is
 * not a font this can read comes back as `inputError`, the user's fault rather
 * than a script failure.
 */
export async function convertFontPy(
  inPath: string,
  outPath: string,
  format: FontFormat,
  opts?: DocsScriptOptions,
): Promise<void> {
  const runOpts = buildDocsRunOpts(opts);
  const stdout = await runDocsScript(
    "font_convert",
    { path: inPath, out: outPath, format },
    ...(runOpts ? [runOpts] : []),
  );
  const parsed = parseDocsJson<{ ok?: boolean; inputError?: string; error?: string }>(
    "font_convert",
    stdout,
  );
  if (typeof parsed.inputError === "string") {
    throw new ToolInputError(parsed.inputError, { code: "FONT_UNSUPPORTED" });
  }
  if ("error" in parsed || parsed.ok !== true) {
    throw new Error(`font_convert failed: ${formatDocsError(parsed.error, stdout)}`);
  }
}
