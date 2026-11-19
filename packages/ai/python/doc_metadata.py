"""Read or write PDF document metadata via pikepdf docinfo.
Args: {"path": in, "mode": "get"} -> {"metadata": {...}}
      {"path": in, "out": o, "mode": "set", "metadata": {"Title": "..", ...}} -> {"ok": true}
      {"path": in, "out": o, "mode": "strip", "metadata": {...}?}
        -> {"ok": true, "removed": [keys], "xmpRemoved": bool, "pdfa": "2B" | null}
Settable keys: Title, Author, Subject, Keywords, Creator, Producer.
Strip drops the whole Info dictionary and the catalog XMP stream, then writes
any given metadata onto the clean document. Per-page metadata streams and
embedded files are left alone."""
import json
import sys

ALLOWED_KEYS = {"Title", "Author", "Subject", "Keywords", "Creator", "Producer"}


def apply_metadata(pdf, meta):
    for key, value in meta.items():
        if key not in ALLOWED_KEYS:
            continue
        if value is None or value == "":
            if f"/{key}" in pdf.docinfo:
                del pdf.docinfo[f"/{key}"]
        else:
            pdf.docinfo[f"/{key}"] = str(value)[:500]


def strip_metadata(pdf):
    """Remove the Info dictionary and catalog XMP. Returns (removed keys, xmp removed, PDF/A level)."""
    info = pdf.trailer.get("/Info")
    removed = [str(k).lstrip("/") for k in info.keys()] if info is not None else []
    if info is not None:
        del pdf.trailer.Info
    xmp_removed = "/Metadata" in pdf.Root
    pdfa = None
    if xmp_removed:
        try:
            # Read-only: entering open_metadata() would write the packet back.
            pdfa = pdf.open_metadata().pdfa_status or None
        except Exception as exc:  # noqa: BLE001
            # Unreadable XMP is still removed; only the PDF/A report is lost.
            print(f"[doc_metadata] could not read PDF/A status: {exc}", file=sys.stderr)
            pdfa = None
        del pdf.Root.Metadata
    return removed, xmp_removed, pdfa


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path, mode = args.get("path"), args.get("mode", "get")
    if not path:
        print(json.dumps({"error": "missing path"}))
        sys.exit(1)
    try:
        import pikepdf
    except ImportError:
        print(json.dumps({"error": "pikepdf not installed"}))
        sys.exit(1)
    try:
        if mode == "get":
            with pikepdf.open(path) as pdf:
                info = {}
                if pdf.docinfo is not None:
                    for k, v in pdf.docinfo.items():
                        info[str(k).lstrip("/")] = str(v)
                print(json.dumps({"metadata": info}))
            return
        out = args.get("out")
        meta = args.get("metadata") or {}
        if not out or not isinstance(meta, dict):
            print(json.dumps({"error": f"missing out/metadata for {mode}"}))
            sys.exit(1)
        if mode == "strip":
            with pikepdf.open(path) as pdf:
                removed, xmp_removed, pdfa = strip_metadata(pdf)
                apply_metadata(pdf, meta)
                # fix_metadata_version would recreate an XMP packet to record the version.
                pdf.save(out, fix_metadata_version=False)
            print(json.dumps({"ok": True, "removed": removed, "xmpRemoved": xmp_removed, "pdfa": pdfa}))
            return
        with pikepdf.open(path) as pdf:
            apply_metadata(pdf, meta)
            pdf.save(out)
        print(json.dumps({"ok": True}))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc).strip() or type(exc).__name__}))
        sys.exit(1)


if __name__ == "__main__":
    main()
