import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the docs dispatcher so we control exactly what stdout the helpers parse.
const runDocsScript = vi.fn();
vi.mock("@snapotter/ai", () => ({
  runDocsScript: (...args: unknown[]) => runDocsScript(...args),
}));

import { isSafeMessageError } from "@snapotter/shared";
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
