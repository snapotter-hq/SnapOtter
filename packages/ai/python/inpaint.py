"""Object erasing / inpainting using LaMa (Large Mask Inpainting) via ONNX."""
import sys
import os
import json


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# Resolve the LaMa ONNX model path.
# Docker places it at /opt/models/lama/lama_fp32.onnx.
# For local dev, check a user-writable cache dir.
_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")
LAMA_MODEL_DIR = os.environ.get("LAMA_MODEL_DIR", os.path.join(_MODELS_BASE, "lama"))
LAMA_MODEL_PATH = os.path.join(LAMA_MODEL_DIR, "lama_fp32.onnx")
LAMA_LOCAL_CACHE = os.path.join(os.path.expanduser("~"), ".cache", "snapotter", "lama")
LAMA_LOCAL_PATH = os.path.join(LAMA_LOCAL_CACHE, "lama_fp32.onnx")
LAMA_HF_URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"

# The ONNX model expects 512x512 fixed input.
MODEL_SIZE = 512

# Crop-and-composite tuning. Defaults validated against the real model in a POC
# (see docs/superpowers/specs/2026-07-11-erase-object-inpainting-quality-design.md).
MIN_IMAGE_DIM = 8  # below this, inpainting is meaningless; return the original
WHOLE_FRAME_RATIO = 0.95  # crop this fraction of the frame -> just use the whole frame
DILATE_FRAC = 0.04  # mask dilation as a fraction of the mask bbox diagonal
DILATE_MIN = 6
DILATE_MAX = 96
MARGIN_FRAC = 0.5  # context margin around the dilated mask, fraction of its max side
MARGIN_MIN = 32


def _mask_bbox(mask_bin):
    """Return (x0, y0, x1, y1) tight bounds of nonzero pixels, or None if empty."""
    import numpy as np

    ys, xs = np.where(mask_bin > 0)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def dilate_mask(mask_bin, d):
    """Grow a binary mask by d px with an elliptical kernel. d<=0 is a no-op copy."""
    import cv2

    if d <= 0:
        return mask_bin.copy()
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * d + 1, 2 * d + 1))
    return cv2.dilate(mask_bin, kernel, iterations=1)


def compute_crop_box(mask_dil, image_shape, margin_frac, margin_min):
    """Bounding box of the dilated mask, expanded by a context margin, clamped."""
    h, w = image_shape[:2]
    x0, y0, x1, y1 = _mask_bbox(mask_dil)
    margin = int(max(margin_min, round(margin_frac * max(x1 - x0, y1 - y0))))
    return (
        max(0, x0 - margin),
        max(0, y0 - margin),
        min(w, x1 + margin),
        min(h, y1 + margin),
    )


def composite(original, inpainted_crop, mask_dil_native, crop_box, feather):
    """Blend the inpainted crop into a copy of the full-res original.

    Only the crop_box region is written, and within it only where the feathered
    dilated mask has alpha > 0. Pixels beyond the feather stay byte-identical.
    """
    import cv2
    import numpy as np

    x0, y0, x1, y1 = crop_box
    result = original.copy()
    ksize = 2 * feather + 1
    alpha = cv2.GaussianBlur((mask_dil_native > 0).astype(np.float32), (ksize, ksize), 0)
    alpha = np.clip(alpha, 0.0, 1.0)[:, :, np.newaxis]
    region = result[y0:y1, x0:x1].astype(np.float32)
    blended = region * (1.0 - alpha) + inpainted_crop.astype(np.float32) * alpha
    result[y0:y1, x0:x1] = np.clip(blended, 0, 255).astype(np.uint8)
    return result


def inpaint_array(img_array, mask_array, run_model, progress=None):
    """Crop-and-composite inpainting orchestrator (model-agnostic).

    img_array: HxWx3 uint8 RGB. mask_array: HxW uint8 (white = erase).
    run_model(crop_img, crop_mask) -> inpainted crop, same HxWx3 size as crop_img.
    progress(percent, stage) optional; called for the SSE progress UI.
    """
    import numpy as np

    def _p(percent, stage):
        if progress:
            progress(percent, stage)

    h, w = img_array.shape[:2]
    mask_bin = (mask_array > 127).astype(np.uint8) * 255

    # Guards: nothing to erase, or an image too small to inpaint meaningfully.
    if int(mask_bin.max()) == 0 or min(h, w) < MIN_IMAGE_DIM:
        return img_array.copy()

    _p(30, "Preprocessing")
    x0, y0, x1, y1 = _mask_bbox(mask_bin)
    diag = float(np.hypot(x1 - x0, y1 - y0))
    d = int(np.clip(round(DILATE_FRAC * diag), DILATE_MIN, DILATE_MAX))
    mask_dil = dilate_mask(mask_bin, d)

    bx0, by0, bx1, by1 = compute_crop_box(mask_dil, img_array.shape, MARGIN_FRAC, MARGIN_MIN)
    if (bx1 - bx0) * (by1 - by0) >= WHOLE_FRAME_RATIO * w * h:
        bx0, by0, bx1, by1 = 0, 0, w, h

    crop_img = img_array[by0:by1, bx0:bx1]
    crop_mask = mask_dil[by0:by1, bx0:bx1]

    _p(40, "Erasing objects")
    inpainted_crop = run_model(crop_img, crop_mask)

    _p(75, "Compositing")
    side = max(bx1 - bx0, by1 - by0)
    feather = int(np.clip(round(0.01 * side), 2, 12))
    feather = min(feather, max(1, d // 2))
    return composite(img_array, inpainted_crop, crop_mask, (bx0, by0, bx1, by1), feather)


def _get_model_path():
    """Return path to the LaMa ONNX model, downloading only if allowed."""
    if os.path.exists(LAMA_MODEL_PATH):
        return LAMA_MODEL_PATH
    if os.path.exists(LAMA_LOCAL_PATH):
        return LAMA_LOCAL_PATH

    from offline_guard import ensure_download_allowed
    ensure_download_allowed("LaMa inpainting model (lama_fp32.onnx)")
    emit_progress(5, "Downloading LaMa model")
    os.makedirs(LAMA_LOCAL_CACHE, exist_ok=True)
    import urllib.request
    urllib.request.urlretrieve(LAMA_HF_URL, LAMA_LOCAL_PATH)
    return LAMA_LOCAL_PATH


def _preprocess_image(img_array):
    """Convert HWC uint8 RGB image to NCHW float32 [0,1] at MODEL_SIZE."""
    import cv2
    import numpy as np

    resized = cv2.resize(img_array, (MODEL_SIZE, MODEL_SIZE), interpolation=cv2.INTER_AREA)
    # HWC -> CHW, normalize to [0, 1], add batch dim
    chw = np.transpose(resized, (2, 0, 1)).astype(np.float32) / 255.0
    return chw[np.newaxis, ...]  # (1, 3, 512, 512)


def _preprocess_mask(mask_array):
    """Convert HW uint8 grayscale mask to NC(1)HW float32 binary at MODEL_SIZE."""
    import cv2
    import numpy as np

    resized = cv2.resize(mask_array, (MODEL_SIZE, MODEL_SIZE), interpolation=cv2.INTER_NEAREST)
    # Threshold to binary 0/1
    binary = (resized > 127).astype(np.float32)
    return binary[np.newaxis, np.newaxis, ...]  # (1, 1, 512, 512)


def _feathered_composite(original, inpainted, mask, feather_radius=5):
    """Composite inpainted region into original using a feathered mask.

    This preserves full quality in non-masked areas and smoothly blends
    the inpainted region at the boundary.
    """
    import cv2
    import numpy as np

    # Dilate mask slightly for smoother transition
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (feather_radius, feather_radius))
    dilated = cv2.dilate(mask.astype(np.uint8), kernel, iterations=1)

    # Gaussian blur the dilated mask for feathering
    blur_size = feather_radius * 2 + 1
    alpha = cv2.GaussianBlur(dilated.astype(np.float32), (blur_size, blur_size), 0)
    alpha = np.clip(alpha, 0.0, 1.0)

    # Expand alpha to 3 channels
    alpha_3ch = alpha[:, :, np.newaxis]

    # Composite: original * (1 - alpha) + inpainted * alpha
    result = (original.astype(np.float32) * (1.0 - alpha_3ch) +
              inpainted.astype(np.float32) * alpha_3ch)
    return np.clip(result, 0, 255).astype(np.uint8)


def main():
    input_path = sys.argv[1]
    mask_path = sys.argv[2]
    output_path = sys.argv[3]

    try:
        emit_progress(5, "Preparing")
        from PIL import Image
        import numpy as np

        try:
            import cv2
            import onnxruntime
        except ImportError as e:
            msg = str(e)
            hint = "Fix with: apt-get install -y libgl1" if "libGL" in msg else "Requires opencv-python-headless and onnxruntime."
            print(json.dumps({
                "success": False,
                "error": f"Missing dependency: {msg}. {hint}",
            }))
            sys.exit(1)

        emit_progress(10, "Loading model")
        model_path = _get_model_path()

        from gpu import safe_onnx_session
        session, _device = safe_onnx_session(model_path)

        emit_progress(20, "Loading images")
        img = Image.open(input_path).convert("RGB")
        mask = Image.open(mask_path).convert("L")

        orig_w, orig_h = img.size
        img_array = np.array(img)
        mask_array = np.array(mask)

        # Resize mask to match image if needed
        if mask_array.shape[:2] != img_array.shape[:2]:
            mask_array = cv2.resize(
                mask_array, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST
            )

        # Threshold mask to binary
        _, mask_binary = cv2.threshold(mask_array, 127, 255, cv2.THRESH_BINARY)

        emit_progress(30, "Preprocessing")
        img_input = _preprocess_image(img_array)
        mask_input = _preprocess_mask(mask_binary)

        emit_progress(40, "Erasing objects")
        outputs = session.run(
            None,
            {"image": img_input, "mask": mask_input},
        )

        emit_progress(75, "Compositing")
        # Output shape: (1, 3, 512, 512) with values in [0, 255]
        raw_output = outputs[0][0]  # (3, 512, 512)
        raw_output = np.transpose(raw_output, (1, 2, 0))  # (512, 512, 3)
        raw_output = np.clip(raw_output, 0, 255).astype(np.uint8)

        # Resize inpainted result back to original dimensions
        inpainted_full = cv2.resize(raw_output, (orig_w, orig_h), interpolation=cv2.INTER_LANCZOS4)

        # Feathered composite: preserve quality outside mask, blend at edges
        mask_full = mask_binary.astype(np.float32) / 255.0
        feather_r = max(3, min(orig_w, orig_h) // 200)
        result = _feathered_composite(img_array, inpainted_full, mask_full, feather_r)

        emit_progress(90, "Saving")
        Image.fromarray(result).save(output_path)

        print(json.dumps({"success": True, "method": "lama-onnx"}))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
