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
LAMA_LOCAL_CACHE = os.path.join(os.path.expanduser("~"), ".cache", "ashim", "lama")
LAMA_LOCAL_PATH = os.path.join(LAMA_LOCAL_CACHE, "lama_fp32.onnx")
LAMA_HF_URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"

# The ONNX model expects 512x512 fixed input.
MODEL_SIZE = 512


def _get_model_path():
    """Return path to the LaMa ONNX model, downloading if needed."""
    if os.path.exists(LAMA_MODEL_PATH):
        return LAMA_MODEL_PATH
    if os.path.exists(LAMA_LOCAL_PATH):
        return LAMA_LOCAL_PATH

    # Auto-download for local dev
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
            import onnxruntime as ort
        except ImportError as e:
            print(json.dumps({
                "success": False,
                "error": f"Missing dependency: {e}. Requires opencv-python-headless and onnxruntime.",
            }))
            sys.exit(1)

        emit_progress(10, "Loading model")
        model_path = _get_model_path()

        # Configure ONNX Runtime session
        from gpu import onnx_providers
        providers = onnx_providers()

        session = ort.InferenceSession(model_path, providers=providers)

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
