"""Background removal using rembg with state-of-the-art BiRefNet models."""
import sys
import json


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    model = settings.get("model", "u2net")
    bg_color = settings.get("backgroundColor", "")

    try:
        from rembg import remove, new_session
        import io

        # Progress messages go to stderr (stdout reserved for JSON result)
        sys.stderr.write(f"Loading model: {model}\n")
        sys.stderr.flush()

        session = new_session(model)

        sys.stderr.write("Processing image...\n")
        sys.stderr.flush()

        with open(input_path, "rb") as f:
            input_data = f.read()

        # Try with alpha matting for better edges, fall back without
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

        # If a background color is specified, composite onto it
        if bg_color and bg_color.startswith("#"):
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

        with open(output_path, "wb") as f:
            f.write(output_data)

        print(json.dumps({"success": True, "model": model}))

    except ImportError:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "rembg is not installed. Install with: pip install rembg[cpu]",
                }
            )
        )
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
