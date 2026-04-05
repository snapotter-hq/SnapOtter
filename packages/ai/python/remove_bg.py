"""Background removal using rembg with state-of-the-art BiRefNet models."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    model = settings.get("model", "u2net")
    bg_color = settings.get("backgroundColor", "")

    # Redirect stdout to stderr so library download/progress output
    # cannot contaminate our JSON result on stdout.
    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    try:
        from rembg import remove, new_session
        from gpu import onnx_providers
        import io

        emit_progress(10, "Loading model")

        session = new_session(model, providers=onnx_providers())

        emit_progress(25, "Model loaded")

        with open(input_path, "rb") as f:
            input_data = f.read()

        # Try with alpha matting for better edges, fall back without
        emit_progress(30, "Analyzing image")
        try:
            output_data = remove(
                input_data,
                session=session,
                alpha_matting=True,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
            )
        except Exception:
            output_data = remove(input_data, session=session)

        emit_progress(80, "Background removed")

        # If a background color is specified, composite onto it
        if bg_color and bg_color.startswith("#"):
            emit_progress(85, "Compositing background")
            from PIL import Image

            img = Image.open(io.BytesIO(output_data)).convert("RGBA")
            hex_color = bg_color.lstrip("#")
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            bg = Image.new("RGBA", img.size, (r, g, b, 255))
            bg.paste(img, mask=img.split()[3])
            buf = io.BytesIO()
            bg.save(buf, format="PNG")
            output_data = buf.getvalue()

        emit_progress(95, "Saving result")
        with open(output_path, "wb") as f:
            f.write(output_data)

        result = json.dumps({"success": True, "model": model})

    except ImportError:
        result = json.dumps(
            {
                "success": False,
                "error": "rembg is not installed. Install with: pip install rembg[cpu]",
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
