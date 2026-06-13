"""OCR text extraction from PDF documents.

Rasterizes each page via PyMuPDF (fitz) and runs the same OCR engine
pipeline as ocr.py (tesseract / PaddleOCR PP-OCRv5 / PaddleOCR-VL).

Contract: argv[1] = pdf path, argv[2] = options JSON {"quality","language","pages"}.
Output: {"success": true, "engine": ..., "pages": n, "text": ...} to stdout.
Errors: {"error": ...} to stdout, exit 1.

Engine functions are imported from sibling ocr.py (the dispatcher adds the
scripts directory to sys.path, and `import ocr` loads ocr.py as a module
without triggering its __main__ guard).
"""
import sys
import json
import os
import tempfile


MAX_PAGES = 50


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def parse_page_spec(spec, total_pages):
    """Parse a page spec like 'all', '1-3,5', '2,4-6' into a sorted list of 0-based indices.

    Returns (pages, error) where error is a string if the spec is invalid.
    """
    if spec.strip().lower() == "all":
        return list(range(total_pages)), None

    pages = set()
    parts = spec.split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            bounds = part.split("-", 1)
            try:
                start = int(bounds[0].strip())
                end = int(bounds[1].strip())
            except ValueError:
                return None, f"Invalid page range: {part}"
            if start < 1 or end < 1:
                return None, f"Invalid page range: {part} (pages start at 1)"
            if start > end:
                return None, f"Invalid page range: {part} (start > end)"
            if end > total_pages:
                return None, f"Invalid page range: {part} (document has {total_pages} pages)"
            for i in range(start, end + 1):
                pages.add(i - 1)  # 0-based
        else:
            try:
                num = int(part)
            except ValueError:
                return None, f"Invalid page number: {part}"
            if num < 1:
                return None, f"Invalid page number: {num} (pages start at 1)"
            if num > total_pages:
                return None, f"Invalid page number: {num} (document has {total_pages} pages)"
            pages.add(num - 1)  # 0-based

    if not pages:
        return None, "No pages specified"

    return sorted(pages), None


def main():
    input_path = sys.argv[1]
    settings = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    quality = settings.get("quality", "balanced")
    language = settings.get("language", "auto")
    pages_spec = settings.get("pages", "all")

    try:
        emit_progress(2, "Opening PDF")

        # Lazy import: fitz (PyMuPDF) is in the base venv but keep it lazy
        # so py_compile succeeds without it.
        import fitz

        doc = fitz.open(input_path)
        total_pages = len(doc)

        if total_pages == 0:
            print(json.dumps({"error": "PDF has no pages"}))
            sys.exit(1)

        # Parse page specification
        page_indices, parse_error = parse_page_spec(pages_spec, total_pages)
        if parse_error:
            print(json.dumps({"error": parse_error}))
            sys.exit(1)

        if len(page_indices) > MAX_PAGES:
            print(json.dumps({"error": f"Too many pages for OCR (max {MAX_PAGES})"}))
            sys.exit(1)

        emit_progress(5, "Preparing")

        # Import engine functions from sibling ocr.py.
        # The dispatcher's scripts directory is on sys.path, so this import
        # loads ocr.py as a module (its __main__ guard prevents re-execution).
        import ocr as ocr_module

        # Language auto-detection on the first page's raster
        was_auto = language == "auto"

        # Create a temp directory for scratch PNGs next to the input
        scratch_dir = tempfile.mkdtemp(
            prefix="ocr_pdf_",
            dir=os.path.dirname(input_path) or tempfile.gettempdir(),
        )

        page_texts = []
        engine_used = quality
        num_pages = len(page_indices)

        for i, page_idx in enumerate(page_indices):
            page_num = page_idx + 1  # 1-based for display
            pct = 5 + int((i / num_pages) * 85)
            emit_progress(pct, f"Page {page_num}/{total_pages}")

            # Rasterize page to PNG at 200 DPI
            page = doc[page_idx]
            pix = page.get_pixmap(dpi=200)
            png_path = os.path.join(scratch_dir, f"page_{page_idx}.png")
            pix.save(png_path)

            # Auto-detect language on the first page only
            current_lang = language
            if was_auto and i == 0:
                current_lang = ocr_module.auto_detect_language(png_path)
                language = current_lang  # reuse for remaining pages
            elif was_auto:
                current_lang = language  # already detected

            # Run OCR engine based on quality tier
            if quality == "fast":
                text = ocr_module.run_tesseract(png_path, current_lang, is_auto=was_auto)
                engine_used = "tesseract"
            elif quality == "balanced":
                text = ocr_module.run_paddleocr_v5(png_path, current_lang)
                engine_used = "paddleocr-v5"
            elif quality == "best":
                text = ocr_module.run_paddleocr_vl(png_path)
                engine_used = "paddleocr-vl"
            else:
                print(json.dumps({"error": f"Unknown quality: {quality}"}))
                sys.exit(1)

            page_texts.append((page_num, text))

            # Clean up scratch PNG immediately
            try:
                os.remove(png_path)
            except OSError:
                pass

        # Clean up scratch directory
        try:
            os.rmdir(scratch_dir)
        except OSError:
            pass

        doc.close()

        # Join page texts with page headers
        parts = []
        for page_num, text in page_texts:
            parts.append(f"\n\n--- Page {page_num} ---\n\n{text}")

        # Strip leading newlines from the first page
        full_text = "".join(parts).strip()

        emit_progress(95, "Done")
        print(json.dumps({
            "success": True,
            "engine": engine_used,
            "pages": num_pages,
            "text": full_text,
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
