"""Gate runtime model downloads behind an explicit opt-in.

Models normally arrive through user-initiated feature bundle installs
(install_feature.py), and the resolvers in the AI scripts always prefer those
bundled files. If a model is missing, the runtime fails closed instead of
fetching mutable content. Operators may explicitly opt into public model
fallback downloads with SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1.
"""
import contextlib
import os


def downloads_allowed():
    """Return True only when runtime downloads are explicitly enabled.

    Unknown values remain fail-closed to avoid enabling network access through
    a typo or an inherited environment setting.
    """
    return os.environ.get("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "0").lower() in ("1", "true")


def ensure_download_allowed(what):
    """Raise a clear, actionable error when runtime downloads are disabled."""
    if downloads_allowed():
        return
    raise RuntimeError(
        f"{what} is missing and automatic downloads are disabled. Reinstall "
        "the feature bundle from Settings, or explicitly set "
        "SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1 to permit runtime downloads."
    )


def library_workdir_path():
    """Absolute path of the writable cwd the face libraries run in."""
    return os.path.abspath(os.path.join(os.environ.get("DATA_DIR", "/data"), "ai", "lib-cwd"))


@contextlib.contextmanager
def library_workdir():
    """Run gfpgan / codeformer-pip with a writable cwd under the data dir.

    Both libraries resolve weights, and codeformer-pip writes output/out.png,
    relative to the process cwd. The sidecar inherits the API's cwd
    (/app/apps/api in the image), which is read-only when the container runs
    with a read-only root filesystem, so linking the bundled weights there
    fails with EROFS (#4710). The previous cwd is restored on exit.
    """
    workdir = library_workdir_path()
    os.makedirs(workdir, exist_ok=True)
    previous = os.getcwd()
    os.chdir(workdir)
    try:
        yield workdir
    finally:
        os.chdir(previous)


def link_bundled_weight(link_path, target_path):
    """Make link_path resolve to an installed bundle file.

    gfpgan and codeformer-pip hardcode weight paths relative to the process
    cwd, while the feature bundles install those weights under MODELS_PATH.
    Symlinking the expected path to the bundled file lets the libraries find
    the weight without downloading. Returns True when link_path resolves
    afterwards, False when neither it nor the bundled target exists. A symlink
    that dangles or points somewhere else is replaced, so a moved models dir
    can't leave a stale link that blocks relinking. Raises RuntimeError with
    the underlying OSError when the bundled file exists but can't be linked,
    because reporting that as a missing weight sends people to reinstall a
    bundle that is already there.
    """
    if os.path.islink(link_path):
        if os.path.exists(link_path) and (
            not os.path.exists(target_path) or os.path.samefile(link_path, target_path)
        ):
            return True
    elif os.path.exists(link_path):
        return True
    if not os.path.exists(target_path):
        return False
    target_path = os.path.abspath(target_path)
    staging = f"{link_path}.{os.getpid()}.tmp"
    try:
        parent = os.path.dirname(link_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        if os.path.lexists(staging):
            os.unlink(staging)
        os.symlink(target_path, staging)
        os.replace(staging, link_path)
    except OSError as err:
        with contextlib.suppress(OSError):
            os.unlink(staging)
        raise RuntimeError(
            f"Could not link bundled weight {target_path} to "
            f"{os.path.abspath(link_path)}: {err}"
        ) from err
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
