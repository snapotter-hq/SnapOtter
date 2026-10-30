"""remove_bg must load the model once and reuse it on later requests (#776),
evict it after an out-of-memory failure, and keep CPU and CUDA sessions apart."""
import io
import json
import os
import sys
import types

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import remove_bg  # noqa: E402
import session_cache  # noqa: E402

CUDA = ["CUDAExecutionProvider", "CPUExecutionProvider"]
CPU = ["CPUExecutionProvider"]


@pytest.fixture
def harness(tmp_path, monkeypatch):
    home = tmp_path / "u2net"
    home.mkdir()
    (home / "u2net.onnx").write_bytes(b"x" * 1024)
    (home / "isnet-general-use.onnx").write_bytes(b"x" * 1024)
    monkeypatch.setenv("U2NET_HOME", str(home))
    monkeypatch.setenv("AI_SESSION_CACHE_BYTES", str(10 * 1024 * 1024))
    session_cache._entries.clear()

    state = types.SimpleNamespace(
        sessions=[], providers=CUDA, device="cuda", remove_error=None, create_error=None
    )

    def new_session(model, providers=None):
        state.sessions.append((model, tuple(providers)))
        if state.create_error is not None and "CUDAExecutionProvider" in providers:
            err, state.create_error = state.create_error, None
            raise err
        return object()

    def remove(_data, session=None, **_kw):
        if state.remove_error is not None:
            raise state.remove_error
        return b"png"

    rembg = types.ModuleType("rembg")
    rembg.new_session = new_session
    rembg.remove = remove
    sessions = types.ModuleType("rembg.sessions")
    sessions.sessions_class = []
    gpu = types.ModuleType("gpu")
    gpu.onnx_providers = lambda: (state.providers, state.device)
    gpu.emit_info = lambda _m: None
    model_paths = types.ModuleType("model_paths")
    model_paths.ensure_rembg_model_home = lambda: None
    for name, mod in (
        ("rembg", rembg),
        ("rembg.sessions", sessions),
        ("gpu", gpu),
        ("model_paths", model_paths),
    ):
        monkeypatch.setitem(sys.modules, name, mod)
    monkeypatch.setattr(remove_bg, "_matting_registered", True)
    monkeypatch.setattr(remove_bg, "_hr_matting_registered", True)

    src = tmp_path / "in.png"
    src.write_bytes(b"img")

    def run(model="u2net"):
        out = tmp_path / "out.png"
        buf = io.StringIO()
        monkeypatch.setattr(
            sys, "argv", ["remove_bg.py", str(src), str(out), json.dumps({"model": model})]
        )
        monkeypatch.setattr(sys, "stdout", buf)
        remove_bg.main()
        return json.loads(buf.getvalue().strip().splitlines()[-1])

    state.run = run
    yield state
    session_cache._entries.clear()


def test_second_request_does_not_reload_the_model(harness):
    assert harness.run()["success"] is True
    assert harness.run()["success"] is True
    assert harness.sessions == [("u2net", tuple(CUDA))]


def test_cpu_request_does_not_get_a_cuda_session(harness):
    harness.run()
    harness.providers, harness.device = CPU, "cpu"
    result = harness.run()
    assert result["device"] == "cpu"
    assert harness.sessions == [("u2net", tuple(CUDA)), ("u2net", tuple(CPU))]


def test_out_of_memory_drops_the_cached_session(harness):
    harness.run()
    harness.remove_error = RuntimeError("CUDA out of memory. Tried to allocate 2.00 GiB")
    assert harness.run()["success"] is False
    assert not session_cache._entries
    harness.remove_error = None
    harness.run()
    assert len(harness.sessions) == 2


def test_gpu_oom_loading_a_session_frees_the_cache_and_stays_on_gpu(harness):
    harness.run("u2net")
    harness.create_error = RuntimeError("CUDA out of memory. Tried to allocate 2.00 GiB")
    result = harness.run("isnet-general-use")
    assert result["success"] is True
    assert result["device"] == "cuda"
    assert harness.sessions == [
        ("u2net", tuple(CUDA)),
        ("isnet-general-use", tuple(CUDA)),
        ("isnet-general-use", tuple(CUDA)),
    ]


def test_gpu_oom_with_nothing_cached_still_falls_back_to_cpu(harness):
    harness.create_error = RuntimeError("CUDA out of memory. Tried to allocate 2.00 GiB")
    result = harness.run("u2net")
    assert result["device"] == "cpu"
    assert harness.sessions == [("u2net", tuple(CUDA)), ("u2net", tuple(CPU))]
