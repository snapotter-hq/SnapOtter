import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the docs dispatcher so we control exactly what stdout the helpers parse.
const runDocsScript = vi.fn();
vi.mock("@snapotter/ai", () => ({
  runDocsScript: (...args: unknown[]) => runDocsScript(...args),
}));

import { isSafeMessageError, isToolInputError } from "@snapotter/shared";
import {
  pdfPageCountPy,
  pdfRedactPy,
  pdfToWordPy,
} from "../../../packages/doc-engine/src/python-docs.js";

/** Flatten an error's message, code, and cause-chain messages into one string. */
function errorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    parts.push(cur.message);
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") parts.push(code);
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.join(" | ");
}

describe("python-docs sidecar JSON parsing", () => {
  beforeEach(() => {
    runDocsScript.mockReset();
  });

  // MuPDF's C-level printer writes "error: ..." lines to stdout ahead of the
  // script's one JSON line (pdf2docx drives PyMuPDF). Sentry NODE-5M: those
  // lines broke the whole parse and a successful conversion reported as
  // "Document tool returned non-JSON output".
  it("finds the JSON line under library noise on stdout", async () => {
    runDocsScript.mockResolvedValue(
      "error: No common ancestor in structure tree\n" +
        "error: No common ancestor in structure tree\n" +
        JSON.stringify({ ok: true }),
    );
    await expect(pdfToWordPy("/in.pdf", "/out.docx")).resolves.toBeUndefined();
  });

  it("surfaces the script's real error line under library noise", async () => {
    runDocsScript.mockResolvedValue(
      "error: No common ancestor in structure tree\n" +
        JSON.stringify({ error: "conversion failed on page 3" }),
    );
    await expect(pdfToWordPy("/in.pdf", "/out.docx")).rejects.toThrow(
      "conversion failed on page 3",
    );
  });

  it("parses valid JSON output normally", async () => {
    runDocsScript.mockResolvedValue(JSON.stringify({ found: 3, verified: true }));
    await expect(pdfRedactPy("/in.pdf", "/out.pdf", ["x"], false)).resolves.toEqual({ found: 3 });
  });

  it("throws a safe, diagnosable error (not a bare SyntaxError) when stdout is not JSON", async () => {
    const garbage =
      'Traceback (most recent call last):\n  File "redact.py", line 9\nRuntimeError: boom';
    runDocsScript.mockResolvedValue(garbage);

    let caught: unknown;
    try {
      await pdfRedactPy("/in.pdf", "/out.pdf", ["secret"], false);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).not.toBe("SyntaxError");
    // The user gets an authored, safe message rather than a raw parser error.
    expect(isSafeMessageError(caught)).toBe(true);
    const text = errorText(caught);
    // The real sidecar output survives for Sentry.
    expect(text).toContain("Traceback");
    // And it identifies which script produced it.
    expect(text).toContain("doc_redact");
  });

  // A damaged PDF (broken xref) passes the qpdf pre-check (exit 3 = recovered
  // with warnings) and reaches the worker, where MuPDF's printer floods stdout
  // with damage diagnostics. That is a user-input problem, not a code bug:
  // it must classify as ToolInputError (error_class=expected, never Sentry),
  // not SafeError kind:"bug" (issue #898, Sentry NODE-60).
  it("classifies MuPDF xref damage noise as a user input error, not a bug", async () => {
    runDocsScript.mockResolvedValue(
      "error: cannot find object in xref (14 0 R)\n" + "error: cannot find object in xref (14 0 R)",
    );

    let caught: unknown;
    try {
      await pdfRedactPy("/in.pdf", "/out.pdf", ["secret"], false);
    } catch (e) {
      caught = e;
    }

    expect(isToolInputError(caught)).toBe(true);
    expect(isSafeMessageError(caught)).toBe(false);
    // The user gets an actionable pointer at the repair path.
    expect((caught as Error).message).toContain("Repair PDF");
    // The raw MuPDF output survives on the cause for local triage, mirroring
    // the SafeError branch; without it a misclassification is unfalsifiable.
    expect(String(((caught as Error).cause as Error)?.message)).toContain(
      "cannot find object in xref",
    );
  });

  // Ordering guard: the salvage walk must run BEFORE the damage classifier.
  // MuPDF repairs many PDFs and completes the job while still printing damage
  // lines; if the classifier ever moves ahead of the walk, every recovered
  // PDF starts failing with "damaged" and NODE-5M comes back via the new path.
  it("still salvages the JSON line when damage noise precedes it", async () => {
    runDocsScript.mockResolvedValue(
      'error: cannot find object in xref (14 0 R)\n{"found": 2, "verified": true}',
    );
    await expect(pdfRedactPy("/in.pdf", "/out.pdf", ["secret"], false)).resolves.toEqual({
      found: 2,
    });
  });

  it("classifies warning-prefixed repair noise as a user input error too", async () => {
    runDocsScript.mockResolvedValue(
      "warning: repairing PDF document\n" +
        "warning: trying to repair broken xref\n" +
        '{"found": ',
    );

    let caught: unknown;
    try {
      await pdfRedactPy("/in.pdf", "/out.pdf", ["secret"], false);
    } catch (e) {
      caught = e;
    }

    expect(isToolInputError(caught)).toBe(true);
  });

  it("classifies interleave-corrupted JSON with MuPDF damage noise as input error", async () => {
    // Modern PyMuPDF prefixes the printer lines with "MuPDF error:"; a mid-line
    // interleave can corrupt the JSON line itself so no line parses at all.
    runDocsScript.mockResolvedValue(
      "MuPDF error: syntax error: invalid key in dict\n" +
        "MuPDF error: format error: non-page object in page tree\n" +
        '{"found": MuPDF error: syntax error: invalid key in dict\n0}',
    );

    let caught: unknown;
    try {
      await pdfRedactPy("/in.pdf", "/out.pdf", ["secret"], false);
    } catch (e) {
      caught = e;
    }

    expect(isToolInputError(caught)).toBe(true);
  });

  it("keeps damage keywords without a MuPDF printer prefix classified as a bug", async () => {
    // A Python traceback that merely mentions xref is not the MuPDF printer;
    // it must stay a diagnosable bug, not silently become an input error.
    runDocsScript.mockResolvedValue(
      'Traceback (most recent call last):\n  File "doc_redact.py", line 27\n' +
        "RuntimeError: internal xref cache invariant violated",
    );

    let caught: unknown;
    try {
      await pdfRedactPy("/in.pdf", "/out.pdf", ["secret"], false);
    } catch (e) {
      caught = e;
    }

    expect(isToolInputError(caught)).toBe(false);
    expect(isSafeMessageError(caught)).toBe(true);
  });

  it("guards every helper, not only redact", async () => {
    runDocsScript.mockResolvedValue("<html>500 Internal Server Error</html>");

    let caught: unknown;
    try {
      await pdfPageCountPy("/in.pdf");
    } catch (e) {
      caught = e;
    }

    expect((caught as Error | undefined)?.name).not.toBe("SyntaxError");
    expect(isSafeMessageError(caught)).toBe(true);
    expect(errorText(caught)).toContain("doc_pagecount");
  });
});
