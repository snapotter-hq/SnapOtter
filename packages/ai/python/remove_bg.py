"""Background removal using rembg with state-of-the-art BiRefNet models."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


ALLOWED_MODELS = {
    "u2net",
    "isnet-general-use",
    "bria-rmbg",
    "birefnet-general-lite",
    "birefnet-portrait",
    "birefnet-general",
    "birefnet-matting",
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
        try:
            output_data = remove(
                input_data,
                session=session,
                alpha_matting=use_alpha_matting,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
            )
        except Exception as e:
            if use_alpha_matting:
                emit_progress(35, "Retrying without alpha matting")
                output_data = remove(input_data, session=session, alpha_matting=False)
            else:
                raise RuntimeError(
                    f"Background removal failed: {e}"
                ) from e

        emit_progress(80, "Background removed")

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
