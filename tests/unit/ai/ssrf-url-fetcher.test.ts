// Contract test for the network chokepoint in doc_html_pdf.py.
//
// WeasyPrint routes every resource it would read (images, stylesheets, fonts,
// SVG <image>, <object> data) through the url_fetcher it is handed. The one
// _make_url_fetcher builds is that fetcher, and refusing there is the whole
// SSRF control for html-to-pdf, markdown-to-pdf and epub-convert's pdf format.
//
// The driver stubs weasyprint and markdown in sys.modules, so this runs on a
// bare python3 (CI has one) instead of skipping the way a weasyprint-gated
// suite would. Stubbing also lets it assert the thing that matters: main()
// hands the blocking fetcher to WeasyPrint and converts documents that merely
// link to remote content, rather than rejecting them up front (#1157).
//
// What it cannot see, because weasyprint is stubbed, is whether WeasyPrint
// really routes everything through the fetcher. That end of the contract lives
// in the weasyprint-gated integration suites, which no CI lane runs (#1174).

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

const MODULE_PATH = join(process.cwd(), "packages", "ai", "python", "doc_html_pdf.py");

const DRIVER = `
import contextlib, importlib.util, io, json, os, sys, tempfile, types

MODULE = sys.argv[1]
recorded = {}
# Flipped for the one case that checks what happens if a refusal ever escapes
# write_pdf, which is the contract main()'s error branch has to honour.
raise_from_write = []


class FakeHTML:
    def __init__(self, string=None, url_fetcher=None, base_url="ABSENT"):
        recorded["string"] = string
        recorded["url_fetcher"] = url_fetcher
        recorded["base_url"] = base_url

    def write_pdf(self, out):
        if raise_from_write:
            recorded["url_fetcher"]("https://example.com/escapes.png")
        with open(out, "wb") as fh:
            fh.write(b"%PDF-1.7 stub")


weasyprint = types.ModuleType("weasyprint")
weasyprint.HTML = FakeHTML
weasyprint_urls = types.ModuleType("weasyprint.urls")
weasyprint_urls.default_url_fetcher = lambda url, *a, **k: {"string": b"DELEGATED"}
weasyprint.urls = weasyprint_urls
sys.modules["weasyprint"] = weasyprint
sys.modules["weasyprint.urls"] = weasyprint_urls

markdown_seen = []
markdown = types.ModuleType("markdown")
# Echo the source back inside an anchor so the assertion on what WeasyPrint
# received depends on the input, rather than on a literal baked into the stub.
markdown.markdown = lambda src, extensions=None: (
    markdown_seen.append(src) or '<p><a href="https://example.com">' + src.strip() + "</a></p>"
)
sys.modules["markdown"] = markdown

spec = importlib.util.spec_from_file_location("doc_html_pdf", MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

probe_fetcher = mod._make_url_fetcher(weasyprint_urls.default_url_fetcher)


def refuses(fetcher, url):
    """True when this exact callable rejects the URL rather than serving it."""
    if fetcher is None:
        return False
    try:
        fetcher(url)
        return False
    except ValueError:
        return True
    except Exception:
        return False


def serves_data(fetcher):
    if fetcher is None:
        return False
    try:
        return fetcher("data:image/png;base64,AA==")["string"] == b"DELEGATED"
    except Exception:
        return False


result = {"fetcher": {}}
for url in [
    "https://example.com/x.png",
    "http://example.com/x.png",
    "http:/example.com/x.png",
    "file:///etc/passwd",
    "ftp://example.com/x.png",
    "//example.com/x.png",
    "DATA:image/png;base64,AA==",
]:
    try:
        probe_fetcher(url)
        result["fetcher"][url] = "ALLOWED"
    except ValueError:
        result["fetcher"][url] = "REFUSED"
    except Exception as exc:
        result["fetcher"][url] = "OTHER:" + type(exc).__name__

try:
    result["dataUri"] = probe_fetcher("data:image/png;base64,AA==")["string"].decode()
except Exception as exc:
    result["dataUri"] = "RAISED:" + type(exc).__name__


def run_main(name, text, mode):
    scratch = tempfile.mkdtemp()
    src = os.path.join(scratch, name)
    out = os.path.join(scratch, "out.pdf")
    with open(src, "w", encoding="utf-8") as fh:
        fh.write(text)
    recorded.clear()
    sys.argv = ["doc_html_pdf.py", json.dumps({"path": src, "out": out, "mode": mode})]
    buf = io.StringIO()
    code = 0
    try:
        with contextlib.redirect_stdout(buf):
            mod.main()
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
    installed = recorded.get("url_fetcher")
    return {
        "exitCode": code,
        "stdout": buf.getvalue().strip(),
        "wrotePdf": os.path.exists(out) and os.path.getsize(out) > 0,
        "sourceSeen": recorded.get("string") or "",
        "installedRefusesRemote": refuses(installed, "https://example.com/x.png"),
        "installedServesData": serves_data(installed),
        "baseUrl": recorded.get("base_url", "ABSENT"),
    }


# Every ref shape the deleted pre-scan used to reject, plus the CSS ones it
# also matched, in one document.
result["html"] = run_main(
    "doc.html",
    "<html><head><style>"
    '@import "https://example.com/theme.css";'
    "body{background:url(https://example.com/bg.png)}"
    "@font-face{font-family:x;src:url(https://example.com/f.woff2)}"
    "</style></head><body>"
    '<a href="https://example.com">docs</a>'
    '<form action="https://example.com/submit"></form>'
    '<button formaction="https://example.com/go">go</button>'
    '<img src="https://example.com/x.png" srcset="https://example.com/x2.png 2x">'
    '<video poster="https://example.com/t.jpg"></video>'
    '<object data="https://example.com/d.pdf"></object>'
    "</body></html>",
    "html",
)
result["markdown"] = run_main("doc.md", "See [the docs](https://example.com) for more.\\n", "markdown")
result["markdownSaw"] = markdown_seen[-1] if markdown_seen else ""

raise_from_write.append(True)
result["escapes"] = run_main("escape.html", "<html><body>x</body></html>", "html")
raise_from_write.clear()

print(json.dumps(result))
`;

// Separate spawn with weasyprint and markdown made unimportable: the module
// has to load anyway, or main()'s "weasyprint not usable" reply would never
// get the chance to run.
const BARE_IMPORT_DRIVER = `
import importlib.util, json, sys

for blocked in ("weasyprint", "weasyprint.urls", "markdown"):
    sys.modules[blocked] = None

spec = importlib.util.spec_from_file_location("doc_html_pdf", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(json.dumps({"imported": True, "hasFactory": hasattr(mod, "_make_url_fetcher")}))
`;

interface MainRun {
  exitCode: number;
  stdout: string;
  wrotePdf: boolean;
  sourceSeen: string;
  installedRefusesRemote: boolean;
  installedServesData: boolean;
  baseUrl: string | null;
}

interface DriverResult {
  fetcher: Record<string, string>;
  dataUri: string;
  html: MainRun;
  markdown: MainRun;
  markdownSaw: string;
  escapes: MainRun;
}

function runPython(code: string): string {
  const res = spawnSync(pythonBin as string, ["-c", code, MODULE_PATH], {
    encoding: "utf8",
    timeout: 30_000,
  });
  // status is null on a timeout or a signal kill, so check it explicitly
  // rather than relying on a truthy non-zero.
  if (res.status !== 0) {
    throw new Error(`python driver exited ${res.status ?? "on a signal"}: ${res.stderr}`);
  }
  const line = res.stdout.trim().split("\n").pop();
  if (!line) throw new Error(`python driver printed nothing. stderr: ${res.stderr}`);
  return line;
}

let result: DriverResult;

describe.skipIf(!hasPython)("doc_html_pdf.py url_fetcher (the SSRF chokepoint)", () => {
  beforeAll(() => {
    result = JSON.parse(runPython(DRIVER));
  });

  it.each([
    "https://example.com/x.png",
    "http://example.com/x.png",
    // pandoc rewrites http:// to http:/ in some epub spines
    "http:/example.com/x.png",
    "file:///etc/passwd",
    "ftp://example.com/x.png",
    "//example.com/x.png",
    // scheme matching is case-sensitive, so an unrecognised spelling fails
    // closed. That costs the document a resource, never an egress hole.
    "DATA:image/png;base64,AA==",
  ])("refuses %s", (url) => {
    expect(result.fetcher[url]).toBe("REFUSED");
  });

  it("serves data: URIs through WeasyPrint's own fetcher", () => {
    expect(result.dataUri).toBe("DELEGATED");
  });

  it("imports on an interpreter where weasyprint is unusable", () => {
    expect(JSON.parse(runPython(BARE_IMPORT_DRIVER))).toEqual({
      imported: true,
      hasFactory: true,
    });
  });

  describe("main() installs the fetcher instead of rejecting the document", () => {
    it("converts HTML carrying every ref shape the pre-scan used to reject", () => {
      expect(result.html.exitCode).toBe(0);
      expect(JSON.parse(result.html.stdout)).toEqual({ ok: true });
      expect(result.html.wrotePdf).toBe(true);
    });

    it.each([
      'href="https://example.com"',
      'action="https://example.com/submit"',
      'formaction="https://example.com/go"',
      'src="https://example.com/x.png"',
      'srcset="https://example.com/x2.png 2x"',
      'poster="https://example.com/t.jpg"',
      'data="https://example.com/d.pdf"',
      '@import "https://example.com/theme.css"',
      "url(https://example.com/bg.png)",
      "url(https://example.com/f.woff2)",
    ])("leaves %s in the HTML it hands to WeasyPrint", (ref) => {
      expect(result.html.sourceSeen).toContain(ref);
    });

    it("converts Markdown whose only remote ref is an inline link", () => {
      expect(result.markdown.exitCode).toBe(0);
      expect(JSON.parse(result.markdown.stdout)).toEqual({ ok: true });
    });

    it("feeds the Markdown source through and keeps the rendered link", () => {
      expect(result.markdownSaw).toContain("[the docs](https://example.com)");
      expect(result.markdown.sourceSeen).toContain("See [the docs](https://example.com) for more.");
    });

    // The exact callable handed to WeasyPrint has to be the blocking one.
    // Passing the wrong fetcher, or none, is the one way to silently reopen
    // egress, so assert on its behaviour rather than that an argument arrived.
    it.each(["html", "markdown"] as const)(
      "installs a fetcher that refuses remote in %s mode",
      (mode) => {
        expect(result[mode].installedRefusesRemote).toBe(true);
      },
    );

    it.each(["html", "markdown"] as const)(
      "installs a fetcher that serves data: in %s mode",
      (mode) => {
        expect(result[mode].installedServesData).toBe(true);
      },
    );

    it.each(["html", "markdown"] as const)("renders with no base URL in %s mode", (mode) => {
      expect(result[mode].baseUrl).toBeNull();
    });
  });

  it("names the refused URL if a refusal ever escapes the render", () => {
    // WeasyPrint 69 swallows the ValueError and omits the resource, so this
    // branch is unreachable today. It is the fallback the acceptance criteria
    // ask for: a message naming the URL, never a bare exit-1.
    expect(result.escapes.exitCode).toBe(1);
    expect(JSON.parse(result.escapes.stdout).error).toBe(
      "remote resources are disabled: https://example.com/escapes.png",
    );
  });
});
