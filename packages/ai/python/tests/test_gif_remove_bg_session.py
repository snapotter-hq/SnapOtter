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
    for cuda_err in (
        RuntimeError("CUDA failure for the test"),
        RuntimeError(
            "[ONNXRuntimeError] : 1 : FAIL : Failed to load library libonnxruntime_providers_cuda.so with error: libcudnn.so.8: cannot open shared object file: No such file or directory"
        ),
    ):
        calls = []

        def new_session(model, providers=None, _exc=cuda_err):
            calls.append(providers)
            if "CUDAExecutionProvider" in providers:
                raise _exc
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
        assert str(cuda_err) in err


def test_successful_cuda_session_keeps_device_and_stays_quiet(capsys):
    mod = load_gif_module(lambda model, providers=None: "gpu-session")
    session, device = mod._create_session(
        "u2net", ["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda"
    )
    assert session == "gpu-session"
    assert device == "cuda"
    assert "falling back" not in capsys.readouterr().err


def test_cuda_session_host_oom_reraises_without_cpu_retry(capsys):
    for host_oom in (
        MemoryError(),
        RuntimeError("DefaultCPUAllocator: not enough memory"),
        RuntimeError("DefaultCPUAllocator: failed to allocate memory"),
        OSError(12, "Cannot allocate memory"),
        OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
    ):
        calls = []

        def new_session(model, providers=None, _exc=host_oom):
            calls.append(providers)
            raise _exc

        mod = load_gif_module(new_session)
        try:
            mod._create_session(
                "birefnet-general", ["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda"
            )
            raise AssertionError(f"Expected {host_oom!r} to be re-raised")
        except Exception as exc:
            assert exc is host_oom

        assert calls == [["CUDAExecutionProvider", "CPUExecutionProvider"]]
        assert "falling back" not in capsys.readouterr().err


def test_cuda_session_model_load_error_reraises_without_cpu_retry(capsys):
    class InvalidProtobuf(RuntimeError):
        pass

    class InvalidGraph(RuntimeError):
        pass

    class NoSuchFile(RuntimeError):
        pass

    for model_load_err in (
        FileNotFoundError(2, "No such file or directory", "/tmp/u2net.onnx"),
        PermissionError(13, "Permission denied", "/tmp/u2net.onnx"),
        IsADirectoryError(21, "Is a directory", "/tmp/u2net.onnx"),
        OSError(5, "Input/output error"),
        ConnectionError("Connection reset by peer"),
        EOFError("Unexpected end of file"),
        InvalidProtobuf("Load model from /tmp/u2net.onnx failed"),
        InvalidGraph("Load model from /tmp/u2net.onnx failed"),
        NoSuchFile("/tmp/u2net.onnx"),
        RuntimeError(
            "[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/u2net.onnx failed:Protobuf parsing failed."
        ),
        RuntimeError(
            "[ONNXRuntimeError] : 3 : NO_SUCHFILE : Load model from /tmp/u2net.onnx failed:File doesn't exist"
        ),
        RuntimeError(
            "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/u2net.onnx failed:This is an invalid model. Error: ModelProto does not have a graph."
        ),
        RuntimeError(
            "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/u2net.onnx failed:This is an invalid model. Type Error: Type 'tensor(float)' of input parameter is invalid."
        ),
        ValueError("SHA256 hash of downloaded file (u2net.onnx) does not match the known hash"),
        ValueError("Checksum verification failed"),
        RuntimeError(
            "Offline mode is enabled (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0); cannot download model"
        ),
    ):
        calls = []

        def new_session(model, providers=None, _exc=model_load_err):
            calls.append(providers)
            raise _exc

        mod = load_gif_module(new_session)
        try:
            mod._create_session(
                "birefnet-general", ["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda"
            )
            raise AssertionError(f"Expected {model_load_err!r} to be re-raised")
        except Exception as exc:
            assert exc is model_load_err

        assert calls == [["CUDAExecutionProvider", "CPUExecutionProvider"]]
        assert "falling back" not in capsys.readouterr().err



def test_gif_sessions_share_the_cache_with_remove_bg(tmp_path, monkeypatch):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import session_cache

    home = tmp_path / "u2net"
    home.mkdir()
    (home / "u2net.onnx").write_bytes(b"x" * 1024)
    monkeypatch.setenv("U2NET_HOME", str(home))
    monkeypatch.setenv("AI_SESSION_CACHE_BYTES", str(10 * 1024 * 1024))
    session_cache._entries.clear()
    cuda = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    calls = []

    def new_session(model, providers=None):
        calls.append((model, tuple(providers)))
        return object()

    mod = load_gif_module(new_session)
    try:
        first, _ = mod._create_session("u2net", cuda, "cuda")
        second, device = mod._create_session("u2net", cuda, "cuda")
        # remove_bg asks the same cache for the same key, so it reuses the GIF's session.
        from_still = session_cache.get_session("u2net", cuda, lambda: object(), 1024 * 8)
    finally:
        session_cache._entries.clear()
    assert first is second is from_still
    assert device == "cuda"
    assert calls == [("u2net", tuple(cuda))]
