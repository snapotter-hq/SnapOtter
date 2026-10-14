import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the docs dispatcher so we control exactly what stdout the helpers parse.
const runDocsScript = vi.fn();
vi.mock("@snapotter/ai", () => ({
  runDocsScript: (...args: unknown[]) => runDocsScript(...args),
}));

import { isSafeMessageError, isToolInputError } from "@snapotter/shared";
import {
  htmlToPdfPy,
  pdfFlattenPy,
  pdfMetadataGetPy,
  pdfMetadataSetPy,
  pdfPageCountPy,
  pdfRedactPy,
  pdfScrubProducerPy,
  pdfSignPy,
  pdfTextPy,
  pdfToWordPy,
} from "../../../packages/doc-engine/src/python-docs.js";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

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

  it.each(["null", "[]", "123", '"ok"'])(
    "wraps non-object JSON literal %s in a SafeError instead of throwing a TypeError on 'in'",
    async (raw) => {
      runDocsScript.mockResolvedValue(raw);

      let caught: unknown;
      try {
        await pdfFlattenPy("/in.pdf", "/out.pdf");
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).name).toBe("SafeError");
      expect(isSafeMessageError(caught)).toBe(true);
      expect((caught as Error).message).toBe("Document tool returned non-JSON output");
      expect(errorText(caught)).toContain("doc_flatten");
    },
  );

  it.each([
    ["pdfPageCountPy", "doc_pagecount", () => pdfPageCountPy("/in.pdf")],
    ["pdfFlattenPy", "doc_flatten", () => pdfFlattenPy("/in.pdf", "/out.pdf")],
    ["pdfScrubProducerPy", "doc_scrub_meta", () => pdfScrubProducerPy("/in.pdf", "/out.pdf")],
    ["pdfRedactPy", "doc_redact", () => pdfRedactPy("/in.pdf", "/out.pdf", ["secret"], false)],
    ["pdfTextPy", "doc_text", () => pdfTextPy("/in.pdf", "/out.txt")],
    ["pdfToWordPy", "doc_to_word", () => pdfToWordPy("/in.pdf", "/out.docx")],
    ["pdfMetadataGetPy", "doc_metadata get", () => pdfMetadataGetPy("/in.pdf")],
    ["pdfMetadataSetPy", "doc_metadata set", () => pdfMetadataSetPy("/in.pdf", "/out.pdf", {})],
    ["htmlToPdfPy", "doc_html_pdf", () => htmlToPdfPy("/in.html", "/out.pdf", "html")],
    [
      "pdfSignPy",
      "doc_sign",
      () =>
        pdfSignPy(
          "/in.pdf",
          "/out.pdf",
          ["/sig.png"],
          [{ sig: 0, page: 0, x: 0, y: 0, w: 0.1, h: 0.1 }],
        ),
    ],
  ])(
    "%s rejects an empty or whitespace-only error message with a non-empty reason and does not classify it as ToolInputError",
    async (_name, prefix, call) => {
      for (const payload of ['{"error": ""}', '{"error": "   "}']) {
        runDocsScript.mockResolvedValue(payload);

        let caught: unknown;
        try {
          await call();
        } catch (e) {
          caught = e;
        }

        expect(caught).toBeInstanceOf(Error);
        expect(isToolInputError(caught)).toBe(false);
        expect((caught as Error).message).toBe(`${prefix} failed: ${payload}`);
      }
    },
  );
});

const EMPTY_EXCEPTION_DRIVER = `
import contextlib, importlib.util, io, json, os, sys, tempfile, types

PYTHON_DIR = sys.argv[1]

pymupdf = types.ModuleType("pymupdf")
pymupdf.set_messages = lambda **k: None
sys.modules["pymupdf"] = pymupdf

fitz = types.ModuleType("fitz")
fitz.TEXTFLAGS_TEXT = 1
fitz.TEXT_CID_FOR_UNKNOWN_UNICODE = 1
fitz.TEXT_DEHYPHENATE = 1
def _raise_mem(*a, **k):
    raise MemoryError()
fitz.open = _raise_mem
sys.modules["fitz"] = fitz

pikepdf = types.ModuleType("pikepdf")
pikepdf.open = _raise_mem
sys.modules["pikepdf"] = pikepdf

pdf2docx = types.ModuleType("pdf2docx")
pdf2docx.Converter = _raise_mem
sys.modules["pdf2docx"] = pdf2docx

pdf2docx_layout = types.ModuleType("pdf2docx_layout")
pdf2docx_layout.install_pdf2docx_layout_fixes = lambda: None
sys.modules["pdf2docx_layout"] = pdf2docx_layout

weasyprint = types.ModuleType("weasyprint")
weasyprint.HTML = _raise_mem
weasyprint_urls = types.ModuleType("weasyprint.urls")
weasyprint_urls.default_url_fetcher = lambda *a, **k: None
weasyprint.urls = weasyprint_urls
sys.modules["weasyprint"] = weasyprint
sys.modules["weasyprint.urls"] = weasyprint_urls

results = []
with tempfile.TemporaryDirectory() as scratch:
    dummy_in = os.path.join(scratch, "in.bin")
    dummy_out = os.path.join(scratch, "out.bin")
    with open(dummy_in, "wb") as fh:
        fh.write(b"x")

    CASES = [
        ("doc_pagecount.py", {"path": dummy_in}),
        ("doc_flatten.py", {"path": dummy_in, "out": dummy_out}),
        ("doc_scrub_meta.py", {"path": dummy_in, "out": dummy_out}),
        ("doc_redact.py", {"path": dummy_in, "out": dummy_out, "terms": ["x"], "caseSensitive": False}),
        ("doc_text.py", {"path": dummy_in, "out": dummy_out}),
        ("doc_to_word.py", {"path": dummy_in, "out": dummy_out}),
        ("doc_metadata.py", {"path": dummy_in, "mode": "get"}),
        ("doc_metadata.py", {"path": dummy_in, "out": dummy_out, "mode": "set", "metadata": {"Title": "T"}}),
        ("doc_html_pdf.py", {"path": dummy_in, "out": dummy_out, "mode": "html"}),
        ("doc_sign.py", {"input": dummy_in, "output": dummy_out, "signatures": [dummy_in], "placements": [{"sig": 0, "page": 0, "x": 0, "y": 0, "w": 0.1, "h": 0.1}]}),
    ]

    for filename, payload in CASES:
        script_path = os.path.join(PYTHON_DIR, filename)
        spec = importlib.util.spec_from_file_location(filename[:-3], script_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        sys.argv = [filename, json.dumps(payload)]
        buf = io.StringIO()
        code = 0
        try:
            with contextlib.redirect_stdout(buf):
                mod.main()
        except SystemExit as exc:
            code = exc.code if isinstance(exc.code, int) else 1
        results.append({
            "script": filename,
            "mode": payload.get("mode"),
            "exitCode": code,
            "stdout": buf.getvalue().strip(),
        })

print(json.dumps(results))
`;

describe.skipIf(!hasPython)("doc_*.py empty-message exception handling", () => {
  it("emits the exception class name and exits 1 when a bare MemoryError() is raised", () => {
    const pythonDir = join(process.cwd(), "packages", "ai", "python");
    const res = spawnSync(pythonBin as string, ["-c", EMPTY_EXCEPTION_DRIVER, pythonDir], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(res.status, res.stderr).toBe(0);
    const rows = JSON.parse(res.stdout.trim()) as Array<{
      script: string;
      mode?: string;
      exitCode: number;
      stdout: string;
    }>;
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row.exitCode, `${row.script} (${row.mode ?? "default"}) exitCode`).toBe(1);
      expect(JSON.parse(row.stdout), `${row.script} (${row.mode ?? "default"}) stdout`).toEqual({
        error: "MemoryError",
      });
    }
  });
});
