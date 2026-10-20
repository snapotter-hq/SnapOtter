"""Guard: drive a real Python exception through the ACTUAL dispatcher and confirm
the structured error envelope (type + redacted message + our script frames, with
the dispatcher's own plumbing frame dropped) is emitted. Run directly with
`python3 packages/ai/python/test_sidecar_wire.py`, or in CI via the vitest wrapper
`tests/unit/ai/sidecar-wire.test.ts`."""
import json
import os
import sys

os.environ.setdefault("DISPATCHER_PROFILE", "docs")  # lean import, no ML libs needed
SIDE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SIDE)
import dispatcher  # noqa: E402

RAISER = os.path.join(SIDE, "zzz_wire_check.py")
with open(RAISER, "w") as f:
    f.write(
        "def _inner():\n"
        "    raise RuntimeError('model load failed at /data/uploads/ab/user_photo.png for 10.0.0.5')\n"
        "_inner()\n"
    )
# Allow the throwaway script through the allowlist (not in TOOL_BUNDLE_MAP, no gate).
dispatcher.ALLOWED_SCRIPTS = set(dispatcher.ALLOWED_SCRIPTS) | {"zzz_wire_check"}

try:
    stdout, code = dispatcher._run_script_main("zzz_wire_check", [])
finally:
    os.remove(RAISER)

payload = json.loads(stdout)
assert code == 1, code
assert payload["success"] is False, payload
assert "errorInfo" in payload, "no errorInfo in dispatcher output: %r" % payload
info = payload["errorInfo"]
assert info["type"] == "RuntimeError", info
# message is redacted: path + IP masked, original filename gone
assert "<path>" in info["message"] and "<ip>" in info["message"], info["message"]
assert "user_photo" not in info["message"] and "10.0.0.5" not in info["message"], info["message"]
# the back-compat `error` string mirrors the redacted message
assert payload["error"] == info["message"], payload
# frames are the real failing script only (basename), with NO dispatcher plumbing frame
files = [fr["file"] for fr in info["frames"]]
assert files, "no frames captured"
assert "dispatcher.py" not in files, files
assert all(f == "zzz_wire_check.py" for f in files), files
assert any(fr["func"] == "_inner" for fr in info["frames"]), info["frames"]

# Bare MemoryError() has str(e) == "": confirm both the dispatcher uncaught path
# and all 14 AI entrypoint scripts fall back to the exception class name rather
# than emitting an empty "error": "".
with open(RAISER, "w") as f:
    f.write("raise MemoryError()\n")
try:
    empty_stdout, empty_code = dispatcher._run_script_main("zzz_wire_check", [])
finally:
    os.remove(RAISER)

empty_payload = json.loads(empty_stdout)
assert empty_code == 1, empty_code
assert empty_payload["success"] is False, empty_payload
assert empty_payload["error"] == "MemoryError", empty_payload
assert empty_payload["errorInfo"]["type"] == "MemoryError", empty_payload
assert empty_payload["errorInfo"]["message"] == "MemoryError", empty_payload

AI_ENTRYPOINT_SCRIPTS = (
    "colorize.py",
    "detect_faces.py",
    "enhance_faces.py",
    "face_landmarks.py",
    "gif_remove_bg.py",
    "inpaint.py",
    "inpaint_hq.py",
    "noise_removal.py",
    "outpaint.py",
    "red_eye_removal.py",
    "remove_bg.py",
    "restore.py",
    "transcribe.py",
    "upscale.py",
)
for script_file in AI_ENTRYPOINT_SCRIPTS:
    with open(os.path.join(SIDE, script_file)) as sf:
        src = sf.read()
    assert '{"error": str(e)}' not in src, f"{script_file} still emits bare str(e) without success: False"
    assert '"error": str(e)}' not in src, f"{script_file} still formats caught exception with bare str(e)"
    assert "type(e).__name__" in src, f"{script_file} does not fall back to type(e).__name__"

import gif_remove_bg  # noqa: E402
assert gif_remove_bg._is_oom(MemoryError()) is True, "gif_remove_bg._is_oom must recognize bare MemoryError()"
assert gif_remove_bg._is_oom(RuntimeError("MemoryError")) is True
assert gif_remove_bg._hex_to_rgba("#F50") == (255, 85, 0, 255)
assert gif_remove_bg._hex_to_rgba("ff5500") == (255, 85, 0, 255)
assert gif_remove_bg._hex_to_rgba(" #f50 ") == (255, 85, 0, 255)
for bad_hex in ("red", "", None, "#FF", "#FF00", "#FF00000", "#FF000080", "#GGGGGG"):
    try:
        gif_remove_bg._hex_to_rgba(bad_hex)
        raise AssertionError(f"gif_remove_bg._hex_to_rgba({bad_hex!r}) did not raise")
    except ValueError:
        pass

for bad_grad in ({}, {"gradientColor1": "#000"}, {"gradientColor2": "#fff"}, {"gradientColor1": "red", "gradientColor2": "#fff"}):
    try:
        gif_remove_bg._gradient(10, 10, bad_grad)
        raise AssertionError(f"gif_remove_bg._gradient(10, 10, {bad_grad!r}) did not raise")
    except ValueError:
        pass

for bad_effect in (
    {"backgroundType": "color"},
    {"backgroundType": "color", "backgroundColor": "red"},
    {"backgroundType": "gradient", "gradientColor1": "#000"},
    {"backgroundType": "image"},
):
    try:
        gif_remove_bg._apply_effect(None, None, bad_effect, None)
        raise AssertionError(f"gif_remove_bg._apply_effect(..., {bad_effect!r}) did not raise")
    except ValueError:
        pass

try:
    gif_remove_bg._apply_effect(None, None, {"backgroundType": "image"}, None)
    raise AssertionError("gif_remove_bg._apply_effect image without bg_img did not raise")
except ValueError as err:
    assert "An image background needs a background image" in str(err), err

import subprocess  # noqa: E402

proc = subprocess.run(
    [
        sys.executable,
        os.path.join(SIDE, "gif_remove_bg.py"),
        "in.gif",
        "out.webp",
        json.dumps({"backgroundType": "image"}),
    ],
    capture_output=True,
    text=True,
    check=True,
)
main_payload = json.loads(proc.stdout.strip())
assert main_payload == {
    "success": False,
    "error": "An image background needs a background image",
}, main_payload

print("WIRE OK")
