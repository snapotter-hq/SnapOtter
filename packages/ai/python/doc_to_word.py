"""PDF to DOCX via pdf2docx (text PDFs; scanned PDFs produce poor output by
design: documented fidelity caveat). Args: {"path": in, "out": out}.
Prints {"ok": true}."""
import json
import sys


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path, out = args.get("path"), args.get("out")
    if not path or not out:
        print(json.dumps({"error": "missing path/out"}))
        sys.exit(1)
    try:
        from pdf2docx import Converter
        from pdf2docx_layout import install_pdf2docx_layout_fixes
    except ImportError:
        print(json.dumps({"error": "pdf2docx not installed"}))
        sys.exit(1)
    try:
        # PyMuPDF's message system writes to sys.stdout by default, and MuPDF
        # errors ("error: No common ancestor in structure tree") are routed
        # through it. This stdout is a one-JSON-line protocol; keep library
        # diagnostics on stderr (issue #843, Sentry NODE-5M).
        import pymupdf

        pymupdf.set_messages(stream=sys.stderr)
    except Exception:  # noqa: BLE001
        pass
    try:
        install_pdf2docx_layout_fixes()
        cv = Converter(path)
        try:
            cv.convert(out, max_border_width=2.0)
        finally:
            cv.close()
        print(json.dumps({"ok": True}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
