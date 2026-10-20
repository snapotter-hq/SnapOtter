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
for cpu_oom_err in (
    RuntimeError(
        "RuntimeError: [enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."
    ),
    RuntimeError("DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."),
    RuntimeError("OSError: [Errno 12] Cannot allocate memory"),
    OSError(12, "Cannot allocate memory"),
    RuntimeError("DefaultCPUAllocator: NOT ENOUGH MEMORY"),
    RuntimeError("DefaultCPUAllocator: CAN'T ALLOCATE MEMORY"),
    RuntimeError(
        "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32"
    ),
):
    assert gif_remove_bg._is_oom(cpu_oom_err) is True, (
        f"gif_remove_bg._is_oom must recognize CPU allocator OOM: {cpu_oom_err!r}"
    )
assert (
    gif_remove_bg._is_oom(RuntimeError("RuntimeError: DefaultCPUAllocator: invalid alignment"))
    is False
)

# Verify _remove_one does not retry with alpha_matting=False when a CPU allocator OOM occurs,
# and verify main()'s frame-0 probe falls back from birefnet* to u2net on CPU allocator OOM.
import tempfile  # noqa: E402
import types  # noqa: E402


def _verify_gif_cpu_oom_handling():
    rembg_calls = []
    fake_rembg = types.ModuleType("rembg")
    active_err = [None]

    def _fake_remove(_data, session=None, alpha_matting=False, **_kwargs):
        rembg_calls.append((session, alpha_matting))
        if active_err[0] is not None and alpha_matting:
            raise active_err[0]
        return b"png"

    fake_rembg.remove = _fake_remove
    fake_pil = types.ModuleType("PIL")

    class _FakeFrame:
        size = (16, 16)

        def save(self, buf, format="PNG"):  # noqa: A002
            buf.write(b"png")

        def convert(self, _mode):
            return self

    fake_pil.Image = types.SimpleNamespace(LANCZOS=1, open=lambda _b: _FakeFrame())
    prev_rembg = sys.modules.get("rembg")
    prev_pil = sys.modules.get("PIL")
    sys.modules["rembg"] = fake_rembg
    sys.modules["PIL"] = fake_pil
    try:
        for oom_msg in (
            "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
            "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes.",
            "[Errno 12] Cannot allocate memory",
            "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
        ):
            rembg_calls.clear()
            active_err[0] = RuntimeError(oom_msg)
            try:
                gif_remove_bg._remove_one(_FakeFrame(), "sess", True, {}, None, (16, 16))
                raise AssertionError(f"_remove_one did not re-raise CPU allocator OOM: {oom_msg!r}")
            except RuntimeError:
                pass
            assert rembg_calls == [("sess", True)], (
                f"_remove_one should not retry alpha_matting=False on CPU OOM, got {rembg_calls!r}"
            )

        # Non-OOM with use_alpha=True falls back to alpha_matting=False.
        rembg_calls.clear()
        active_err[0] = ValueError("pymatting Cholesky failed")
        gif_remove_bg._remove_one(_FakeFrame(), "sess", True, {}, None, (16, 16))
        assert rembg_calls == [("sess", True), ("sess", False)], rembg_calls

        # Now exercise main()'s frame-0 probe fallback from birefnet-general to u2net on CPU OOM,
        # and confirm non-OOM errors or OOMs when already on u2net are not retried.
        with tempfile.TemporaryDirectory() as tmpdir:
            for m_name in ("birefnet-general", "u2net"):
                open(os.path.join(tmpdir, f"{m_name}.onnx"), "wb").close()

            fake_gpu = types.ModuleType("gpu")
            fake_gpu.onnx_providers = lambda: (["CPUExecutionProvider"], "cpu")
            fake_model_paths = types.ModuleType("model_paths")
            fake_model_paths.ensure_rembg_model_home = lambda: None
            fake_remove_bg = types.ModuleType("remove_bg")
            fake_remove_bg.ALLOWED_MODELS = {"birefnet-general", "u2net"}

            prev_mods = {
                k: sys.modules.get(k) for k in ("gpu", "model_paths", "remove_bg")
            }
            sys.modules["gpu"] = fake_gpu
            sys.modules["model_paths"] = fake_model_paths
            sys.modules["remove_bg"] = fake_remove_bg

            orig_read_frames = gif_remove_bg._read_frames
            orig_create_session = gif_remove_bg._create_session
            orig_remove_one = gif_remove_bg._remove_one
            orig_apply_effect = gif_remove_bg._apply_effect
            orig_encode = gif_remove_bg._encode
            orig_argv = sys.argv
            orig_u2net_home = os.environ.get("U2NET_HOME")

            created_models = []
            removed_sessions = []
            probe_err = [None]

            def _stub_create_session(model, _providers, device):
                created_models.append(model)
                return f"session:{model}", device

            def _stub_remove_one(_frame, session, *_args):
                removed_sessions.append(session)
                if probe_err[0] is not None and session in probe_err[0][0]:
                    raise probe_err[0][1]
                return _FakeFrame()

            def _run_main(settings_dict):
                created_models.clear()
                removed_sessions.clear()
                sys.argv = [
                    "gif_remove_bg.py",
                    "in.gif",
                    "out.webp",
                    json.dumps(settings_dict),
                ]
                r_fd, w_fd = os.pipe()
                try:
                    saved_stdout_fd = os.dup(1)
                    os.dup2(w_fd, 1)
                    os.close(w_fd)
                    try:
                        gif_remove_bg.main()
                    finally:
                        os.dup2(saved_stdout_fd, 1)
                        os.close(saved_stdout_fd)
                    captured = os.read(r_fd, 4096).decode("utf-8")
                finally:
                    os.close(r_fd)
                return json.loads(captured.strip())

            gif_remove_bg._read_frames = lambda _p: ([_FakeFrame(), _FakeFrame()], [100, 100], 0)
            gif_remove_bg._create_session = _stub_create_session
            gif_remove_bg._remove_one = _stub_remove_one
            gif_remove_bg._apply_effect = lambda cut, *_a: cut
            gif_remove_bg._encode = lambda *_a: None
            os.environ["U2NET_HOME"] = tmpdir
            try:
                for oom_msg in (
                    "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
                    "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes.",
                    "[Errno 12] Cannot allocate memory",
                    "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
                ):
                    probe_err[0] = ({"session:birefnet-general"}, RuntimeError(oom_msg))
                    probe_payload = _run_main({"model": "birefnet-general", "outputFormat": "webp"})
                    assert probe_payload == {
                        "success": True,
                        "model": "u2net",
                        "device": "cpu",
                        "frames": 2,
                        "format": "webp",
                    }, probe_payload
                    assert created_models == ["birefnet-general", "u2net"], created_models
                    assert removed_sessions == [
                        "session:birefnet-general",
                        "session:u2net",
                        "session:u2net",
                    ], removed_sessions

                # Non-OOM error on birefnet-general does not fall back to u2net.
                probe_err[0] = (
                    {"session:birefnet-general"},
                    RuntimeError("DefaultCPUAllocator: invalid alignment"),
                )
                non_oom_payload = _run_main({"model": "birefnet-general", "outputFormat": "webp"})
                assert non_oom_payload == {
                    "success": False,
                    "error": "DefaultCPUAllocator: invalid alignment",
                }, non_oom_payload
                assert created_models == ["birefnet-general"], created_models

                # CPU OOM when already on u2net does not retry session creation.
                probe_err[0] = (
                    {"session:u2net"},
                    RuntimeError("DefaultCPUAllocator: not enough memory"),
                )
                u2net_oom_payload = _run_main({"model": "u2net", "outputFormat": "webp"})
                assert u2net_oom_payload == {
                    "success": False,
                    "error": "DefaultCPUAllocator: not enough memory",
                }, u2net_oom_payload
                assert created_models == ["u2net"], created_models
                assert removed_sessions == ["session:u2net"], removed_sessions
            finally:
                gif_remove_bg._read_frames = orig_read_frames
                gif_remove_bg._create_session = orig_create_session
                gif_remove_bg._remove_one = orig_remove_one
                gif_remove_bg._apply_effect = orig_apply_effect
                gif_remove_bg._encode = orig_encode
                sys.argv = orig_argv
                if orig_u2net_home is None:
                    os.environ.pop("U2NET_HOME", None)
                else:
                    os.environ["U2NET_HOME"] = orig_u2net_home
                for k, v in prev_mods.items():
                    if v is None:
                        sys.modules.pop(k, None)
                    else:
                        sys.modules[k] = v
    finally:
        if prev_rembg is None:
            sys.modules.pop("rembg", None)
        else:
            sys.modules["rembg"] = prev_rembg
        if prev_pil is None:
            sys.modules.pop("PIL", None)
        else:
            sys.modules["PIL"] = prev_pil


_verify_gif_cpu_oom_handling()
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
