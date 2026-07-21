"""Background removal using rembg with state-of-the-art BiRefNet models."""
import sys
import json
import os


def emit_progress(percent, stage):
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def _refine_edges(image_bytes, level):
    """Morphological mask refinement to reduce gray halos on edges.

    level: 1=light, 2=medium, 3=strong
    """
    import cv2
    import numpy as np
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3]

    kernel_size = 1 + level
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel)

    sigma = 0.3 + level * 0.3
    alpha = cv2.GaussianBlur(alpha, (0, 0), sigma)

    arr[:, :, 3] = alpha
    out = Image.fromarray(arr, "RGBA")
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


def _decontaminate_edges(image_bytes):
    """Remove background color spill from semi-transparent edge pixels."""
    import numpy as np
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    arr = np.array(img, dtype=np.float32)
    alpha = arr[:, :, 3] / 255.0
    rgb = arr[:, :, :3]

    bg_mask = alpha < 0.04
    if not np.any(bg_mask):
        return image_bytes

    bg_color = np.zeros(3, dtype=np.float32)
    for c in range(3):
        channel = rgb[:, :, c]
        bg_pixels = channel[bg_mask]
        if len(bg_pixels) > 0:
            bg_color[c] = np.median(bg_pixels)

    edge_mask = (alpha > 0.04) & (alpha < 0.96)
    if not np.any(edge_mask):
        return image_bytes

    a = alpha[edge_mask, np.newaxis]
    fg = rgb[edge_mask]
    corrected = (fg - bg_color[np.newaxis, :] * (1.0 - a)) / np.maximum(a, 0.01)
    corrected = np.clip(corrected, 0, 255)
    rgb[edge_mask] = corrected

    arr[:, :, :3] = rgb
    result = np.clip(arr, 0, 255).astype(np.uint8)
    out = Image.fromarray(result, "RGBA")
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


ALLOWED_MODELS = {
    "u2net",
    "isnet-general-use",
    "bria-rmbg",
    "birefnet-general-lite",
    "birefnet-portrait",
    "birefnet-general",
    "birefnet-matting",
    "birefnet-hr-matting",
}

_matting_registered = False

def _register_matting_session(sessions_class):
    """Register the BiRefNet-matting ONNX session for Ultra quality mode."""
    global _matting_registered
    if _matting_registered:
        return
    _matting_registered = True

    import os
    import pooch
    from rembg.sessions.birefnet_general import BiRefNetSessionGeneral

    class BiRefNetMattingSession(BiRefNetSessionGeneral):
        @classmethod
        def download_models(cls, *args, **kwargs):
            fname = f"{cls.name(*args, **kwargs)}.onnx"
            target = os.path.join(cls.u2net_home(*args, **kwargs), fname)
            if not os.path.exists(target):
                from offline_guard import ensure_download_allowed
                ensure_download_allowed(f"Background removal model '{cls.name(*args, **kwargs)}'")
            pooch.retrieve(
                "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-matting-epoch_100.onnx",
                None,  # Skip checksum for GitHub release assets
                fname=fname,
                path=cls.u2net_home(*args, **kwargs),
                progressbar=True,
            )
            return target

        @classmethod
        def name(cls, *args, **kwargs):
            return "birefnet-matting"

    sessions_class.append(BiRefNetMattingSession)

_hr_matting_registered = False

def _register_hr_matting_session(sessions_class):
    """Register the BiRefNet HR-matting ONNX session for 2048x2048 high-res matting."""
    global _hr_matting_registered
    if _hr_matting_registered:
        return
    _hr_matting_registered = True

    import os
    import numpy as np
    import pooch
    from PIL import Image
    from rembg.sessions.birefnet_general import BiRefNetSessionGeneral

    class BiRefNetHRMattingSession(BiRefNetSessionGeneral):
        @classmethod
        def download_models(cls, *args, **kwargs):
            fname = f"{cls.name(*args, **kwargs)}.onnx"
            target = os.path.join(cls.u2net_home(*args, **kwargs), fname)
            if not os.path.exists(target):
                from offline_guard import ensure_download_allowed
                ensure_download_allowed(f"Background removal model '{cls.name(*args, **kwargs)}'")
            pooch.retrieve(
                "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet_HR-matting-epoch_135.onnx",
                None,
                fname=fname,
                path=cls.u2net_home(*args, **kwargs),
                progressbar=True,
            )
            return target

        @classmethod
        def name(cls, *args, **kwargs):
            return "birefnet-hr-matting"

        def predict(self, img, *args, **kwargs):
            ort_outs = self.inner_session.run(
                None,
                self.normalize(
                    img, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), (2048, 2048)
                ),
            )
            pred = ort_outs[0][:, 0, :, :]
            ma = np.max(pred)
            mi = np.min(pred)
            denom = ma - mi
            pred = (pred - mi) / denom if denom > 0 else pred * 0
            pred = np.squeeze(pred)
            mask = Image.fromarray((pred * 255).astype("uint8"), mode="L")
            mask = mask.resize(img.size, Image.LANCZOS)
            return [mask]

    sessions_class.append(BiRefNetHRMattingSession)


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    model = settings.get("model", "birefnet-general-lite")
    if model not in ALLOWED_MODELS:
        model = "birefnet-general-lite"

    # Redirect stdout to stderr so library download/progress output
    # cannot contaminate our JSON result on stdout.
    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    try:
        from rembg import remove, new_session
        from rembg.sessions import sessions_class
        from gpu import onnx_providers

        # Register BiRefNet-matting (Ultra quality) if not already present
        _register_matting_session(sessions_class)
        _register_hr_matting_session(sessions_class)

        # Every built-in rembg session downloads its .onnx (pooch,
        # GitHub/HuggingFace) when it is missing from the rembg home dir;
        # strict offline mode blocks that fallback with a clear error.
        # Mirrors rembg's own home resolution.
        model_home = os.path.expanduser(
            os.getenv("U2NET_HOME", os.path.join(os.getenv("XDG_DATA_HOME", "~"), ".u2net"))
        )
        if not os.path.exists(os.path.join(model_home, f"{model}.onnx")):
            from offline_guard import ensure_download_allowed
            ensure_download_allowed(f"Background removal model '{model}'")

        emit_progress(10, "Loading model")

        providers, device = onnx_providers()
        try:
            session = new_session(model, providers=providers)
        except Exception as e:
            if "CUDAExecutionProvider" in providers:
                from gpu import emit_info
                emit_info(f"GPU session failed ({e}), falling back to CPU")
                session = new_session(model, providers=["CPUExecutionProvider"])
                device = "cpu"
            else:
                raise

        emit_progress(25, "Model loaded")

        with open(input_path, "rb") as f:
            input_data = f.read()

        emit_progress(30, "Analyzing image")
        use_alpha_matting = device != "cpu"

        # remove() runs the whole model in one opaque call with no per-step
        # callback, so advance the bar in the background to show the job is
        # alive instead of freezing at 30% (#591).
        from progress_heartbeat import run_with_heartbeat

        def _remove():
            try:
                return remove(
                    input_data,
                    session=session,
                    alpha_matting=use_alpha_matting,
                    alpha_matting_foreground_threshold=240,
                    alpha_matting_background_threshold=10,
                )
            except Exception as e:
                if use_alpha_matting:
                    return remove(input_data, session=session, alpha_matting=False)
                raise RuntimeError(f"Background removal failed: {e}") from e

        output_data = run_with_heartbeat(_remove, emit_progress, 30, 80, "Analyzing image")

        emit_progress(80, "Background removed")

        edge_refine = settings.get("edgeRefine", 0)
        decontaminate = settings.get("decontaminate", False)

        if edge_refine and edge_refine > 0:
            emit_progress(85, "Refining edges")
            output_data = _refine_edges(output_data, int(edge_refine))

        if decontaminate:
            emit_progress(90, "Removing color spill")
            output_data = _decontaminate_edges(output_data)

        # Always return transparent PNG. All background compositing
        # (solid color, gradient, blur, shadow) is handled by Node.js/Sharp.

        emit_progress(95, "Saving result")
        with open(output_path, "wb") as f:
            f.write(output_data)

        result = json.dumps({"success": True, "model": model, "device": device})

    except ImportError as e:
        print(f"[remove-bg] Import failed: {e}", file=sys.stderr, flush=True)
        result = json.dumps(
            {
                "success": False,
                "error": f"rembg import failed: {e}",
            }
        )
    except Exception as e:
        result = json.dumps({"success": False, "error": str(e)})

    # Restore original stdout and write only our JSON result
    os.dup2(stdout_fd, 1)
    os.close(stdout_fd)
    sys.stdout.write(result + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
