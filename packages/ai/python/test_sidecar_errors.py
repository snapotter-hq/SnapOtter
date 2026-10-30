import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sidecar_errors import build_error_envelope, redact  # noqa: E402


def test_redact_masks_paths_and_files():
    assert redact("open /data/uploads/9f/in.bin") == "open <path>"
    assert redact("cannot read family_photo.JPG") == "cannot read <file>"
    assert redact("torch 2.2.0 ok") == "torch 2.2.0 ok"


def test_redact_masks_every_root_the_node_redactor_masks():
    assert redact("open /Volumes/Photos/in.bin") == "open <path>"
    assert redact("open /volume1/photos/in.bin") == "open <path>"
    assert redact("open /private/var/in.bin") == "open <path>"
    assert redact("open /media/usb/in.bin") == "open <path>"
    assert redact("open /run/user/in.bin") == "open <path>"
    assert redact("open /storage/emulated/in.bin") == "open <path>"
    assert redact("open /scratch/in.bin") == "open <path>"
    assert redact("open /workspace/in.bin") == "open <path>"


def test_redact_masks_the_formats_the_node_redactor_masks():
    assert redact("cannot read holiday.HEIC") == "cannot read <file>"
    assert redact("cannot read clip.heif") == "cannot read <file>"
    assert redact("cannot read song.wma") == "cannot read <file>"
    assert redact("cannot read dump.jxl") == "cannot read <file>"
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


def test_envelope_falls_back_to_exception_type_when_message_is_empty():
    try:
        raise MemoryError()
    except MemoryError as exc:
        env = build_error_envelope(exc)
    assert env["type"] == "MemoryError"
    assert env["message"] == "MemoryError"


if __name__ == "__main__":
    test_redact_masks_paths_and_files()
    test_redact_masks_every_root_the_node_redactor_masks()
    test_redact_masks_the_formats_the_node_redactor_masks()
    test_envelope_shape_and_frames()
    test_envelope_falls_back_to_exception_type_when_message_is_empty()
    print("ok")
