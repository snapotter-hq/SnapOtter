"""Fail-closed gate for runtime model downloads.

SnapOtter must never fetch models from the network on its own: models arrive
through user-initiated feature bundle installs (install_feature.py). Every AI
script calls ensure_download_allowed() immediately before any code path that
would download a model at runtime, so a missing file surfaces as an
actionable error instead of silent third-party egress.

Setting SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1 opts back in to runtime downloads.
"""
import os


def downloads_allowed():
    """True when the operator explicitly permits runtime model downloads."""
    return os.environ.get("SNAPOTTER_ALLOW_MODEL_DOWNLOAD") == "1"


def ensure_download_allowed(what):
    """Raise a clear, actionable error unless runtime downloads are enabled."""
    if downloads_allowed():
        return
    raise RuntimeError(
        f"{what} is missing and automatic downloads are disabled. "
        "Reinstall the feature bundle from Settings, or set "
        "SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1 to permit downloads."
    )


def link_bundled_weight(link_path, target_path):
    """Best-effort: make link_path resolve to an installed bundle file.

    gfpgan and codeformer-pip hardcode weight paths relative to the process
    cwd, while the feature bundles install those weights under MODELS_PATH.
    Symlinking the expected path to the bundled file lets the libraries find
    the weight without downloading. Returns True when link_path exists
    afterwards (already present, or successfully linked).
    """
    if os.path.exists(link_path):
        return True
    if not os.path.exists(target_path):
        return False
    try:
        parent = os.path.dirname(link_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        os.symlink(target_path, link_path)
    except OSError:
        return os.path.exists(link_path)
    return True


GFPGAN_HELPER_WEIGHTS = ("detection_Resnet50_Final.pth", "parsing_parsenet.pth")


def prepare_gfpgan_helper_weights(models_base):
    """Resolve GFPGAN's cwd-relative facexlib helper weights offline.

    gfpgan 1.3.x hardcodes FaceRestoreHelper(model_rootpath="gfpgan/weights"),
    a path relative to the process cwd, and facexlib downloads any file
    missing from it (GitHub release URLs). The feature bundles install those
    weights under <models>/gfpgan/facelib, so link them into the expected
    location and fail closed when they cannot be resolved locally.
    """
    for fname in GFPGAN_HELPER_WEIGHTS:
        link = os.path.join("gfpgan", "weights", fname)
        target = os.path.join(models_base, "gfpgan", "facelib", fname)
        if not link_bundled_weight(link, target):
            ensure_download_allowed(f"GFPGAN helper weight {fname}")


def prepare_codeformer_weights(models_base):
    """Resolve codeformer-pip's cwd-relative weights offline.

    codeformer-pip 0.0.4 downloads four weights into a cwd-relative
    CodeFormer/weights/ tree at import time of codeformer.app. Three of them
    ship in the feature bundles; RealESRGAN_x2plus.pth (a background-upscale
    helper this app never invokes) is not bundled, so a host that has never
    downloaded it fails closed unless downloads are explicitly enabled.
    """
    expected = {
        os.path.join("CodeFormer", "weights", "CodeFormer", "codeformer.pth"): os.path.join(
            models_base, "codeformer", "codeformer.pth"
        ),
        os.path.join("CodeFormer", "weights", "facelib", "detection_Resnet50_Final.pth"): os.path.join(
            models_base, "gfpgan", "facelib", "detection_Resnet50_Final.pth"
        ),
        os.path.join("CodeFormer", "weights", "facelib", "parsing_parsenet.pth"): os.path.join(
            models_base, "gfpgan", "facelib", "parsing_parsenet.pth"
        ),
    }
    for link, target in expected.items():
        if not link_bundled_weight(link, target):
            ensure_download_allowed(f"CodeFormer weight {os.path.basename(link)}")

    x2plus = os.path.join("CodeFormer", "weights", "realesrgan", "RealESRGAN_x2plus.pth")
    if not os.path.exists(x2plus):
        ensure_download_allowed("CodeFormer helper weight RealESRGAN_x2plus.pth")
