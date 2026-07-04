"""Gate for runtime model downloads, with an optional strict offline mode.

Models normally arrive through user-initiated feature bundle installs
(install_feature.py), and the resolvers in the AI scripts always prefer those
bundled files. When a model is missing, scripts may fetch the public model
weights as a fallback so tools work out of the box; that fallback only ever
downloads public model files, never user data.

Setting SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0 enables strict offline mode for
airgapped or locked-down deployments: every script calls
ensure_download_allowed() immediately before any download fallback, so a
missing file then surfaces as an actionable error instead of an outbound
fetch.
"""
import os


def downloads_allowed():
    """True unless strict offline mode is explicitly enabled.

    Runtime model downloads are allowed by default; only an explicit
    SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0 (or "false") blocks them.
    """
    return os.environ.get("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "1").lower() not in ("0", "false")


def ensure_download_allowed(what):
    """Raise a clear, actionable error when strict offline mode blocks a fetch."""
    if downloads_allowed():
        return
    raise RuntimeError(
        f"{what} is missing and automatic downloads are disabled by "
        "SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0. Reinstall the feature bundle from "
        "Settings, or unset SNAPOTTER_ALLOW_MODEL_DOWNLOAD to permit downloads."
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
    location; when a weight cannot be resolved locally, strict offline mode
    errors instead of downloading.
    """
    for fname in GFPGAN_HELPER_WEIGHTS:
        link = os.path.join("gfpgan", "weights", fname)
        target = os.path.join(models_base, "gfpgan", "facelib", fname)
        if not link_bundled_weight(link, target):
            ensure_download_allowed(f"GFPGAN helper weight {fname}")


def prepare_codeformer_weights(models_base):
    """Resolve codeformer-pip's cwd-relative weights offline.

    codeformer-pip 0.0.4 downloads four weights into a cwd-relative
    CodeFormer/weights/ tree at import time of codeformer.app -- unconditionally,
    even though this app calls inference_app with background_enhance=False and so
    never uses the RealESRGAN background upsampler (RealESRGAN_x2plus.pth). All
    four ship in the upscale-enhance bundle and are linked here from models_base
    so the import never triggers a download; strict offline mode then works.
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
        os.path.join("CodeFormer", "weights", "realesrgan", "RealESRGAN_x2plus.pth"): os.path.join(
            models_base, "realesrgan", "RealESRGAN_x2plus.pth"
        ),
    }
    for link, target in expected.items():
        if not link_bundled_weight(link, target):
            ensure_download_allowed(f"CodeFormer weight {os.path.basename(link)}")
