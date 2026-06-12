"""Read or write PDF document metadata via pikepdf docinfo.
Args: {"path": in, "mode": "get"} -> {"metadata": {...}}
      {"path": in, "out": o, "mode": "set", "metadata": {"Title": "..", ...}} -> {"ok": true}
Settable keys: Title, Author, Subject, Keywords, Creator, Producer."""
import json
import sys

ALLOWED_KEYS = {"Title", "Author", "Subject", "Keywords", "Creator", "Producer"}


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
            print(json.dumps({"error": "missing out/metadata for set"}))
            sys.exit(1)
        with pikepdf.open(path) as pdf:
            for key, value in meta.items():
                if key not in ALLOWED_KEYS:
                    continue
                if value is None or value == "":
                    if f"/{key}" in pdf.docinfo:
                        del pdf.docinfo[f"/{key}"]
                else:
                    pdf.docinfo[f"/{key}"] = str(value)[:500]
            pdf.save(out)
        print(json.dumps({"ok": True}))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
