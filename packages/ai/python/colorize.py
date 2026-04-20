"""AI photo colorization using DDColor ONNX model.

Converts grayscale / black-and-white photos to full color using the DDColor
dual-decoder architecture. Falls back to a lightweight OpenCV DNN colorizer
when the DDColor model is unavailable.
"""
import sys
import json
import os

try:
    import numpy as np
    import cv2
    from PIL import Image
except ImportError as _e:
    print(json.dumps({"error": f"Missing dependency: {_e}. Install opencv-python-headless, numpy, and Pillow."}))
    sys.exit(1)


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")

DDCOLOR_MODEL_PATH = os.environ.get(
    "DDCOLOR_MODEL_PATH",
    os.path.join(_MODELS_BASE, "ddcolor", "ddcolor.onnx"),
)

# OpenCV DNN fallback model paths (lightweight ~17 MB)
OPENCV_PROTO_PATH = os.environ.get(
    "OPENCV_COLORIZE_PROTO",
    os.path.join(_MODELS_BASE, "colorize-opencv", "colorization_deploy_v2.prototxt"),
)
OPENCV_MODEL_PATH = os.environ.get(
    "OPENCV_COLORIZE_MODEL",
    os.path.join(_MODELS_BASE, "colorize-opencv", "colorization_release_v2.caffemodel"),
)
OPENCV_POINTS_PATH = os.environ.get(
    "OPENCV_COLORIZE_POINTS",
    os.path.join(_MODELS_BASE, "colorize-opencv", "pts_in_hull.npy"),
)


def colorize_ddcolor(img_bgr, intensity):
    """Colorize using DDColor ONNX model."""
    from gpu import safe_onnx_session

    emit_progress(15, "Loading DDColor model")

    session, _device = safe_onnx_session(DDCOLOR_MODEL_PATH)
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    # Dynamic dims are strings ('w', 'h'), so default to 512 if not int
    model_size = input_shape[2] if len(input_shape) == 4 and isinstance(input_shape[2], int) else 512

    emit_progress(25, "Preprocessing image")

    orig_h, orig_w = img_bgr.shape[:2]

    # Convert to Lab, extract L channel
    img_lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    orig_l = img_lab[:, :, 0].astype(np.float32)

    # Prepare input: resize, normalize to [0, 1], NCHW format
    img_resized = cv2.resize(img_bgr, (model_size, model_size))
    img_float = img_resized.astype(np.float32) / 255.0
    img_nchw = np.transpose(img_float, (2, 0, 1))
    img_nchw = np.expand_dims(img_nchw, axis=0)

    emit_progress(40, "Running AI colorization")

    # Run inference - model outputs predicted ab channels
    output = session.run(None, {input_name: img_nchw})[0]

    emit_progress(75, "Post-processing colors")

    # Output shape: (1, 2, H, W) - predicted ab channels
    ab_pred = output[0]  # (2, model_size, model_size)

    # Resize ab channels back to original dimensions
    ab_resized = np.zeros((2, orig_h, orig_w), dtype=np.float32)
    for i in range(2):
        ab_resized[i] = cv2.resize(ab_pred[i], (orig_w, orig_h))

    # Model outputs ab values already in Lab scale (roughly -50 to +70)
    ab_a = np.clip(ab_resized[0], -128, 127)
    ab_b = np.clip(ab_resized[1], -128, 127)

    # Apply intensity blending
    if intensity < 1.0:
        # Blend with original ab channels (grayscale has ab near 0)
        orig_a = img_lab[:, :, 1].astype(np.float32) - 128.0
        orig_b = img_lab[:, :, 2].astype(np.float32) - 128.0
        ab_a = orig_a * (1 - intensity) + ab_a * intensity
        ab_b = orig_b * (1 - intensity) + ab_b * intensity

    # Reconstruct Lab image
    result_lab = np.zeros((orig_h, orig_w, 3), dtype=np.uint8)
    result_lab[:, :, 0] = np.clip(orig_l, 0, 255).astype(np.uint8)
    result_lab[:, :, 1] = np.clip(ab_a + 128.0, 0, 255).astype(np.uint8)
    result_lab[:, :, 2] = np.clip(ab_b + 128.0, 0, 255).astype(np.uint8)

    # Convert back to BGR
    result_bgr = cv2.cvtColor(result_lab, cv2.COLOR_LAB2BGR)
    return result_bgr, "ddcolor"


def colorize_opencv(img_bgr, intensity):
    """Fallback colorization using lightweight OpenCV DNN model (Zhang et al.)."""
    emit_progress(15, "Loading OpenCV colorizer")

    net = cv2.dnn.readNetFromCaffe(OPENCV_PROTO_PATH, OPENCV_MODEL_PATH)
    pts = np.load(OPENCV_POINTS_PATH).transpose().reshape(2, 313, 1, 1)

    # Set cluster centers as 1x1 convolution kernel
    net.getLayer(net.getLayerId("class8_ab")).blobs = [pts.astype(np.float32)]
    net.getLayer(net.getLayerId("conv8_313_rh")).blobs = [
        np.full([1, 313], 2.606, dtype=np.float32)
    ]

    emit_progress(25, "Preprocessing image")

    orig_h, orig_w = img_bgr.shape[:2]

    # Convert to Lab
    img_lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    orig_l = img_lab[:, :, 0].astype(np.float32)

    # Resize L channel and normalize for the network
    l_resized = cv2.resize(orig_l, (224, 224))
    l_resized -= 50  # Mean subtraction

    emit_progress(40, "Running colorization")

    net.setInput(cv2.dnn.blobFromImage(l_resized))
    ab_out = net.forward()[0]  # (2, 56, 56)

    emit_progress(75, "Post-processing colors")

    # Resize ab to original size
    ab_a = cv2.resize(ab_out[0], (orig_w, orig_h))
    ab_b = cv2.resize(ab_out[1], (orig_w, orig_h))

    # Apply intensity
    if intensity < 1.0:
        orig_a = img_lab[:, :, 1].astype(np.float32) - 128.0
        orig_b = img_lab[:, :, 2].astype(np.float32) - 128.0
        ab_a = orig_a * (1 - intensity) + ab_a * intensity
        ab_b = orig_b * (1 - intensity) + ab_b * intensity

    # Reconstruct
    result_lab = np.zeros((orig_h, orig_w, 3), dtype=np.uint8)
    result_lab[:, :, 0] = np.clip(orig_l, 0, 255).astype(np.uint8)
    result_lab[:, :, 1] = np.clip(ab_a + 128.0, 0, 255).astype(np.uint8)
    result_lab[:, :, 2] = np.clip(ab_b + 128.0, 0, 255).astype(np.uint8)

    result_bgr = cv2.cvtColor(result_lab, cv2.COLOR_LAB2BGR)
    return result_bgr, "opencv"


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    intensity = float(settings.get("intensity", 1.0))
    model_choice = settings.get("model", "auto")

    try:
        emit_progress(5, "Opening image")
        img_bgr = cv2.imread(input_path, cv2.IMREAD_COLOR)
        if img_bgr is None:
            # Try with Pillow for formats OpenCV can't read
            pil_img = Image.open(input_path).convert("RGB")
            img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        orig_h, orig_w = img_bgr.shape[:2]
        result_bgr = None
        method = "unknown"

        if model_choice in ("auto", "ddcolor"):
            try:
                if not os.path.exists(DDCOLOR_MODEL_PATH):
                    raise FileNotFoundError(f"DDColor model not found: {DDCOLOR_MODEL_PATH}")
                result_bgr, method = colorize_ddcolor(img_bgr, intensity)
            except Exception as e:
                import traceback
                print(f"[colorize] DDColor failed: {e}", file=sys.stderr, flush=True)
                traceback.print_exc(file=sys.stderr)
                print(json.dumps({
                    "success": False,
                    "error": (
                        f"DDColor is not available: {e}. "
                        "Install the colorize feature or use model=opencv for basic colorization."
                    ),
                }))
                sys.exit(1)

        elif model_choice == "opencv":
            try:
                if not (os.path.exists(OPENCV_PROTO_PATH) and os.path.exists(OPENCV_MODEL_PATH)):
                    raise FileNotFoundError(f"OpenCV colorize models not found: {OPENCV_PROTO_PATH}")
                result_bgr, method = colorize_opencv(img_bgr, intensity)
            except Exception as e:
                import traceback
                print(f"[colorize] OpenCV failed: {e}", file=sys.stderr, flush=True)
                traceback.print_exc(file=sys.stderr)
                raise

        else:
            print(json.dumps({
                "success": False,
                "error": f"Unknown model '{model_choice}'. Use 'auto', 'ddcolor', or 'opencv'.",
            }))
            sys.exit(1)

        emit_progress(90, "Saving result")

        # Save output as PNG (API route handles format conversion)
        cv2.imwrite(output_path, result_bgr)

        print(json.dumps({
            "success": True,
            "width": orig_w,
            "height": orig_h,
            "method": method,
            "output_path": output_path,
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
