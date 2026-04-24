"""AI photo restoration pipeline.

Multi-step pipeline for restoring old and damaged photos:
1. Scratch & damage detection (morphological analysis)
2. Damage inpainting (LaMa ONNX)
3. Face enhancement (CodeFormer ONNX)
4. Noise reduction (OpenCV NLMeans)
5. Optional B&W colorization (DDColor ONNX)
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


# ── Model paths ───────────────────────────────────────────────────────

_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")

LAMA_MODEL_DIR = os.environ.get("LAMA_MODEL_DIR", os.path.join(_MODELS_BASE, "lama"))
LAMA_MODEL_PATH = os.path.join(LAMA_MODEL_DIR, "lama_fp32.onnx")
LAMA_LOCAL_CACHE = os.path.join(os.path.expanduser("~"), ".cache", "snapotter", "lama")
LAMA_LOCAL_PATH = os.path.join(LAMA_LOCAL_CACHE, "lama_fp32.onnx")

CODEFORMER_MODEL_DIR = os.environ.get("CODEFORMER_MODEL_DIR", os.path.join(_MODELS_BASE, "codeformer"))
CODEFORMER_MODEL_PATH = os.path.join(CODEFORMER_MODEL_DIR, "codeformer.onnx")
CODEFORMER_LOCAL_CACHE = os.path.join(
    os.path.expanduser("~"), ".cache", "snapotter", "codeformer"
)
CODEFORMER_LOCAL_PATH = os.path.join(CODEFORMER_LOCAL_CACHE, "codeformer.onnx")

DDCOLOR_MODEL_PATH = os.environ.get(
    "DDCOLOR_MODEL_PATH", os.path.join(_MODELS_BASE, "ddcolor", "ddcolor.onnx")
)

LAMA_MODEL_SIZE = 512
CODEFORMER_SIZE = 512


# ── Scratch detection ─────────────────────────────────────────────────

def detect_scratches(img_bgr, sensitivity="medium"):
    """Detect scratches, tears, and spots using morphological analysis.

    Uses top-hat and black-hat transforms with oriented line kernels
    to find both bright and dark linear structures at multiple scales
    and angles. Returns a binary mask (255 = damage, 0 = clean).
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # CLAHE for local contrast enhancement to reveal faint scratches
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Sensitivity controls the detection threshold
    thresh_map = {"light": 170, "medium": 130, "heavy": 90}
    thresh = thresh_map.get(sensitivity, 130)

    h, w = gray.shape
    base_dim = min(h, w)

    # Scale kernel sizes to image resolution
    kernel_sizes = [
        max(9, base_dim // 80),
        max(15, base_dim // 50),
        max(25, base_dim // 30),
    ]

    mask = np.zeros_like(gray)

    for ksize in kernel_sizes:
        ksize = ksize | 1  # ensure odd
        for angle in [0, 45, 90, 135]:
            kernel = _make_line_kernel(ksize, angle)

            # Black-hat: detects dark structures (dark scratches on light areas)
            blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, kernel)
            # Top-hat: detects bright structures (light scratches on dark areas)
            tophat = cv2.morphologyEx(enhanced, cv2.MORPH_TOPHAT, kernel)

            combined = cv2.add(blackhat, tophat)
            _, binary = cv2.threshold(combined, thresh, 255, cv2.THRESH_BINARY)
            mask = cv2.bitwise_or(mask, binary)

    # Clean up: remove isolated noise pixels
    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open)

    # Connect nearby scratch segments
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close)

    # Dilate to include scratch edges for cleaner inpainting
    kernel_dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.dilate(mask, kernel_dilate, iterations=1)

    return mask


def _make_line_kernel(size, angle):
    """Create an oriented line structuring element."""
    kernel = np.zeros((size, size), np.uint8)
    mid = size // 2
    if angle == 0:
        kernel[mid, :] = 1
    elif angle == 90:
        kernel[:, mid] = 1
    elif angle == 45:
        for i in range(size):
            kernel[i, i] = 1
    elif angle == 135:
        for i in range(size):
            kernel[i, size - 1 - i] = 1
    return kernel


# ── LaMa inpainting ──────────────────────────────────────────────────

def _get_lama_path():
    """Resolve LaMa model path, downloading if needed."""
    if os.path.exists(LAMA_MODEL_PATH):
        return LAMA_MODEL_PATH
    if os.path.exists(LAMA_LOCAL_PATH):
        return LAMA_LOCAL_PATH
    # Auto-download for local dev
    os.makedirs(LAMA_LOCAL_CACHE, exist_ok=True)
    import urllib.request
    url = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"
    urllib.request.urlretrieve(url, LAMA_LOCAL_PATH)
    return LAMA_LOCAL_PATH


def inpaint_damage(img_bgr, mask):
    """Inpaint damaged areas using LaMa ONNX model.

    Args:
        img_bgr: Input BGR image as numpy array.
        mask: Binary mask (255 = damage to repair, 0 = keep).

    Returns:
        Restored BGR image with damage inpainted.
    """
    from gpu import safe_onnx_session

    model_path = _get_lama_path()
    session, _device = safe_onnx_session(model_path)

    orig_h, orig_w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    # Preprocess image: resize to 512x512, normalize to [0,1], NCHW
    img_resized = cv2.resize(img_rgb, (LAMA_MODEL_SIZE, LAMA_MODEL_SIZE))
    img_input = img_resized.astype(np.float32) / 255.0
    img_input = np.transpose(img_input, (2, 0, 1))[np.newaxis, ...]  # (1,3,512,512)

    # Preprocess mask: resize to 512x512, binary, NCHW
    mask_resized = cv2.resize(mask, (LAMA_MODEL_SIZE, LAMA_MODEL_SIZE),
                              interpolation=cv2.INTER_NEAREST)
    mask_binary = (mask_resized > 127).astype(np.float32)
    mask_input = mask_binary[np.newaxis, np.newaxis, ...]  # (1,1,512,512)

    # Run inference
    outputs = session.run(None, {"image": img_input, "mask": mask_input})
    result = outputs[0][0]  # (3, 512, 512)
    result = np.transpose(result, (1, 2, 0))  # (512, 512, 3)
    result = np.clip(result, 0, 255).astype(np.uint8)

    # Resize inpainted result back to original dimensions
    inpainted = cv2.resize(result, (orig_w, orig_h), interpolation=cv2.INTER_LANCZOS4)

    # Feathered composite: preserve quality outside mask, blend at edges
    mask_full = mask.astype(np.float32) / 255.0
    feather_r = max(3, min(orig_w, orig_h) // 200)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (feather_r, feather_r))
    dilated = cv2.dilate(mask_full, kernel, iterations=1)
    blur_size = feather_r * 2 + 1
    alpha = cv2.GaussianBlur(dilated, (blur_size, blur_size), 0)
    alpha = np.clip(alpha, 0.0, 1.0)[:, :, np.newaxis]

    # Composite in RGB space, then convert back to BGR
    inpainted_rgb = inpainted
    original_rgb = img_rgb
    composited = (original_rgb.astype(np.float32) * (1.0 - alpha) +
                  inpainted_rgb.astype(np.float32) * alpha)
    composited = np.clip(composited, 0, 255).astype(np.uint8)

    return cv2.cvtColor(composited, cv2.COLOR_RGB2BGR)


# ── CodeFormer face enhancement ──────────────────────────────────────

def _get_codeformer_path():
    """Resolve CodeFormer ONNX model path, downloading if needed."""
    if os.path.exists(CODEFORMER_MODEL_PATH):
        return CODEFORMER_MODEL_PATH
    if os.path.exists(CODEFORMER_LOCAL_PATH):
        return CODEFORMER_LOCAL_PATH

    # Auto-download for local dev
    os.makedirs(CODEFORMER_LOCAL_CACHE, exist_ok=True)
    emit_progress(35, "Downloading CodeFormer model")
    from huggingface_hub import hf_hub_download
    hf_hub_download(
        repo_id="facefusion/models-3.0.0",
        filename="codeformer.onnx",
        local_dir=CODEFORMER_LOCAL_CACHE,
    )
    return CODEFORMER_LOCAL_PATH


# ── Model path for new mp.tasks API ─────────────────────────────────

_FACE_DETECT_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
_FACE_DETECT_DOCKER_PATH = os.path.join(_MODELS_BASE, "mediapipe", "blaze_face_short_range.tflite")
_FACE_DETECT_LOCAL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".models")
_FACE_DETECT_LOCAL_PATH = os.path.join(_FACE_DETECT_LOCAL_DIR, "blaze_face_short_range.tflite")


def _ensure_face_detect_model():
    """Resolve face detector model. Docker path first, then local dev."""
    if os.path.exists(_FACE_DETECT_DOCKER_PATH):
        return _FACE_DETECT_DOCKER_PATH
    if os.path.exists(_FACE_DETECT_LOCAL_PATH):
        return _FACE_DETECT_LOCAL_PATH
    os.makedirs(_FACE_DETECT_LOCAL_DIR, exist_ok=True)
    import urllib.request
    emit_progress(15, "Downloading face detection model")
    urllib.request.urlretrieve(_FACE_DETECT_MODEL_URL, _FACE_DETECT_LOCAL_PATH)
    return _FACE_DETECT_LOCAL_PATH


def enhance_faces(img_bgr, fidelity=0.7):
    """Enhance faces in the image using CodeFormer ONNX.

    1. Detect faces with MediaPipe
    2. Crop each face with generous padding
    3. Run CodeFormer ONNX inference
    4. Paste enhanced face back with feathered blending

    Args:
        img_bgr: Input BGR image.
        fidelity: 0.0 = aggressive enhancement, 1.0 = faithful to original.

    Returns:
        Tuple of (enhanced BGR image, number of faces found).
    """
    import mediapipe as mp
    from gpu import safe_onnx_session

    # Detect faces — downscale large images for reliable MediaPipe detection
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    ih, iw = img_bgr.shape[:2]

    max_dim = 1920
    longest = max(ih, iw)
    if longest > max_dim:
        det_scale = max_dim / longest
        det_rgb = cv2.resize(
            img_rgb,
            (int(iw * det_scale), int(ih * det_scale)),
            interpolation=cv2.INTER_AREA,
        )
        inv_scale = 1.0 / det_scale
    else:
        det_rgb = img_rgb
        inv_scale = 1.0

    try:
        mp_face = mp.solutions.face_detection
        all_detections = []
        for model_sel in [0, 1]:
            detector = mp_face.FaceDetection(
                model_selection=model_sel, min_detection_confidence=0.4
            )
            results = detector.process(det_rgb)
            detector.close()
            for detection in (results.detections or []):
                all_detections.append(detection)

        if not all_detections:
            return img_bgr, 0

        dh, dw = det_rgb.shape[:2]
        face_boxes = []
        for detection in all_detections:
            bbox = detection.location_data.relative_bounding_box
            face_boxes.append({
                "x": int(bbox.xmin * dw * inv_scale),
                "y": int(bbox.ymin * dh * inv_scale),
                "w": int(bbox.width * dw * inv_scale),
                "h": int(bbox.height * dh * inv_scale),
            })

    except AttributeError:
        model_path = _ensure_face_detect_model()
        options = mp.tasks.vision.FaceDetectorOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            min_detection_confidence=0.4,
        )
        fd = mp.tasks.vision.FaceDetector.create_from_options(options)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=det_rgb)
        result = fd.detect(mp_image)
        fd.close()

        if not result.detections:
            return img_bgr, 0

        face_boxes = []
        for detection in result.detections:
            bbox = detection.bounding_box
            face_boxes.append({
                "x": int(bbox.origin_x * inv_scale),
                "y": int(bbox.origin_y * inv_scale),
                "w": int(bbox.width * inv_scale),
                "h": int(bbox.height * inv_scale),
            })

    # Load CodeFormer model
    model_path = _get_codeformer_path()
    session, _device = safe_onnx_session(model_path)
    input_names = [inp.name for inp in session.get_inputs()]

    result = img_bgr.copy()
    faces_enhanced = 0

    for i, face_box in enumerate(face_boxes):
        x = face_box["x"]
        y = face_box["y"]
        w = face_box["w"]
        h = face_box["h"]

        if w < 24 or h < 24:
            continue

        # Expand bounding box by ~80% for hair, forehead, chin
        pad_x = int(w * 0.8)
        pad_y = int(h * 0.8)
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(iw, x + w + pad_x)
        y2 = min(ih, y + h + pad_y)

        # Crop face region
        face_crop = img_bgr[y1:y2, x1:x2].copy()
        crop_h, crop_w = face_crop.shape[:2]

        # Resize to 512x512 for CodeFormer
        face_resized = cv2.resize(face_crop, (CODEFORMER_SIZE, CODEFORMER_SIZE),
                                  interpolation=cv2.INTER_LANCZOS4)

        # Preprocess: BGR -> RGB, normalize to [-1, 1]
        face_rgb = cv2.cvtColor(face_resized, cv2.COLOR_BGR2RGB)
        face_input = face_rgb.astype(np.float32) / 255.0
        face_input = (face_input - 0.5) / 0.5
        face_input = np.transpose(face_input, (2, 0, 1))
        face_input = np.expand_dims(face_input, 0)  # (1, 3, 512, 512)

        # Build model inputs
        model_inputs = {}
        for name in input_names:
            if name == "input":
                model_inputs[name] = face_input.astype(np.float32)
            elif name == "weight":
                model_inputs[name] = np.array([fidelity]).astype(np.float64)

        # Run inference
        try:
            output = session.run(None, model_inputs)[0][0]  # (3, 512, 512)
        except Exception as e:
            print(f"[restore] CodeFormer inference failed for face {i}: {e}", file=sys.stderr, flush=True)
            continue

        # Postprocess: [-1, 1] -> [0, 255], RGB -> BGR
        output = np.clip(output, -1, 1)
        output = (output + 1) / 2
        output = np.transpose(output, (1, 2, 0))  # (512, 512, 3)
        output = (output * 255.0).clip(0, 255).astype(np.uint8)
        output_bgr = cv2.cvtColor(output, cv2.COLOR_RGB2BGR)

        # Resize back to original crop size
        enhanced_crop = cv2.resize(output_bgr, (crop_w, crop_h),
                                   interpolation=cv2.INTER_LANCZOS4)

        # Create feathered elliptical mask for smooth blending
        blend_mask = np.zeros((crop_h, crop_w), dtype=np.float32)
        center = (crop_w // 2, crop_h // 2)
        axes = (int(crop_w * 0.42), int(crop_h * 0.45))
        cv2.ellipse(blend_mask, center, axes, 0, 0, 360, 1.0, -1)

        # Feather the mask edges
        blur_r = max(5, min(crop_w, crop_h) // 8) | 1
        blend_mask = cv2.GaussianBlur(blend_mask, (blur_r, blur_r), 0)
        blend_mask = blend_mask[:, :, np.newaxis]

        # Blend enhanced face into result
        face_region = result[y1:y2, x1:x2].astype(np.float32)
        blended = face_region * (1.0 - blend_mask) + enhanced_crop.astype(np.float32) * blend_mask
        result[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)
        faces_enhanced += 1

    return result, faces_enhanced


# ── Denoising ─────────────────────────────────────────────────────────

def denoise_image(img_bgr, strength=40):
    """Apply noise reduction using Non-Local Means in LAB color space.

    Processes luminance and chrominance channels independently
    for better color preservation.

    Args:
        img_bgr: Input BGR image.
        strength: 0-100, higher = more aggressive denoising.

    Returns:
        Denoised BGR image.
    """
    if strength <= 0:
        return img_bgr

    # Map 0-100 to NLMeans filter strength
    h = 3 + (strength / 100) * 12  # 3-15

    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)

    # Denoise luminance channel
    l_ch = cv2.fastNlMeansDenoising(l_ch, None, h, 7, 21)

    # Lightly denoise color channels to remove chroma noise
    color_h = h * 0.5
    if color_h > 1:
        a_ch = cv2.fastNlMeansDenoising(a_ch, None, color_h, 7, 21)
        b_ch = cv2.fastNlMeansDenoising(b_ch, None, color_h, 7, 21)

    result = cv2.merge([l_ch, a_ch, b_ch])
    return cv2.cvtColor(result, cv2.COLOR_LAB2BGR)


# ── B&W detection ────────────────────────────────────────────────────

def is_grayscale(img_bgr):
    """Detect if an image is grayscale/B&W.

    Checks if color channels are nearly identical by measuring
    the standard deviation of channel differences.
    """
    if len(img_bgr.shape) == 2:
        return True
    if img_bgr.shape[2] == 1:
        return True

    b, g, r = cv2.split(img_bgr)
    diff_rg = np.abs(r.astype(np.float32) - g.astype(np.float32)).mean()
    diff_rb = np.abs(r.astype(np.float32) - b.astype(np.float32)).mean()
    diff_gb = np.abs(g.astype(np.float32) - b.astype(np.float32)).mean()
    avg_diff = (diff_rg + diff_rb + diff_gb) / 3

    return bool(avg_diff < 5.0)


# ── DDColor colorization ─────────────────────────────────────────────

def colorize_bw(img_bgr, intensity=0.85):
    """Colorize a B&W image using DDColor ONNX.

    Reuses the DDColor model that the colorize tool already downloads.
    """
    from gpu import safe_onnx_session

    if not os.path.exists(DDCOLOR_MODEL_PATH):
        return img_bgr, False

    session, _device = safe_onnx_session(DDCOLOR_MODEL_PATH)
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    model_size = (
        input_shape[2]
        if len(input_shape) == 4 and isinstance(input_shape[2], int)
        else 512
    )

    orig_h, orig_w = img_bgr.shape[:2]
    img_lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    orig_l = img_lab[:, :, 0].astype(np.float32)

    # Prepare input
    img_resized = cv2.resize(img_bgr, (model_size, model_size))
    img_float = img_resized.astype(np.float32) / 255.0
    img_nchw = np.transpose(img_float, (2, 0, 1))[np.newaxis, ...]

    output = session.run(None, {input_name: img_nchw})[0]
    ab_pred = output[0]  # (2, model_size, model_size)

    # Resize ab channels back to original
    ab_resized = np.zeros((2, orig_h, orig_w), dtype=np.float32)
    for i in range(2):
        ab_resized[i] = cv2.resize(ab_pred[i], (orig_w, orig_h))

    ab_a = np.clip(ab_resized[0], -128, 127)
    ab_b = np.clip(ab_resized[1], -128, 127)

    # Apply intensity blending
    if intensity < 1.0:
        orig_a = img_lab[:, :, 1].astype(np.float32) - 128.0
        orig_b = img_lab[:, :, 2].astype(np.float32) - 128.0
        ab_a = orig_a * (1 - intensity) + ab_a * intensity
        ab_b = orig_b * (1 - intensity) + ab_b * intensity

    result_lab = np.zeros((orig_h, orig_w, 3), dtype=np.uint8)
    result_lab[:, :, 0] = np.clip(orig_l, 0, 255).astype(np.uint8)
    result_lab[:, :, 1] = np.clip(ab_a + 128.0, 0, 255).astype(np.uint8)
    result_lab[:, :, 2] = np.clip(ab_b + 128.0, 0, 255).astype(np.uint8)

    return cv2.cvtColor(result_lab, cv2.COLOR_LAB2BGR), True


# ── Main pipeline ─────────────────────────────────────────────────────

def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    mode = settings.get("mode", "auto")
    scratch_removal = settings.get("scratchRemoval", True)
    face_enhancement = settings.get("faceEnhancement", True)
    fidelity = float(settings.get("fidelity", 0.7))
    do_denoise = settings.get("denoise", True)
    denoise_strength = float(settings.get("denoiseStrength", 40))
    do_colorize = settings.get("colorize", False)

    # Mode presets override individual settings
    if mode == "light":
        scratch_sensitivity = "light"
        if denoise_strength > 30:
            denoise_strength = 30
    elif mode == "heavy":
        scratch_sensitivity = "heavy"
        if denoise_strength < 60:
            denoise_strength = 60
    else:
        scratch_sensitivity = "medium"

    try:
        from gpu import gpu_available
        device = "cuda" if gpu_available() else "cpu"

        emit_progress(5, "Opening image")
        img_bgr = cv2.imread(input_path, cv2.IMREAD_COLOR)
        if img_bgr is None:
            pil_img = Image.open(input_path).convert("RGB")
            img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        orig_h, orig_w = img_bgr.shape[:2]
        result = img_bgr.copy()
        steps_applied = []

        # ── Step 1: Analyze photo ────────────────────────────────
        emit_progress(8, "Analyzing photo")
        bw_detected = is_grayscale(img_bgr)
        scratch_mask = None
        scratch_coverage = 0.0

        # ── Step 2: Scratch detection & inpainting ───────────────
        if scratch_removal:
            emit_progress(10, "Detecting damage")
            scratch_mask = detect_scratches(result, scratch_sensitivity)
            scratch_pixels = np.count_nonzero(scratch_mask)
            total_pixels = scratch_mask.shape[0] * scratch_mask.shape[1]
            scratch_coverage = float(scratch_pixels / total_pixels)

            if scratch_coverage > 0.001:  # At least 0.1% coverage
                emit_progress(15, f"Repairing damage ({scratch_coverage:.1%} affected)")
                result = inpaint_damage(result, scratch_mask)
                steps_applied.append("scratch_removal")
                emit_progress(30, "Damage repaired")
            else:
                emit_progress(15, "No significant damage detected")
        else:
            emit_progress(15, "Scratch removal disabled")

        # ── Step 3: Face enhancement ─────────────────────────────
        faces_found = 0
        if face_enhancement:
            emit_progress(35, "Detecting faces")
            try:
                result, faces_found = enhance_faces(result, fidelity)
                if faces_found > 0:
                    steps_applied.append("face_enhancement")
                    emit_progress(65, f"Enhanced {faces_found} face{'s' if faces_found != 1 else ''}")
                else:
                    emit_progress(65, "No faces detected")
            except Exception as e:
                emit_progress(65, f"Face enhancement skipped: {str(e)[:40]}")
        else:
            emit_progress(65, "Face enhancement disabled")

        # ── Step 4: Noise reduction ──────────────────────────────
        if do_denoise and denoise_strength > 0:
            emit_progress(70, "Reducing noise")
            result = denoise_image(result, denoise_strength)
            steps_applied.append("denoise")
            emit_progress(80, "Noise reduced")
        else:
            emit_progress(80, "Denoising disabled")

        # ── Step 5: Colorization ─────────────────────────────────
        colorized = False
        if do_colorize and bw_detected:
            emit_progress(82, "Colorizing B&W photo")
            try:
                result, colorized = colorize_bw(result, intensity=0.85)
                if colorized:
                    steps_applied.append("colorize")
                    emit_progress(92, "Colorization complete")
                else:
                    emit_progress(92, "Colorization model not available")
            except Exception as e:
                emit_progress(92, f"Colorization skipped: {str(e)[:40]}")
        else:
            emit_progress(92, "Colorization skipped")

        # ── Save result ──────────────────────────────────────────
        emit_progress(95, "Saving result")
        cv2.imwrite(output_path, result)

        print(json.dumps({
            "success": True,
            "width": orig_w,
            "height": orig_h,
            "steps": steps_applied,
            "scratchCoverage": round(scratch_coverage * 100, 2),
            "facesEnhanced": faces_found,
            "isGrayscale": bw_detected,
            "colorized": colorized,
            "device": device,
            "output_path": output_path,
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
