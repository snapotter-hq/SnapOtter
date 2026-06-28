"""Stamp signature images onto a PDF and save a flattened copy.
Args: {"input": in, "output": out, "signatures": [paths], "placements": [
  {"sig": idx, "page": 0-based, "x": 0..1, "y": 0..1, "w": 0..1, "h": 0..1}
]}. Coordinates are page fractions, top-left origin. Each signature PNG is
already rotated; insert_image is always axis-aligned. Prints {"ok": true,
"placed": N}. insert_image draws into page content, so output is flattened."""
import json
import sys


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    path = args.get("input")
    out = args.get("output")
    signatures = args.get("signatures") or []
    placements = args.get("placements") or []
    if not path or not out or not isinstance(placements, list) or not placements:
        print(json.dumps({"error": "missing input/output/placements"}))
        sys.exit(1)
    try:
        import fitz
    except ImportError:
        print(json.dumps({"error": "PyMuPDF not installed"}))
        sys.exit(1)
    try:
        doc = fitz.open(path)
        page_count = doc.page_count
        for p in placements:
            page_no = p.get("page")
            sig_idx = p.get("sig")
            if not isinstance(page_no, int) or page_no < 0 or page_no >= page_count:
                print(json.dumps({"error": f"page index {page_no} out of range (0..{page_count - 1})"}))
                sys.exit(1)
            if not isinstance(sig_idx, int) or sig_idx < 0 or sig_idx >= len(signatures):
                print(json.dumps({"error": f"signature index {sig_idx} out of range"}))
                sys.exit(1)
            page = doc[page_no]
            r = page.rect  # rotation-aware; x0/y0 carry the CropBox origin
            x0, y0, w, h = r.x0, r.y0, r.width, r.height
            fx, fy, fw, fh = (float(p["x"]), float(p["y"]), float(p["w"]), float(p["h"]))
            rect = fitz.Rect(
                x0 + fx * w, y0 + fy * h, x0 + (fx + fw) * w, y0 + (fy + fh) * h
            )
            with open(signatures[sig_idx], "rb") as f:
                page.insert_image(rect, stream=f.read(), keep_proportion=False)
        doc.save(out, garbage=4, deflate=True)
        doc.close()
        print(json.dumps({"ok": True, "placed": len(placements)}))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
