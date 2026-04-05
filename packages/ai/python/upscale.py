"""Image upscaling with Real-ESRGAN fallback to Lanczos."""
import sys
import json


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    scale = settings.get("scale", 2)

    try:
        emit_progress(10, "Loading upscale model")
        from PIL import Image

        img = Image.open(input_path)
        new_size = (img.width * scale, img.height * scale)

        # Try Real-ESRGAN first
        try:
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer
            from gpu import gpu_available
            import numpy as np
            import torch

            use_gpu = gpu_available()
            device = torch.device("cuda" if use_gpu else "cpu")

            model = RRDBNet(
                num_in_ch=3,
                num_out_ch=3,
                num_feat=64,
                num_block=23,
                num_grow_ch=32,
                scale=scale,
            )
            upsampler = RealESRGANer(
                scale=scale,
                model_path=None,
                model=model,
                half=use_gpu,
                device=device,
            )
            emit_progress(20, "Model ready")
            img_array = np.array(img.convert("RGB"))
            emit_progress(25, "Upscaling image")
            output, _ = upsampler.enhance(img_array, outscale=scale)
            emit_progress(90, "Upscaling complete")
            result = Image.fromarray(output)
            emit_progress(95, "Saving result")
            result.save(output_path)
            method = "realesrgan"
        except (ImportError, Exception):
            # Fallback to Lanczos upscaling
            emit_progress(50, "Upscaling with Lanczos")
            img_upscaled = img.resize(new_size, Image.LANCZOS)
            emit_progress(95, "Saving result")
            img_upscaled.save(output_path)
            method = "lanczos"

        print(
            json.dumps(
                {
                    "success": True,
                    "scale": scale,
                    "width": new_size[0],
                    "height": new_size[1],
                    "method": method,
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
