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
print("WIRE OK")
