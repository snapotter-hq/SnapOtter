import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PyMuPDF's message system writes MuPDF's C-level diagnostics ("error: cannot
 * find object in xref (14 0 R)") to sys.stdout by default. The docs sidecar's
 * stdout is a one-JSON-line protocol, so any script that drives PyMuPDF must
 * redirect those messages to stderr or a damaged PDF corrupts the JSON channel
 * and a user-input problem surfaces as "Document tool returned non-JSON
 * output" tagged as a code bug (#898, Sentry NODE-60; pattern from #843/#859).
 */
const PYTHON_DIR = path.resolve(__dirname, "../../../packages/ai/python");
// pdf2docx drives MuPDF internally, so scripts that only import pdf2docx need
// the redirect too (doc_to_word.py, the #843 incident). `from X import Y`
// counts the same as `import X`.
const IMPORTS_PYMUPDF = /^\s*(?:import|from) (?:fitz|pymupdf|pdf2docx)\b/m;
const REDIRECT_MARKER = "set_messages(stream=sys.stderr)";
// Only entrypoints own process-level stream config; helper modules (e.g.
// pdf2docx_layout.py) run under an entrypoint that already redirected.
const IS_ENTRYPOINT = /if __name__ == "__main__":/;

describe("PyMuPDF docs scripts keep MuPDF diagnostics off the JSON stdout channel", () => {
  const scripts = readdirSync(PYTHON_DIR).filter((f) => f.endsWith(".py"));
  const pymupdfScripts = scripts.filter((f) => {
    const src = readFileSync(path.join(PYTHON_DIR, f), "utf8");
    return IS_ENTRYPOINT.test(src) && IMPORTS_PYMUPDF.test(src);
  });

  it("finds the PyMuPDF-driven scripts (guards against the directory moving)", () => {
    expect(pymupdfScripts).toContain("doc_redact.py");
    expect(pymupdfScripts).toContain("doc_to_word.py");
  });

  it("every script importing fitz/pymupdf redirects MuPDF messages to stderr", () => {
    const missingRedirect = pymupdfScripts.filter(
      (f) => !readFileSync(path.join(PYTHON_DIR, f), "utf8").includes(REDIRECT_MARKER),
    );
    expect(missingRedirect).toEqual([]);
  });
});
