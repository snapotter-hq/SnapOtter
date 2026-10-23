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

  it("classifies a doc_html_pdf remote-resource rejection as ToolInputError (#1176)", async () => {
    runDocsScript.mockResolvedValue(
      JSON.stringify({ error: "remote resources are disabled: http://127.0.0.1:9/x.png" }),
    );

    let caught: unknown;
    try {
      await htmlToPdfPy("/in.html", "/out.pdf", "html");
    } catch (e) {
      caught = e;
    }

    expect(isToolInputError(caught)).toBe(true);
    expect((caught as Error).message).toBe(
      "remote resources are disabled: http://127.0.0.1:9/x.png",
    );
  });

  it("keeps other doc_html_pdf errors as non-input errors (#1176)", async () => {
    runDocsScript.mockResolvedValue(
      JSON.stringify({ error: "weasyprint not usable: No module named 'weasyprint'" }),
    );

    let caught: unknown;
    try {
      await htmlToPdfPy("/in.html", "/out.pdf", "html");
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(isToolInputError(caught)).toBe(false);
    expect((caught as Error).message).toBe(
      "doc_html_pdf failed: weasyprint not usable: No module named 'weasyprint'",
    );
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

const FITZ_CLOSE_DRIVER = `
import contextlib, importlib.util, io, json, os, shutil, sys, tempfile, types

PYTHON_DIR = sys.argv[1]
sys.path.insert(0, PYTHON_DIR)

pymupdf = types.ModuleType("pymupdf")
pymupdf.set_messages = lambda **k: None
sys.modules["pymupdf"] = pymupdf

fitz = types.ModuleType("fitz")
fitz.TEXTFLAGS_TEXT = 3
fitz.TEXT_CID_FOR_UNKNOWN_UNICODE = 1
fitz.TEXT_DEHYPHENATE = 1
fitz.Rect = lambda *coords: coords
sys.modules["fitz"] = fitz

def load_script(filename, suffix):
    script_path = os.path.join(PYTHON_DIR, filename)
    spec = importlib.util.spec_from_file_location(f"{filename[:-3]}_{suffix}", script_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def run_main(mod, filename, payload):
    sys.argv = [filename, json.dumps(payload)]
    out_buf, err_buf = io.StringIO(), io.StringIO()
    exit_code = 0
    try:
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            mod.main()
    except SystemExit as exc:
        exit_code = exc.code if isinstance(exc.code, int) else 1
    return exit_code, out_buf.getvalue().strip(), err_buf.getvalue().strip()

failures = {
    "doc_scrub_meta.py": [],
    "doc_flatten.py": [],
    "doc_redact.py": [],
    "doc_sign.py": [],
    "doc_text.py": [],
}

def check(script, cond, msg):
    if not cond:
        failures[script].append(msg)

with tempfile.TemporaryDirectory() as scratch:
    in_pdf = os.path.join(scratch, "in.pdf")
    out_pdf = os.path.join(scratch, "out.pdf")
    sig_png = os.path.join(scratch, "sig.png")
    with open(in_pdf, "wb") as fh:
        fh.write(b"%PDF-1.4")
    with open(sig_png, "wb") as fh:
        fh.write(b"\\x89PNG")

    # 1. doc_scrub_meta.py
    scrub_mod = load_script("doc_scrub_meta.py", "3765")
    scrub_closed = []

    class ScrubDoc:
        def __init__(self, needs_pass=False, fail_stage=None):
            self.needs_pass = needs_pass
            self.metadata = {"title": "Keep"}
            self.fail_stage = fail_stage
        def set_metadata(self, meta):
            if self.fail_stage == "set_metadata":
                raise RuntimeError("set_metadata failed")
            self.metadata = meta
        def del_xml_metadata(self):
            if self.fail_stage == "del_xml_metadata":
                raise RuntimeError("del_xml_metadata failed")
        def save(self, out):
            if self.fail_stage == "save":
                raise OSError("save failed")
        def close(self):
            scrub_closed.append(True)

    for stage in ("set_metadata", "del_xml_metadata", "save"):
        scrub_closed.clear()
        fitz.open = lambda _p, s=stage: ScrubDoc(fail_stage=s)
        code, stdout, _ = run_main(scrub_mod, "doc_scrub_meta.py", {"path": in_pdf, "out": out_pdf})
        check("doc_scrub_meta.py", code == 1 and json.loads(stdout) == {"error": f"{stage} failed"}, f"unexpected output on {stage}: {code} {stdout}")
        check("doc_scrub_meta.py", scrub_closed == [True], f"leaked doc on {stage}: {scrub_closed}")

    # Encrypted branch: closes exactly once on success and when shutil.copyfile raises
    scrub_closed.clear()
    fitz.open = lambda _p: ScrubDoc(needs_pass=True)
    code, stdout, _ = run_main(scrub_mod, "doc_scrub_meta.py", {"path": in_pdf, "out": out_pdf})
    check("doc_scrub_meta.py", code == 0 and json.loads(stdout) == {"ok": True, "skipped": "encrypted"}, f"encrypted ok output: {code} {stdout}")
    check("doc_scrub_meta.py", scrub_closed == [True], f"encrypted close count: {scrub_closed}")

    orig_copyfile = shutil.copyfile
    try:
        def fail_copyfile(_src, _dst):
            raise OSError("copyfile failed")
        shutil.copyfile = fail_copyfile
        scrub_closed.clear()
        fitz.open = lambda _p: ScrubDoc(needs_pass=True)
        code, stdout, _ = run_main(scrub_mod, "doc_scrub_meta.py", {"path": in_pdf, "out": out_pdf})
        check("doc_scrub_meta.py", code == 1 and json.loads(stdout) == {"error": "copyfile failed"}, f"copyfile error output: {code} {stdout}")
        check("doc_scrub_meta.py", scrub_closed == [True], f"encrypted copyfile failure close count: {scrub_closed}")
    finally:
        shutil.copyfile = orig_copyfile

    scrub_closed.clear()
    fitz.open = lambda _p: ScrubDoc()
    code, stdout, _ = run_main(scrub_mod, "doc_scrub_meta.py", {"path": in_pdf, "out": out_pdf})
    check("doc_scrub_meta.py", code == 0 and json.loads(stdout) == {"ok": True} and scrub_closed == [True], f"normal scrub: {code} {stdout} {scrub_closed}")

    # 2. doc_flatten.py
    flatten_mod = load_script("doc_flatten.py", "3765")
    flatten_closed = []

    class FlattenDoc:
        def __init__(self, fail_stage=None):
            self.fail_stage = fail_stage
        def bake(self):
            if self.fail_stage == "bake":
                raise RuntimeError("bake failed")
        def save(self, out):
            if self.fail_stage == "save":
                raise OSError("flatten save failed")
        def close(self):
            flatten_closed.append(True)

    for stage, msg in (("bake", "bake failed"), ("save", "flatten save failed")):
        flatten_closed.clear()
        fitz.open = lambda _p, s=stage: FlattenDoc(fail_stage=s)
        code, stdout, _ = run_main(flatten_mod, "doc_flatten.py", {"path": in_pdf, "out": out_pdf})
        check("doc_flatten.py", code == 1 and json.loads(stdout) == {"error": msg}, f"unexpected output on {stage}: {code} {stdout}")
        check("doc_flatten.py", flatten_closed == [True], f"leaked doc on {stage}: {flatten_closed}")

    flatten_closed.clear()
    fitz.open = lambda _p: FlattenDoc()
    code, stdout, _ = run_main(flatten_mod, "doc_flatten.py", {"path": in_pdf, "out": out_pdf})
    check("doc_flatten.py", code == 0 and json.loads(stdout) == {"ok": True} and flatten_closed == [True], f"normal flatten: {code} {stdout} {flatten_closed}")

    # 3. doc_redact.py (both doc and check handles)
    redact_mod = load_script("doc_redact.py", "3765")
    redact_closed = []

    class RedactPage:
        def __init__(self, fail_stage=None, text=""):
            self.fail_stage = fail_stage
            self._text = text
        def search_for(self, _term, quads=True, flags=0):
            if self.fail_stage == "search_for":
                raise RuntimeError("search_for failed")
            return [types.SimpleNamespace(rect=(0, 0, 10, 10))]
        def get_textbox(self, _rect):
            if self.fail_stage == "get_textbox":
                raise RuntimeError("get_textbox failed")
            return "secret"
        def add_redact_annot(self, _quad, fill=None):
            if self.fail_stage == "add_redact_annot":
                raise RuntimeError("add_redact_annot failed")
        def apply_redactions(self):
            if self.fail_stage == "apply_redactions":
                raise RuntimeError("apply_redactions failed")
        def get_text(self):
            if self.fail_stage == "check_get_text":
                raise RuntimeError("check_get_text failed")
            return self._text

    class RedactDoc:
        def __init__(self, tag, pages, fail_stage=None):
            self.tag = tag
            self._pages = pages
            self.fail_stage = fail_stage
        def __iter__(self):
            return iter(self._pages)
        def save(self, _out, garbage=0, deflate=False):
            if self.fail_stage == "save":
                raise OSError("redact save failed")
        def close(self):
            redact_closed.append(self.tag)

    for stage, case_sens, expected_err in (
        ("search_for", False, "search_for failed"),
        ("get_textbox", True, "get_textbox failed"),
        ("add_redact_annot", False, "add_redact_annot failed"),
        ("apply_redactions", False, "apply_redactions failed"),
        ("save", False, "redact save failed"),
    ):
        redact_closed.clear()
        fitz.open = lambda p, s=stage: RedactDoc("doc", [RedactPage(fail_stage=s)], fail_stage=s)
        code, stdout, _ = run_main(
            redact_mod,
            "doc_redact.py",
            {"path": in_pdf, "out": out_pdf, "terms": ["secret"], "caseSensitive": case_sens},
        )
        check("doc_redact.py", code == 1 and json.loads(stdout) == {"error": expected_err}, f"unexpected output on {stage}: {code} {stdout}")
        check("doc_redact.py", redact_closed == ["doc"], f"leaked doc on {stage}: {redact_closed}")

    redact_closed.clear()
    def open_redact_check_fail(p):
        if p == in_pdf:
            return RedactDoc("doc", [RedactPage()])
        return RedactDoc("check", [RedactPage(fail_stage="check_get_text")])
    fitz.open = open_redact_check_fail
    code, stdout, _ = run_main(
        redact_mod,
        "doc_redact.py",
        {"path": in_pdf, "out": out_pdf, "terms": ["secret"], "caseSensitive": False},
    )
    check("doc_redact.py", code == 1 and json.loads(stdout) == {"error": "check_get_text failed"}, f"check_get_text output: {code} {stdout}")
    check("doc_redact.py", redact_closed == ["doc", "check"], f"leaked check on check_get_text: {redact_closed}")

    redact_closed.clear()
    def open_redact_ok(p):
        if p == in_pdf:
            return RedactDoc("doc", [RedactPage()])
        return RedactDoc("check", [RedactPage(text="clean")])
    fitz.open = open_redact_ok
    code, stdout, _ = run_main(
        redact_mod,
        "doc_redact.py",
        {"path": in_pdf, "out": out_pdf, "terms": ["secret"], "caseSensitive": True},
    )
    check("doc_redact.py", code == 0 and json.loads(stdout) == {"found": 1, "verified": True} and redact_closed == ["doc", "check"], f"normal redact: {code} {stdout} {redact_closed}")

    # 4. doc_sign.py (including early sys.exit(1) on out-of-range page/signature index, missing sig file, insert_image, and save)
    sign_mod = load_script("doc_sign.py", "3765")
    sign_closed = []

    class SignPage:
        def __init__(self, fail_stage=None):
            self.rect = types.SimpleNamespace(x0=0.0, y0=0.0, width=100.0, height=200.0)
            self.fail_stage = fail_stage
        def insert_image(self, _rect, stream=None, keep_proportion=False):
            if self.fail_stage == "insert_image":
                raise RuntimeError("insert_image failed")

    class SignDoc:
        def __init__(self, fail_stage=None):
            self.page_count = 2
            self.fail_stage = fail_stage
        def __getitem__(self, _idx):
            return SignPage(fail_stage=self.fail_stage)
        def save(self, _out, garbage=0, deflate=False):
            if self.fail_stage == "save":
                raise OSError("sign save failed")
        def close(self):
            sign_closed.append(True)

    # Out-of-range page index (sys.exit(1))
    sign_closed.clear()
    fitz.open = lambda _p: SignDoc()
    code, stdout, _ = run_main(
        sign_mod,
        "doc_sign.py",
        {
            "input": in_pdf,
            "output": out_pdf,
            "signatures": [sig_png],
            "placements": [{"sig": 0, "page": 5, "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}],
        },
    )
    check("doc_sign.py", code == 1 and "page index 5 out of range" in json.loads(stdout)["error"], f"out-of-range page output: {code} {stdout}")
    check("doc_sign.py", sign_closed == [True], f"leaked doc on out-of-range page index: {sign_closed}")

    # Out-of-range signature index (sys.exit(1))
    sign_closed.clear()
    fitz.open = lambda _p: SignDoc()
    code, stdout, _ = run_main(
        sign_mod,
        "doc_sign.py",
        {
            "input": in_pdf,
            "output": out_pdf,
            "signatures": [sig_png],
            "placements": [{"sig": 3, "page": 0, "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}],
        },
    )
    check("doc_sign.py", code == 1 and "signature index 3 out of range" in json.loads(stdout)["error"], f"out-of-range sig output: {code} {stdout}")
    check("doc_sign.py", sign_closed == [True], f"leaked doc on out-of-range sig index: {sign_closed}")

    # Missing signature file, insert_image failure, save failure
    for stage, sig_path, expected_err in (
        ("missing_sig", os.path.join(scratch, "nope.png"), "nope.png"),
        ("insert_image", sig_png, "insert_image failed"),
        ("save", sig_png, "sign save failed"),
    ):
        sign_closed.clear()
        fitz.open = lambda _p, s=stage: SignDoc(fail_stage=s)
        code, stdout, _ = run_main(
            sign_mod,
            "doc_sign.py",
            {
                "input": in_pdf,
                "output": out_pdf,
                "signatures": [sig_path],
                "placements": [{"sig": 0, "page": 0, "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}],
            },
        )
        check("doc_sign.py", code == 1 and expected_err in json.loads(stdout)["error"], f"unexpected output on {stage}: {code} {stdout}")
        check("doc_sign.py", sign_closed == [True], f"leaked doc on {stage}: {sign_closed}")

    sign_closed.clear()
    fitz.open = lambda _p: SignDoc()
    code, stdout, _ = run_main(
        sign_mod,
        "doc_sign.py",
        {
            "input": in_pdf,
            "output": out_pdf,
            "signatures": [sig_png],
            "placements": [{"sig": 0, "page": 0, "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}],
        },
    )
    check("doc_sign.py", code == 0 and json.loads(stdout) == {"ok": True, "placed": 1} and sign_closed == [True], f"normal sign: {code} {stdout} {sign_closed}")

    # 5. doc_text.py
    text_mod = load_script("doc_text.py", "3765")
    text_closed = []

    class TextPage:
        number = 0
        def __init__(self, fail_stage=None):
            self.fail_stage = fail_stage
        def get_text(self, *args, **kwargs):
            if self.fail_stage == "get_text":
                raise RuntimeError("page get_text failed")
            if self.fail_stage == "flagged_get_text" and kwargs.get("flags") is not None:
                raise RuntimeError("flagged get_text failed")
            return "Hello world"

    class TextDoc:
        def __init__(self, fail_stage=None):
            self.fail_stage = fail_stage
        def __iter__(self):
            return iter([TextPage(fail_stage=self.fail_stage)])
        def close(self):
            text_closed.append(True)

    def fake_draws_unmapped(page):
        if page.fail_stage == "draws_unmapped":
            raise RuntimeError("draws_unmapped_composite_font failed")
        return page.fail_stage == "flagged_get_text"

    text_mod.draws_unmapped_composite_font = fake_draws_unmapped
    text_mod._judge_without_glyph_id_fonts = lambda _p, _f=None: None

    for stage, expected_err in (
        ("get_text", "page get_text failed"),
        ("draws_unmapped", "draws_unmapped_composite_font failed"),
        ("flagged_get_text", "flagged get_text failed"),
    ):
        text_closed.clear()
        fitz.open = lambda _p, s=stage: TextDoc(fail_stage=s)
        code, stdout, _ = run_main(text_mod, "doc_text.py", {"path": in_pdf, "out": out_pdf})
        check("doc_text.py", code == 1 and json.loads(stdout) == {"error": expected_err}, f"unexpected output on {stage}: {code} {stdout}")
        check("doc_text.py", text_closed == [True], f"leaked doc on {stage}: {text_closed}")

    text_closed.clear()
    fitz.open = lambda _p: TextDoc()
    code, stdout, _ = run_main(text_mod, "doc_text.py", {"path": in_pdf, "out": out_pdf})
    check("doc_text.py", code == 0 and json.loads(stdout) == {"chars": 11, "hasText": True} and text_closed == [True], f"normal text: {code} {stdout} {text_closed}")

print(json.dumps(failures))
`;

describe.skipIf(!hasPython)("PyMuPDF fitz.open handle cleanup (#3765)", () => {
  it("closes fitz.open handles in try/finally across doc_scrub_meta, doc_flatten, doc_redact, doc_sign, and doc_text when processing, validation, or save raises", () => {
    const pythonDir = join(process.cwd(), "packages", "ai", "python");
    const res = spawnSync(pythonBin as string, ["-c", FITZ_CLOSE_DRIVER, pythonDir], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(res.status, res.stderr).toBe(0);
    const report = JSON.parse(res.stdout.trim()) as Record<string, string[]>;
    expect(report).toEqual({
      "doc_scrub_meta.py": [],
      "doc_flatten.py": [],
      "doc_redact.py": [],
      "doc_sign.py": [],
      "doc_text.py": [],
    });
  });
});
