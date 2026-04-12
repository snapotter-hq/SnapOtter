"""Text extraction from images using Tesseract, PaddleOCR PP-OCRv5, or PaddleOCR-VL 1.5."""
import sys
import json
import os

# Lazy-loaded VLM instance (stays resident in dispatcher process)
_paddleocr_vl_instance = None


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


TESSERACT_LANG_MAP = {
    "en": "eng", "de": "deu", "fr": "fra", "es": "spa",
    "zh": "chi_sim", "ja": "jpn", "ko": "kor",
}

PADDLE_LANG_MAP = {
    "en": "en", "de": "latin", "fr": "latin", "es": "latin",
    "zh": "ch", "ja": "japan", "ko": "korean",
}


def auto_detect_language(input_path):
    """Detect the predominant script in the image using Tesseract multi-lang.

    Runs a quick Tesseract pass with all installed language packs,
    then analyzes the Unicode character ranges in the output to
    determine which PaddleOCR language model to use.
    """
    import subprocess

    try:
        result = subprocess.run(
            ["tesseract", input_path, "stdout", "-l", "eng+kor+chi_sim+jpn"],
            capture_output=True, text=True, timeout=30,
        )
        text = result.stdout.strip()
        if not text:
            return "en"

        hangul = sum(1 for c in text if "\uAC00" <= c <= "\uD7AF" or "\u1100" <= c <= "\u11FF")
        cjk = sum(1 for c in text if "\u4E00" <= c <= "\u9FFF")
        hiragana = sum(1 for c in text if "\u3040" <= c <= "\u309F")
        katakana = sum(1 for c in text if "\u30A0" <= c <= "\u30FF")
        latin = sum(1 for c in text if c.isascii() and c.isalpha())

        total = hangul + cjk + hiragana + katakana + latin
        if total == 0:
            return "en"

        if hangul / total > 0.3:
            return "ko"
        if (hiragana + katakana) / total > 0.2:
            return "ja"
        if cjk / total > 0.3:
            return "zh"
        return "en"
    except Exception:
        return "en"


def run_tesseract(input_path, language, is_auto=False):
    """Run Tesseract OCR (Fast tier)."""
    import subprocess

    # When auto-detected, use all installed language packs for best coverage
    if is_auto:
        tess_lang = "eng+kor+chi_sim+jpn+deu+fra+spa"
    else:
        tess_lang = TESSERACT_LANG_MAP.get(language, "eng")

    emit_progress(30, "Scanning")
    result = subprocess.run(
        ["tesseract", input_path, "stdout", "-l", tess_lang],
        capture_output=True,
        text=True,
        timeout=120,
    )
    emit_progress(70, "Extracting text")
    text = result.stdout.strip()
    if result.returncode != 0 and not text:
        raise RuntimeError(result.stderr.strip() or "Tesseract failed")
    return text


def _extract_ocr_texts(results):
    """Extract text from PaddleOCR 3.x result objects.

    Handles multiple result formats across PaddleOCR versions:
    - 3.4.x: OCRResult with .json["res"]["rec_texts"]
    - Earlier: result objects with .res dict containing "text" list
    """
    text_parts = []
    for res in results:
        # PaddleOCR 3.4.x format: OCRResult with .json dict
        if hasattr(res, "json") and isinstance(res.json, dict):
            inner = res.json.get("res", {})
            rec_texts = inner.get("rec_texts", [])
            if rec_texts:
                text_parts.extend(rec_texts)
                continue
        # Older format: .res dict with "text" list
        if hasattr(res, "res") and isinstance(res.res, dict):
            text_parts.extend(res.res.get("text", []))
    return "\n".join(text_parts)


def run_paddleocr_v5(input_path, language):
    """Run PaddleOCR PP-OCRv5 server models (Balanced tier)."""
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    try:
        import logging
        from paddleocr import PaddleOCR
        from gpu import gpu_available

        # Suppress PaddleOCR internal logging (replaces removed show_log param)
        for name in ("ppocr", "paddleocr", "paddle"):
            logging.getLogger(name).setLevel(logging.ERROR)

        paddle_lang = PADDLE_LANG_MAP.get(language, "en")
        device = "gpu:0" if gpu_available() else "cpu"

        emit_progress(20, "Loading")
        ocr = PaddleOCR(
            lang=paddle_lang,
            device=device,
            ocr_version="PP-OCRv5",
        )
        emit_progress(30, "Scanning")
        results = ocr.predict(input=input_path)
        emit_progress(70, "Extracting text")

        text = _extract_ocr_texts(results)
    finally:
        os.dup2(stdout_fd, 1)
        os.close(stdout_fd)

    return text


def run_paddleocr_vl(input_path):
    """Run PaddleOCR-VL 1.5 vision-language model (Best tier).

    The VLM is lazy-loaded on first call and stays resident in the
    dispatcher process for subsequent requests.
    Requires PaddlePaddle >= 3.2 for fused_rms_norm_ext.
    """
    global _paddleocr_vl_instance
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    try:
        if _paddleocr_vl_instance is None:
            emit_progress(15, "Loading model")
            from paddleocr import PaddleOCRVL
            from gpu import gpu_available

            device = "gpu" if gpu_available() else "cpu"
            _paddleocr_vl_instance = PaddleOCRVL(device=device)

        emit_progress(30, "Scanning")
        output = _paddleocr_vl_instance.predict(input_path)
        emit_progress(70, "Extracting text")

        text_parts = []
        for res in output:
            if hasattr(res, "parsing_res_list"):
                for block in res.parsing_res_list:
                    content = block.get("block_content", "")
                    if content:
                        text_parts.append(content)
            elif hasattr(res, "rec_text"):
                text_parts.append(res.rec_text)
            # Also try the json-based extraction as fallback
            elif hasattr(res, "json") and isinstance(res.json, dict):
                inner = res.json.get("res", {})
                rec_texts = inner.get("rec_texts", [])
                text_parts.extend(rec_texts)

        text = "\n".join(text_parts)
    finally:
        os.dup2(stdout_fd, 1)
        os.close(stdout_fd)

    return text


def main():
    input_path = sys.argv[1]
    settings = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    quality = settings.get("quality", None)
    language = settings.get("language", "auto")
    enhance = settings.get("enhance", True)

    # Backward compat: old "engine" param maps to quality
    if quality is None:
        engine = settings.get("engine", "tesseract")
        quality = "fast" if engine == "tesseract" else "balanced"

    preprocessed_path = None
    try:
        emit_progress(5, "Preparing")

        # Preprocessing (if enabled)
        if enhance:
            emit_progress(8, "Enhancing image")
            try:
                from ocr_preprocess import preprocess
                preprocessed_path = input_path + "_enhanced.png"
                preprocess(input_path, preprocessed_path)
                input_path = preprocessed_path
            except Exception as e:
                print(json.dumps({"warning": f"Enhancement skipped: {e}"}), file=sys.stderr, flush=True)
                preprocessed_path = None

        # Language auto-detection
        was_auto = language == "auto"
        if was_auto:
            emit_progress(10, "Detecting language")
            language = auto_detect_language(input_path)

        # Route to engine based on quality tier
        if quality == "fast":
            try:
                text = run_tesseract(input_path, language, is_auto=was_auto)
            except FileNotFoundError:
                print(json.dumps({"success": False, "error": "Tesseract is not installed"}))
                sys.exit(1)

        elif quality == "balanced":
            try:
                text = run_paddleocr_v5(input_path, language)
            except ImportError:
                print(json.dumps({"success": False, "error": "PaddleOCR is not installed"}))
                sys.exit(1)
            except Exception:
                emit_progress(25, "Falling back")
                try:
                    text = run_tesseract(input_path, language, is_auto=was_auto)
                except FileNotFoundError:
                    print(json.dumps({"success": False, "error": "OCR engines unavailable"}))
                    sys.exit(1)

        elif quality == "best":
            try:
                text = run_paddleocr_vl(input_path)
            except ImportError:
                emit_progress(20, "Falling back")
                try:
                    text = run_paddleocr_v5(input_path, language)
                except Exception:
                    text = run_tesseract(input_path, language, is_auto=was_auto)
            except Exception:
                emit_progress(20, "Falling back")
                try:
                    text = run_paddleocr_v5(input_path, language)
                except Exception:
                    text = run_tesseract(input_path, language, is_auto=was_auto)

        else:
            print(json.dumps({"success": False, "error": f"Unknown quality: {quality}"}))
            sys.exit(1)

        emit_progress(95, "Done")
        print(json.dumps({"success": True, "text": text}))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
    finally:
        # Clean up preprocessed temp file
        if preprocessed_path:
            try:
                os.remove(preprocessed_path)
            except OSError:
                pass


if __name__ == "__main__":
    main()
