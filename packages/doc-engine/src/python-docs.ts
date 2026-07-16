import { runDocsScript } from "@snapotter/ai";
import { SafeError, type SignPlacement } from "@snapotter/shared";

/**
 * Parse the JSON line the docs dispatcher prints on stdout. Every doc_* script
 * is contract-bound to emit a single JSON object, but a crashed interpreter, a
 * library warning, or a partial write can leave non-JSON on stdout. A bare
 * JSON.parse then throws an opaque SyntaxError that discards the real output;
 * wrap it so the failure carries a safe, authored message and the raw stdout
 * (in the cause) survives for triage instead of a context-free SyntaxError.
 */
function parseDocsJson<T>(script: string, stdout: string): T {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new SafeError("Document tool returned non-JSON output", {
      kind: "bug",
      code: script,
      cause: new Error(`${script} stdout (first 200 chars): ${trimmed.slice(0, 200)}`),
    });
  }
}

/** Page count via the docs-profile Python dispatcher (pikepdf). */
export async function pdfPageCountPy(absPath: string): Promise<number> {
  const stdout = await runDocsScript("doc_pagecount", { path: absPath });
  const parsed = parseDocsJson<{ pages?: number; error?: string }>("doc_pagecount", stdout);
  if (parsed.error || typeof parsed.pages !== "number") {
    throw new Error(`doc_pagecount failed: ${parsed.error ?? stdout.slice(0, 200)}`);
  }
  return parsed.pages;
}

/** Flatten forms/annotations into page content (PyMuPDF bake). */
export async function pdfFlattenPy(inPath: string, outPath: string): Promise<void> {
  const stdout = await runDocsScript("doc_flatten", { path: inPath, out: outPath });
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_flatten", stdout);
  if (parsed.error) {
    throw new Error(`doc_flatten failed: ${parsed.error}`);
  }
}

/**
 * Stamp SnapOtter as Producer/Creator on a GENERATED PDF (PyMuPDF), replacing
 * the conversion engine's self-promotion (LibreOffice, Ghostscript, pdfcpu,
 * WeasyPrint, PDFKit). Encrypted files are copied through untouched.
 */
export async function pdfScrubProducerPy(inPath: string, outPath: string): Promise<void> {
  const stdout = await runDocsScript("doc_scrub_meta", { path: inPath, out: outPath });
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_scrub_meta", stdout);
  if (parsed.error) {
    throw new Error(`doc_scrub_meta failed: ${parsed.error}`);
  }
}

/** True redaction with verification pass (PyMuPDF search + apply_redactions). */
export async function pdfRedactPy(
  inPath: string,
  outPath: string,
  terms: string[],
  caseSensitive: boolean,
): Promise<{ found: number }> {
  const stdout = await runDocsScript("doc_redact", {
    path: inPath,
    out: outPath,
    terms,
    caseSensitive,
  });
  const parsed = parseDocsJson<{
    found?: number;
    verified?: boolean;
    error?: string;
  }>("doc_redact", stdout);
  if (parsed.error) {
    throw new Error(`doc_redact failed: ${parsed.error}`);
  }
  if (typeof parsed.found !== "number") {
    throw new Error(`doc_redact failed: ${stdout.slice(0, 200)}`);
  }
  return { found: parsed.found };
}

/** Extract plain text from a PDF (PyMuPDF get_text). */
export async function pdfTextPy(inPath: string, outTxtPath: string): Promise<{ chars: number }> {
  const stdout = await runDocsScript("doc_text", { path: inPath, out: outTxtPath });
  const parsed = parseDocsJson<{ chars?: number; error?: string }>("doc_text", stdout);
  if (parsed.error) {
    throw new Error(`doc_text failed: ${parsed.error}`);
  }
  if (typeof parsed.chars !== "number") {
    throw new Error(`doc_text failed: ${stdout.slice(0, 200)}`);
  }
  return { chars: parsed.chars };
}

/** PDF to DOCX conversion (pdf2docx). Long-running: 5 min timeout. */
export async function pdfToWordPy(inPath: string, outPath: string): Promise<void> {
  const stdout = await runDocsScript(
    "doc_to_word",
    { path: inPath, out: outPath },
    { timeoutMs: 300_000 },
  );
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_to_word", stdout);
  if (parsed.error) {
    throw new Error(`doc_to_word failed: ${parsed.error}`);
  }
}

/** Read PDF document metadata (pikepdf docinfo). */
export async function pdfMetadataGetPy(inPath: string): Promise<Record<string, string>> {
  const stdout = await runDocsScript("doc_metadata", { path: inPath, mode: "get" });
  const parsed = parseDocsJson<{ metadata?: Record<string, string>; error?: string }>(
    "doc_metadata",
    stdout,
  );
  if (parsed.error) {
    throw new Error(`doc_metadata get failed: ${parsed.error}`);
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
): Promise<void> {
  const stdout = await runDocsScript("doc_metadata", {
    path: inPath,
    out: outPath,
    mode: "set",
    metadata,
  });
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_metadata", stdout);
  if (parsed.error) {
    throw new Error(`doc_metadata set failed: ${parsed.error}`);
  }
}

/** HTML or Markdown to PDF (WeasyPrint, SSRF-hardened). 2 min timeout. */
export async function htmlToPdfPy(
  inPath: string,
  outPath: string,
  mode: "html" | "markdown",
): Promise<void> {
  const stdout = await runDocsScript(
    "doc_html_pdf",
    { path: inPath, out: outPath, mode },
    { timeoutMs: 120_000 },
  );
  const parsed = parseDocsJson<{ ok?: boolean; error?: string }>("doc_html_pdf", stdout);
  if (parsed.error) {
    throw new Error(`doc_html_pdf failed: ${parsed.error}`);
  }
}

/** Stamp signature images onto a PDF (PyMuPDF insert_image), flattened. */
export async function pdfSignPy(
  inPath: string,
  outPath: string,
  signatures: string[],
  placements: SignPlacement[],
): Promise<{ placed: number }> {
  const stdout = await runDocsScript("doc_sign", {
    input: inPath,
    output: outPath,
    signatures,
    placements,
  });
  const parsed = parseDocsJson<{
    ok?: boolean;
    placed?: number;
    error?: string;
  }>("doc_sign", stdout);
  if (parsed.error) {
    throw new Error(`doc_sign failed: ${parsed.error}`);
  }
  if (typeof parsed.placed !== "number") {
    throw new Error(`doc_sign failed: ${stdout.slice(0, 200)}`);
  }
  return { placed: parsed.placed };
}
