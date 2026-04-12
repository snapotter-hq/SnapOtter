"""Image upscaling with Real-ESRGAN fallback to Lanczos."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


REALESRGAN_MODEL_PATH = os.environ.get(
    "REALESRGAN_MODEL_PATH",
    "/opt/models/realesrgan/RealESRGAN_x4plus.pth",
)

GFPGAN_MODEL_PATH = os.environ.get(
    "GFPGAN_MODEL_PATH",
    "/opt/models/gfpgan/GFPGANv1.3.pth",
)


def apply_denoise(img, strength):
    """Apply denoising to a PIL image. Uses OpenCV when available, falls back to PIL."""
    if strength <= 0:
        return img
    try:
        import numpy as np
        import cv2

        arr = np.array(img)
        # Map 0-1 strength to filter parameter (3-15 range)
        h = int(3 + strength * 12)
        if len(arr.shape) == 3 and arr.shape[2] >= 3:
            denoised = cv2.fastNlMeansDenoisingColored(arr, None, h, h, 7, 21)
        else:
            denoised = cv2.fastNlMeansDenoising(arr, None, h, 7, 21)
        return type(img).fromarray(denoised)
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
        from PIL import Image

        img = Image.open(input_path)
        new_size = (img.width * scale, img.height * scale)

        method = "lanczos"
        result = None

        # Try Real-ESRGAN if requested
        if model_choice in ("auto", "realesrgan"):
            try:
                emit_progress(10, "Loading AI model")

                # Redirect stdout to stderr so basicsr/realesrgan init messages
                # cannot contaminate our JSON result on stdout.
                stdout_fd = os.dup(1)
                os.dup2(2, 1)

                try:
                    from basicsr.archs.rrdbnet_arch import RRDBNet
                    from realesrgan import RealESRGANer
                    from gpu import gpu_available
                    import numpy as np
                    import torch
                finally:
                    # Restore stdout after imports
                    os.dup2(stdout_fd, 1)
                    os.close(stdout_fd)

                if not os.path.exists(REALESRGAN_MODEL_PATH):
                    raise FileNotFoundError(
                        f"RealESRGAN model not found: {REALESRGAN_MODEL_PATH}"
                    )

                use_gpu = gpu_available()
                device = torch.device("cuda" if use_gpu else "cpu")

                # RealESRGAN_x4plus is a 4x model internally
                model = RRDBNet(
                    num_in_ch=3,
                    num_out_ch=3,
                    num_feat=64,
                    num_block=23,
                    num_grow_ch=32,
                    scale=4,
                )
                upsampler = RealESRGANer(
                    scale=4,
                    model_path=REALESRGAN_MODEL_PATH,
                    model=model,
                    half=use_gpu,
                    device=device,
                )
                emit_progress(20, "AI model loaded")

                img_array = np.array(img.convert("RGB"))
                emit_progress(30, "Enhancing image with AI")
                output_array, _ = upsampler.enhance(img_array, outscale=scale)
                emit_progress(80, "AI enhancement complete")
                result = Image.fromarray(output_array)
                method = "realesrgan"

                # Face enhancement with GFPGAN
                if face_enhance:
                    emit_progress(82, "Enhancing faces")
                    try:
                        from gfpgan import GFPGANer

                        if os.path.exists(GFPGAN_MODEL_PATH):
                            face_enhancer = GFPGANer(
                                model_path=GFPGAN_MODEL_PATH,
                                upscale=scale,
                                arch="clean",
                                channel_multiplier=2,
                                bg_upsampler=upsampler,
                            )
                            _, _, face_output = face_enhancer.enhance(
                                img_array,
                                has_aligned=False,
                                only_center_face=False,
                                paste_back=True,
                            )
                            result = Image.fromarray(face_output)
                            emit_progress(88, "Face enhancement complete")
                        else:
                            emit_progress(88, "Face model not found, skipping")
                    except (ImportError, RuntimeError, OSError):
                        emit_progress(88, "Face enhancement unavailable, skipping")

            except (ImportError, FileNotFoundError, RuntimeError, OSError):
                # RealESRGAN unavailable or failed
                if model_choice == "realesrgan":
                    emit_progress(15, "AI model not available, using fast resize")
                result = None

        # Fall back to Lanczos
        if result is None:
            emit_progress(50, "Upscaling with Lanczos")
            result = img.resize(new_size, Image.LANCZOS)
            method = "lanczos"

        # Denoise
        if denoise_strength > 0:
            emit_progress(90, "Reducing noise")
            result = apply_denoise(result, denoise_strength)

        # Determine final output path based on format
        base_path = output_path.rsplit(".", 1)[0]
        if output_format == "jpeg":
            final_path = base_path + ".jpg"
        elif output_format == "webp":
            final_path = base_path + ".webp"
        else:
            final_path = base_path + ".png"

        # Save with format-specific options
        emit_progress(95, "Saving result")
        save_kwargs = {}
        if output_format == "jpeg":
            result = result.convert("RGB")  # Strip alpha for JPEG
            save_kwargs["quality"] = quality
            save_kwargs["optimize"] = True
        elif output_format == "webp":
            save_kwargs["quality"] = quality

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
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
