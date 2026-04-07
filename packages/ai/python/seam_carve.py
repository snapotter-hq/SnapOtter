"""
Content-aware image resize using seam carving.
Uses the seam-carving library (li-plus) with optional face protection via MediaPipe.

Args:
    sys.argv[1]: input image path
    sys.argv[2]: output image path
    sys.argv[3]: JSON settings string with keys:
        - width (int, optional): target width
        - height (int, optional): target height
        - protectFaces (bool, optional): enable face detection for protection mask
"""

import json
import sys


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


def build_face_mask(img_array):
    """Detect faces with MediaPipe and return a boolean keep_mask."""
    import numpy as np

    try:
        import mediapipe as mp
    except ImportError:
        emit_progress(20, "MediaPipe not available, skipping face protection")
        return None

    h, w = img_array.shape[:2]
    mask = np.zeros((h, w), dtype=bool)

    face_detection = mp.solutions.face_detection
    detector = face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)

    try:
        results = detector.process(img_array)
        if not results.detections:
            emit_progress(20, "No faces detected")
            return None

        for detection in results.detections:
            bbox = detection.location_data.relative_bounding_box
            x = int(bbox.xmin * w)
            y = int(bbox.ymin * h)
            bw = int(bbox.width * w)
            bh = int(bbox.height * h)

            # Add 20% padding around face
            pad_x = int(bw * 0.2)
            pad_y = int(bh * 0.2)
            x1 = max(0, x - pad_x)
            y1 = max(0, y - pad_y)
            x2 = min(w, x + bw + pad_x)
            y2 = min(h, y + bh + pad_y)

            mask[y1:y2, x1:x2] = True

        emit_progress(20, f"Detected {len(results.detections)} face(s)")
        return mask
    finally:
        detector.close()


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"success": False, "error": "Usage: seam_carve.py <input> <output> <settings>"}))
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    try:
        settings = json.loads(sys.argv[3])
    except (json.JSONDecodeError, ValueError):
        print(json.dumps({"success": False, "error": "Invalid settings JSON"}))
        sys.exit(1)

    target_width = settings.get("width")
    target_height = settings.get("height")
    protect_faces = settings.get("protectFaces", False)

    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        print(json.dumps({"success": False, "error": "Pillow/numpy not installed"}))
        sys.exit(1)

    try:
        import seam_carving
    except ImportError:
        print(json.dumps({"success": False, "error": "seam-carving package not installed"}))
        sys.exit(1)

    try:
        emit_progress(0, "Loading image")
        img = Image.open(input_path).convert("RGB")
        img_array = np.array(img)
        src_h, src_w = img_array.shape[:2]

        # Default to source dimensions if not specified
        if target_width is None:
            target_width = src_w
        if target_height is None:
            target_height = src_h

        # Validate: shrink only
        if target_width > src_w or target_height > src_h:
            print(json.dumps({
                "success": False,
                "error": f"Content-aware resize only supports shrinking. Source is {src_w}x{src_h}, target is {target_width}x{target_height}."
            }))
            sys.exit(1)

        # Nothing to do
        if target_width == src_w and target_height == src_h:
            img.save(output_path)
            print(json.dumps({"success": True, "width": src_w, "height": src_h}))
            return

        # Warn about large images
        if src_w > 3000 or src_h > 3000:
            emit_progress(5, "Large image detected, this may take a while")

        # Face protection mask
        keep_mask = None
        if protect_faces:
            emit_progress(10, "Detecting faces")
            keep_mask = build_face_mask(img_array)

        emit_progress(25, "Starting seam carving")

        # seam_carving.resize takes size as (width, height)
        result = seam_carving.resize(
            img_array,
            (target_width, target_height),
            energy_mode="backward",
            order="width-first",
            keep_mask=keep_mask,
        )

        emit_progress(90, "Saving result")
        Image.fromarray(result).save(output_path)

        print(json.dumps({
            "success": True,
            "width": result.shape[1],
            "height": result.shape[0],
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
