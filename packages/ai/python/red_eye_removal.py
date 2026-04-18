"""Red-eye removal using MediaPipe Face Mesh."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# ── Model path for new mp.tasks API ─────────────────────────────────

_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")

_FACE_MESH_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
_DOCKER_MODEL_PATH = os.path.join(_MODELS_BASE, "mediapipe", "face_landmarker.task")
_LOCAL_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".models")
_LOCAL_MODEL_PATH = os.path.join(_LOCAL_MODEL_DIR, "face_landmarker.task")


def _ensure_face_mesh_model():
    """Resolve face landmarker model. Docker path first, then local dev."""
    if os.path.exists(_DOCKER_MODEL_PATH):
        return _DOCKER_MODEL_PATH
    if os.path.exists(_LOCAL_MODEL_PATH):
        return _LOCAL_MODEL_PATH
    os.makedirs(_LOCAL_MODEL_DIR, exist_ok=True)
    import urllib.request
    emit_progress(15, "Downloading face mesh model")
    urllib.request.urlretrieve(_FACE_MESH_MODEL_URL, _LOCAL_MODEL_PATH)
    return _LOCAL_MODEL_PATH


def _mesh_with_solutions(img_array, max_faces=10, min_confidence=0.5):
    """FaceMesh using legacy mp.solutions API (mediapipe < 0.10.30).

    Returns list of landmark lists. Each landmark has .x, .y attributes.
    """
    import mediapipe as mp

    mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=max_faces,
        refine_landmarks=True,
        min_detection_confidence=min_confidence,
    )
    results = mesh.process(img_array)
    mesh.close()

    if not results.multi_face_landmarks:
        return []

    return [face.landmark for face in results.multi_face_landmarks]


def _mesh_with_tasks(img_array, max_faces=10, min_confidence=0.5):
    """FaceMesh using new mp.tasks API (mediapipe >= 0.10.30).

    Returns list of landmark lists. Each landmark has .x, .y attributes.
    """
    import mediapipe as mp

    model_path = _ensure_face_mesh_model()
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=max_faces,
        min_face_detection_confidence=min_confidence,
    )
    landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_array)
    result = landmarker.detect(mp_image)
    landmarker.close()

    if not result.face_landmarks:
        return []

    return result.face_landmarks


def _detect_face_mesh(img_array, max_faces=10, min_confidence=0.5):
    """Detect face mesh, trying legacy API first then falling back to tasks API."""
    try:
        return _mesh_with_solutions(img_array, max_faces, min_confidence)
    except AttributeError:
        return _mesh_with_tasks(img_array, max_faces, min_confidence)


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    sensitivity = settings.get("sensitivity", 50)
    strength = settings.get("strength", 70)
    out_format = settings.get("format", "original")
    quality = settings.get("quality", 90)

    # Map sensitivity (0-100) to LAB "a" channel threshold.
    # Higher sensitivity = lower threshold = more pixels flagged as red.
    threshold = 170 - (sensitivity / 100) * 50

    # Map strength (0-100) to darken factor.
    # Higher strength = darker correction.
    darken_factor = 1.0 - (strength / 100) * 0.7

    try:
        emit_progress(10, "Preparing image")
        from PIL import Image

        img = Image.open(input_path).convert("RGB")
        width, height = img.size

        # Determine output format
        if out_format == "original":
            ext = os.path.splitext(input_path)[1].lower()
            if ext in (".heic", ".heif"):
                save_format = "PNG"
                if not output_path.lower().endswith(".png"):
                    output_path = os.path.splitext(output_path)[0] + ".png"
            elif ext in (".jpg", ".jpeg"):
                save_format = "JPEG"
            elif ext == ".webp":
                save_format = "WEBP"
            else:
                save_format = "PNG"
        elif out_format == "jpeg":
            save_format = "JPEG"
            if not output_path.lower().endswith((".jpg", ".jpeg")):
                output_path = os.path.splitext(output_path)[0] + ".jpg"
        elif out_format == "webp":
            save_format = "WEBP"
            if not output_path.lower().endswith(".webp"):
                output_path = os.path.splitext(output_path)[0] + ".webp"
        else:
            save_format = "PNG"
            if not output_path.lower().endswith(".png"):
                output_path = os.path.splitext(output_path)[0] + ".png"

        format_label = save_format.lower()
        if format_label == "jpeg":
            format_label = "jpg"

        try:
            import numpy as np
            import cv2

            emit_progress(25, "Detecting faces")

            img_array = np.array(img)

            # Try legacy mp.solutions API first, fall back to mp.tasks
            all_face_landmarks = _detect_face_mesh(img_array)

            faces_detected = len(all_face_landmarks)
            eyes_corrected = 0

            emit_progress(50, "Analyzing eyes")

            # Iris landmark indices
            right_iris = [468, 469, 470, 471, 472]  # 468 = center
            left_iris = [473, 474, 475, 476, 477]   # 473 = center

            if faces_detected > 0:
                all_eyes = []
                for landmarks in all_face_landmarks:
                    for iris_indices in [right_iris, left_iris]:
                        center_idx = iris_indices[0]
                        contour_indices = iris_indices[1:]

                        cx = int(landmarks[center_idx].x * width)
                        cy = int(landmarks[center_idx].y * height)

                        # Compute radius from contour landmarks
                        radii = []
                        for idx in contour_indices:
                            px = int(landmarks[idx].x * width)
                            py = int(landmarks[idx].y * height)
                            dist = np.sqrt((px - cx) ** 2 + (py - cy) ** 2)
                            radii.append(dist)
                        radius = np.mean(radii) if radii else 5.0

                        all_eyes.append((cx, cy, radius))

                total_eyes = len(all_eyes)
                for eye_i, (cx, cy, radius) in enumerate(all_eyes):
                    progress = 50 + int((eye_i + 1) / total_eyes * 40)
                    emit_progress(progress, f"Correcting eye {eye_i + 1} of {total_eyes}")

                    # Padded radius for the circular mask
                    padded_radius = radius * 1.3
                    r_int = int(np.ceil(padded_radius))

                    # Bounding box for the ROI
                    x1 = max(0, cx - r_int)
                    y1 = max(0, cy - r_int)
                    x2 = min(width, cx + r_int)
                    y2 = min(height, cy + r_int)

                    if x2 <= x1 or y2 <= y1:
                        continue

                    # Create circular mask in ROI space
                    roi_h = y2 - y1
                    roi_w = x2 - x1
                    yy, xx = np.ogrid[:roi_h, :roi_w]
                    local_cx = cx - x1
                    local_cy = cy - y1
                    circle_mask = ((xx - local_cx) ** 2 + (yy - local_cy) ** 2) <= (padded_radius ** 2)

                    # Extract ROI
                    roi = img_array[y1:y2, x1:x2].copy()

                    # Convert to LAB
                    roi_lab = cv2.cvtColor(roi, cv2.COLOR_RGB2LAB).astype(np.float64)
                    L_chan = roi_lab[:, :, 0]
                    a_chan = roi_lab[:, :, 1]

                    # LAB red detection: a > threshold AND 50 < L < 220
                    lab_red = (a_chan > threshold) & (L_chan > 50) & (L_chan < 220)

                    # HSV saturation check
                    roi_hsv = cv2.cvtColor(roi, cv2.COLOR_RGB2HSV)
                    S_chan = roi_hsv[:, :, 1]
                    hsv_saturated = S_chan > 60

                    # Intersection: LAB-red AND HSV-saturated AND inside circle
                    red_mask = lab_red & hsv_saturated & circle_mask

                    # Morphological cleanup
                    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
                    red_mask_u8 = red_mask.astype(np.uint8) * 255
                    red_mask_u8 = cv2.morphologyEx(red_mask_u8, cv2.MORPH_CLOSE, kernel)
                    red_mask_u8 = cv2.morphologyEx(red_mask_u8, cv2.MORPH_OPEN, kernel)

                    red_pixel_count = np.count_nonzero(red_mask_u8)
                    if red_pixel_count < 3:
                        continue

                    # Correct red pixels in LAB space
                    corrected_lab = roi_lab.copy()
                    mask_bool = red_mask_u8 > 0
                    corrected_lab[:, :, 0][mask_bool] = corrected_lab[:, :, 0][mask_bool] * darken_factor
                    corrected_lab[:, :, 1][mask_bool] = 128  # neutral a
                    corrected_lab[:, :, 2][mask_bool] = 128  # neutral b

                    corrected_lab = np.clip(corrected_lab, 0, 255).astype(np.uint8)
                    corrected_rgb = cv2.cvtColor(corrected_lab, cv2.COLOR_LAB2RGB)

                    # Soft mask for blending (Gaussian blur on mask edges)
                    soft_mask = cv2.GaussianBlur(
                        red_mask_u8.astype(np.float32), (5, 5), 1.5
                    )
                    soft_mask = soft_mask / 255.0
                    soft_mask = soft_mask[:, :, np.newaxis]

                    # Alpha blend corrected with original
                    blended = (corrected_rgb.astype(np.float32) * soft_mask +
                               roi.astype(np.float32) * (1.0 - soft_mask))
                    blended = np.clip(blended, 0, 255).astype(np.uint8)

                    img_array[y1:y2, x1:x2] = blended
                    eyes_corrected += 1

                # Update the PIL image from the corrected array
                img = Image.fromarray(img_array)

            emit_progress(95, "Saving result")

            save_kwargs = {}
            if save_format == "JPEG":
                save_kwargs["quality"] = quality
            elif save_format == "WEBP":
                save_kwargs["quality"] = quality

            img.save(output_path, format=save_format, **save_kwargs)

            print(
                json.dumps(
                    {
                        "success": True,
                        "facesDetected": faces_detected,
                        "eyesCorrected": eyes_corrected,
                        "width": width,
                        "height": height,
                        "format": format_label,
                        "output_path": output_path,
                    }
                )
            )

        except ImportError:
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": "Red-eye removal requires MediaPipe, NumPy, and OpenCV. Install with: pip install mediapipe numpy opencv-python",
                    }
                )
            )
            sys.exit(1)

    except ImportError:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "Pillow is not installed. Install with: pip install Pillow",
                }
            )
        )
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
