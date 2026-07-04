"""Set the PDF Producer/Creator to SnapOtter on generated documents.
Conversion engines stamp themselves (LibreOffice, Ghostscript, pdfcpu,
WeasyPrint, PDFKit); from the user's point of view SnapOtter produced the
file. Only runs for tools that GENERATE PDFs; pass-through edits keep the
user's original metadata untouched.
Args: {"path": in, "out": out}. Prints {"ok": true}."""
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
        if doc.needs_pass:
            # Encrypted output: pass it through untouched rather than
            # re-encrypting. `out` must always exist for the caller.
            doc.close()
            import shutil

            shutil.copyfile(path, out)
            print(json.dumps({"ok": True, "skipped": "encrypted"}))
            return
        meta = doc.metadata or {}
        meta["producer"] = "SnapOtter"
        meta["creator"] = "SnapOtter"
        doc.set_metadata(meta)
        # XMP often carries the engine's own pdf:Producer; DocInfo is the
        # canonical source for these files, so drop the stale copy.
        doc.del_xml_metadata()
        doc.save(out)
        doc.close()
        print(json.dumps({"ok": True}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
