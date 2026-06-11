"""Page count via pikepdf. Args: {"path": "/abs/file.pdf"}. Prints {"pages": N}."""
import json
import sys


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path = args.get("path")
    if not path:
        print(json.dumps({"error": "missing path"}))
        sys.exit(1)
    try:
        import pikepdf
    except ImportError:
        print(json.dumps({"error": "pikepdf not installed"}))
        sys.exit(1)
    try:
        with pikepdf.open(path) as pdf:
            print(json.dumps({"pages": len(pdf.pages)}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
