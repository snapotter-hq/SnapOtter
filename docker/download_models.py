"""Pre-download and verify all ML models for the Docker image.

This script runs at Docker build time. Any failure exits non-zero,
failing the build. No silent fallbacks.
"""
import os
import sys
import time
import urllib.error
import urllib.request

# Some servers (e.g. Berkeley) block the default Python-urllib User-Agent.
_opener = urllib.request.build_opener()
_opener.addheaders = [("User-Agent", "snapotter/1.0")]
urllib.request.install_opener(_opener)


def _urlretrieve(url: str, path: str, max_retries: int = 5) -> None:
    """Download url to path with exponential backoff on transient errors (5xx, timeout)."""
    for attempt in range(1, max_retries + 1):
        try:
            urllib.request.urlretrieve(url, path)
            return
        except urllib.error.HTTPError as e:
            if attempt == max_retries or e.code < 500:
                raise
            delay = 10 * (2 ** (attempt - 1))  # 10s, 20s, 40s, 80s
            print(f"  HTTP {e.code} on attempt {attempt}/{max_retries}, retrying in {delay}s...")
            time.sleep(delay)
        except (urllib.error.URLError, OSError) as e:
            if attempt == max_retries:
                raise
            delay = 10 * (2 ** (attempt - 1))
            print(f"  Network error on attempt {attempt}/{max_retries}: {e}, retrying in {delay}s...")
            time.sleep(delay)


def _hf_download(
    repo_id: str,
    filename: str,
    local_dir: str,
    min_size: int,
    label: str,
    repo_type: str = "model",
) -> str:
    """Download a file from HuggingFace Hub with built-in retry and CDN routing.

    Uses hf_hub_download which handles retries, resumable downloads, and respects
    the HF_ENDPOINT env var for mirror support. repo_type can be "model" or "space".
    """
    from huggingface_hub import hf_hub_download

    print(f"  Downloading {label} from HuggingFace ({repo_id}/{filename})...")
    path = hf_hub_download(
        repo_id=repo_id, filename=filename, local_dir=local_dir, repo_type=repo_type
    )
    # hf_hub_download may place the file in a cache subdir; normalise to local_dir/filename
    dest = os.path.join(local_dir, filename)
    if path != dest and os.path.exists(path):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        os.rename(path, dest)
    size = os.path.getsize(dest)
    assert size > min_size, f"{label} too small: {size} bytes (expected > {min_size})"
    print(f"  {label} ready ({size / 1_000_000:.1f} MB)")
    return dest

# Force CPU mode during build - no GPU driver available at build time.
# Must be set before any ML library import.
os.environ["PADDLE_DEVICE"] = "cpu"
os.environ["FLAGS_use_cuda"] = "0"
os.environ["CUDA_VISIBLE_DEVICES"] = ""

# Prevent ONNX Runtime from loading the CUDA Execution Provider at build time.
# The cudnn-runtime base image includes cuDNN, which makes ONNX try to init
# the CUDA EP.  Without a GPU driver (only available at container runtime),
# this segfaults.  Temporarily renaming the provider .so is the most reliable
# way to prevent this — env vars alone are not enough.
def _hide_cuda_provider():
    """Rename ONNX CUDA provider .so to prevent load at build time."""
    try:
        import onnxruntime as _ort
        ep_dir = os.path.join(os.path.dirname(_ort.__file__), "capi")
        for name in ("libonnxruntime_providers_cuda.so", "libonnxruntime_providers_tensorrt.so"):
            src = os.path.join(ep_dir, name)
            if os.path.exists(src):
                os.rename(src, src + ".build_hide")
    except ImportError:
        pass

def _restore_cuda_provider():
    """Restore hidden ONNX CUDA provider .so after build-time downloads."""
    try:
        import onnxruntime as _ort
        ep_dir = os.path.join(os.path.dirname(_ort.__file__), "capi")
        for name in ("libonnxruntime_providers_cuda.so", "libonnxruntime_providers_tensorrt.so"):
            bak = os.path.join(ep_dir, name + ".build_hide")
            if os.path.exists(bak):
                os.rename(bak, os.path.join(ep_dir, name))
    except ImportError:
        pass

_hide_cuda_provider()

LAMA_MODEL_DIR = "/opt/models/lama"
LAMA_MODEL_URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"
LAMA_MODEL_PATH = os.path.join(LAMA_MODEL_DIR, "lama_fp32.onnx")
LAMA_MIN_SIZE = 100_000_000  # ~200 MB

REALESRGAN_MODEL_DIR = "/opt/models/realesrgan"
REALESRGAN_MODEL_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
)
REALESRGAN_MODEL_PATH = os.path.join(REALESRGAN_MODEL_DIR, "RealESRGAN_x4plus.pth")
REALESRGAN_MIN_SIZE = 60_000_000  # ~67 MB

GFPGAN_MODEL_DIR = "/opt/models/gfpgan"
GFPGAN_MODEL_URL = (
    "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.3.pth"
)
GFPGAN_MODEL_PATH = os.path.join(GFPGAN_MODEL_DIR, "GFPGANv1.3.pth")
GFPGAN_MIN_SIZE = 300_000_000  # ~332 MB

CODEFORMER_MODEL_DIR = "/opt/models/codeformer"
CODEFORMER_MODEL_URL = (
    "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth"
)
CODEFORMER_MODEL_PATH = os.path.join(CODEFORMER_MODEL_DIR, "codeformer.pth")
CODEFORMER_MIN_SIZE = 350_000_000  # ~375 MB

DDCOLOR_MODEL_DIR = "/opt/models/ddcolor"
DDCOLOR_MODEL_URL = (
    "https://huggingface.co/piddnad/DDColor-models/resolve/main/ddcolor_paper_tiny.pth"
)
DDCOLOR_ONNX_PATH = os.path.join(DDCOLOR_MODEL_DIR, "ddcolor.onnx")
DDCOLOR_MIN_SIZE = 50_000_000  # ~220 MB ONNX

SCUNET_MODEL_DIR = "/opt/models/scunet"
SCUNET_MODEL_URL = (
    "https://github.com/cszn/KAIR/releases/download/v1.0/scunet_color_real_psnr.pth"
)
SCUNET_MODEL_PATH = os.path.join(SCUNET_MODEL_DIR, "scunet_color_real_psnr.pth")
SCUNET_MIN_SIZE = 3_000_000  # ~4 MB

CODEFORMER_MODEL_DIR = "/opt/models/codeformer"
CODEFORMER_ONNX_PATH = os.path.join(CODEFORMER_MODEL_DIR, "codeformer.onnx")
CODEFORMER_MIN_SIZE = 100_000_000  # ~377 MB

NAFNET_MODEL_DIR = "/opt/models/nafnet"
NAFNET_MODEL_URL = (
    "https://huggingface.co/mikestealth/nafnet-models/resolve/main/"
    "NAFNet-SIDD-width64.pth"
)
NAFNET_MODEL_PATH = os.path.join(NAFNET_MODEL_DIR, "NAFNet-SIDD-width64.pth")
NAFNET_MIN_SIZE = 60_000_000  # ~67 MB

MEDIAPIPE_MODEL_DIR = "/opt/models/mediapipe"
FACE_DETECT_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
FACE_DETECT_MODEL_PATH = os.path.join(MEDIAPIPE_MODEL_DIR, "blaze_face_short_range.tflite")
FACE_DETECT_MIN_SIZE = 100_000  # ~200 KB
FACE_LANDMARKER_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
FACE_LANDMARKER_MODEL_PATH = os.path.join(MEDIAPIPE_MODEL_DIR, "face_landmarker.task")
FACE_LANDMARKER_MIN_SIZE = 1_000_000  # ~7 MB

FACEXLIB_MODEL_DIR = "/opt/models/gfpgan/facelib"
FACEXLIB_DET_URL = "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth"
FACEXLIB_DET_PATH = os.path.join(FACEXLIB_MODEL_DIR, "detection_Resnet50_Final.pth")
FACEXLIB_DET_MIN_SIZE = 100_000_000  # ~104 MB
FACEXLIB_PARSE_URL = "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth"
FACEXLIB_PARSE_PATH = os.path.join(FACEXLIB_MODEL_DIR, "parsing_parsenet.pth")
FACEXLIB_PARSE_MIN_SIZE = 80_000_000  # ~85 MB

OPENCV_COLORIZE_DIR = "/opt/models/colorize-opencv"
OPENCV_PROTO_URL = "https://raw.githubusercontent.com/richzhang/colorization/caffe/colorization/models/colorization_deploy_v2.prototxt"
OPENCV_PROTO_PATH = os.path.join(OPENCV_COLORIZE_DIR, "colorization_deploy_v2.prototxt")
OPENCV_CAFFE_URL = "https://huggingface.co/spaces/BilalSardar/Black-N-White-To-Color/resolve/main/colorization_release_v2.caffemodel"
OPENCV_CAFFE_PATH = os.path.join(OPENCV_COLORIZE_DIR, "colorization_release_v2.caffemodel")
OPENCV_CAFFE_MIN_SIZE = 100_000_000  # ~129 MB
OPENCV_POINTS_URL = "https://raw.githubusercontent.com/richzhang/colorization/caffe/colorization/resources/pts_in_hull.npy"
OPENCV_POINTS_PATH = os.path.join(OPENCV_COLORIZE_DIR, "pts_in_hull.npy")

REMBG_MODELS = [
    "u2net",
    "isnet-general-use",
    "bria-rmbg",
    "birefnet-general-lite",
    "birefnet-portrait",
    "birefnet-general",
    "birefnet-matting",
]

# PaddleOCR PP-OCRv5 HuggingFace model repos to pre-download.
# These are the models used by PaddleOCR(ocr_version="PP-OCRv5").
# Downloaded via huggingface_hub to avoid initializing the PaddlePaddle
# inference engine, which segfaults under QEMU emulation at build time.
PADDLEOCR_MODELS = [
    "PaddlePaddle/PP-OCRv5_server_det",
    "PaddlePaddle/PP-OCRv5_server_rec",
    "PaddlePaddle/PP-OCRv5_mobile_det",
    "PaddlePaddle/PP-OCRv5_mobile_rec",
    "PaddlePaddle/latin_PP-OCRv5_mobile_rec",
    "PaddlePaddle/korean_PP-OCRv5_mobile_rec",
    "PaddlePaddle/PP-LCNet_x1_0_textline_ori",
]

PADDLEOCR_VL_MODEL = "PaddlePaddle/PaddleOCR-VL-1.5"

# PaddleX stores models here by default
PADDLEX_MODEL_DIR = "/opt/models/paddlex/official_models"


def _register_birefnet_matting():
    """Register BiRefNet-matting ONNX session for Ultra quality mode."""
    import os
    import pooch
    from rembg.sessions import sessions_class
    from rembg.sessions.birefnet_general import BiRefNetSessionGeneral

    class BiRefNetMattingSession(BiRefNetSessionGeneral):
        @classmethod
        def download_models(cls, *args, **kwargs):
            fname = f"{cls.name(*args, **kwargs)}.onnx"
            pooch.retrieve(
                "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-matting-epoch_100.onnx",
                None,  # Skip checksum for GitHub release assets
                fname=fname,
                path=cls.u2net_home(*args, **kwargs),
                progressbar=True,
            )
            return os.path.join(cls.u2net_home(*args, **kwargs), fname)

        @classmethod
        def name(cls, *args, **kwargs):
            return "birefnet-matting"

    sessions_class.append(BiRefNetMattingSession)


def download_rembg_models():
    """Download all rembg ONNX models."""
    print("=== Downloading rembg models ===")
    from rembg import new_session

    _register_birefnet_matting()

    for model in REMBG_MODELS:
        print(f"  Downloading {model}...")
        new_session(model)
        print(f"  {model} ready")
    print(f"All {len(REMBG_MODELS)} rembg models downloaded.\n")


def download_lama_model():
    """Download LaMa ONNX inpainting model from HuggingFace Hub."""
    print("=== Downloading LaMa ONNX model ===")
    os.makedirs(LAMA_MODEL_DIR, exist_ok=True)
    _hf_download("Carve/LaMa-ONNX", "lama_fp32.onnx", LAMA_MODEL_DIR, LAMA_MIN_SIZE, "LaMa ONNX")
    print()


def download_realesrgan_model():
    """Download RealESRGAN_x4plus.pth pretrained weights."""
    print("=== Downloading RealESRGAN model ===")
    os.makedirs(REALESRGAN_MODEL_DIR, exist_ok=True)
    print(f"  Downloading from {REALESRGAN_MODEL_URL}...")
    _urlretrieve(REALESRGAN_MODEL_URL, REALESRGAN_MODEL_PATH)

    size = os.path.getsize(REALESRGAN_MODEL_PATH)
    assert size > REALESRGAN_MIN_SIZE, (
        f"RealESRGAN model too small: {size} bytes (expected > {REALESRGAN_MIN_SIZE})"
    )
    print(f"  RealESRGAN_x4plus.pth downloaded ({size / 1_000_000:.1f} MB)\n")


def download_gfpgan_model():
    """Download GFPGANv1.3.pth pretrained weights for face enhancement."""
    print("=== Downloading GFPGAN model ===")
    os.makedirs(GFPGAN_MODEL_DIR, exist_ok=True)
    print(f"  Downloading from {GFPGAN_MODEL_URL}...")
    _urlretrieve(GFPGAN_MODEL_URL, GFPGAN_MODEL_PATH)

    size = os.path.getsize(GFPGAN_MODEL_PATH)
    assert size > GFPGAN_MIN_SIZE, (
        f"GFPGAN model too small: {size} bytes (expected > {GFPGAN_MIN_SIZE})"
    )
    print(f"  GFPGANv1.3.pth downloaded ({size / 1_000_000:.1f} MB)\n")


def download_codeformer_model():
    """Download codeformer.pth pretrained weights for face enhancement."""
    print("=== Downloading CodeFormer model ===")
    os.makedirs(CODEFORMER_MODEL_DIR, exist_ok=True)
    print(f"  Downloading from {CODEFORMER_MODEL_URL}...")
    _urlretrieve(CODEFORMER_MODEL_URL, CODEFORMER_MODEL_PATH)

    size = os.path.getsize(CODEFORMER_MODEL_PATH)
    assert size > CODEFORMER_MIN_SIZE, (
        f"CodeFormer model too small: {size} bytes (expected > {CODEFORMER_MIN_SIZE})"
    )
    print(f"  codeformer.pth downloaded ({size / 1_000_000:.1f} MB)\n")


def download_ddcolor_model():
    """Download pre-exported DDColor ONNX model for AI photo colorization.

    Uses the pre-converted ONNX model from HuggingFace (facefusion repo)
    for direct inference via onnxruntime without needing PyTorch.
    """
    print("=== Downloading DDColor ONNX model ===")
    os.makedirs(DDCOLOR_MODEL_DIR, exist_ok=True)

    from huggingface_hub import hf_hub_download

    print("  Downloading DDColor ONNX from HuggingFace...")
    downloaded_path = hf_hub_download(
        repo_id="facefusion/models-3.0.0",
        filename="ddcolor.onnx",
        local_dir=DDCOLOR_MODEL_DIR,
    )

    # huggingface_hub downloads to local_dir/filename
    actual_path = os.path.join(DDCOLOR_MODEL_DIR, "ddcolor.onnx")
    if not os.path.exists(actual_path) and os.path.exists(downloaded_path):
        os.rename(downloaded_path, actual_path)

    size = os.path.getsize(actual_path)
    assert size > DDCOLOR_MIN_SIZE, (
        f"DDColor model too small: {size} bytes (expected > {DDCOLOR_MIN_SIZE})"
    )
    print(f"  DDColor ONNX model ready ({size / 1_000_000:.1f} MB)\n")



def download_codeformer_onnx_model():
    """Download CodeFormer ONNX model for AI face restoration.

    Uses the pre-converted ONNX model from HuggingFace (facefusion repo)
    for direct inference via onnxruntime without needing PyTorch.
    """
    print("=== Downloading CodeFormer ONNX model ===")
    os.makedirs(CODEFORMER_MODEL_DIR, exist_ok=True)

    from huggingface_hub import hf_hub_download

    print("  Downloading CodeFormer ONNX from HuggingFace...")
    downloaded_path = hf_hub_download(
        repo_id="facefusion/models-3.0.0",
        filename="codeformer.onnx",
        local_dir=CODEFORMER_MODEL_DIR,
    )

    actual_path = os.path.join(CODEFORMER_MODEL_DIR, "codeformer.onnx")
    if not os.path.exists(actual_path) and os.path.exists(downloaded_path):
        os.rename(downloaded_path, actual_path)

    size = os.path.getsize(actual_path)
    assert size > CODEFORMER_MIN_SIZE, (
        f"CodeFormer model too small: {size} bytes (expected > {CODEFORMER_MIN_SIZE})"
    )
    print(f"  CodeFormer ONNX model ready ({size / 1_000_000:.1f} MB)\n")


def download_paddleocr_models():
    """Pre-download PaddleOCR PP-OCRv5 model weights from HuggingFace.

    Uses huggingface_hub.snapshot_download() to fetch model files directly
    into the PaddleX cache directory. This avoids initializing PaddlePaddle's
    C++ inference engine, which segfaults under QEMU emulation (arm64 host
    building amd64 image).
    """
    print("=== Downloading PaddleOCR PP-OCRv5 models ===")
    from huggingface_hub import snapshot_download

    os.makedirs(PADDLEX_MODEL_DIR, exist_ok=True)

    for repo_id in PADDLEOCR_MODELS:
        model_name = repo_id.split("/", 1)[1]
        local_dir = os.path.join(PADDLEX_MODEL_DIR, model_name)
        print(f"  Downloading {model_name}...")
        snapshot_download(repo_id=repo_id, local_dir=local_dir)
        print(f"  {model_name} ready")
    print(f"All {len(PADDLEOCR_MODELS)} PaddleOCR PP-OCRv5 models downloaded.\n")


def download_paddleocr_vl_model():
    """Pre-download PaddleOCR-VL 1.5 model weights from HuggingFace."""
    print("=== Downloading PaddleOCR-VL 1.5 model ===")
    from huggingface_hub import snapshot_download

    model_name = PADDLEOCR_VL_MODEL.split("/", 1)[1]
    local_dir = os.path.join(PADDLEX_MODEL_DIR, model_name)
    print(f"  Downloading {model_name} (~1.93 GB)...")
    snapshot_download(repo_id=PADDLEOCR_VL_MODEL, local_dir=local_dir)
    print(f"  {model_name} ready\n")


def download_scunet_model():
    """Download SCUNet real-noise denoising model."""
    print(f"Downloading SCUNet model to {SCUNET_MODEL_PATH}...")
    os.makedirs(SCUNET_MODEL_DIR, exist_ok=True)
    _urlretrieve(SCUNET_MODEL_URL, SCUNET_MODEL_PATH)
    size = os.path.getsize(SCUNET_MODEL_PATH)
    assert size > SCUNET_MIN_SIZE, (
        f"SCUNet model too small: {size} bytes (expected >{SCUNET_MIN_SIZE})"
    )
    print(f"  SCUNet model downloaded: {size:,} bytes")


def download_nafnet_model():
    """Download NAFNet SIDD width-64 denoising model from HuggingFace Hub."""
    print("=== Downloading NAFNet model ===")
    os.makedirs(NAFNET_MODEL_DIR, exist_ok=True)
    _hf_download(
        "mikestealth/nafnet-models",
        "NAFNet-SIDD-width64.pth",
        NAFNET_MODEL_DIR,
        NAFNET_MIN_SIZE,
        "NAFNet",
    )


def download_facexlib_models():
    """Download face detection and parsing models used by GFPGAN and CodeFormer.

    These are auxiliary models from facexlib that GFPGAN/CodeFormer download
    on first use via basicsr. Pre-downloading prevents runtime network access.
    """
    print("=== Downloading facexlib auxiliary models ===")
    os.makedirs(FACEXLIB_MODEL_DIR, exist_ok=True)

    print(f"  Downloading detection_Resnet50_Final.pth...")
    _urlretrieve(FACEXLIB_DET_URL, FACEXLIB_DET_PATH)
    size = os.path.getsize(FACEXLIB_DET_PATH)
    assert size > FACEXLIB_DET_MIN_SIZE, (
        f"Face detection model too small: {size} bytes (expected > {FACEXLIB_DET_MIN_SIZE})"
    )
    print(f"  detection_Resnet50_Final.pth downloaded ({size / 1_000_000:.1f} MB)")

    print(f"  Downloading parsing_parsenet.pth...")
    _urlretrieve(FACEXLIB_PARSE_URL, FACEXLIB_PARSE_PATH)
    size = os.path.getsize(FACEXLIB_PARSE_PATH)
    assert size > FACEXLIB_PARSE_MIN_SIZE, (
        f"Face parsing model too small: {size} bytes (expected > {FACEXLIB_PARSE_MIN_SIZE})"
    )
    print(f"  parsing_parsenet.pth downloaded ({size / 1_000_000:.1f} MB)\n")


def download_opencv_colorize_models():
    """Download OpenCV DNN colorization models (Zhang et al.).

    Three files needed for the lightweight OpenCV colorizer fallback.
    """
    print("=== Downloading OpenCV colorization models ===")
    os.makedirs(OPENCV_COLORIZE_DIR, exist_ok=True)

    # Prototxt and cluster-centres file are from GitHub raw content
    for url, path, name in [
        (OPENCV_PROTO_URL, OPENCV_PROTO_PATH, "colorization_deploy_v2.prototxt"),
        (OPENCV_POINTS_URL, OPENCV_POINTS_PATH, "pts_in_hull.npy"),
    ]:
        print(f"  Downloading {name}...")
        _urlretrieve(url, path)
        size = os.path.getsize(path)
        print(f"  {name} downloaded ({size / 1_000_000:.1f} MB)")

    # Caffemodel lives in a HuggingFace space — use hf_hub_download for reliability
    _hf_download(
        "BilalSardar/Black-N-White-To-Color",
        "colorization_release_v2.caffemodel",
        OPENCV_COLORIZE_DIR,
        OPENCV_CAFFE_MIN_SIZE,
        "OpenCV caffemodel",
        repo_type="space",
    )
    print("OpenCV colorization models downloaded.\n")


def download_mediapipe_task_models():
    """Download MediaPipe tasks API model files for face detection and landmarks.

    These models are used by the mp.tasks fallback when mp.solutions is
    unavailable (mediapipe >= 0.10.30). Pre-downloading ensures the Docker
    image works fully airgapped.
    """
    print("=== Downloading MediaPipe task models ===")
    os.makedirs(MEDIAPIPE_MODEL_DIR, exist_ok=True)

    for url, path, name, min_size in [
        (FACE_DETECT_MODEL_URL, FACE_DETECT_MODEL_PATH,
         "blaze_face_short_range", FACE_DETECT_MIN_SIZE),
        (FACE_LANDMARKER_MODEL_URL, FACE_LANDMARKER_MODEL_PATH,
         "face_landmarker", FACE_LANDMARKER_MIN_SIZE),
    ]:
        print(f"  Downloading {name}...")
        _urlretrieve(url, path)
        size = os.path.getsize(path)
        assert size > min_size, (
            f"{name} model too small: {size} bytes (expected > {min_size})"
        )
        print(f"  {name} downloaded ({size / 1_000_000:.1f} MB)")
    print("MediaPipe task models downloaded.\n")


def verify_mediapipe():
    """Verify MediaPipe face detection models are bundled in the wheel."""
    print("=== Verifying MediaPipe models ===")
    import mediapipe as mp

    try:
        for selection in [0, 1]:
            label = "short-range" if selection == 0 else "full-range"
            print(f"  Verifying {label} model (selection={selection})...")
            detector = mp.solutions.face_detection.FaceDetection(
                model_selection=selection, min_detection_confidence=0.5
            )
            detector.close()
            print(f"  {label} model OK")
    except AttributeError:
        # mediapipe >= 0.10.30 removed mp.solutions; verify tasks API instead
        print("  mp.solutions unavailable, verifying mp.tasks API...")
        options = mp.tasks.vision.FaceDetectorOptions(
            base_options=mp.tasks.BaseOptions(
                model_asset_path=FACE_DETECT_MODEL_PATH
            ),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            min_detection_confidence=0.5,
        )
        detector = mp.tasks.vision.FaceDetector.create_from_options(options)
        detector.close()
        print("  mp.tasks FaceDetector OK")

    print("MediaPipe models verified.\n")


def smoke_test():
    """Final verification that all ML libraries and models are loadable.

    GPU-dependent libraries (paddlepaddle-gpu, torch CUDA) cannot be imported
    at build time because the CUDA driver is only available at runtime. We verify
    CPU-only imports and check that model files exist on disk.
    """
    print("=== Running smoke test ===")

    # CPU-only imports that work on all platforms at build time
    from PIL import Image
    import cv2
    import numpy
    from rembg import new_session
    print("  CPU imports OK (Pillow, cv2, numpy, rembg)")

    # MediaPipe is CPU-only, should always import
    import mediapipe as mp
    print("  MediaPipe import OK")

    # LaMa model file must exist
    assert os.path.exists(LAMA_MODEL_PATH), (
        f"LaMa model missing: {LAMA_MODEL_PATH}"
    )
    assert os.path.getsize(LAMA_MODEL_PATH) > LAMA_MIN_SIZE, (
        "LaMa model file is too small"
    )
    print("  LaMa ONNX model file verified")

    # RealESRGAN model file must exist
    assert os.path.exists(REALESRGAN_MODEL_PATH), (
        f"RealESRGAN model missing: {REALESRGAN_MODEL_PATH}"
    )
    assert os.path.getsize(REALESRGAN_MODEL_PATH) > REALESRGAN_MIN_SIZE, (
        "RealESRGAN model file is too small"
    )
    print("  RealESRGAN model file verified")

    # GFPGAN model file must exist
    assert os.path.exists(GFPGAN_MODEL_PATH), (
        f"GFPGAN model missing: {GFPGAN_MODEL_PATH}"
    )
    assert os.path.getsize(GFPGAN_MODEL_PATH) > GFPGAN_MIN_SIZE, (
        "GFPGAN model file is too small"
    )
    print("  GFPGAN model file verified")

    # CodeFormer model file must exist
    assert os.path.exists(CODEFORMER_MODEL_PATH), (
        f"CodeFormer model missing: {CODEFORMER_MODEL_PATH}"
    )
    assert os.path.getsize(CODEFORMER_MODEL_PATH) > CODEFORMER_MIN_SIZE, (
        "CodeFormer model file is too small"
    )
    print("  CodeFormer model file verified")

    # DDColor ONNX model must exist
    assert os.path.exists(DDCOLOR_ONNX_PATH), (
        f"DDColor model missing: {DDCOLOR_ONNX_PATH}"
    )
    assert os.path.getsize(DDCOLOR_ONNX_PATH) > DDCOLOR_MIN_SIZE, (
        "DDColor model file is too small"
    )
    print("  DDColor ONNX model file verified")

    # CodeFormer ONNX model must exist
    assert os.path.exists(CODEFORMER_ONNX_PATH), (
        f"CodeFormer model missing: {CODEFORMER_ONNX_PATH}"
    )
    assert os.path.getsize(CODEFORMER_ONNX_PATH) > CODEFORMER_MIN_SIZE, (
        "CodeFormer model file is too small"
    )
    print("  CodeFormer ONNX model file verified")

    # SCUNet model file must exist
    assert os.path.exists(SCUNET_MODEL_PATH), f"SCUNet model not found: {SCUNET_MODEL_PATH}"
    assert os.path.getsize(SCUNET_MODEL_PATH) > SCUNET_MIN_SIZE
    print("  SCUNet model file verified")

    # NAFNet model file must exist
    assert os.path.exists(NAFNET_MODEL_PATH), f"NAFNet model not found: {NAFNET_MODEL_PATH}"
    assert os.path.getsize(NAFNET_MODEL_PATH) > NAFNET_MIN_SIZE
    print("  NAFNet model file verified")

    # PaddleOCR model directories must exist
    for repo_id in PADDLEOCR_MODELS:
        model_name = repo_id.split("/", 1)[1]
        model_dir = os.path.join(PADDLEX_MODEL_DIR, model_name)
        assert os.path.isdir(model_dir), f"PaddleOCR model missing: {model_dir}"
    print(f"  PaddleOCR models verified ({len(PADDLEOCR_MODELS)} models)")

    # PaddleOCR-VL model directory must exist
    vl_name = PADDLEOCR_VL_MODEL.split("/", 1)[1]
    vl_dir = os.path.join(PADDLEX_MODEL_DIR, vl_name)
    assert os.path.isdir(vl_dir), f"PaddleOCR-VL model missing: {vl_dir}"
    print("  PaddleOCR-VL model verified")

    # MediaPipe task models must exist (for mp.tasks fallback)
    assert os.path.exists(FACE_DETECT_MODEL_PATH), (
        f"MediaPipe face detector model missing: {FACE_DETECT_MODEL_PATH}"
    )
    assert os.path.getsize(FACE_DETECT_MODEL_PATH) > FACE_DETECT_MIN_SIZE
    print("  MediaPipe face detector model verified")

    assert os.path.exists(FACE_LANDMARKER_MODEL_PATH), (
        f"MediaPipe face landmarker model missing: {FACE_LANDMARKER_MODEL_PATH}"
    )
    assert os.path.getsize(FACE_LANDMARKER_MODEL_PATH) > FACE_LANDMARKER_MIN_SIZE
    print("  MediaPipe face landmarker model verified")

    # Facexlib auxiliary models must exist (for GFPGAN/CodeFormer)
    assert os.path.exists(FACEXLIB_DET_PATH), (
        f"Facexlib detection model missing: {FACEXLIB_DET_PATH}"
    )
    assert os.path.getsize(FACEXLIB_DET_PATH) > FACEXLIB_DET_MIN_SIZE
    assert os.path.exists(FACEXLIB_PARSE_PATH), (
        f"Facexlib parsing model missing: {FACEXLIB_PARSE_PATH}"
    )
    assert os.path.getsize(FACEXLIB_PARSE_PATH) > FACEXLIB_PARSE_MIN_SIZE
    print("  Facexlib auxiliary models verified")

    # OpenCV colorization models must exist
    assert os.path.exists(OPENCV_PROTO_PATH), (
        f"OpenCV colorize prototxt missing: {OPENCV_PROTO_PATH}"
    )
    assert os.path.exists(OPENCV_CAFFE_PATH), (
        f"OpenCV colorize caffemodel missing: {OPENCV_CAFFE_PATH}"
    )
    assert os.path.getsize(OPENCV_CAFFE_PATH) > OPENCV_CAFFE_MIN_SIZE
    assert os.path.exists(OPENCV_POINTS_PATH), (
        f"OpenCV colorize points missing: {OPENCV_POINTS_PATH}"
    )
    print("  OpenCV colorization models verified")

    print("Smoke test passed.\n")


def main():
    import concurrent.futures
    import threading

    print("Pre-downloading all ML models (parallel)...\n")
    print_lock = threading.Lock()

    # All download functions are independent (separate dirs, separate CDNs).
    # Run them in parallel to cut download time from ~30 min to ~5-10 min.
    download_fns = [
        download_lama_model,
        download_rembg_models,
        download_realesrgan_model,
        download_gfpgan_model,
        download_codeformer_model,
        download_ddcolor_model,
        download_codeformer_onnx_model,
        download_paddleocr_models,
        download_paddleocr_vl_model,
        download_scunet_model,
        download_nafnet_model,
        download_facexlib_models,
        download_opencv_colorize_models,
        download_mediapipe_task_models,
    ]

    # 6 workers balances parallelism with CDN rate limits
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        future_to_name = {
            pool.submit(fn): fn.__name__ for fn in download_fns
        }
        for future in concurrent.futures.as_completed(future_to_name):
            name = future_to_name[future]
            try:
                future.result()
            except Exception as e:
                errors.append((name, e))
                print(f"\n*** {name} FAILED: {e}\n")

    if errors:
        print(f"\n{len(errors)} download(s) failed:")
        for name, e in errors:
            print(f"  {name}: {e}")
        sys.exit(1)

    print("\nAll downloads complete. Running verification...\n")
    verify_mediapipe()
    smoke_test()
    _restore_cuda_provider()
    print("All models downloaded and verified.")


if __name__ == "__main__":
    main()
