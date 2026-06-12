"""HTML or Markdown to PDF via WeasyPrint (no-phone-home posture).
Remote references (src/href/action/url()) are REJECTED before conversion
with a clear error listing up to 5 offending URLs. The url_fetcher remains
as a defense-in-depth backstop: it blocks any reference that slips past
the scan, raising ValueError so WeasyPrint omits the resource with zero
outbound requests.
Args: {"path": in, "out": o, "mode": "html"|"markdown"}. Prints {"ok": true}."""
import json
import re
import sys

_REMOTE_REF_RE = re.compile(
    r'(?:src|href|action)\s*=\s*["\']?\s*(https?:/{1,2}[^\s"\'>\)]{1,200})',
    re.IGNORECASE,
)
_REMOTE_CSS_URL_RE = re.compile(
    r'url\s*\(\s*["\']?\s*(https?:/{1,2}[^\s"\'>\)]{1,200})',
    re.IGNORECASE,
)


def _find_remote_refs(source):
    """Return up to 5 remote URLs found in HTML/CSS source."""
    refs = []
    for pattern in (_REMOTE_REF_RE, _REMOTE_CSS_URL_RE):
        for m in pattern.finditer(source):
            refs.append(m.group(1)[:120])
            if len(refs) >= 5:
                return refs
    return refs


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
        remote_refs = _find_remote_refs(source)
        if remote_refs:
            print(json.dumps({"error": f"remote resources are disabled: {', '.join(remote_refs)}"}))
            sys.exit(1)
        HTML(string=source, url_fetcher=no_remote_fetcher, base_url=None).write_pdf(out)
        print(json.dumps({"ok": True}))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
