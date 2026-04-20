"""Face enhancement using GFPGAN or CodeFormer with MediaPipe detection."""
import sys
import json
import os


def emit_progress(percent, stage):
    """Emit structured progress to stderr for bridge.ts to capture."""
    print(json.dumps({"progress": percent, "stage": stage}), file=sys.stderr, flush=True)


_MODELS_BASE = os.environ.get("MODELS_PATH", "/opt/models")

GFPGAN_MODEL_PATH = os.environ.get(
    "GFPGAN_MODEL_PATH",
    os.path.join(_MODELS_BASE, "gfpgan", "GFPGANv1.3.pth"),
)

CODEFORMER_MODEL_PATH = os.environ.get(
    "CODEFORMER_MODEL_PATH",
    os.path.join(_MODELS_BASE, "codeformer", "codeformer.pth"),
)


# ── Model path for new mp.tasks API ─────────────────────────────────

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


def detect_faces_mediapipe(img_array, sensitivity):
    """Detect faces using MediaPipe with dual-model approach.

    Returns a list of {x, y, w, h} dicts for each detected face.
    Tries legacy mp.solutions API first, falls back to mp.tasks.
    """
    import mediapipe as mp

    min_confidence = max(0.1, 1.0 - sensitivity)

    try:
        mp_face = mp.solutions.face_detection

        # Try short-range model first (model_selection=0, best for faces
        # within ~2m which covers most photos), then fall back to
        # full-range model (model_selection=1) for distant/group shots.
        detections = []
        for model_sel in [0, 1]:
            detector = mp_face.FaceDetection(
                model_selection=model_sel,
                min_detection_confidence=min_confidence,
            )
            results = detector.process(img_array)
            detector.close()
            if results.detections:
                detections = results.detections
                break

        if not detections:
            return []

        ih, iw = img_array.shape[:2]
        faces = []
        for detection in detections:
            bbox = detection.location_data.relative_bounding_box
            faces.append({
                "x": int(bbox.xmin * iw),
                "y": int(bbox.ymin * ih),
                "w": int(bbox.width * iw),
                "h": int(bbox.height * ih),
            })
        return faces

    except AttributeError:
        # mediapipe >= 0.10.30 removed mp.solutions, use tasks API
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


def enhance_with_gfpgan(img_array, only_center_face):
    """Enhance faces using GFPGAN. Returns the enhanced image array."""
    import torch
    from gfpgan import GFPGANer
    from gpu import gpu_available

    if not os.path.exists(GFPGAN_MODEL_PATH):
        raise FileNotFoundError(f"GFPGAN model not found: {GFPGAN_MODEL_PATH}")

    use_gpu = gpu_available()
    device = torch.device("cuda" if use_gpu else "cpu")

    enhancer = GFPGANer(
        model_path=GFPGAN_MODEL_PATH,
        upscale=1,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=None,
        device=device,
    )
    _, _, output = enhancer.enhance(
        img_array,
        has_aligned=False,
        only_center_face=only_center_face,
        paste_back=True,
    )
    return output


def enhance_with_codeformer(img_array, fidelity_weight):
    """Enhance faces using CodeFormer via codeformer-pip.

    The codeformer-pip package provides inference_app() which handles
    face detection, alignment, restoration, and paste-back internally.
    fidelity_weight controls quality vs fidelity (0 = quality, 1 = fidelity).

    NOTE: codeformer-pip's app.py runs heavy module-level initialization
    (model downloads, GPU setup) on import. The Docker image must place
    model weights where the package expects them, or set environment
    variables so the download step succeeds. If the import or inference
    fails, the auto model selection will fall back to GFPGAN.
    """
    import numpy as np
    import torch
    from gpu import gpu_available

    use_gpu = gpu_available()

    # CodeFormer selects its device during module-level init and inside
    # inference_app(). It has no device= parameter, so to respect
    # ASHIM_GPU=false we temporarily override torch.cuda.is_available
    # so all internal device checks see False. When use_gpu is True
    # (the common path) no override happens.
    _orig_cuda_check = torch.cuda.is_available
    if not use_gpu:
        torch.cuda.is_available = lambda: False
    try:
        from codeformer.app import inference_app

        img_bgr = img_array[:, :, ::-1].copy()
        restored_bgr = inference_app(
            image=img_bgr,
            background_enhance=False,
            face_upsample=False,
            upscale=1,
            codeformer_fidelity=fidelity_weight,
        )
    finally:
        torch.cuda.is_available = _orig_cuda_check

    if restored_bgr is None:
        raise RuntimeError("CodeFormer returned no result (face detection may have failed)")

    restored_rgb = restored_bgr[:, :, ::-1].copy()
    return restored_rgb


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

    model_choice = settings.get("model", "auto")
    strength = float(settings.get("strength", 0.8))
    only_center_face = settings.get("onlyCenterFace", False)
    sensitivity = float(settings.get("sensitivity", 0.5))

    try:
        emit_progress(10, "Preparing")
        from PIL import Image
        import numpy as np

        img = Image.open(input_path).convert("RGB")
        img_array = np.array(img)

        # Detect faces with MediaPipe
        try:
            emit_progress(20, "Scanning for faces")
            faces = detect_faces_mediapipe(img_array, sensitivity)
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

        num_faces = len(faces)
        emit_progress(30, f"Found {num_faces} face{'s' if num_faces != 1 else ''}")

        # No faces found - save original unchanged
        if num_faces == 0:
            img.save(output_path)
            print(
                json.dumps(
                    {
                        "success": True,
                        "facesDetected": 0,
                        "faces": [],
                        "model": "none",
                    }
                )
            )
            return

        emit_progress(40, "Loading AI model")

        # Redirect stdout to stderr for the ENTIRE AI pipeline.
        # Libraries like basicsr, gfpgan, and torch print download
        # progress and init messages to stdout which would corrupt
        # our JSON result.
        stdout_fd = None
        try:
            stdout_fd = os.dup(1)
            sys.stdout.flush()  # Flush before redirect to avoid mixing buffers
            os.dup2(2, 1)
        except OSError:
            # os.dup may fail on Windows when launched via child_process.spawn
            # with piped stdio — fall back to just suppressing sys.stdout
            stdout_fd = None
        sys.stdout = sys.stderr  # Python-level redirect regardless of OS

        enhanced = None
        model_used = None

        try:
            if model_choice == "gfpgan":
                enhanced = enhance_with_gfpgan(img_array, only_center_face)
                model_used = "gfpgan"

            elif model_choice == "codeformer":
                fidelity_weight = 1.0 - strength
                enhanced = enhance_with_codeformer(img_array, fidelity_weight)
                model_used = "codeformer"

            elif model_choice == "auto":
                # Try CodeFormer first, fall back to GFPGAN.
                # Catch broad Exception because codeformer-pip can fail in
                # unexpected ways (AttributeError, TypeError, etc.)
                try:
                    fidelity_weight = 1.0 - strength
                    enhanced = enhance_with_codeformer(img_array, fidelity_weight)
                    model_used = "codeformer"
                except Exception as e:
                    import traceback
                    print(f"[enhance-faces] CodeFormer failed, falling back to GFPGAN: {e}", file=sys.stderr, flush=True)
                    traceback.print_exc(file=sys.stderr)
                    enhanced = enhance_with_gfpgan(img_array, only_center_face)
                    model_used = "gfpgan"

        finally:
            # Restore stdout after ALL AI processing
            sys.stdout.flush()
            if stdout_fd is not None:
                os.dup2(stdout_fd, 1)
                os.close(stdout_fd)
            sys.stdout = sys.__stdout__  # Restore Python-level stdout

        if enhanced is None:
            raise RuntimeError("Face enhancement failed: no model available")

        emit_progress(85, "Enhancement complete")

        # Alpha blend result with original based on strength.
        # For CodeFormer, strength is already applied via fidelity_weight,
        # so skip the blend to avoid double-applying.
        # For GFPGAN (which has no fidelity knob), blend with original.
        if strength < 1.0 and model_used != "codeformer":
            blended = (
                img_array.astype(np.float32) * (1.0 - strength)
                + enhanced.astype(np.float32) * strength
            )
            enhanced = np.clip(blended, 0, 255).astype(np.uint8)

        emit_progress(95, "Saving result")
        Image.fromarray(enhanced).save(output_path)

        print(
            json.dumps(
                {
                    "success": True,
                    "facesDetected": num_faces,
                    "faces": faces,
                    "model": model_used,
                }
            )
        )

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
