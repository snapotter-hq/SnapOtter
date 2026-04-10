"""Pre-download and verify all ML models for the Docker image.

This script runs at Docker build time. Any failure exits non-zero,
failing the build. No silent fallbacks.
"""
import os
import sys
import urllib.request

# Force CPU mode during build - no GPU driver available at build time.
# Must be set before any ML library import.
os.environ["PADDLE_DEVICE"] = "cpu"
os.environ["FLAGS_use_cuda"] = "0"
os.environ["CUDA_VISIBLE_DEVICES"] = ""

REALESRGAN_MODEL_DIR = "/opt/models/realesrgan"
REALESRGAN_MODEL_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
)
REALESRGAN_MODEL_PATH = os.path.join(REALESRGAN_MODEL_DIR, "RealESRGAN_x4plus.pth")
REALESRGAN_MIN_SIZE = 60_000_000  # ~67 MB

REMBG_MODELS = [
    "u2net",
    "isnet-general-use",
    "bria-rmbg",
    "birefnet-general-lite",
    "birefnet-portrait",
    "birefnet-general",
]

# PaddleOCR language codes (not ISO). German/French/Spanish use "latin" model.
# Valid keys: ch, en, korean, japan, chinese_cht, ta, te, ka, latin, arabic, cyrillic, devanagari
PADDLEOCR_LANGUAGES = ["en", "ch", "japan", "korean", "latin"]


def download_rembg_models():
    """Download all rembg ONNX models."""
    print("=== Downloading rembg models ===")
    from rembg import new_session

    for model in REMBG_MODELS:
        print(f"  Downloading {model}...")
        new_session(model)
        print(f"  {model} ready")
    print(f"All {len(REMBG_MODELS)} rembg models downloaded.\n")


def download_realesrgan_model():
    """Download RealESRGAN_x4plus.pth pretrained weights."""
    print("=== Downloading RealESRGAN model ===")
    os.makedirs(REALESRGAN_MODEL_DIR, exist_ok=True)
    print(f"  Downloading from {REALESRGAN_MODEL_URL}...")
    urllib.request.urlretrieve(REALESRGAN_MODEL_URL, REALESRGAN_MODEL_PATH)

    size = os.path.getsize(REALESRGAN_MODEL_PATH)
    assert size > REALESRGAN_MIN_SIZE, (
        f"RealESRGAN model too small: {size} bytes (expected > {REALESRGAN_MIN_SIZE})"
    )
    print(f"  RealESRGAN_x4plus.pth downloaded ({size / 1_000_000:.1f} MB)\n")


def download_paddleocr_models():
    """Pre-download PaddleOCR models for all supported languages."""
    print("=== Downloading PaddleOCR models ===")
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
    # Force CPU mode during build - no GPU driver available at build time
    os.environ["PADDLE_DEVICE"] = "cpu"
    os.environ["FLAGS_use_cuda"] = "0"
    from paddleocr import PaddleOCR

    for lang in PADDLEOCR_LANGUAGES:
        print(f"  Downloading models for lang={lang}...")
        PaddleOCR(lang=lang, use_gpu=False, show_log=False)
        print(f"  {lang} ready")
    print(f"All {len(PADDLEOCR_LANGUAGES)} PaddleOCR languages downloaded.\n")


def verify_mediapipe():
    """Verify MediaPipe face detection models are bundled in the wheel."""
    print("=== Verifying MediaPipe models ===")
    import mediapipe as mp

    for selection in [0, 1]:
        label = "short-range" if selection == 0 else "full-range"
        print(f"  Verifying {label} model (selection={selection})...")
        detector = mp.solutions.face_detection.FaceDetection(
            model_selection=selection, min_detection_confidence=0.5
        )
        detector.close()
        print(f"  {label} model OK")
    print("MediaPipe models verified.\n")


def smoke_test():
    """Final verification that all ML libraries and models are loadable."""
    import platform

    print("=== Running smoke test ===")
    is_amd64 = platform.machine() in ("x86_64", "amd64")

    from rembg import new_session
    from paddleocr import PaddleOCR
    import mediapipe as mp
    import cv2
    import numpy
    from PIL import Image
    import seam_carving
    print("  Core imports OK")

    # RealESRGAN/basicsr has a known torchvision compat issue on arm64.
    # On amd64 we verify the full import chain; on arm64 we just check the model file.
    if is_amd64:
        from realesrgan import RealESRGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet
        print("  RealESRGAN imports OK (amd64)")
    else:
        print("  RealESRGAN import skipped (arm64 - Lanczos fallback used)")

    assert os.path.exists(REALESRGAN_MODEL_PATH), (
        f"RealESRGAN model missing: {REALESRGAN_MODEL_PATH}"
    )
    assert os.path.getsize(REALESRGAN_MODEL_PATH) > REALESRGAN_MIN_SIZE, (
        "RealESRGAN model file is too small"
    )

    print("  RealESRGAN model file verified")
    print("Smoke test passed.\n")


def main():
    print("Pre-downloading all ML models...\n")
    download_rembg_models()
    download_realesrgan_model()
    download_paddleocr_models()
    verify_mediapipe()
    smoke_test()
    print("All models downloaded and verified.")


if __name__ == "__main__":
    main()
