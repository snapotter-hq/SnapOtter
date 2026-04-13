"""Image noise removal with 4 quality tiers: quick, balanced, quality, maximum."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# Model paths - Docker locations as defaults, with env var overrides
SCUNET_MODEL_PATH = os.environ.get(
    "SCUNET_MODEL_PATH",
    "/opt/models/scunet/scunet_color_real_psnr.pth",
)

NAFNET_MODEL_PATH = os.environ.get(
    "NAFNET_MODEL_PATH",
    "/opt/models/nafnet/NAFNet-SIDD-width64.pth",
)

# Local cache for dev installs
_CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "stirling-image", "models")

# GitHub release URLs for auto-download
SCUNET_URL = "https://github.com/cszn/KAIR/releases/download/v1.0/scunet_color_real_psnr.pth"
NAFNET_URL = "https://huggingface.co/mikestealth/nafnet-models/resolve/main/NAFNet-SIDD-width64.pth"


def _get_model_path(env_path, filename, url):
    """Resolve model path: env/Docker first, then local cache, then download."""
    if os.path.exists(env_path):
        return env_path

    local_path = os.path.join(_CACHE_DIR, filename)
    if os.path.exists(local_path):
        return local_path

    # Auto-download
    emit_progress(10, f"Downloading {filename}")
    os.makedirs(_CACHE_DIR, exist_ok=True)
    import urllib.request
    urllib.request.urlretrieve(url, local_path)
    return local_path


def denoise_quick(img_array, strength, detail, color_noise):
    """Bilateral filter denoising - fast, good for mild noise.

    Processes in LAB color space to independently handle luminance
    and chrominance noise.
    """
    import cv2
    import numpy as np

    # Map strength 0-100 to bilateral filter params
    d = int(3 + (strength / 100) * 12)  # diameter: 3-15
    sigma_base_color = 20 + (strength / 100) * 130  # 20-150
    sigma_base_space = 20 + (strength / 100) * 130  # 20-150

    # Detail preservation reduces sigma values
    detail_factor = 1.0 - (detail / 100) * 0.7  # 1.0 down to 0.3
    sigma_color = sigma_base_color * detail_factor
    sigma_space = sigma_base_space * detail_factor

    is_gray = len(img_array.shape) == 2 or (
        len(img_array.shape) == 3 and img_array.shape[2] == 1
    )

    if is_gray:
        gray = img_array if len(img_array.shape) == 2 else img_array[:, :, 0]
        result = cv2.bilateralFilter(gray, d, sigma_color, sigma_space)
        if len(img_array.shape) == 3:
            result = result[:, :, np.newaxis]
        return result

    # Convert to LAB for split luminance/chrominance processing
    lab = cv2.cvtColor(img_array, cv2.COLOR_RGB2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)

    # Denoise L (luminance) channel
    l_ch = cv2.bilateralFilter(l_ch, d, sigma_color, sigma_space)

    # Optionally denoise A/B (color) channels based on color_noise param
    if color_noise > 0:
        color_factor = color_noise / 100
        color_sigma = sigma_color * color_factor * 0.7
        color_d = max(3, int(d * 0.7))
        a_ch = cv2.bilateralFilter(a_ch, color_d, color_sigma, sigma_space * 0.5)
        b_ch = cv2.bilateralFilter(b_ch, color_d, color_sigma, sigma_space * 0.5)

    result = cv2.merge([l_ch, a_ch, b_ch])
    return cv2.cvtColor(result, cv2.COLOR_LAB2RGB)


def denoise_balanced(img_array, strength, detail, color_noise):
    """Non-Local Means denoising with LAB split - good balance of speed and quality.

    NLMeans compares patches across the image for more accurate noise
    estimation than bilateral filtering.
    """
    import cv2
    import numpy as np

    # Map strength 0-100 to filter strength h: 3-20
    h = 3 + (strength / 100) * 17

    # Detail preservation controls search window size: 21 down to 11
    search_window = 21 - int((detail / 100) * 10)
    template_window = 7

    is_gray = len(img_array.shape) == 2 or (
        len(img_array.shape) == 3 and img_array.shape[2] == 1
    )

    if is_gray:
        gray = img_array if len(img_array.shape) == 2 else img_array[:, :, 0]
        result = cv2.fastNlMeansDenoising(gray, None, h, template_window, search_window)
        if len(img_array.shape) == 3:
            result = result[:, :, np.newaxis]
        return result

    # Process in LAB space
    lab = cv2.cvtColor(img_array, cv2.COLOR_RGB2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)

    # Denoise L channel with NLMeans
    l_ch = cv2.fastNlMeansDenoising(l_ch, None, h, template_window, search_window)

    # Optionally denoise color channels
    if color_noise > 0:
        color_h = h * (color_noise / 100) * 0.6
        if color_h > 1:
            a_ch = cv2.fastNlMeansDenoising(a_ch, None, color_h, template_window, search_window)
            b_ch = cv2.fastNlMeansDenoising(b_ch, None, color_h, template_window, search_window)

    result = cv2.merge([l_ch, a_ch, b_ch])
    return cv2.cvtColor(result, cv2.COLOR_LAB2RGB)


def _run_ai_denoise(model, img_array, strength, detail, color_noise, device):
    """Shared inference helper for AI-based denoise tiers (SCUNet, NAFNet).

    Handles tensor conversion, tiling for large images, strength blending,
    detail preservation, and optional color noise post-processing.
    """
    import torch
    import torch.nn.functional as F
    import numpy as np
    import cv2

    original = img_array.copy()
    h, w = img_array.shape[:2]

    # Convert to float32 tensor [0,1] in NCHW format
    tensor = torch.from_numpy(img_array.astype(np.float32) / 255.0)
    tensor = tensor.permute(2, 0, 1).unsqueeze(0)  # HWC -> NCHW
    tensor = tensor.to(device)

    emit_progress(50, "Running AI denoising")

    with torch.inference_mode():
        # Decide whether to use tiling (for images > 2048px on either side)
        if h > 2048 or w > 2048:
            result_tensor = _tile_process(model, tensor, tile_size=512, overlap=32, device=device)
        else:
            # Pad to multiple of 8 for model compatibility
            pad_h = (8 - h % 8) % 8
            pad_w = (8 - w % 8) % 8
            if pad_h > 0 or pad_w > 0:
                tensor = F.pad(tensor, (0, pad_w, 0, pad_h), mode="reflect")

            result_tensor = model(tensor)

            # Remove padding
            if pad_h > 0 or pad_w > 0:
                result_tensor = result_tensor[:, :, :h, :w]

    emit_progress(70, "Post-processing")

    # Convert back to numpy uint8
    result = result_tensor.squeeze(0).permute(1, 2, 0).cpu().clamp(0, 1).numpy()
    result = (result * 255).astype(np.uint8)

    # Blend with original based on strength (0 = no change, 100 = full denoise)
    blend = strength / 100.0
    result = (original.astype(np.float32) * (1 - blend) + result.astype(np.float32) * blend)
    result = np.clip(result, 0, 255).astype(np.uint8)

    # Detail preservation: extract high-frequency from original, add back
    if detail > 0:
        detail_scale = detail / 100.0
        # Blur original to get low-frequency component
        kernel_size = 5
        blurred = cv2.GaussianBlur(
            original.astype(np.float32),
            (kernel_size, kernel_size),
            0,
        )
        # High-frequency = original - blurred
        high_freq = original.astype(np.float32) - blurred
        # Add high frequency back to result, scaled by detail
        result = result.astype(np.float32) + high_freq * detail_scale
        result = np.clip(result, 0, 255).astype(np.uint8)

    # Color noise post-processing: denoise A/B channels in LAB with NLMeans
    if color_noise > 0:
        color_h = 3 + (color_noise / 100) * 12
        lab = cv2.cvtColor(result, cv2.COLOR_RGB2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)
        a_ch = cv2.fastNlMeansDenoising(a_ch, None, color_h, 7, 21)
        b_ch = cv2.fastNlMeansDenoising(b_ch, None, color_h, 7, 21)
        lab = cv2.merge([l_ch, a_ch, b_ch])
        result = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)

    return result


def _tile_process(model, tensor, tile_size=512, overlap=32, device="cpu"):
    """Process large images in overlapping tiles to avoid OOM.

    Tiles are blended at overlapping edges using linear ramps
    for seamless results.
    """
    import torch
    import torch.nn.functional as F

    _, c, h, w = tensor.shape
    step = tile_size - overlap

    # Allocate output and weight map for blending
    output = torch.zeros_like(tensor)
    weight = torch.zeros((1, 1, h, w), device=device)

    # Create blending weight ramp for overlap regions
    ramp = torch.ones((1, 1, tile_size, tile_size), device=device)
    if overlap > 0:
        for i in range(overlap):
            factor = (i + 1) / (overlap + 1)
            ramp[:, :, i, :] *= factor       # top edge
            ramp[:, :, -1 - i, :] *= factor  # bottom edge
            ramp[:, :, :, i] *= factor        # left edge
            ramp[:, :, :, -1 - i] *= factor   # right edge

    tiles_y = max(1, (h - overlap + step - 1) // step)
    tiles_x = max(1, (w - overlap + step - 1) // step)
    total_tiles = tiles_y * tiles_x
    tile_count = 0

    for y in range(0, h, step):
        for x in range(0, w, step):
            y_end = min(y + tile_size, h)
            x_end = min(x + tile_size, w)
            y_start = max(0, y_end - tile_size)
            x_start = max(0, x_end - tile_size)

            tile = tensor[:, :, y_start:y_end, x_start:x_end]

            # Pad tile if smaller than tile_size
            th, tw = tile.shape[2], tile.shape[3]
            pad_h = tile_size - th
            pad_w = tile_size - tw
            if pad_h > 0 or pad_w > 0:
                tile = F.pad(tile, (0, pad_w, 0, pad_h), mode="reflect")

            result_tile = model(tile)

            # Remove padding
            if pad_h > 0 or pad_w > 0:
                result_tile = result_tile[:, :, :th, :tw]

            # Trim ramp to actual tile size
            tile_ramp = ramp[:, :, :th, :tw]

            output[:, :, y_start:y_end, x_start:x_end] += result_tile * tile_ramp
            weight[:, :, y_start:y_end, x_start:x_end] += tile_ramp

            tile_count += 1
            pct = 50 + int(20 * tile_count / total_tiles)
            emit_progress(pct, f"Processing tile {tile_count}/{total_tiles}")

    # Normalize by weight
    weight = torch.clamp(weight, min=1e-6)
    output = output / weight

    return output


def denoise_quality(img_array, strength, detail, color_noise, model_path):
    """SCUNet-based denoising - high quality, slower.

    Uses the Swin-Conv-UNet architecture trained on real-world noise.
    """
    import torch
    from gpu import gpu_available

    emit_progress(15, "Loading SCUNet model")

    # Redirect stdout during model loading/inference
    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "models"))
        from scunet_arch import SCUNet

        use_gpu = gpu_available()
        device = torch.device("cuda" if use_gpu else "cpu")

        model = SCUNet(in_nc=3, config=[4, 4, 4, 4, 4, 4, 4], dim=64)

        resolved_path = _get_model_path(model_path, "scunet_color_real_psnr.pth", SCUNET_URL)
        checkpoint = torch.load(resolved_path, map_location=device, weights_only=True)
        model.load_state_dict(checkpoint)

        model = model.to(device)
        model.eval()

        emit_progress(30, "SCUNet model loaded")

        result = _run_ai_denoise(model, img_array, strength, detail, color_noise, device)

        # Free model from memory
        del model
        if use_gpu:
            torch.cuda.empty_cache()

        return result
    finally:
        os.dup2(stdout_fd, 1)
        os.close(stdout_fd)


def denoise_maximum(img_array, strength, detail, color_noise, model_path):
    """NAFNet-based denoising - maximum quality, slowest.

    Uses the Nonlinear Activation Free Network architecture for
    state-of-the-art image restoration.
    """
    import torch
    from gpu import gpu_available

    emit_progress(15, "Loading NAFNet model")

    # Redirect stdout during model loading/inference
    stdout_fd = os.dup(1)
    os.dup2(2, 1)

    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "models"))
        from nafnet_arch import NAFNet

        use_gpu = gpu_available()
        device = torch.device("cuda" if use_gpu else "cpu")

        model = NAFNet(
            img_channel=3,
            width=64,
            middle_blk_num=12,
            enc_blk_nums=[2, 2, 4, 8],
            dec_blk_nums=[2, 2, 2, 2],
        )

        resolved_path = _get_model_path(model_path, "NAFNet-SIDD-width64.pth", NAFNET_URL)
        checkpoint = torch.load(resolved_path, map_location=device, weights_only=True)

        # NAFNet checkpoints may wrap state_dict under "params" key
        if "params" in checkpoint:
            checkpoint = checkpoint["params"]

        model.load_state_dict(checkpoint)

        model = model.to(device)
        model.eval()

        emit_progress(30, "NAFNet model loaded")

        result = _run_ai_denoise(model, img_array, strength, detail, color_noise, device)

        # Free model from memory
        del model
        if use_gpu:
            torch.cuda.empty_cache()

        return result
    finally:
        os.dup2(stdout_fd, 1)
        os.close(stdout_fd)


def _process_single_image(img_array, settings, tier, strength, detail, color_noise):
    """Run the appropriate denoise tier on a single image array (RGB uint8)."""
    if tier == "quick":
        return denoise_quick(img_array, strength, detail, color_noise)
    elif tier == "balanced":
        return denoise_balanced(img_array, strength, detail, color_noise)
    elif tier == "quality":
        return denoise_quality(img_array, strength, detail, color_noise, SCUNET_MODEL_PATH)
    elif tier == "maximum":
        return denoise_maximum(img_array, strength, detail, color_noise, NAFNET_MODEL_PATH)
    else:
        raise ValueError(f"Unknown tier: {tier}")


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    tier = settings.get("tier", "balanced")
    strength = float(settings.get("strength", 50))
    detail = float(settings.get("detailPreservation", 50))
    color_noise = float(settings.get("colorNoise", 30))
    output_format = settings.get("format", "original")
    quality = int(settings.get("quality", 90))

    try:
        emit_progress(5, "Opening image")
        from PIL import Image
        import numpy as np

        try:
            import cv2
        except ImportError:
            print(json.dumps({
                "success": False,
                "error": "OpenCV is not installed. Install with: pip install opencv-python-headless",
            }))
            sys.exit(1)

        img = Image.open(input_path)
        original_format = img.format or "PNG"
        is_animated = getattr(img, "is_animated", False) and getattr(img, "n_frames", 1) > 1
        is_gif = original_format.upper() == "GIF"

        # Determine output format
        if output_format == "original":
            # HEIC/HEIF -> PNG (Pillow can read but not always write these)
            if original_format.upper() in ("HEIC", "HEIF"):
                fmt = "png"
            elif is_gif and is_animated:
                fmt = "gif"
            else:
                fmt = original_format.lower()
        else:
            fmt = output_format.lower()

        # Resolve output path extension
        ext_map = {
            "jpeg": ".jpg",
            "jpg": ".jpg",
            "png": ".png",
            "webp": ".webp",
            "tiff": ".tiff",
            "gif": ".gif",
        }
        base_path = output_path.rsplit(".", 1)[0]
        final_path = base_path + ext_map.get(fmt, ".png")

        # Handle animated GIFs
        if is_animated and is_gif:
            ai_tier = tier in ("quality", "maximum")

            if ai_tier:
                # AI tiers: process first frame only, save as static image
                emit_progress(10, "Processing first frame (AI mode)")
                frame = img.convert("RGB")
                img_array = np.array(frame)
                result_array = _process_single_image(img_array, settings, tier, strength, detail, color_noise)
                result = Image.fromarray(result_array)

                # Override to static format
                if fmt == "gif":
                    fmt = "png"
                    final_path = base_path + ".png"
            else:
                # Classical tiers: process frame-by-frame
                frames = []
                durations = []
                n_frames = img.n_frames

                for i in range(n_frames):
                    img.seek(i)
                    frame = img.convert("RGB")
                    img_array = np.array(frame)

                    pct = 10 + int(80 * i / n_frames)
                    emit_progress(pct, f"Denoising frame {i + 1}/{n_frames}")

                    result_array = _process_single_image(img_array, settings, tier, strength, detail, color_noise)
                    result_frame = Image.fromarray(result_array)
                    frames.append(result_frame)
                    durations.append(img.info.get("duration", 100))

                emit_progress(92, "Saving animated GIF")
                frames[0].save(
                    final_path,
                    save_all=True,
                    append_images=frames[1:],
                    duration=durations,
                    loop=img.info.get("loop", 0),
                    optimize=True,
                )

                actual_w, actual_h = frames[0].size
                print(json.dumps({
                    "success": True,
                    "tier": tier,
                    "width": actual_w,
                    "height": actual_h,
                    "frames": n_frames,
                    "output_path": final_path,
                    "format": "gif",
                }))
                return
        else:
            # Static image processing
            emit_progress(10, f"Denoising with {tier} tier")

            # Convert to RGB for processing (handle RGBA, palette, grayscale)
            has_alpha = img.mode in ("RGBA", "LA", "PA")
            alpha_channel = None
            if has_alpha:
                alpha_channel = np.array(img.convert("RGBA"))[:, :, 3]
                img_rgb = img.convert("RGB")
            elif img.mode in ("L", "1"):
                img_rgb = img
            else:
                img_rgb = img.convert("RGB")

            img_array = np.array(img_rgb)
            result_array = _process_single_image(img_array, settings, tier, strength, detail, color_noise)
            result = Image.fromarray(result_array)

            # Re-attach alpha channel if present
            if alpha_channel is not None:
                result_rgba = result.convert("RGBA")
                r, g, b, _ = result_rgba.split()
                result = Image.merge("RGBA", (r, g, b, Image.fromarray(alpha_channel)))

        # Save with format-specific options
        emit_progress(92, "Saving result")
        save_kwargs = {}

        if fmt in ("jpeg", "jpg"):
            result = result.convert("RGB")
            save_kwargs["quality"] = quality
            save_kwargs["optimize"] = True
        elif fmt == "webp":
            save_kwargs["quality"] = quality
        elif fmt == "tiff":
            save_kwargs["compression"] = "tiff_lzw"
        elif fmt == "gif":
            result = result.convert("P", palette=Image.ADAPTIVE, colors=256)

        result.save(final_path, **save_kwargs)

        actual_w, actual_h = result.size
        print(json.dumps({
            "success": True,
            "tier": tier,
            "width": actual_w,
            "height": actual_h,
            "output_path": final_path,
            "format": fmt,
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
