"""Enhanced LaMa outpainting with 6-step preprocessing pipeline."""
import sys
import os
import json


MODEL_SIZE = 512

TIER_PARAMS = {
    "fast":     {"band_size": 192, "mask_dilate": 12, "seam_strip": 0,  "use_telea": False},
    "balanced": {"band_size": 128, "mask_dilate": 18, "seam_strip": 24, "use_telea": True},
    "high":     {"band_size": 72,  "mask_dilate": 24, "seam_strip": 36, "use_telea": True},
}


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# Resolve the LaMa ONNX model path.
_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")
LAMA_MODEL_DIR = os.environ.get("LAMA_MODEL_DIR", os.path.join(_MODELS_BASE, "lama"))
LAMA_MODEL_PATH = os.path.join(LAMA_MODEL_DIR, "lama_fp32.onnx")
LAMA_LOCAL_CACHE = os.path.join(os.path.expanduser("~"), ".cache", "snapotter", "lama")
LAMA_LOCAL_PATH = os.path.join(LAMA_LOCAL_CACHE, "lama_fp32.onnx")
LAMA_HF_URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"


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


def _run_lama(session, canvas, mask, feather_radius=5):
    """Run a single LaMa inference pass with feathered compositing."""
    import cv2
    import numpy as np

    h, w = canvas.shape[:2]

    # Skip if mask is empty
    if np.sum(mask) == 0:
        return canvas

    # Resize to model input size
    img_resized = cv2.resize(canvas, (MODEL_SIZE, MODEL_SIZE), interpolation=cv2.INTER_AREA)
    mask_resized = cv2.resize(mask, (MODEL_SIZE, MODEL_SIZE), interpolation=cv2.INTER_NEAREST)

    # Preprocess image: HWC -> NCHW float32 [0,1]
    img_input = np.transpose(img_resized, (2, 0, 1)).astype(np.float32) / 255.0
    img_input = img_input[np.newaxis, ...]  # (1, 3, 512, 512)

    # Preprocess mask: HW -> N1HW float32 binary
    mask_binary = (mask_resized > 127).astype(np.float32)
    mask_input = mask_binary[np.newaxis, np.newaxis, ...]  # (1, 1, 512, 512)

    # Run inference
    outputs = session.run(None, {"image": img_input, "mask": mask_input})

    # Postprocess: (1, 3, 512, 512) -> (512, 512, 3) uint8
    raw_output = outputs[0][0]  # (3, 512, 512)
    raw_output = np.transpose(raw_output, (1, 2, 0))  # (512, 512, 3)
    raw_output = np.clip(raw_output, 0, 255).astype(np.uint8)

    # Resize back to original dimensions
    inpainted = cv2.resize(raw_output, (w, h), interpolation=cv2.INTER_LANCZOS4)

    # Feathered blending: smooth transition at mask edges
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (feather_radius, feather_radius))
    dilated = cv2.dilate(mask.astype(np.uint8), kernel, iterations=1)
    blur_size = feather_radius * 2 + 1
    alpha = cv2.GaussianBlur(dilated.astype(np.float32) / 255.0, (blur_size, blur_size), 0)
    alpha = np.clip(alpha, 0.0, 1.0)
    alpha_3ch = alpha[:, :, np.newaxis]

    result = (canvas.astype(np.float32) * (1.0 - alpha_3ch) +
              inpainted.astype(np.float32) * alpha_3ch)
    return np.clip(result, 0, 255).astype(np.uint8)


def _progressive_outpaint(session, canvas, mask, band_size=128, progress_start=30, progress_end=75):
    """Process mask in concentric bands from original edge outward."""
    import cv2
    import numpy as np

    remaining = mask.copy()
    current_canvas = canvas.copy()

    # Count total bands for progress scaling
    total_white = np.sum(remaining > 127)
    if total_white == 0:
        return current_canvas

    band_index = 0
    total_bands = 0
    temp = remaining.copy()
    while np.sum(temp > 127) > 0:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (band_size * 2 + 1, band_size * 2 + 1)
        )
        eroded = cv2.erode(temp, kernel, iterations=1)
        temp = eroded
        total_bands += 1

    if total_bands == 0:
        total_bands = 1

    while np.sum(remaining > 127) > 0:
        # Erode remaining mask to peel off outermost band
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (band_size * 2 + 1, band_size * 2 + 1)
        )
        eroded = cv2.erode(remaining, kernel, iterations=1)

        # Current band = remaining minus eroded
        band = cv2.subtract(remaining, eroded)

        # Run LaMa on this band
        current_canvas = _run_lama(session, current_canvas, band)

        remaining = eroded
        band_index += 1

        progress_range = progress_end - progress_start
        progress = progress_start + int(progress_range * band_index / total_bands)
        emit_progress(min(progress, progress_end), f"AI outpainting band {band_index}/{total_bands}")

    return current_canvas


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    extend_top = int(sys.argv[3])
    extend_right = int(sys.argv[4])
    extend_bottom = int(sys.argv[5])
    extend_left = int(sys.argv[6])

    tier = sys.argv[7] if len(sys.argv) > 7 else "balanced"
    if tier not in TIER_PARAMS:
        tier = "balanced"
    params = TIER_PARAMS[tier]

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

        emit_progress(8, "Loading model")
        model_path = _get_model_path()

        from gpu import safe_onnx_session
        session, _device = safe_onnx_session(model_path)

        emit_progress(15, "Loading image")
        img = Image.open(input_path).convert("RGB")
        orig_w, orig_h = img.size
        img_array = np.array(img)

        # Step 1: Mirror pre-fill -- extend canvas with reflected content
        emit_progress(20, "Extending canvas")
        canvas = cv2.copyMakeBorder(
            img_array,
            extend_top, extend_bottom, extend_left, extend_right,
            cv2.BORDER_REFLECT_101,
        )
        new_h, new_w = canvas.shape[:2]

        # Step 2: Create mask -- white for extended regions, black for original
        mask = np.zeros((new_h, new_w), dtype=np.uint8)
        mask[:extend_top, :] = 255
        mask[extend_top + orig_h:, :] = 255
        mask[:, :extend_left] = 255
        mask[:, extend_left + orig_w:] = 255

        # Dilate mask into original area for overlap
        dilate_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (params["mask_dilate"] * 2 + 1, params["mask_dilate"] * 2 + 1)
        )
        mask = cv2.dilate(mask, dilate_kernel, iterations=1)

        # Step 3: Telea pre-inpainting for gradient hints
        if params["use_telea"]:
            emit_progress(25, "Pre-filling gradients")
            canvas = cv2.inpaint(canvas, mask, 3, cv2.INPAINT_TELEA)

        # Step 4: Progressive LaMa outpainting in concentric bands
        if params["use_telea"]:
            canvas = _progressive_outpaint(session, canvas, mask, params["band_size"], 30, 75)
        else:
            canvas = _progressive_outpaint(session, canvas, mask, params["band_size"], 20, 85)

        # Step 5: Seam refinement -- second LaMa pass on thin boundary strip
        seam_strip = params["seam_strip"]
        if seam_strip > 0:
            emit_progress(80, "Refining seams")
            seam_mask = np.zeros((new_h, new_w), dtype=np.uint8)

            # Create thin strip along original image boundary
            inner_kernel = cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (seam_strip + 1, seam_strip + 1)
            )
            outer_kernel = cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (seam_strip * 2 + 1, seam_strip * 2 + 1)
            )

            # Original region mask (before dilation)
            orig_mask = np.zeros((new_h, new_w), dtype=np.uint8)
            orig_mask[extend_top:extend_top + orig_h, extend_left:extend_left + orig_w] = 255

            inner_edge = cv2.erode(orig_mask, inner_kernel, iterations=1)
            outer_edge = cv2.dilate(orig_mask, outer_kernel, iterations=1)
            seam_mask = cv2.subtract(outer_edge, inner_edge)

            canvas = _run_lama(session, canvas, seam_mask)

        # Step 6: Poisson blending -- paste untouched original back
        emit_progress(90, "Blending")

        # Extract the region where original will go
        center_x = extend_left + orig_w // 2
        center_y = extend_top + orig_h // 2

        try:
            # Poisson seamless clone for smooth boundary
            blended = cv2.seamlessClone(
                img_array, canvas, np.ones_like(img_array[:, :, 0]) * 255,
                (center_x, center_y), cv2.NORMAL_CLONE,
            )
        except Exception:
            # Fall back to alpha blending if Poisson fails
            blended = canvas.copy()
            # Create gradient alpha mask for the boundary
            blend_mask = np.zeros((new_h, new_w), dtype=np.float32)
            blend_mask[extend_top:extend_top + orig_h, extend_left:extend_left + orig_w] = 1.0
            # Blur edges for smooth transition
            blend_mask = cv2.GaussianBlur(blend_mask, (31, 31), 0)
            alpha_3ch = blend_mask[:, :, np.newaxis]

            # Paste original into canvas position
            paste = canvas.copy()
            paste[extend_top:extend_top + orig_h, extend_left:extend_left + orig_w] = img_array

            blended = (canvas.astype(np.float32) * (1.0 - alpha_3ch) +
                       paste.astype(np.float32) * alpha_3ch)
            blended = np.clip(blended, 0, 255).astype(np.uint8)

        emit_progress(95, "Saving")
        Image.fromarray(blended).save(output_path)

        print(json.dumps({
            "success": True,
            "method": "lama-enhanced-outpaint",
            "originalWidth": orig_w,
            "originalHeight": orig_h,
            "newWidth": new_w,
            "newHeight": new_h,
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
