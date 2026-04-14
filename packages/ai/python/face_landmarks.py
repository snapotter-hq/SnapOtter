"""Face landmark detection using MediaPipe FaceMesh for passport photo positioning."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


# ── Landmark extraction (shared by both APIs) ──────────────────────

# MediaPipe face mesh indices for key points
LEFT_EYE_INDICES = [33, 133, 159, 145, 160, 144, 158, 153]
RIGHT_EYE_INDICES = [362, 263, 386, 374, 385, 373, 387, 380]
CHIN_INDEX = 152
FOREHEAD_INDEX = 10
NOSE_INDEX = 1


def extract_key_points(lms):
    """Extract passport-relevant points from a list of (x, y) normalized landmarks."""
    left_eye_x = sum(lms[i][0] for i in LEFT_EYE_INDICES) / len(LEFT_EYE_INDICES)
    left_eye_y = sum(lms[i][1] for i in LEFT_EYE_INDICES) / len(LEFT_EYE_INDICES)

    right_eye_x = sum(lms[i][0] for i in RIGHT_EYE_INDICES) / len(RIGHT_EYE_INDICES)
    right_eye_y = sum(lms[i][1] for i in RIGHT_EYE_INDICES) / len(RIGHT_EYE_INDICES)

    eye_center_x = (left_eye_x + right_eye_x) / 2
    eye_center_y = (left_eye_y + right_eye_y) / 2

    chin_x, chin_y = lms[CHIN_INDEX]
    forehead_x, forehead_y = lms[FOREHEAD_INDEX]
    nose_x, nose_y = lms[NOSE_INDEX]

    forehead_chin_dist = chin_y - forehead_y
    crown_y = forehead_y - (forehead_chin_dist * 0.15)
    crown_x = forehead_x

    face_center_x = (nose_x + eye_center_x) / 2

    return {
        "leftEye": {"x": round(left_eye_x, 6), "y": round(left_eye_y, 6)},
        "rightEye": {"x": round(right_eye_x, 6), "y": round(right_eye_y, 6)},
        "eyeCenter": {"x": round(eye_center_x, 6), "y": round(eye_center_y, 6)},
        "chin": {"x": round(chin_x, 6), "y": round(chin_y, 6)},
        "forehead": {"x": round(forehead_x, 6), "y": round(forehead_y, 6)},
        "crown": {"x": round(crown_x, 6), "y": round(crown_y, 6)},
        "nose": {"x": round(nose_x, 6), "y": round(nose_y, 6)},
        "faceCenterX": round(face_center_x, 6),
    }


# ── Old API: mp.solutions (mediapipe < 0.10.30) ───────────────────

def detect_with_solutions(img_array):
    """Use the legacy mp.solutions.face_mesh API."""
    import mediapipe as mp

    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    )

    results = face_mesh.process(img_array)
    face_mesh.close()

    if not results.multi_face_landmarks:
        return None

    face_lm = results.multi_face_landmarks[0]
    return [(lm.x, lm.y) for lm in face_lm.landmark]


# ── New API: mp.tasks (mediapipe >= 0.10.30) ───────────────────────

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
_DOCKER_MODEL_PATH = "/opt/models/mediapipe/face_landmarker.task"
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".models")
MODEL_PATH = os.path.join(MODEL_DIR, "face_landmarker.task")


def ensure_model():
    """Resolve face landmarker model. Docker path first, then local dev."""
    if os.path.exists(_DOCKER_MODEL_PATH):
        return _DOCKER_MODEL_PATH
    if os.path.exists(MODEL_PATH):
        return MODEL_PATH
    os.makedirs(MODEL_DIR, exist_ok=True)
    import urllib.request
    emit_progress(15, "Downloading face model")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    return MODEL_PATH


def detect_with_tasks(img_path):
    """Use the new mp.tasks.vision.FaceLandmarker API."""
    import mediapipe as mp

    model_path = ensure_model()

    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=0.5,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )

    landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
    mp_image = mp.Image.create_from_file(img_path)
    result = landmarker.detect(mp_image)
    landmarker.close()

    if not result.face_landmarks:
        return None

    face_lm = result.face_landmarks[0]
    return [(lm.x, lm.y) for lm in face_lm]


# ── Main ───────────────────────────────────────────────────────────

def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]  # unused but kept for bridge.ts compatibility
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    try:
        emit_progress(10, "Loading image")
        from PIL import Image

        img = Image.open(input_path).convert("RGB")
        iw, ih = img.size

        try:
            import mediapipe as mp
            import numpy as np

            emit_progress(20, "Initializing face mesh")

            # Try the legacy solutions API first (Docker / older mediapipe),
            # fall back to the tasks API (newer mediapipe versions).
            landmarks_list = None
            try:
                img_array = np.array(img)
                emit_progress(30, "Detecting face landmarks")
                landmarks_list = detect_with_solutions(img_array)
            except AttributeError:
                emit_progress(30, "Detecting face landmarks")
                landmarks_list = detect_with_tasks(input_path)

            if landmarks_list is None:
                print(json.dumps({
                    "success": True,
                    "faceDetected": False,
                    "landmarks": None,
                }))
                return

            emit_progress(60, "Extracting key points")
            key_points = extract_key_points(landmarks_list)

            emit_progress(90, "Done")

            print(json.dumps({
                "success": True,
                "faceDetected": True,
                "landmarks": key_points,
                "imageWidth": iw,
                "imageHeight": ih,
            }))

        except ImportError:
            print(json.dumps({
                "success": False,
                "error": "Face landmark detection requires MediaPipe. Install with: pip install mediapipe",
            }))
            sys.exit(1)

    except ImportError:
        print(json.dumps({
            "success": False,
            "error": "Pillow is not installed. Install with: pip install Pillow",
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
