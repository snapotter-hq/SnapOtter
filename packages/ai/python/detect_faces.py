"""Face detection and blurring using MediaPipe."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# ── Model path for new mp.tasks API ─────────────────────────────────

_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")

_FACE_DETECT_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
_DOCKER_MODEL_PATH = os.path.join(_MODELS_BASE, "mediapipe", "blaze_face_short_range.tflite")
_LOCAL_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".models")
_LOCAL_MODEL_PATH = os.path.join(_LOCAL_MODEL_DIR, "blaze_face_short_range.tflite")


def _ensure_face_detect_model():
    """Resolve face detector model. Docker path first, then local dev."""
    if os.path.exists(_DOCKER_MODEL_PATH):
        return _DOCKER_MODEL_PATH
    if os.path.exists(_LOCAL_MODEL_PATH):
        return _LOCAL_MODEL_PATH
    os.makedirs(_LOCAL_MODEL_DIR, exist_ok=True)
    import urllib.request
    emit_progress(15, "Downloading face detection model")
    urllib.request.urlretrieve(_FACE_DETECT_MODEL_URL, _LOCAL_MODEL_PATH)
    return _LOCAL_MODEL_PATH


def _iou(a, b):
    """Compute intersection-over-union between two face boxes."""
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    inter_w = max(0, min(ax2, bx2) - max(a["x"], b["x"]))
    inter_h = max(0, min(ay2, by2) - max(a["y"], b["y"]))
    inter = inter_w * inter_h
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union > 0 else 0.0


def _nms_faces(faces, iou_threshold=0.4):
    """Remove duplicate detections using greedy non-maximum suppression."""
    if len(faces) <= 1:
        return faces
    kept = []
    used = [False] * len(faces)
    for i in range(len(faces)):
        if used[i]:
            continue
        kept.append(faces[i])
        used[i] = True
        for j in range(i + 1, len(faces)):
            if not used[j] and _iou(faces[i], faces[j]) >= iou_threshold:
                used[j] = True
    return kept


def _detect_with_solutions(img_array, min_confidence):
    """Detect faces using legacy mp.solutions API (mediapipe < 0.10.30).

    Runs both short-range (model 0) and full-range (model 1) detectors and
    merges the results. Previously the loop broke on the first model that
    found any face, so group photos where model 0 caught only 1-2 large
    faces would never have the remaining faces scanned by model 1.
    """
    import mediapipe as mp

    mp_face = mp.solutions.face_detection
    ih, iw = img_array.shape[:2]
    all_faces = []

    for model_sel in [0, 1]:
        detector = mp_face.FaceDetection(
            model_selection=model_sel,
            min_detection_confidence=min_confidence,
        )
        results = detector.process(img_array)
        detector.close()
        for detection in (results.detections or []):
            bbox = detection.location_data.relative_bounding_box
            all_faces.append({
                "x": int(bbox.xmin * iw),
                "y": int(bbox.ymin * ih),
                "w": int(bbox.width * iw),
                "h": int(bbox.height * ih),
            })

    return _nms_faces(all_faces)


def _detect_with_tasks(img_array, min_confidence):
    """Detect faces using new mp.tasks API (mediapipe >= 0.10.30)."""
    import mediapipe as mp

    model_path = _ensure_face_detect_model()
    options = mp.tasks.vision.FaceDetectorOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        min_detection_confidence=min_confidence,
    )
    detector = mp.tasks.vision.FaceDetector.create_from_options(options)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_array)
    result = detector.detect(mp_image)
    detector.close()

    faces = []
    for detection in result.detections:
        bbox = detection.bounding_box
        faces.append({
            "x": bbox.origin_x,
            "y": bbox.origin_y,
            "w": bbox.width,
            "h": bbox.height,
        })
    return faces


def _detect_faces(img_array, min_confidence):
    """Detect faces, trying legacy API first then falling back to tasks API."""
    try:
        return _detect_with_solutions(img_array, min_confidence)
    except AttributeError:
        return _detect_with_tasks(img_array, min_confidence)


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    blur_radius = settings.get("blurRadius", 30)
    sensitivity = settings.get("sensitivity", 0.5)
    detect_only = settings.get("detectOnly", False)

    try:
        emit_progress(10, "Preparing")
        from PIL import Image, ImageFilter

        img = Image.open(input_path).convert("RGB")

        try:
            import numpy as np

            emit_progress(20, "Ready")

            # Map sensitivity (0.1-0.9) to MediaPipe confidence threshold.
            # Higher sensitivity = lower confidence threshold = more detections.
            min_confidence = max(0.1, 1.0 - sensitivity)

            img_array = np.array(img)

            # Try legacy mp.solutions API first, fall back to mp.tasks
            emit_progress(25, "Scanning for faces")
            faces = _detect_faces(img_array, min_confidence)
            num_faces = len(faces)
            emit_progress(50, f"Found {num_faces} face{'s' if num_faces != 1 else ''}")

            if num_faces > 0 and not detect_only:
                for i, face in enumerate(faces):
                    x, y, w, h = face["x"], face["y"], face["w"], face["h"]

                    # Add padding around the face
                    pad = int(max(w, h) * 0.1)
                    x1 = max(0, x - pad)
                    y1 = max(0, y - pad)
                    x2 = min(img.width, x + w + pad)
                    y2 = min(img.height, y + h + pad)

                    face_region = img.crop((x1, y1, x2, y2))
                    blurred = face_region.filter(
                        ImageFilter.GaussianBlur(blur_radius)
                    )
                    img.paste(blurred, (x1, y1))
                    emit_progress(
                        50 + int((i + 1) / num_faces * 40),
                        f"Blurring face {i + 1} of {num_faces}",
                    )

            if not detect_only:
                emit_progress(95, "Saving result")
                img.save(output_path)

            print(
                json.dumps(
                    {
                        "success": True,
                        "facesDetected": len(faces),
                        "faces": faces,
                    }
                )
            )

        except ImportError:
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": "Face detection requires MediaPipe. Install with: pip install mediapipe",
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
