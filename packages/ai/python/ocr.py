"""Text extraction from images using Tesseract or PaddleOCR."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def run_tesseract(input_path, language):
    """Run Tesseract OCR."""
    import subprocess

    lang_map = {"en": "eng", "de": "deu", "fr": "fra", "es": "spa", "zh": "chi_sim", "ja": "jpn", "ko": "kor"}
    tess_lang = lang_map.get(language, "eng")

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
    return text, "tesseract"


def run_paddleocr(input_path, language):
    """Run PaddleOCR."""
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
    from paddleocr import PaddleOCR
    from gpu import gpu_available

    emit_progress(20, "Loading")
    ocr = PaddleOCR(lang=language, use_gpu=gpu_available())
    emit_progress(30, "Scanning")
    result = ocr.ocr(input_path)
    emit_progress(70, "Extracting text")
    text = "\n".join(
        [
            line[1][0]
            for res in result
            if res
            for line in res
            if line and line[1]
        ]
    )
    return text, "paddleocr"


def main():
    input_path = sys.argv[1]
    settings = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}

    engine = settings.get("engine", "tesseract")
    language = settings.get("language", "en")

    try:
        emit_progress(10, "Preparing")

        if engine == "paddleocr":
            try:
                text, used_engine = run_paddleocr(input_path, language)
            except ImportError:
                print(
                    json.dumps(
                        {
                            "success": False,
                            "error": "PaddleOCR is not installed",
                        }
                    )
                )
                sys.exit(1)
            except Exception:
                # PaddleOCR failed at runtime — fall back to Tesseract
                emit_progress(25, "Falling back")
                try:
                    text, used_engine = run_tesseract(input_path, language)
                except FileNotFoundError:
                    print(
                        json.dumps({"success": False, "error": "OCR engines unavailable"})
                    )
                    sys.exit(1)
        else:
            try:
                text, used_engine = run_tesseract(input_path, language)
            except FileNotFoundError:
                print(
                    json.dumps(
                        {
                            "success": False,
                            "error": "Tesseract is not installed",
                        }
                    )
                )
                sys.exit(1)

        emit_progress(95, "Done")
        print(json.dumps({"success": True, "text": text, "engine": used_engine}))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
