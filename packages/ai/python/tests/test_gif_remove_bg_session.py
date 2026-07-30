"""The animated-removal session helper must not downgrade to CPU silently.

The 2.2.0 fleet QA (#668) burned hours on an unexplainable six-minute GIF job
because nothing in the logs said which device the frame loop used, and the
CUDA-to-CPU retry in _create_session swallowed the reason entirely.
"""

import importlib.util
import os
import sys
import types


def load_gif_module(fake_new_session):
    """Load gif_remove_bg with fakes for its function-local imports."""
    rembg = types.ModuleType("rembg")
    rembg.new_session = fake_new_session
    rembg.remove = lambda *a, **k: b""
    sessions = types.ModuleType("rembg.sessions")
    sessions.sessions_class = []
    rembg.sessions = sessions

    remove_bg = types.ModuleType("remove_bg")
    remove_bg._register_matting_session = lambda _c: None
    remove_bg._register_hr_matting_session = lambda _c: None
    remove_bg.ALLOWED_MODELS = {"u2net"}

    sys.modules["rembg"] = rembg
    sys.modules["rembg.sessions"] = sessions
    sys.modules["remove_bg"] = remove_bg

    script_path = os.path.join(os.path.dirname(__file__), "..", "gif_remove_bg.py")
    spec = importlib.util.spec_from_file_location("gif_remove_bg_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def teardown_function(_fn):
    for name in ("rembg", "rembg.sessions", "remove_bg"):
        sys.modules.pop(name, None)


def test_cuda_session_failure_falls_back_to_cpu_and_says_so(capsys):
    calls = []

    def new_session(model, providers=None):
        calls.append(providers)
        if "CUDAExecutionProvider" in providers:
            raise RuntimeError("CUDA failure for the test")
        return "cpu-session"

    mod = load_gif_module(new_session)
    session, device = mod._create_session(
        "u2net", ["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda"
    )

    assert session == "cpu-session"
    assert device == "cpu"
    assert calls == [
        ["CUDAExecutionProvider", "CPUExecutionProvider"],
        ["CPUExecutionProvider"],
    ]
    err = capsys.readouterr().err
    assert "falling back to CPU" in err
    assert "CUDA failure for the test" in err


def test_successful_cuda_session_keeps_device_and_stays_quiet(capsys):
    mod = load_gif_module(lambda model, providers=None: "gpu-session")
    session, device = mod._create_session(
        "u2net", ["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda"
    )
    assert session == "gpu-session"
    assert device == "cuda"
    assert "falling back" not in capsys.readouterr().err
