import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

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

const REDIRECT_FAILURE_DRIVER = `
import contextlib, importlib.util, io, json, os, sys, tempfile, types

PYTHON_DIR = sys.argv[1]
SCRIPTS = json.loads(sys.argv[2])

pymupdf = types.ModuleType("pymupdf")
def _fail_redirect(**k):
    raise RuntimeError("set_messages unsupported")
pymupdf.set_messages = _fail_redirect
sys.modules["pymupdf"] = pymupdf

fitz = types.ModuleType("fitz")
fitz.TEXTFLAGS_TEXT = 1
fitz.TEXT_CID_FOR_UNKNOWN_UNICODE = 1
fitz.TEXT_DEHYPHENATE = 1
def _stop(*a, **k):
    raise RuntimeError("stop after redirect")
fitz.open = _stop
sys.modules["fitz"] = fitz

pdf2docx = types.ModuleType("pdf2docx")
pdf2docx.Converter = _stop
sys.modules["pdf2docx"] = pdf2docx

pdf2docx_layout = types.ModuleType("pdf2docx_layout")
pdf2docx_layout.install_pdf2docx_layout_fixes = lambda: None
sys.modules["pdf2docx_layout"] = pdf2docx_layout

results = []
with tempfile.TemporaryDirectory() as scratch:
    dummy_in = os.path.join(scratch, "in.pdf")
    dummy_out = os.path.join(scratch, "out.bin")
    with open(dummy_in, "wb") as fh:
        fh.write(b"%PDF-1.4")

    PAYLOADS = {
        "doc_flatten.py": {"path": dummy_in, "out": dummy_out},
        "doc_redact.py": {"path": dummy_in, "out": dummy_out, "terms": ["x"], "caseSensitive": False},
        "doc_scrub_meta.py": {"path": dummy_in, "out": dummy_out},
        "doc_sign.py": {"input": dummy_in, "output": dummy_out, "signatures": [dummy_in], "placements": [{"sig": 0, "page": 0, "x": 0, "y": 0, "w": 0.1, "h": 0.1}]},
        "doc_text.py": {"path": dummy_in, "out": dummy_out},
        "doc_to_word.py": {"path": dummy_in, "out": dummy_out},
    }

    for filename in SCRIPTS:
        script_path = os.path.join(PYTHON_DIR, filename)
        spec = importlib.util.spec_from_file_location(filename[:-3], script_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        sys.argv = [filename, json.dumps(PAYLOADS[filename])]
        out_buf, err_buf = io.StringIO(), io.StringIO()
        exit_code = 0
        try:
            with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
                mod.main()
        except SystemExit as exc:
            exit_code = exc.code if isinstance(exc.code, int) else 1
        results.append({
            "script": filename,
            "exitCode": exit_code,
            "stdout": out_buf.getvalue().strip(),
            "stderr": err_buf.getvalue().strip(),
        })

print(json.dumps(results))
`;

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

  it("every script importing fitz/pymupdf logs redirect failures to stderr instead of silencing them", () => {
    const missingBreadcrumb = pymupdfScripts.filter((f) => {
      const stem = f.replace(/\.py$/, "");
      const src = readFileSync(path.join(PYTHON_DIR, f), "utf8");
      const expected = `print(f"[${stem}] pymupdf message redirect unavailable: {exc}", file=sys.stderr)`;
      return !src.includes(expected);
    });
    expect(missingBreadcrumb).toEqual([]);
  });

  it.skipIf(!hasPython)(
    "emits a stderr breadcrumb and keeps stdout clean JSON when pymupdf.set_messages raises",
    () => {
      const res = spawnSync(
        pythonBin as string,
        ["-c", REDIRECT_FAILURE_DRIVER, PYTHON_DIR, JSON.stringify(pymupdfScripts)],
        {
          encoding: "utf8",
          timeout: 30_000,
        },
      );
      expect(res.status, res.stderr).toBe(0);
      const rows = JSON.parse(res.stdout.trim()) as Array<{
        script: string;
        exitCode: number;
        stdout: string;
        stderr: string;
      }>;
      expect(rows).toHaveLength(pymupdfScripts.length);
      for (const row of rows) {
        const stem = row.script.replace(/\.py$/, "");
        expect(row.exitCode, `${row.script} exitCode`).toBe(1);
        expect(row.stderr, `${row.script} stderr`).toBe(
          `[${stem}] pymupdf message redirect unavailable: set_messages unsupported`,
        );
        expect(JSON.parse(row.stdout), `${row.script} stdout`).toEqual({
          error: "stop after redirect",
        });
      }
    },
  );
});
