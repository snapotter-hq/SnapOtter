"""Image upscaling with Real-ESRGAN."""
import errno
import sys
import json
import os
import types

# basicsr imports torchvision.transforms.functional_tensor which was removed
# in torchvision >= 0.17. This shim must exist before basicsr is imported.
try:
    import torchvision.transforms.functional_tensor  # noqa: F401
except (ImportError, ModuleNotFoundError):
    try:
        import torchvision.transforms.functional as _F
        import torchvision.transforms

        _shim = types.ModuleType("torchvision.transforms.functional_tensor")
        for _attr in dir(_F):
            if not _attr.startswith("_"):
                setattr(_shim, _attr, getattr(_F, _attr))
        sys.modules["torchvision.transforms.functional_tensor"] = _shim
        torchvision.transforms.functional_tensor = _shim
    except ImportError:
        pass


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")

REALESRGAN_MODEL_PATH = os.environ.get(
    "REALESRGAN_MODEL_PATH",
    os.path.join(_MODELS_BASE, "realesrgan", "RealESRGAN_x4plus.pth"),
)

GFPGAN_MODEL_PATH = os.environ.get(
    "GFPGAN_MODEL_PATH",
    os.path.join(_MODELS_BASE, "gfpgan", "GFPGANv1.3.pth"),
)

GPU_TILE_SIZE = 512
CPU_TILE_SIZE = 256
FALLBACK_CPU_TILE_SIZE = 128
OOM_ERROR_PATTERNS = (
    "out of memory",
    "not enough memory",
    "can't allocate memory",
    "cannot allocate memory",
    "[errno 12]",
    "unable to allocate",
    "failed to allocate",
    "cudaerrormemoryallocation",
    "cublas_status_alloc_failed",
    "bad_alloc",
    "memoryerror",
)


def default_tile_size(use_gpu: bool) -> int:
    """Return the initial Real-ESRGAN tile size for the active device.

    CPU inference runs in fp32 (half=False), so starting at 256px quarters per-tile
    activation memory instead of waiting for a CUDA-style RuntimeError that never
    fires before the Linux OOM killer sends SIGKILL (#2513).
    """
    return GPU_TILE_SIZE if use_gpu else CPU_TILE_SIZE


def fallback_tile_size(current_tile: int) -> int:
    """Return a smaller tile size when an OOM error is caught."""
    return FALLBACK_CPU_TILE_SIZE if current_tile <= CPU_TILE_SIZE else CPU_TILE_SIZE


def is_oom_error(error: BaseException) -> bool:
    """Return True for CUDA or CPU memory allocation failures."""
    if isinstance(error, MemoryError):
        return True
    if isinstance(error, OSError) and error.errno == errno.ENOMEM:
        return True
    msg = str(error).lower()
    return any(pattern in msg for pattern in OOM_ERROR_PATTERNS)


def realesrgan_failure_message(error: BaseException) -> str:
    """Say what actually went wrong with Real-ESRGAN, and what to do about it.

    Telling someone to install what they already installed sends them in a
    circle (AI-20260726-002): on a venv where scipy was carrying two versions
    this path fired on an ImportError raised deep inside a package that had been
    present the whole time. A missing module or missing weights is the only
    shape that really means "not installed"; anything else is an install that is
    there and broken, which needs a reinstall rather than an install.
    """
    detail = str(error).strip() or type(error).__name__
    if is_oom_error(error):
        return (
            f"Real-ESRGAN ran out of memory: {detail}. "
            "Try a smaller image, lower scale factor, or use model=lanczos for basic upscaling."
        )
    missing = isinstance(error, (ModuleNotFoundError, FileNotFoundError))
    remedy = (
        "Install the upscale-enhance feature"
        if missing
        else (
            "The upscale-enhance libraries are present but did not load, which usually "
            "means a partial or conflicting install. Reinstall it from Settings > AI "
            "Features, or use Reset AI Environment if that does not help"
        )
    )
    return f"Real-ESRGAN is not available: {detail}. {remedy}, or use model=lanczos for basic upscaling."


def apply_denoise(img, strength):
    """Apply denoising to a PIL image. Uses OpenCV when available, falls back to PIL."""
    if strength <= 0:
        return img
    try:
        import numpy as np
        import cv2
        from PIL import Image

        arr = np.array(img)
        # Map 0-1 strength to filter parameter (3-15 range)
        h = int(3 + strength * 12)
        if len(arr.shape) == 3 and arr.shape[2] >= 3:
            denoised = cv2.fastNlMeansDenoisingColored(arr, None, h, h, 7, 21)
        else:
            denoised = cv2.fastNlMeansDenoising(arr, None, h, 7, 21)
        return Image.fromarray(denoised)
    except ImportError:
        from PIL import ImageFilter

        radius = max(0.5, strength * 1.5)
        return img.filter(ImageFilter.GaussianBlur(radius=radius))


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    scale = settings.get("scale", 2)
    model_choice = settings.get("model", "auto")
    face_enhance = settings.get("faceEnhance", False)
    denoise_strength = float(settings.get("denoise", 0))
    output_format = settings.get("format", "png")
    quality = int(settings.get("quality", 95))

    try:
        emit_progress(5, "Opening image")
        try:
            from PIL import Image
        except ImportError:
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": "Pillow is not installed. Install with: pip install Pillow",
                    }
                )
            )
            sys.exit(1)

        img = Image.open(input_path)
        new_size = (img.width * scale, img.height * scale)

        method = "lanczos"
        result = None

        # Try Real-ESRGAN if requested
        if model_choice in ("auto", "realesrgan"):
            try:
                emit_progress(10, "Loading AI model")

                # Redirect stdout to stderr for the ENTIRE AI pipeline.
                # Libraries like basicsr, realesrgan, gfpgan, and torch print
                # download progress and init messages to stdout which would
                # corrupt our JSON result.
                stdout_fd = None
                try:
                    stdout_fd = os.dup(1)
                    os.dup2(2, 1)
                except OSError:
                    # os.dup may fail on Windows with piped stdio
                    stdout_fd = None
                sys.stdout = sys.stderr

                try:
                    from basicsr.archs.rrdbnet_arch import RRDBNet
                    from realesrgan import RealESRGANer
                    from gpu import torch_gpu_available
                    import numpy as np
                    import torch

                    if not os.path.exists(REALESRGAN_MODEL_PATH):
                        raise FileNotFoundError(
                            f"RealESRGAN model not found: {REALESRGAN_MODEL_PATH}"
                        )

                    use_gpu = torch_gpu_available()
                    device = torch.device("cuda" if use_gpu else "cpu")

                    # RealESRGAN_x4plus is a 4x model internally
                    ai_model = RRDBNet(
                        num_in_ch=3,
                        num_out_ch=3,
                        num_feat=64,
                        num_block=23,
                        num_grow_ch=32,
                        scale=4,
                    )
                    tile_size = default_tile_size(use_gpu)
                    upsampler = RealESRGANer(
                        scale=4,
                        model_path=REALESRGAN_MODEL_PATH,
                        model=ai_model,
                        tile=tile_size,
                        tile_pad=10,
                        half=use_gpu,
                        device=device,
                    )
                    emit_progress(20, "AI model loaded")

                    img_array = np.array(img.convert("RGB"))
                    emit_progress(30, "Enhancing image with AI")

                    # enhance() runs the whole model in one opaque call with no
                    # per-tile callback, so advance the bar in the background to
                    # show the job is alive instead of freezing at 30% (#591).
                    from progress_heartbeat import run_with_heartbeat

                    def _enhance():
                        try:
                            return upsampler.enhance(img_array, outscale=scale)
                        except (RuntimeError, MemoryError, OSError) as oom_err:
                            if not is_oom_error(oom_err):
                                raise
                            retry_tile = fallback_tile_size(upsampler.tile)
                            if retry_tile >= upsampler.tile:
                                raise
                            if use_gpu:
                                torch.cuda.empty_cache()
                            print(
                                f"[upscale] OOM with tile={upsampler.tile}, retrying with tile={retry_tile}",
                                file=sys.stderr,
                                flush=True,
                            )
                            upsampler.tile = retry_tile
                            return upsampler.enhance(img_array, outscale=scale)

                    output_array, _ = run_with_heartbeat(
                        _enhance, emit_progress, 30, 80, "Enhancing image with AI"
                    )

                    emit_progress(80, "AI enhancement complete")
                    result = Image.fromarray(output_array)
                    method = "realesrgan"

                    if face_enhance:
                        emit_progress(82, "Enhancing faces")
                        from gfpgan import GFPGANer

                        if not os.path.exists(GFPGAN_MODEL_PATH):
                            raise FileNotFoundError(
                                f"GFPGAN model not found at {GFPGAN_MODEL_PATH}. "
                                "Install the upscale-enhance feature or disable faceEnhance."
                            )
                        # GFPGANer resolves its facexlib helper weights
                        # relative to the cwd and downloads them from GitHub
                        # when missing; resolve them from the bundle first so
                        # no download is needed (strict offline mode errors
                        # instead).
                        from offline_guard import prepare_gfpgan_helper_weights
                        prepare_gfpgan_helper_weights(_MODELS_BASE)
                        face_enhancer = GFPGANer(
                            model_path=GFPGAN_MODEL_PATH,
                            upscale=scale,
                            arch="clean",
                            channel_multiplier=2,
                            bg_upsampler=upsampler,
                        )
                        try:
                            _, _, face_output = face_enhancer.enhance(
                                img_array,
                                has_aligned=False,
                                only_center_face=False,
                                paste_back=True,
                            )
                        except (RuntimeError, MemoryError, OSError) as oom_err:
                            if not is_oom_error(oom_err):
                                raise
                            retry_tile = fallback_tile_size(upsampler.tile)
                            if retry_tile >= upsampler.tile:
                                raise
                            if use_gpu:
                                torch.cuda.empty_cache()
                            print(
                                f"[upscale] OOM during face enhance, retrying with tile={retry_tile}",
                                file=sys.stderr,
                                flush=True,
                            )
                            emit_progress(84, "Retrying face enhancement")
                            upsampler.tile = retry_tile
                            face_enhancer.bg_upsampler = upsampler
                            _, _, face_output = face_enhancer.enhance(
                                img_array,
                                has_aligned=False,
                                only_center_face=False,
                                paste_back=True,
                            )
                        result = Image.fromarray(face_output)
                        emit_progress(88, "Face enhancement complete")

                finally:
                    # Restore stdout after ALL AI processing
                    if stdout_fd is not None:
                        os.dup2(stdout_fd, 1)
                        os.close(stdout_fd)
                    sys.stdout = sys.__stdout__

            except (ImportError, FileNotFoundError, RuntimeError, MemoryError, OSError) as e:
                import traceback
                print(json.dumps({"warning": f"[upscale] Real-ESRGAN failed: {e}"}), file=sys.stderr, flush=True)
                traceback.print_exc(file=sys.stderr)
                print(json.dumps({
                    "success": False,
                    "error": realesrgan_failure_message(e),
                }))
                sys.exit(1)

        if result is None and model_choice == "lanczos":
            emit_progress(50, "Upscaling with Lanczos")
            result = img.resize(new_size, Image.LANCZOS)
            method = "lanczos"

        if result is None:
            raise RuntimeError(f"Requested model '{model_choice}' is not available")

        # Denoise
        if denoise_strength > 0:
            emit_progress(90, "Reducing noise")
            result = apply_denoise(result, denoise_strength)

        # Determine final output path based on format
        base_path = output_path.rsplit(".", 1)[0]
        EXT_MAP = {
            "jpeg": ".jpg",
            "jpg": ".jpg",
            "png": ".png",
            "webp": ".webp",
            "tiff": ".tiff",
            "gif": ".gif",
        }
        final_path = base_path + EXT_MAP.get(output_format, ".png")

        # Save with format-specific options
        emit_progress(95, "Saving result")
        save_kwargs = {}
        if output_format in ("jpeg", "jpg"):
            result = result.convert("RGB")  # Strip alpha for JPEG
            save_kwargs["quality"] = quality
            save_kwargs["optimize"] = True
        elif output_format == "webp":
            save_kwargs["quality"] = quality
        elif output_format == "tiff":
            save_kwargs["compression"] = "tiff_lzw"
        elif output_format == "gif":
            result = result.convert("P", palette=Image.ADAPTIVE, colors=256)

        result.save(final_path, **save_kwargs)

        # Get actual dimensions of the saved result
        actual_w, actual_h = result.size

        print(
            json.dumps(
                {
                    "success": True,
                    "scale": scale,
                    "width": actual_w,
                    "height": actual_h,
                    "method": method,
                    "output_path": final_path,
                    "format": output_format,
                }
            )
        )

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e).strip() or type(e).__name__}))
        sys.exit(1)


if __name__ == "__main__":
    main()
