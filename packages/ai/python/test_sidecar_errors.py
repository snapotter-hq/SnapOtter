import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sidecar_errors import build_error_envelope, redact  # noqa: E402


def test_redact_masks_paths_and_files():
    assert redact("open /data/uploads/9f/in.bin") == "open <path>"
    assert redact("cannot read family_photo.JPG") == "cannot read <file>"
    assert redact("torch 2.2.0 ok") == "torch 2.2.0 ok"


def test_envelope_shape_and_frames():
    try:
        raise RuntimeError("CUDA out of memory for /data/x.png")
    except RuntimeError as exc:
        env = build_error_envelope(exc)
    assert env["type"] == "RuntimeError"
    assert env["message"] == "CUDA out of memory for <path>"
    assert isinstance(env["frames"], list) and len(env["frames"]) >= 1
    top = env["frames"][-1]
    assert top["file"] == "test_sidecar_errors.py"
    assert isinstance(top["line"], int)
    assert top["func"] == "test_envelope_shape_and_frames"


if __name__ == "__main__":
    test_redact_masks_paths_and_files()
    test_envelope_shape_and_frames()
    print("ok")
