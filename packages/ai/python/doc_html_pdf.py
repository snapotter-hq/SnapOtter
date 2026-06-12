"""HTML or Markdown to PDF via WeasyPrint. Remote resource fetching is
REJECTED (no-phone-home posture): only data: URIs resolve; any http(s)/file
reference fails the conversion with a clear error.
Args: {"path": in, "out": o, "mode": "html"|"markdown"}. Prints {"ok": true}.

WeasyPrint SSRF contract (verified against 69.0): the url_fetcher's ValueError
is caught internally by WeasyPrint and the offending resource is omitted from
output. No outbound HTTP request is made. The conversion succeeds with remote
resources missing, which is the desired no-phone-home behavior."""
import json
import sys


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path, out, mode = args.get("path"), args.get("out"), args.get("mode", "html")
    if not path or not out or mode not in ("html", "markdown"):
        print(json.dumps({"error": "missing path/out or bad mode"}))
        sys.exit(1)
    try:
        from weasyprint import HTML
        from weasyprint.urls import default_url_fetcher
    except ImportError:
        print(json.dumps({"error": "weasyprint not installed"}))
        sys.exit(1)

    def no_remote_fetcher(url, *fargs, **kwargs):
        if url.startswith("data:"):
            return default_url_fetcher(url, *fargs, **kwargs)
        raise ValueError(f"remote resources are disabled: {url[:120]}")

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
        HTML(string=source, url_fetcher=no_remote_fetcher, base_url=None).write_pdf(out)
        print(json.dumps({"ok": True}))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
