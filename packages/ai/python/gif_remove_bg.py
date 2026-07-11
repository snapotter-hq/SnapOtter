"""Background removal for animated images (GIF, animated WebP, APNG).

Reads every frame with disposal-aware coalescing, runs one warm rembg session
over all frames, applies the chosen effect per frame, and re-encodes an animated
transparent (or composited) output via Pillow. Reuses remove_bg.py's model
registration and edge-refinement helpers so the still and animated paths share
the same matte behaviour.
"""
import io
import json
import os
import sys

MAX_REMBG_PX = int(os.environ.get("MAX_REMBG_PX", "2048"))
_OOM_MARKERS = (
    "out of memory",
    "failed to allocate",
    "cudaerrormemoryallocation",
    "cublas_status_alloc_failed",
    "bad_alloc",
)


def emit_progress(percent, stage):
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def _is_oom(err):
    m = str(err).lower()
    return any(s in m for s in _OOM_MARKERS)


def _read_frames(path):
    """Disposal-aware coalescing. Returns (frames[RGBA], durations[ms], loop).

    Naive ``seek()`` yields partial/garbled frames on disposal-optimized GIFs and
    animated WebP, so composite each frame onto a running canvas. ``copy()`` is
    mandatory: ``ImageSequence.Iterator`` mutates the same underlying object.
    """
    from PIL import Image, ImageSequence

    im = Image.open(path)
    try:
        loop = int(im.info.get("loop", 0) or 0)
    except (TypeError, ValueError):
        loop = 0
    frames, durations = [], []
    canvas = None
    for frame in ImageSequence.Iterator(im):
        raw = frame.info.get("duration", im.info.get("duration", 100))
        try:
            dur = max(20, int(raw))
        except (TypeError, ValueError):
            dur = 100
        disposal = frame.info.get("disposal", 0)
        rgba = frame.convert("RGBA")
        if canvas is None:
            canvas = rgba.copy()
        elif disposal == 2:
            canvas = rgba.copy()  # restore-to-background: don't smear the prior frame
        else:
            canvas = Image.alpha_composite(canvas, rgba)
        frames.append(canvas.copy())
        durations.append(dur)
    return frames, durations, loop


def _scale_target(size):
    w, h = size
    longest = max(w, h)
    if longest <= MAX_REMBG_PX:
        return None
    scale = MAX_REMBG_PX / longest
    return (max(1, round(w * scale)), max(1, round(h * scale)))


def _hex_to_rgba(value, default=(255, 255, 255, 255)):
    if not value:
        return default
    s = str(value).lstrip("#")
    try:
        if len(s) == 3:
            s = "".join(c * 2 for c in s)
        if len(s) == 6:
            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)
        if len(s) == 8:
            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), int(s[6:8], 16))
    except ValueError:
        pass
    return default


def _gradient(w, h, settings):
    import math

    import numpy as np
    from PIL import Image

    c1 = np.array(_hex_to_rgba(settings.get("gradientColor1", "#000000")), dtype=np.float32)
    c2 = np.array(_hex_to_rgba(settings.get("gradientColor2", "#ffffff")), dtype=np.float32)
    angle = math.radians(float(settings.get("gradientAngle", 0)) % 360.0)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    proj = xx * math.cos(angle) + yy * math.sin(angle)
    lo, hi = float(proj.min()), float(proj.max())
    t = (proj - lo) / (hi - lo) if hi > lo else np.zeros_like(proj)
    t = t[:, :, None]
    arr = (c1 * (1.0 - t) + c2 * t).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def _cover(img, w, h):
    from PIL import Image

    iw, ih = img.size
    scale = max(w / iw, h / ih)
    nw, nh = max(1, round(iw * scale)), max(1, round(ih * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - w) // 2, (nh - h) // 2
    return resized.crop((left, top, left + w, top + h)).convert("RGBA")


def _apply_shadow(base, cutout, settings):
    import numpy as np
    from PIL import Image, ImageFilter

    opacity = max(0.0, min(1.0, float(settings.get("shadowOpacity", 50)) / 100.0))
    w, h = cutout.size
    alpha = cutout.split()[3]
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", (w, h), (0, 0, 0, 255)), (0, 0), alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(2.0, w * 0.02)))
    sa = np.array(shadow, dtype=np.float32)
    sa[:, :, 3] *= opacity
    shadow = Image.fromarray(sa.astype(np.uint8), "RGBA")
    offset = max(2, int(w * 0.015))
    shifted = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shifted.paste(shadow, (offset, offset), shadow)
    return Image.alpha_composite(base, shifted)


def _apply_effect(cutout, original, settings, bg_img):
    from PIL import Image, ImageFilter

    bg_type = settings.get("backgroundType", "transparent")
    w, h = cutout.size
    if bg_type == "color":
        base = Image.new("RGBA", (w, h), _hex_to_rgba(settings.get("backgroundColor", "#ffffff")))
    elif bg_type == "gradient":
        base = _gradient(w, h, settings)
    elif bg_type == "blur":
        radius = max(1.0, float(settings.get("blurIntensity", 20)) / 3.0)
        base = original.convert("RGBA").filter(ImageFilter.GaussianBlur(radius=radius))
    elif bg_type == "image" and bg_img is not None:
        base = _cover(bg_img, w, h)
    else:
        base = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if settings.get("shadowEnabled"):
        base = _apply_shadow(base, cutout, settings)
    return Image.alpha_composite(base, cutout)


def _to_gif_frame(rgba):
    """RGBA -> (P-mode image, transparent_index) for a transparent animated GIF.

    GIF alpha is 1-bit: threshold at 50%, quantize RGB to 255 colours, and
    reserve palette index 255 for transparency.
    """
    from PIL import Image

    alpha = rgba.split()[3]
    p = rgba.convert("RGB").quantize(colors=255, method=Image.MEDIANCUT)
    transparent_mask = alpha.point(lambda a: 255 if a < 128 else 0)
    p.paste(255, transparent_mask)
    return p, 255


def _encode(frames, durations, loop, fmt, out_path):
    if fmt == "apng":
        frames[0].save(
            out_path, "PNG", save_all=True, append_images=frames[1:],
            duration=durations, loop=loop, disposal=1,
        )
    elif fmt == "gif":
        pal = [_to_gif_frame(f) for f in frames]
        first, tidx = pal[0]
        first.save(
            out_path, "GIF", save_all=True, append_images=[p for p, _ in pal[1:]],
            duration=durations, loop=loop, transparency=tidx, disposal=2, optimize=False,
        )
    else:  # webp
        frames[0].save(
            out_path, "WEBP", save_all=True, append_images=frames[1:],
            duration=durations, loop=loop, quality=90, method=6,
        )


def _create_session(model, providers, device):
    from rembg import new_session
    from rembg.sessions import sessions_class

    from remove_bg import _register_hr_matting_session, _register_matting_session

    _register_matting_session(sessions_class)
    _register_hr_matting_session(sessions_class)
    try:
        return new_session(model, providers=providers), device
    except Exception:
        if "CUDAExecutionProvider" in providers:
            return new_session(model, providers=["CPUExecutionProvider"]), "cpu"
        raise


def _remove_one(frame_rgba, session, use_alpha, settings, target, orig_size):
    from rembg import remove
    from PIL import Image

    src = frame_rgba if target is None else frame_rgba.resize(target, Image.LANCZOS)
    buf = io.BytesIO()
    src.save(buf, format="PNG")
    data = buf.getvalue()
    try:
        out = remove(
            data, session=session, alpha_matting=use_alpha,
            alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=10,
        )
    except Exception as e:
        if use_alpha and not _is_oom(e):
            out = remove(data, session=session, alpha_matting=False)
        else:
            raise
    edge_refine = settings.get("edgeRefine", 0)
    if edge_refine and int(edge_refine) > 0:
        from remove_bg import _refine_edges

        out = _refine_edges(out, int(edge_refine))
    if settings.get("decontaminate"):
        from remove_bg import _decontaminate_edges

        out = _decontaminate_edges(out)
    cut = Image.open(io.BytesIO(out)).convert("RGBA")
    if target is not None:
        cut = cut.resize(orig_size, Image.LANCZOS)
    return cut


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    fmt = settings.get("outputFormat", "webp")
    if fmt not in ("webp", "gif", "apng"):
        fmt = "webp"
    cancel_file = settings.get("cancelFile")
    bg_path = settings.get("bgImagePath")

    # Redirect stdout to stderr so rembg/onnx/pooch output cannot contaminate the
    # JSON result. Restored only to write the final line.
    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    canceled = False
    try:
        from PIL import Image

        from gpu import onnx_providers
        from remove_bg import ALLOWED_MODELS

        model = settings.get("model", "u2net")
        if model not in ALLOWED_MODELS:
            model = "u2net"

        emit_progress(3, "Reading frames")
        frames, durations, loop = _read_frames(input_path)
        n = len(frames)
        if n == 0:
            raise RuntimeError("no frames found in input")
        orig_size = frames[0].size
        target = _scale_target(orig_size)
        bg_img = Image.open(bg_path).convert("RGBA") if bg_path else None

        # Offline guard for the chosen model (mirrors remove_bg.py home resolution).
        model_home = os.path.expanduser(
            os.getenv("U2NET_HOME", os.path.join(os.getenv("XDG_DATA_HOME", "~"), ".u2net"))
        )
        if not os.path.exists(os.path.join(model_home, f"{model}.onnx")):
            from offline_guard import ensure_download_allowed

            ensure_download_allowed(f"Background removal model '{model}'")

        emit_progress(5, "Loading model")
        providers, device = onnx_providers()
        session, device = _create_session(model, providers, device)
        use_alpha = device != "cpu"

        # Probe frame 0 to settle model (OOM -> lighter model for the WHOLE
        # animation, never per-frame) and matting viability once. Switching model
        # or matting mid-animation would flicker.
        try:
            _remove_one(frames[0], session, use_alpha, settings, target, orig_size)
        except Exception as e:
            if _is_oom(e) and model.startswith("birefnet"):
                model = "u2net"
                emit_progress(5, "Retrying with a lighter model")
                session, device = _create_session(model, providers, device)
                use_alpha = device != "cpu"
            elif use_alpha:
                use_alpha = False  # matting not viable on this device/model
            else:
                raise

        out_frames = []
        for i, frame in enumerate(frames):
            if cancel_file and os.path.exists(cancel_file):
                canceled = True
                break
            cut = _remove_one(frame, session, use_alpha, settings, target, orig_size)
            out_frames.append(_apply_effect(cut, frame, settings, bg_img))
            emit_progress(int(5 + 90 * (i + 1) / n), f"Frame {i + 1}/{n}")

        if canceled:
            result = json.dumps({"success": False, "error": "canceled"})
        else:
            emit_progress(97, "Encoding animation")
            _encode(out_frames, durations, loop, fmt, output_path)
            result = json.dumps(
                {"success": True, "model": model, "device": device, "frames": n, "format": fmt}
            )
    except ImportError as e:
        print(f"[gif-remove-bg] Import failed: {e}", file=sys.stderr, flush=True)
        result = json.dumps({"success": False, "error": f"import failed: {e}"})
    except Exception as e:  # noqa: BLE001
        result = json.dumps({"success": False, "error": str(e)})

    os.dup2(stdout_fd, 1)
    os.close(stdout_fd)
    sys.stdout.write(result + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
