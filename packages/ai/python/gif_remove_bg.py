"""Background removal for animated images (GIF, animated WebP, APNG).

Reads every frame with disposal-aware coalescing, runs one warm rembg session
over all frames, applies the chosen effect per frame, and re-encodes an animated
transparent (or composited) output via Pillow. Reuses remove_bg.py's model
registration and edge-refinement helpers so the still and animated paths share
the same matte behaviour.
"""
import errno
import io
import json
import os
import re
import sys

_HEX_COLOR_RE = re.compile(r"^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

MAX_REMBG_PX = int(os.environ.get("MAX_REMBG_PX", "2048"))
_OOM_MARKERS = (
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
_HOST_OOM_MARKERS = (
    "not enough memory",
    "can't allocate memory",
    "cannot allocate memory",
    "[errno 12]",
    "unable to allocate",
    "bad_alloc",
    "memoryerror",
)
_MODEL_LOAD_ERROR_MARKERS = (
    "invalidprotobuf",
    "invalid_protobuf",
    "protobuf parsing failed",
    "invalidgraph",
    "invalid_graph",
    "no_suchfile",
    "nosuchfile",
    "file doesn't exist",
    "modelproto does not have a graph",
    "checksum",
    "hash of downloaded file",
    "does not match the known hash",
    "snapotter_allow_model_download",
)


def emit_progress(percent, stage):
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def _is_oom(err):
    if isinstance(err, MemoryError):
        return True
    if isinstance(err, OSError) and err.errno == errno.ENOMEM:
        return True
    m = str(err).lower()
    return any(s in m for s in _OOM_MARKERS)


def _is_host_oom(err):
    if isinstance(err, MemoryError):
        return True
    if isinstance(err, OSError) and err.errno == errno.ENOMEM:
        return True
    m = str(err).lower()
    if any(s in m for s in _HOST_OOM_MARKERS):
        return True
    return "defaultcpuallocator" in m and _is_oom(err)


def _is_model_load_error(err):
    if isinstance(err, EOFError):
        return True
    if isinstance(err, OSError):
        return err.errno != errno.ENOMEM
    m = f"{type(err).__name__} {err}".lower()
    return any(s in m for s in _MODEL_LOAD_ERROR_MARKERS)


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


def _hex_to_rgba(value):
    if not isinstance(value, str):
        raise ValueError(f"Not a hex color: {value}")
    s = value.strip()
    if not _HEX_COLOR_RE.fullmatch(s):
        raise ValueError(f"Not a hex color: {value}")
    if s.startswith("#"):
        s = s[1:]
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


def _validate_bg_colors(settings):
    bg_type = settings.get("backgroundType", "transparent")
    if bg_type == "color":
        bg_color = settings.get("backgroundColor")
        if not bg_color:
            raise ValueError("A color background needs a color")
        return _hex_to_rgba(bg_color), None
    if bg_type == "gradient":
        c1_raw = settings.get("gradientColor1")
        c2_raw = settings.get("gradientColor2")
        if not c1_raw or not c2_raw:
            raise ValueError("A gradient background needs two colors")
        return _hex_to_rgba(c1_raw), _hex_to_rgba(c2_raw)
    return None, None


def _gradient(w, h, settings):
    _, c2_rgba = _validate_bg_colors({**settings, "backgroundType": "gradient"})
    c1_rgba = _hex_to_rgba(settings["gradientColor1"])
    import math

    import numpy as np
    from PIL import Image

    c1 = np.array(c1_rgba, dtype=np.float32)
    c2 = np.array(c2_rgba, dtype=np.float32)
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
    c1_rgba, _ = _validate_bg_colors(settings)
    bg_type = settings.get("backgroundType", "transparent")
    if bg_type == "image" and bg_img is None:
        raise ValueError("An image background needs a background image")
    from PIL import Image, ImageFilter

    w, h = cutout.size
    if bg_type == "color":
        base = Image.new("RGBA", (w, h), c1_rgba)
    elif bg_type == "gradient":
        base = _gradient(w, h, settings)
    elif bg_type == "blur":
        radius = max(1.0, float(settings.get("blurIntensity", 20)) / 3.0)
        base = original.convert("RGBA").filter(ImageFilter.GaussianBlur(radius=radius))
    elif bg_type == "image":
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


def _ensure_model_available(model, model_home):
    if not os.path.exists(os.path.join(model_home, f"{model}.onnx")):
        from offline_guard import ensure_download_allowed

        ensure_download_allowed(f"Background removal model '{model}'")


def _create_session(model, providers, device):
    from rembg import new_session
    from rembg.sessions import sessions_class

    from remove_bg import _register_hr_matting_session, _register_matting_session

    _register_matting_session(sessions_class)
    _register_hr_matting_session(sessions_class)
    try:
        return new_session(model, providers=providers), device
    except Exception as e:
        if (
            "CUDAExecutionProvider" in providers
            and not _is_host_oom(e)
            and not _is_model_load_error(e)
        ):
            print(
                f"[gif-remove-bg] CUDA session for '{model}' failed ({e}); falling back to CPU",
                file=sys.stderr,
                flush=True,
            )
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
        _validate_bg_colors(settings)
        if settings.get("backgroundType") == "image" and not bg_path:
            raise ValueError("An image background needs a background image")
        from PIL import Image

        from gpu import onnx_providers
        from model_paths import ensure_rembg_model_home
        from remove_bg import ALLOWED_MODELS

        ensure_rembg_model_home()

        model = settings.get("model", "u2net")
        if model not in ALLOWED_MODELS:
            # JSON so the bridge forwards it to the server log; plain text is dropped.
            sys.stderr.write(
                json.dumps({"warning": f"Unknown model '{model}', falling back to 'u2net'"}) + "\n"
            )
            sys.stderr.flush()
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
        _ensure_model_available(model, model_home)

        emit_progress(5, "Loading model")
        providers, initial_device = onnx_providers()
        # Per-frame pymatting runs on the CPU whatever the session device and
        # costs seconds per frame (it dominated a 30-frame GIF at ~12s/frame
        # on an otherwise idle GPU host, #668), and its per-frame noise
        # flickers across an animation. Stills keep matting; animations never
        # use it.
        use_alpha = False
        session = None

        # Probe frame 0 to settle the model once (OOM -> lighter model for the
        # WHOLE animation, never per-frame; switching mid-animation would
        # flicker). Wrap both session creation and the frame-0 probe so an OOM
        # while loading non-u2net weights or running frame 0 falls back to u2net.
        try:
            session, device = _create_session(model, providers, initial_device)
            print(
                f"[gif-remove-bg] session device={device} model={model}",
                file=sys.stderr,
                flush=True,
            )
            _remove_one(frames[0], session, use_alpha, settings, target, orig_size)
        except Exception as e:
            if _is_oom(e) and model != "u2net":
                prev_model = model
                detail = str(e).strip() or type(e).__name__
                session = None
                e.__traceback__ = None
                model = "u2net"
                sys.stderr.write(
                    json.dumps(
                        {
                            "warning": f"[gif-remove-bg] {prev_model} ran out of memory ({detail}); retrying with u2net"
                        }
                    )
                    + "\n"
                )
                sys.stderr.flush()
                _ensure_model_available(model, model_home)
                emit_progress(5, "Retrying with a lighter model")
                session, device = _create_session(model, providers, initial_device)
                print(
                    f"[gif-remove-bg] session device={device} model={model}",
                    file=sys.stderr,
                    flush=True,
                )
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
        detail = str(e).strip() or type(e).__name__
        print(json.dumps({"warning": f"[gif-remove-bg] Import failed: {detail}"}), file=sys.stderr, flush=True)
        result = json.dumps({"success": False, "error": f"import failed: {detail}"})
    except Exception as e:  # noqa: BLE001
        result = json.dumps({"success": False, "error": str(e).strip() or type(e).__name__})

    os.dup2(stdout_fd, 1)
    os.close(stdout_fd)
    sys.stdout.write(result + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
