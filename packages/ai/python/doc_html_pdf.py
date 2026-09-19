"""HTML or Markdown to PDF via WeasyPrint (no-phone-home posture).
Every resource WeasyPrint would dereference (images, stylesheets, fonts, SVG
<image>, <object> data) is routed through the fetcher _make_url_fetcher builds,
which serves data: URIs and refuses every other scheme. A refusal is not fatal:
WeasyPrint logs it and lays the page out without that resource, so a document
that links to or embeds remote content still converts, with zero outbound
requests (#1157).
Args: {"path": in, "out": o, "mode": "html"|"markdown"}. Prints {"ok": true}."""
import json
import sys


def _make_url_fetcher(default_fetcher):
    """Build the url_fetcher: serve data: URIs, refuse every other scheme.

    This is the single network chokepoint for the three tools that reach
    WeasyPrint. Scheme matching is case-sensitive, so an unrecognised spelling
    fails closed rather than open.

    main() passes the delegate in rather than this importing weasyprint itself,
    because WeasyPrint turns any exception a fetcher raises into an omitted
    resource. An ImportError in here would drop every data: image from the PDF
    and still report success; raised from main() it stops the job. That is not
    hypothetical: default_url_fetcher is deprecated in the pinned 69.0.
    """

    def fetch(url, *args, **kwargs):
        if url.startswith("data:"):
            return default_fetcher(url, *args, **kwargs)
        raise ValueError(f"remote resources are disabled: {url[:120]}")

    return fetch


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path, out, mode = args.get("path"), args.get("out"), args.get("mode", "html")
    if not path or not out or mode not in ("html", "markdown"):
        print(json.dumps({"error": "missing path/out or bad mode"}))
        sys.exit(1)
    try:
        from weasyprint import HTML
        from weasyprint.urls import default_url_fetcher
    except ImportError as exc:
        print(json.dumps({"error": f"weasyprint not usable: {exc}"}))
        sys.exit(1)

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            source = fh.read()
        if mode == "markdown":
            try:
                import markdown as md
            except ImportError:
                print(json.dumps({"error": "markdown not installed"}))
                sys.exit(1)
            body = md.markdown(source, extensions=["tables", "fenced_code"])
            source = (
                "<!doctype html><html><head><meta charset=\"utf-8\">"
                "<style>body{font-family:sans-serif;max-width:46em;margin:2em auto;}"
                "code,pre{background:#f4f4f4;}table,td,th{border:1px solid #999;border-collapse:collapse;padding:4px;}</style>"
                f"</head><body>{body}</body></html>"
            )
        fetcher = _make_url_fetcher(default_url_fetcher)
        HTML(string=source, url_fetcher=fetcher, base_url=None).write_pdf(out)
        print(json.dumps({"ok": True}))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        # str() is empty for an exception built with no args (MemoryError being
        # the one that matters here), and an empty message reads as success to
        # the falsy check in htmlToPdfPy. Never emit one.
        print(json.dumps({"error": str(exc) or type(exc).__name__}))
        sys.exit(1)


if __name__ == "__main__":
    main()
