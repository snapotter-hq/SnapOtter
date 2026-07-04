"""Text extraction from images using Tesseract, PaddleOCR PP-OCRv5, or PaddleOCR-VL 1.5."""
import sys
import json
import os

# Prevent PaddlePaddle C++ runtime from probing for CUDA on CPU-only systems.
# Without these, paddlepaddle-gpu can segfault during import on machines without
# a GPU, because the C++ layer attempts GPU initialization before Python-level
# device routing takes effect.  Must run before any PaddleOCR import.
from gpu import gpu_available
if not gpu_available():
    if not os.environ.get("FLAGS_use_cuda"):
        os.environ["FLAGS_use_cuda"] = "0"
    if not os.environ.get("FLAGS_use_cudnn"):
        os.environ["FLAGS_use_cudnn"] = "0"

# Lazy-loaded VLM instance (stays resident in dispatcher process)
_paddleocr_vl_instance = None


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# OCR quality tiers backed by PaddleOCR. PaddleOCR ships as the GPU build
# (paddlepaddle-gpu) in the amd64 bundle; its native libs dlopen libcuda.so.1 at
# import and segfault on a CPU-only host, so these tiers need a usable GPU.
PADDLE_QUALITY_TIERS = ("balanced", "best")


def effective_quality(requested):
    """Return the OCR quality tier that can actually run on this host.

    On a CPU-only host the PaddleOCR tiers (balanced/best) cannot load, so they
    transparently fall back to "fast" (Tesseract), which runs on CPU. This keeps a
    GPU-less host from importing paddlepaddle-gpu, whose import segfaults and wedges
    the shared AI dispatcher.
    """
    if requested in PADDLE_QUALITY_TIERS and not gpu_available():
        return "fast"
    return requested


TESSERACT_LANG_MAP = {
    "en": "eng", "de": "deu", "fr": "fra", "es": "spa",
    "zh": "chi_sim", "ja": "jpn", "ko": "kor",
}

PADDLE_LANG_MAP = {
    "en": "en", "de": "latin", "fr": "latin", "es": "latin",
    "zh": "ch", "ja": "japan", "ko": "korean",
}

# Bundled PaddleOCR models (shipped by the OCR feature bundle into MODELS_PATH).
# Pinning the constructor at these dirs keeps OCR fully offline / air-gapped and
# skips slow HuggingFace model resolution on first use. PP-OCRv5 server rec
# covers Chinese+English; latin covers en/de/fr/es; plus a dedicated Korean rec.
PADDLE_DET_MODEL = "PP-OCRv5_server_det"
PADDLE_TEXTLINE_MODEL = "PP-LCNet_x1_0_textline_ori"
PADDLE_REC_MODEL = {
    "ch": "PP-OCRv5_server_rec",
    "en": "latin_PP-OCRv5_mobile_rec",
    "latin": "latin_PP-OCRv5_mobile_rec",
    "korean": "korean_PP-OCRv5_mobile_rec",
}


def _bundled_paddle_kwargs(paddle_lang):
    """Build PaddleOCR kwargs that use the bundled models in MODELS_PATH.

    Only pins a component when its model is actually present on disk, so a
    partial bundle (or an unbundled language such as Japanese) falls back to
    PaddleOCR's default resolution for that component. The doc-orientation and
    doc-unwarping models are not bundled and not needed for plain OCR, so they
    are disabled to avoid a runtime HuggingFace download.
    """
    models_dir = os.environ.get("MODELS_PATH", "/data/ai/models")

    def model_dir(name):
        if not name:
            return None
        path = os.path.join(models_dir, name)
        return path if os.path.isdir(path) else None

    kwargs = {"use_doc_orientation_classify": False, "use_doc_unwarping": False}

    det = model_dir(PADDLE_DET_MODEL)
    if det:
        kwargs["text_detection_model_name"] = PADDLE_DET_MODEL
        kwargs["text_detection_model_dir"] = det

    rec_name = PADDLE_REC_MODEL.get(paddle_lang)
    rec = model_dir(rec_name)
    if rec:
        kwargs["text_recognition_model_name"] = rec_name
        kwargs["text_recognition_model_dir"] = rec

    textline = model_dir(PADDLE_TEXTLINE_MODEL)
    if textline:
        kwargs["textline_orientation_model_name"] = PADDLE_TEXTLINE_MODEL
        kwargs["textline_orientation_model_dir"] = textline
        kwargs["use_textline_orientation"] = True
    else:
        kwargs["use_textline_orientation"] = False

    return kwargs


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
    # GPU-only: paddlepaddle-gpu segfaults at import on a CPU-only host (libcuda
    # absent). Refuse before importing so the caller falls back to Tesseract.
    if not gpu_available():
        raise ImportError(
            "PaddleOCR (paddlepaddle-gpu) requires a GPU; the amd64 bundle ships the "
            "GPU build, which cannot load on a CPU-only host. Use quality=fast (Tesseract)."
        )
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    try:
        import logging
        from paddleocr import PaddleOCR

        # Suppress PaddleOCR internal logging (replaces removed show_log param)
        for name in ("ppocr", "paddleocr", "paddle"):
            logging.getLogger(name).setLevel(logging.ERROR)

        paddle_lang = PADDLE_LANG_MAP.get(language, "en")
        device = "gpu:0" if gpu_available() else "cpu"

        emit_progress(20, "Loading")
        mk = _bundled_paddle_kwargs(paddle_lang)
        # When a bundled recognizer is pinned, the model selects the script, so
        # we omit lang (this is the proven fully-offline path). Lang-based
        # resolution for a language without a bundled recognizer (e.g. ja) and
        # a missing detection model both make PaddleOCR fetch models over the
        # network, which strict offline mode blocks with a clear error.
        if "text_recognition_model_dir" not in mk:
            from offline_guard import ensure_download_allowed
            ensure_download_allowed(f"PaddleOCR recognition model for language '{language}'")
            mk["lang"] = paddle_lang
        if "text_detection_model_dir" not in mk:
            from offline_guard import ensure_download_allowed
            ensure_download_allowed(f"PaddleOCR text detection model ({PADDLE_DET_MODEL})")
        ocr = PaddleOCR(
            device=device,
            ocr_version="PP-OCRv5",
            enable_mkldnn=False,
            **mk,
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
    # GPU-only: see run_paddleocr_v5. Refuse before importing paddle on CPU.
    if not gpu_available():
        raise ImportError(
            "PaddleOCR-VL (paddlepaddle-gpu) requires a GPU; the amd64 bundle ships the "
            "GPU build, which cannot load on a CPU-only host. Use quality=balanced or fast."
        )
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    try:
        if _paddleocr_vl_instance is None:
            emit_progress(15, "Loading model")
            from paddleocr import PaddleOCRVL

            device = "gpu" if gpu_available() else "cpu"
            _paddleocr_vl_instance = PaddleOCRVL(device=device)

        emit_progress(30, "Scanning")
        output = _paddleocr_vl_instance.predict(input_path)
        emit_progress(70, "Extracting text")

        text_parts = []
        for res in output:
            # PaddleOCR-VL 1.5+: markdown_texts holds the extracted text
            if hasattr(res, "markdown") and isinstance(res.markdown, dict):
                md_text = res.markdown.get("markdown_texts", "")
                if md_text:
                    text_parts.append(md_text)
                    continue
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

    # On a CPU-only host, downgrade GPU-only tiers (PaddleOCR) to Tesseract so we
    # never import paddlepaddle-gpu, whose import segfaults and wedges the dispatcher.
    downgraded = effective_quality(quality)
    if downgraded != quality:
        print(
            json.dumps({"info": f"{quality} OCR needs a GPU; using {downgraded} (Tesseract) on CPU"}),
            file=sys.stderr,
            flush=True,
        )
        quality = downgraded

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

        engine_used = quality

        # Route to engine based on quality tier
        if quality == "fast":
            try:
                text = run_tesseract(input_path, language, is_auto=was_auto)
                engine_used = "tesseract"
            except FileNotFoundError:
                print(json.dumps({"success": False, "error": "Tesseract is not installed"}))
                sys.exit(1)

        elif quality == "balanced":
            try:
                text = run_paddleocr_v5(input_path, language)
                engine_used = "paddleocr-v5"
            except ImportError as e:
                print(json.dumps({
                    "success": False,
                    "error": (
                        f"PaddleOCR is not installed: {e}. "
                        "Install the OCR feature or use quality=fast for Tesseract."
                    ),
                }))
                sys.exit(1)
            except Exception as e:
                print(json.dumps({
                    "success": False,
                    "error": (
                        f"PaddleOCR PP-OCRv5 failed: {type(e).__name__}: {e}. "
                        "Install the OCR feature or use quality=fast for Tesseract."
                    ),
                }))
                sys.exit(1)

        elif quality == "best":
            try:
                text = run_paddleocr_vl(input_path)
                engine_used = "paddleocr-vl"
            except ImportError as e:
                print(json.dumps({
                    "success": False,
                    "error": (
                        f"PaddleOCR-VL is not available: {e}. "
                        "Install the OCR feature or use quality=balanced for PP-OCRv5."
                    ),
                }))
                sys.exit(1)
            except Exception as e:
                print(json.dumps({
                    "success": False,
                    "error": (
                        f"PaddleOCR-VL failed: {type(e).__name__}: {e}. "
                        "Install the OCR feature or use quality=balanced for PP-OCRv5."
                    ),
                }))
                sys.exit(1)

        else:
            print(json.dumps({"success": False, "error": f"Unknown quality: {quality}"}))
            sys.exit(1)

        emit_progress(95, "Done")
        print(json.dumps({"success": True, "text": text, "engine": engine_used}))

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
