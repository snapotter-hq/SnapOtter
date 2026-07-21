"""Extract plain text. Args: {"path": in, "out": out-txt-path}. Prints {"chars": N, "hasText": bool}."""
import json
import sys


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path, out = args.get("path"), args.get("out")
    if not path or not out:
        print(json.dumps({"error": "missing path/out"}))
        sys.exit(1)
    try:
        import fitz
    except ImportError:
        print(json.dumps({"error": "PyMuPDF not installed"}))
        sys.exit(1)
    try:
        doc = fitz.open(path)
        parts = [page.get_text() for page in doc]
        doc.close()
        text = "\n".join(parts)
        # hasText distinguishes a PDF with a real text layer from a scanned or
        # image-only PDF, where every page returns "" and only the join newlines
        # remain. len(text) alone can't tell them apart, so the caller uses this
        # to offer OCR instead of handing back an empty file (#589).
        has_text = any(part.strip() for part in parts)
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(json.dumps({"chars": len(text), "hasText": has_text}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
