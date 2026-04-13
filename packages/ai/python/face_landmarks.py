"""Face landmark detection using MediaPipe FaceMesh for passport photo positioning."""
import sys
import json


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


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

            img_array = np.array(img)

            mp_face_mesh = mp.solutions.face_mesh
            face_mesh = mp_face_mesh.FaceMesh(
                static_image_mode=True,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
            )

            emit_progress(30, "Detecting face landmarks")
            results = face_mesh.process(img_array)
            face_mesh.close()

            if not results.multi_face_landmarks:
                print(json.dumps({
                    "success": True,
                    "faceDetected": False,
                    "landmarks": None,
                }))
                return

            emit_progress(60, "Extracting key points")
            face_lm = results.multi_face_landmarks[0]
            lms = face_lm.landmark

            # Left eye center (average of key eye landmarks)
            left_eye_indices = [33, 133, 159, 145, 160, 144, 158, 153]
            left_eye_x = sum(lms[i].x for i in left_eye_indices) / len(left_eye_indices)
            left_eye_y = sum(lms[i].y for i in left_eye_indices) / len(left_eye_indices)

            # Right eye center
            right_eye_indices = [362, 263, 386, 374, 385, 373, 387, 380]
            right_eye_x = sum(lms[i].x for i in right_eye_indices) / len(right_eye_indices)
            right_eye_y = sum(lms[i].y for i in right_eye_indices) / len(right_eye_indices)

            # Eye center (midpoint between both eyes)
            eye_center_x = (left_eye_x + right_eye_x) / 2
            eye_center_y = (left_eye_y + right_eye_y) / 2

            # Chin bottom (landmark 152)
            chin_x = lms[152].x
            chin_y = lms[152].y

            # Forehead top (landmark 10)
            forehead_x = lms[10].x
            forehead_y = lms[10].y

            # Nose tip (landmark 1)
            nose_x = lms[1].x
            nose_y = lms[1].y

            # Estimate crown position
            # The crown is above the forehead. Using anthropometric data:
            # forehead-to-chin distance is roughly 85-90% of crown-to-chin.
            # So crown is about 12-15% above forehead relative to chin-forehead distance.
            forehead_chin_dist = chin_y - forehead_y
            crown_y = forehead_y - (forehead_chin_dist * 0.15)
            crown_x = forehead_x

            # Face center X (average of nose, eye center)
            face_center_x = (nose_x + eye_center_x) / 2

            emit_progress(90, "Done")

            print(json.dumps({
                "success": True,
                "faceDetected": True,
                "landmarks": {
                    "leftEye": {"x": round(left_eye_x, 6), "y": round(left_eye_y, 6)},
                    "rightEye": {"x": round(right_eye_x, 6), "y": round(right_eye_y, 6)},
                    "eyeCenter": {"x": round(eye_center_x, 6), "y": round(eye_center_y, 6)},
                    "chin": {"x": round(chin_x, 6), "y": round(chin_y, 6)},
                    "forehead": {"x": round(forehead_x, 6), "y": round(forehead_y, 6)},
                    "crown": {"x": round(crown_x, 6), "y": round(crown_y, 6)},
                    "nose": {"x": round(nose_x, 6), "y": round(nose_y, 6)},
                    "faceCenterX": round(face_center_x, 6),
                },
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
