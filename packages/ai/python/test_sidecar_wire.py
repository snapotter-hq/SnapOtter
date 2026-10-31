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
# and all 15 AI entrypoint scripts fall back to the exception class name rather
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
    "ocr_preprocess.py",
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

import colorize  # noqa: E402
import enhance_faces  # noqa: E402
import gif_remove_bg  # noqa: E402
import gpu  # noqa: E402
import remove_bg  # noqa: E402
import session_cache  # noqa: E402
import restore  # noqa: E402
import upscale  # noqa: E402
assert colorize._OOM_MARKERS == gif_remove_bg._OOM_MARKERS
assert enhance_faces._OOM_MARKERS == gif_remove_bg._OOM_MARKERS
assert remove_bg._OOM_MARKERS == gif_remove_bg._OOM_MARKERS
assert restore._OOM_MARKERS == gif_remove_bg._OOM_MARKERS
assert gpu._OOM_MARKERS == gif_remove_bg._OOM_MARKERS
assert upscale.OOM_ERROR_PATTERNS == gif_remove_bg._OOM_MARKERS
assert remove_bg._HOST_OOM_MARKERS == gif_remove_bg._HOST_OOM_MARKERS
assert gpu._HOST_OOM_MARKERS == gif_remove_bg._HOST_OOM_MARKERS
assert remove_bg._MODEL_LOAD_ERROR_MARKERS == gif_remove_bg._MODEL_LOAD_ERROR_MARKERS
assert gpu._MODEL_LOAD_ERROR_MARKERS == gif_remove_bg._MODEL_LOAD_ERROR_MARKERS
for oom_mod, oom_fn in (
    (colorize, colorize.is_oom_error),
    (enhance_faces, enhance_faces._is_oom),
    (gif_remove_bg, gif_remove_bg._is_oom),
    (remove_bg, remove_bg._is_oom),
    (restore, restore._is_oom),
    (gpu, gpu._is_oom),
    (upscale, upscale.is_oom_error),
):
    assert oom_fn(MemoryError()) is True, (
        f"{oom_mod.__name__} must recognize bare MemoryError()"
    )
    assert oom_fn(RuntimeError("MemoryError")) is True
    for oom_err in (
        RuntimeError("CUDA out of memory"),
        RuntimeError("Failed to allocate memory for requested buffer"),
        RuntimeError("cudaErrorMemoryAllocation: out of memory"),
        RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
        RuntimeError("std::bad_alloc"),
        RuntimeError(
            "RuntimeError: [enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."
        ),
        RuntimeError(
            "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."
        ),
        RuntimeError("OSError: [Errno 12] Cannot allocate memory"),
        RuntimeError("OSError: [Errno 12] Nicht genügend Hauptspeicher verfügbar"),
        OSError(12, "Cannot allocate memory"),
        OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
        RuntimeError("DefaultCPUAllocator: NOT ENOUGH MEMORY"),
        RuntimeError("DefaultCPUAllocator: CAN'T ALLOCATE MEMORY"),
        RuntimeError(
            "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32"
        ),
    ):
        assert oom_fn(oom_err) is True, (
            f"{oom_mod.__name__} must recognize OOM: {oom_err!r}"
        )
    assert (
        oom_fn(RuntimeError("RuntimeError: DefaultCPUAllocator: invalid alignment"))
        is False
    )
    assert oom_fn(OSError(13, "Permission denied")) is False
    assert oom_fn(RuntimeError("OSError: [Errno 13] Permission denied")) is False
    assert oom_fn(RuntimeError("OSError: [Errno 122] Disk quota exceeded")) is False
    assert oom_fn(OSError("disk read failed")) is False
for host_oom_mod in (gif_remove_bg, remove_bg, gpu):
    assert host_oom_mod._is_host_oom(MemoryError()) is True, (
        f"{host_oom_mod.__name__}._is_host_oom must recognize bare MemoryError()"
    )
    assert host_oom_mod._is_host_oom(RuntimeError("MemoryError")) is True
    for host_oom_err in (
        RuntimeError("std::bad_alloc"),
        RuntimeError(
            "RuntimeError: [enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."
        ),
        RuntimeError(
            "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."
        ),
        RuntimeError("DefaultCPUAllocator: out of memory"),
        RuntimeError("DefaultCPUAllocator: failed to allocate memory"),
        RuntimeError("OSError: [Errno 12] Cannot allocate memory"),
        RuntimeError("OSError: [Errno 12] Nicht genügend Hauptspeicher verfügbar"),
        OSError(12, "Cannot allocate memory"),
        OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
        RuntimeError("DefaultCPUAllocator: NOT ENOUGH MEMORY"),
        RuntimeError("DefaultCPUAllocator: CAN'T ALLOCATE MEMORY"),
        RuntimeError(
            "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32"
        ),
    ):
        assert host_oom_mod._is_host_oom(host_oom_err) is True, (
            f"{host_oom_mod.__name__}._is_host_oom must recognize host OOM: {host_oom_err!r}"
        )
    for non_host_oom_err in (
        RuntimeError("CUDA out of memory"),
        RuntimeError("Failed to allocate memory for requested buffer"),
        RuntimeError("cudaErrorMemoryAllocation: out of memory"),
        RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
        RuntimeError("RuntimeError: DefaultCPUAllocator: invalid alignment"),
        RuntimeError("CUDA driver version is insufficient for CUDA runtime version"),
        OSError(13, "Permission denied"),
        RuntimeError("OSError: [Errno 13] Permission denied"),
        RuntimeError("OSError: [Errno 122] Disk quota exceeded"),
    ):
        assert host_oom_mod._is_host_oom(non_host_oom_err) is False, (
            f"{host_oom_mod.__name__}._is_host_oom must not match non-host-OOM: {non_host_oom_err!r}"
        )


class _FakeInvalidProtobuf(RuntimeError):
    pass


class _FakeInvalidGraph(RuntimeError):
    pass


class _FakeNoSuchFile(RuntimeError):
    pass


for model_err_mod in (gif_remove_bg, remove_bg, gpu):
    for model_load_err in (
        FileNotFoundError(2, "No such file or directory", "/tmp/model.onnx"),
        PermissionError(13, "Permission denied", "/tmp/model.onnx"),
        IsADirectoryError(21, "Is a directory", "/tmp/model.onnx"),
        OSError(5, "Input/output error"),
        ConnectionError("Connection reset by peer"),
        EOFError("Unexpected end of file"),
        _FakeInvalidProtobuf("Load model from /tmp/model.onnx failed"),
        _FakeInvalidGraph("Load model from /tmp/model.onnx failed"),
        _FakeNoSuchFile("/tmp/model.onnx"),
        RuntimeError(
            "[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/model.onnx failed:Protobuf parsing failed."
        ),
        RuntimeError(
            "[ONNXRuntimeError] : 3 : NO_SUCHFILE : Load model from /tmp/model.onnx failed:File doesn't exist"
        ),
        RuntimeError(
            "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/model.onnx failed:This is an invalid model. Error: ModelProto does not have a graph."
        ),
        RuntimeError(
            "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/model.onnx failed:This is an invalid model. Type Error: Type 'tensor(float)' of input parameter is invalid."
        ),
        ValueError(
            "SHA256 hash of downloaded file (model.onnx) does not match the known hash: expected abc"
        ),
        ValueError("Checksum mismatch for model.onnx"),
        RuntimeError(
            "Offline mode is enabled (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0); cannot download model"
        ),
    ):
        assert model_err_mod._is_model_load_error(model_load_err) is True, (
            f"{model_err_mod.__name__}._is_model_load_error must recognize {model_load_err!r}"
        )
    for non_model_load_err in (
        MemoryError(),
        OSError(12, "Cannot allocate memory"),
        RuntimeError("CUDA out of memory"),
        RuntimeError("Failed to allocate memory for requested buffer"),
        RuntimeError("cudaErrorMemoryAllocation: out of memory"),
        RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
        RuntimeError("CUDA driver version is insufficient for CUDA runtime version"),
        RuntimeError(
            "[ONNXRuntimeError] : 1 : FAIL : Failed to load library libonnxruntime_providers_cuda.so with error: libcudnn.so.8: cannot open shared object file: No such file or directory"
        ),
    ):
        assert model_err_mod._is_model_load_error(non_model_load_err) is False, (
            f"{model_err_mod.__name__}._is_model_load_error must not match {non_model_load_err!r}"
        )

# Verify _remove_one does not retry with alpha_matting=False when a CPU allocator OOM occurs,
# and verify main()'s frame-0 probe falls back from non-u2net models to u2net on CPU allocator OOM.
import io  # noqa: E402
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

        # Now exercise main()'s frame-0 probe fallback from non-u2net models to u2net on CPU OOM,
        # and confirm non-OOM errors or OOMs when already on u2net are not retried.
        with tempfile.TemporaryDirectory() as tmpdir:
            for m_name in ("birefnet-general", "isnet-general-use", "bria-rmbg", "u2net"):
                open(os.path.join(tmpdir, f"{m_name}.onnx"), "wb").close()

            fake_gpu = types.ModuleType("gpu")
            fake_gpu.onnx_providers = lambda: (["CPUExecutionProvider"], "cpu")
            fake_model_paths = types.ModuleType("model_paths")
            fake_model_paths.ensure_rembg_model_home = lambda: None
            fake_remove_bg = types.ModuleType("remove_bg")
            fake_remove_bg.ALLOWED_MODELS = {
                "birefnet-general",
                "isnet-general-use",
                "bria-rmbg",
                "u2net",
            }

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
            create_err = [None]
            probe_err = [None]
            live_sessions = []
            sessions_alive_on_u2net_alloc = []

            class _TrackedSession:
                def __init__(self, model):
                    self.model = model
                    live_sessions.append(model)

                def __del__(self):
                    if self.model in live_sessions:
                        live_sessions.remove(self.model)

                def __eq__(self, other):
                    return other == f"session:{self.model}" or (
                        isinstance(other, _TrackedSession) and other.model == self.model
                    )

                def __hash__(self):
                    return hash(f"session:{self.model}")

                def __repr__(self):
                    return f"session:{self.model}"

            def _stub_create_session(model, _providers, device):
                if model == "u2net":
                    import gc

                    gc.collect()
                    sessions_alive_on_u2net_alloc.append(list(live_sessions))
                created_models.append(model)
                if create_err[0] is not None and model in create_err[0][0]:
                    raise create_err[0][1]
                return _TrackedSession(model), device

            def _stub_remove_one(_frame, session, *_args):
                removed_sessions.append(f"session:{session.model}")
                if probe_err[0] is not None and f"session:{session.model}" in probe_err[0][0]:
                    raise probe_err[0][1]
                return _FakeFrame()

            stderr_captured = []

            def _run_main(settings_dict):
                session_cache.evict_all("test isolation")
                created_models.clear()
                removed_sessions.clear()
                live_sessions.clear()
                sessions_alive_on_u2net_alloc.clear()
                stderr_captured.clear()
                sys.argv = [
                    "gif_remove_bg.py",
                    "in.gif",
                    "out.webp",
                    json.dumps(settings_dict),
                ]
                r_fd, w_fd = os.pipe()
                err_buf = io.StringIO()
                saved_stderr = sys.stderr
                try:
                    saved_stdout_fd = os.dup(1)
                    os.dup2(w_fd, 1)
                    os.close(w_fd)
                    sys.stderr = err_buf
                    try:
                        gif_remove_bg.main()
                    finally:
                        sys.stderr = saved_stderr
                        os.dup2(saved_stdout_fd, 1)
                        os.close(saved_stdout_fd)
                    captured = os.read(r_fd, 4096).decode("utf-8")
                finally:
                    os.close(r_fd)
                stderr_captured.extend(
                    line.strip() for line in err_buf.getvalue().splitlines() if line.strip()
                )
                return json.loads(captured.strip())

            gif_remove_bg._read_frames = lambda _p: ([_FakeFrame(), _FakeFrame()], [100, 100], 0)
            gif_remove_bg._create_session = _stub_create_session
            gif_remove_bg._remove_one = _stub_remove_one
            gif_remove_bg._apply_effect = lambda cut, *_a: cut
            gif_remove_bg._encode = lambda *_a: None
            os.environ["U2NET_HOME"] = tmpdir
            orig_allow_dl = os.environ.get("SNAPOTTER_ALLOW_MODEL_DOWNLOAD")
            try:
                for oom_msg in (
                    "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
                    "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes.",
                    "[Errno 12] Cannot allocate memory",
                    "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
                ):
                    create_err[0] = None
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
                    assert sessions_alive_on_u2net_alloc == [[]], (
                        f"failed birefnet session must be released before allocating u2net: {sessions_alive_on_u2net_alloc!r}"
                    )
                    warnings = [
                        json.loads(line)["warning"]
                        for line in stderr_captured
                        if line.startswith("{") and "warning" in json.loads(line)
                    ]
                    assert any(
                        "[gif-remove-bg]" in w
                        and "birefnet-general" in w
                        and "u2net" in w
                        and oom_msg in w
                        for w in warnings
                    ), f"expected OOM fallback warning on stderr, got {stderr_captured!r}"
                    assert "[gif-remove-bg] session device=cpu model=u2net" in stderr_captured, (
                        f"expected u2net session log line on stderr, got {stderr_captured!r}"
                    )

                # _create_session OOM on birefnet-general also falls back to u2net, warns, and logs session.
                probe_err[0] = None
                create_err[0] = (
                    {"birefnet-general"},
                    RuntimeError("DefaultCPUAllocator: not enough memory"),
                )
                create_oom_payload = _run_main(
                    {"model": "birefnet-general", "outputFormat": "webp"}
                )
                assert create_oom_payload == {
                    "success": True,
                    "model": "u2net",
                    "device": "cpu",
                    "frames": 2,
                    "format": "webp",
                }, create_oom_payload
                assert created_models == ["birefnet-general", "u2net"], created_models
                assert removed_sessions == ["session:u2net", "session:u2net"], removed_sessions
                create_warnings = [
                    json.loads(line)["warning"]
                    for line in stderr_captured
                    if line.startswith("{") and "warning" in json.loads(line)
                ]
                assert any(
                    "[gif-remove-bg]" in w and "birefnet-general" in w and "u2net" in w
                    for w in create_warnings
                ), f"expected _create_session OOM warning on stderr, got {stderr_captured!r}"
                assert "[gif-remove-bg] session device=cpu model=u2net" in stderr_captured, (
                    f"expected u2net session log line after _create_session OOM, got {stderr_captured!r}"
                )

                # Non-birefnet models (isnet-general-use, bria-rmbg) also fall back to u2net on
                # both frame-0 probe OOM and _create_session OOM (#3385).
                for non_birefnet_model in ("isnet-general-use", "bria-rmbg"):
                    create_err[0] = None
                    probe_err[0] = (
                        {f"session:{non_birefnet_model}"},
                        RuntimeError("DefaultCPUAllocator: not enough memory"),
                    )
                    nb_probe_payload = _run_main(
                        {"model": non_birefnet_model, "outputFormat": "webp"}
                    )
                    assert nb_probe_payload == {
                        "success": True,
                        "model": "u2net",
                        "device": "cpu",
                        "frames": 2,
                        "format": "webp",
                    }, (non_birefnet_model, nb_probe_payload)
                    assert created_models == [non_birefnet_model, "u2net"], created_models
                    assert removed_sessions == [
                        f"session:{non_birefnet_model}",
                        "session:u2net",
                        "session:u2net",
                    ], removed_sessions
                    assert sessions_alive_on_u2net_alloc == [[]], (
                        f"failed {non_birefnet_model} session must be released before allocating u2net: {sessions_alive_on_u2net_alloc!r}"
                    )
                    nb_warnings = [
                        json.loads(line)["warning"]
                        for line in stderr_captured
                        if line.startswith("{") and "warning" in json.loads(line)
                    ]
                    assert any(
                        "[gif-remove-bg]" in w and non_birefnet_model in w and "u2net" in w
                        for w in nb_warnings
                    ), f"expected OOM fallback warning for {non_birefnet_model}, got {stderr_captured!r}"

                    probe_err[0] = None
                    create_err[0] = (
                        {non_birefnet_model},
                        RuntimeError("DefaultCPUAllocator: not enough memory"),
                    )
                    nb_create_payload = _run_main(
                        {"model": non_birefnet_model, "outputFormat": "webp"}
                    )
                    assert nb_create_payload == {
                        "success": True,
                        "model": "u2net",
                        "device": "cpu",
                        "frames": 2,
                        "format": "webp",
                    }, (non_birefnet_model, nb_create_payload)
                    assert created_models == [non_birefnet_model, "u2net"], created_models
                    assert removed_sessions == ["session:u2net", "session:u2net"], removed_sessions

                    create_err[0] = (
                        {non_birefnet_model},
                        RuntimeError("Invalid ONNX model graph"),
                    )
                    nb_non_oom_payload = _run_main(
                        {"model": non_birefnet_model, "outputFormat": "webp"}
                    )
                    assert nb_non_oom_payload == {
                        "success": False,
                        "error": "Invalid ONNX model graph",
                    }, (non_birefnet_model, nb_non_oom_payload)
                    assert created_models == [non_birefnet_model], created_models

                # Bare MemoryError() in _create_session formats type(e).__name__ ("MemoryError") in warning.
                create_err[0] = ({"birefnet-general"}, MemoryError())
                bare_mem_payload = _run_main(
                    {"model": "birefnet-general", "outputFormat": "webp"}
                )
                assert bare_mem_payload["success"] is True, bare_mem_payload
                bare_warnings = [
                    json.loads(line)["warning"]
                    for line in stderr_captured
                    if line.startswith("{") and "warning" in json.loads(line)
                ]
                assert any("(MemoryError)" in w for w in bare_warnings), (
                    f"expected (MemoryError) detail in warning, got {bare_warnings!r}"
                )

                # _create_session non-OOM on birefnet-general does not fall back to u2net.
                create_err[0] = (
                    {"birefnet-general"},
                    RuntimeError("Invalid ONNX model graph"),
                )
                create_non_oom_payload = _run_main(
                    {"model": "birefnet-general", "outputFormat": "webp"}
                )
                assert create_non_oom_payload == {
                    "success": False,
                    "error": "Invalid ONNX model graph",
                }, create_non_oom_payload
                assert created_models == ["birefnet-general"], created_models

                # _create_session OOM when already on u2net does not retry.
                create_err[0] = (
                    {"u2net"},
                    RuntimeError("DefaultCPUAllocator: not enough memory"),
                )
                create_u2net_oom_payload = _run_main(
                    {"model": "u2net", "outputFormat": "webp"}
                )
                assert create_u2net_oom_payload == {
                    "success": False,
                    "error": "DefaultCPUAllocator: not enough memory",
                }, create_u2net_oom_payload
                assert created_models == ["u2net"], created_models

                # Preserves initial_device ("cuda") for u2net fallback even when birefnet-general
                # degraded device to "cpu" before frame-0 OOM.
                create_err[0] = None
                probe_err[0] = (
                    {"session:birefnet-general"},
                    RuntimeError("DefaultCPUAllocator: not enough memory"),
                )
                seen_devices = []

                def _stub_cuda_degrade_create_session(model, _providers, device):
                    seen_devices.append((model, device))
                    created_models.append(model)
                    if model == "birefnet-general":
                        return _TrackedSession(model), "cpu"
                    return _TrackedSession(model), device

                fake_gpu.onnx_providers = lambda: (
                    ["CUDAExecutionProvider", "CPUExecutionProvider"],
                    "cuda",
                )
                gif_remove_bg._create_session = _stub_cuda_degrade_create_session
                try:
                    cuda_fallback_payload = _run_main(
                        {"model": "birefnet-general", "outputFormat": "webp"}
                    )
                    assert cuda_fallback_payload == {
                        "success": True,
                        "model": "u2net",
                        "device": "cuda",
                        "frames": 2,
                        "format": "webp",
                    }, cuda_fallback_payload
                    assert seen_devices == [
                        ("birefnet-general", "cuda"),
                        ("u2net", "cuda"),
                    ], seen_devices
                    assert "[gif-remove-bg] session device=cuda model=u2net" in stderr_captured, (
                        stderr_captured
                    )
                finally:
                    fake_gpu.onnx_providers = lambda: (["CPUExecutionProvider"], "cpu")
                    gif_remove_bg._create_session = _stub_create_session

                # Offline guard is enforced for u2net fallback when u2net.onnx is absent and downloads are disabled.
                u2net_onnx = os.path.join(tmpdir, "u2net.onnx")
                os.remove(u2net_onnx)
                os.environ["SNAPOTTER_ALLOW_MODEL_DOWNLOAD"] = "0"
                try:
                    # 1) Frame-0 probe OOM with missing u2net.onnx
                    create_err[0] = None
                    probe_err[0] = (
                        {"session:birefnet-general"},
                        RuntimeError("DefaultCPUAllocator: not enough memory"),
                    )
                    offline_probe_payload = _run_main(
                        {"model": "birefnet-general", "outputFormat": "webp"}
                    )
                    assert offline_probe_payload["success"] is False, offline_probe_payload
                    assert "Background removal model 'u2net' is missing" in offline_probe_payload["error"], (
                        offline_probe_payload
                    )
                    assert created_models == ["birefnet-general"], (
                        f"_create_session('u2net') must not run when offline_guard rejects: {created_models!r}"
                    )

                    # 2) _create_session OOM with missing u2net.onnx
                    probe_err[0] = None
                    create_err[0] = (
                        {"birefnet-general"},
                        RuntimeError("DefaultCPUAllocator: not enough memory"),
                    )
                    offline_create_payload = _run_main(
                        {"model": "birefnet-general", "outputFormat": "webp"}
                    )
                    assert offline_create_payload["success"] is False, offline_create_payload
                    assert "Background removal model 'u2net' is missing" in offline_create_payload["error"], (
                        offline_create_payload
                    )
                    assert created_models == ["birefnet-general"], (
                        f"_create_session('u2net') must not run when offline_guard rejects: {created_models!r}"
                    )
                finally:
                    open(u2net_onnx, "wb").close()
                    if orig_allow_dl is None:
                        os.environ.pop("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", None)
                    else:
                        os.environ["SNAPOTTER_ALLOW_MODEL_DOWNLOAD"] = orig_allow_dl
                create_err[0] = None

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


def _verify_gif_cuda_session_host_oom():
    session_calls = []
    session_err = [None]
    stderr_lines = []

    class _FakeFrame:
        size = (16, 16)

        def resize(self, *_a):
            return self

        def save(self, buf, format=None):  # noqa: A002
            buf.write(b"png")

    def _fake_new_session(model, providers=None):
        session_calls.append((model, list(providers) if providers is not None else None))
        if (
            session_err[0] is not None
            and model in session_err[0][0]
            and providers is not None
            and "CUDAExecutionProvider" in providers
        ):
            raise session_err[0][1]
        return f"session:{model}:{providers[0] if providers else 'default'}"

    fake_rembg = types.ModuleType("rembg")
    fake_rembg.new_session = _fake_new_session
    fake_rembg.remove = lambda *_a, **_k: b"png-out"
    fake_sessions = types.ModuleType("rembg.sessions")
    fake_sessions.sessions_class = []
    fake_gpu = types.ModuleType("gpu")
    fake_gpu.onnx_providers = lambda: (
        ["CUDAExecutionProvider", "CPUExecutionProvider"],
        "cuda",
    )
    fake_model_paths = types.ModuleType("model_paths")
    fake_model_paths.ensure_rembg_model_home = lambda: None

    fake_pil = types.ModuleType("PIL")
    fake_pil.Image = types.SimpleNamespace(LANCZOS=1, open=lambda _b: _FakeFrame())

    prev_mods = {
        k: sys.modules.get(k) for k in ("rembg", "rembg.sessions", "gpu", "model_paths", "PIL")
    }
    orig_matting_reg = remove_bg._matting_registered
    orig_hr_matting_reg = remove_bg._hr_matting_registered
    orig_read_frames = gif_remove_bg._read_frames
    orig_remove_one = gif_remove_bg._remove_one
    orig_apply_effect = gif_remove_bg._apply_effect
    orig_encode = gif_remove_bg._encode
    orig_argv = sys.argv
    orig_u2net_home = os.environ.get("U2NET_HOME")

    sys.modules["rembg"] = fake_rembg
    sys.modules["rembg.sessions"] = fake_sessions
    sys.modules["gpu"] = fake_gpu
    sys.modules["model_paths"] = fake_model_paths
    sys.modules["PIL"] = fake_pil
    remove_bg._matting_registered = True
    remove_bg._hr_matting_registered = True

    try:
        cuda_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

        # 1) _create_session re-raises host-memory OOMs immediately without retrying CPUExecutionProvider (#3393).
        for host_oom_exc in (
            MemoryError(),
            RuntimeError(
                "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."
            ),
            RuntimeError(
                "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."
            ),
            RuntimeError("DefaultCPUAllocator: failed to allocate memory"),
            RuntimeError("DefaultCPUAllocator: out of memory"),
            OSError(12, "Cannot allocate memory"),
            OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
            RuntimeError(
                "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32"
            ),
            RuntimeError("std::bad_alloc"),
        ):
            session_calls.clear()
            session_err[0] = ({"birefnet-general"}, host_oom_exc)
            err_buf = io.StringIO()
            saved_stderr = sys.stderr
            sys.stderr = err_buf
            try:
                gif_remove_bg._create_session("birefnet-general", cuda_providers, "cuda")
                raise AssertionError(
                    f"gif_remove_bg._create_session did not re-raise {host_oom_exc!r}"
                )
            except Exception as caught:
                assert caught is host_oom_exc, (caught, host_oom_exc)
            finally:
                sys.stderr = saved_stderr
            assert session_calls == [("birefnet-general", cuda_providers)], (
                f"gif_remove_bg._create_session must not retry on CPU for host OOM {host_oom_exc!r}, got {session_calls!r}"
            )
            assert "falling back to CPU" not in err_buf.getvalue(), err_buf.getvalue()

        # 1b) _create_session re-raises model-load / I/O / protobuf / download errors immediately without retrying CPUExecutionProvider (#3443).
        for model_load_exc in (
            FileNotFoundError(2, "No such file or directory", "/tmp/birefnet-general.onnx"),
            PermissionError(13, "Permission denied", "/tmp/birefnet-general.onnx"),
            IsADirectoryError(21, "Is a directory", "/tmp/birefnet-general.onnx"),
            OSError(5, "Input/output error"),
            ConnectionError("Connection reset by peer"),
            EOFError("Unexpected end of file"),
            _FakeInvalidProtobuf("Load model from /tmp/birefnet-general.onnx failed"),
            _FakeInvalidGraph("Load model from /tmp/birefnet-general.onnx failed"),
            _FakeNoSuchFile("/tmp/birefnet-general.onnx"),
            RuntimeError(
                "[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/birefnet-general.onnx failed:Protobuf parsing failed."
            ),
            RuntimeError(
                "[ONNXRuntimeError] : 3 : NO_SUCHFILE : Load model from /tmp/birefnet-general.onnx failed:File doesn't exist"
            ),
            RuntimeError(
                "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/birefnet-general.onnx failed:This is an invalid model. Error: ModelProto does not have a graph."
            ),
            RuntimeError(
                "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/birefnet-general.onnx failed:This is an invalid model. Type Error: Type 'tensor(float)' of input parameter is invalid."
            ),
            ValueError(
                "SHA256 hash of downloaded file (birefnet-general.onnx) does not match the known hash"
            ),
            ValueError("Checksum mismatch"),
            RuntimeError(
                "Offline mode is enabled (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0); cannot download model"
            ),
        ):
            session_calls.clear()
            session_err[0] = ({"birefnet-general"}, model_load_exc)
            err_buf = io.StringIO()
            saved_stderr = sys.stderr
            sys.stderr = err_buf
            try:
                gif_remove_bg._create_session("birefnet-general", cuda_providers, "cuda")
                raise AssertionError(
                    f"gif_remove_bg._create_session did not re-raise {model_load_exc!r}"
                )
            except Exception as caught:
                assert caught is model_load_exc, (caught, model_load_exc)
            finally:
                sys.stderr = saved_stderr
            assert session_calls == [("birefnet-general", cuda_providers)], (
                f"gif_remove_bg._create_session must not retry on CPU for model-load error {model_load_exc!r}, got {session_calls!r}"
            )
            assert "falling back to CPU" not in err_buf.getvalue(), err_buf.getvalue()

        # 2) _create_session still falls back to CPUExecutionProvider on CUDA VRAM / driver errors (#3393).
        for cuda_exc in (
            RuntimeError("CUDA out of memory"),
            RuntimeError("cudaErrorMemoryAllocation: out of memory"),
            RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
            RuntimeError("CUDA driver version is insufficient"),
            RuntimeError(
                "[ONNXRuntimeError] : 1 : FAIL : Failed to load library libonnxruntime_providers_cuda.so with error: libcudnn.so.8: cannot open shared object file: No such file or directory"
            ),
        ):
            session_calls.clear()
            session_err[0] = ({"birefnet-general"}, cuda_exc)
            err_buf = io.StringIO()
            saved_stderr = sys.stderr
            sys.stderr = err_buf
            try:
                sess, dev = gif_remove_bg._create_session(
                    "birefnet-general", cuda_providers, "cuda"
                )
            finally:
                sys.stderr = saved_stderr
            assert sess == "session:birefnet-general:CPUExecutionProvider", sess
            assert dev == "cpu", dev
            assert session_calls == [
                ("birefnet-general", cuda_providers),
                ("birefnet-general", ["CPUExecutionProvider"]),
            ], session_calls
            assert "falling back to CPU" in err_buf.getvalue(), err_buf.getvalue()

        # 3) End-to-end gif_remove_bg.main() on CUDA host with real _create_session switches
        # directly from birefnet-general to u2net on host OOM without a CPU retry of birefnet-general.
        with tempfile.TemporaryDirectory() as tmpdir:
            for m_name in ("birefnet-general", "u2net"):
                open(os.path.join(tmpdir, f"{m_name}.onnx"), "wb").close()
            os.environ["U2NET_HOME"] = tmpdir
            gif_remove_bg._read_frames = lambda _p: ([_FakeFrame(), _FakeFrame()], [100, 100], 0)
            gif_remove_bg._remove_one = lambda frame, *_a: frame
            gif_remove_bg._apply_effect = lambda cut, *_a: cut
            gif_remove_bg._encode = lambda *_a: None

            for host_oom_exc in (
                MemoryError(),
                RuntimeError("DefaultCPUAllocator: not enough memory"),
                RuntimeError("DefaultCPUAllocator: failed to allocate memory"),
                OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
            ):
                session_calls.clear()
                stderr_lines.clear()
                session_err[0] = ({"birefnet-general"}, host_oom_exc)
                sys.argv = [
                    "gif_remove_bg.py",
                    "in.gif",
                    "out.webp",
                    json.dumps({"model": "birefnet-general", "outputFormat": "webp"}),
                ]
                r_fd, w_fd = os.pipe()
                err_buf = io.StringIO()
                saved_stderr = sys.stderr
                try:
                    saved_stdout_fd = os.dup(1)
                    os.dup2(w_fd, 1)
                    os.close(w_fd)
                    sys.stderr = err_buf
                    try:
                        gif_remove_bg.main()
                    finally:
                        sys.stderr = saved_stderr
                        os.dup2(saved_stdout_fd, 1)
                        os.close(saved_stdout_fd)
                    captured = os.read(r_fd, 4096).decode("utf-8")
                finally:
                    os.close(r_fd)
                stderr_lines.extend(
                    line.strip() for line in err_buf.getvalue().splitlines() if line.strip()
                )
                payload = json.loads(captured.strip())
                assert payload == {
                    "success": True,
                    "model": "u2net",
                    "device": "cuda",
                    "frames": 2,
                    "format": "webp",
                }, payload
                assert session_calls == [
                    ("birefnet-general", cuda_providers),
                    ("u2net", cuda_providers),
                ], (
                    f"gif_remove_bg.main must switch directly to u2net on host OOM without retrying birefnet-general on CPU: {session_calls!r}"
                )
                assert not any("falling back to CPU" in line for line in stderr_lines), stderr_lines
                assert any(
                    "birefnet-general ran out of memory" in line and "retrying with u2net" in line
                    for line in stderr_lines
                ), stderr_lines
                assert any(
                    "[gif-remove-bg] session device=cuda model=u2net" in line
                    for line in stderr_lines
                ), stderr_lines

            # 4) End-to-end gif_remove_bg.main() on CUDA host with a model-load / protobuf / checksum error
            # fails immediately without retrying on CPUExecutionProvider or falling back to u2net (#3443).
            for model_load_exc, expected_msg in (
                (
                    FileNotFoundError(2, "No such file or directory"),
                    "[Errno 2] No such file or directory",
                ),
                (
                    PermissionError(13, "Permission denied"),
                    "[Errno 13] Permission denied",
                ),
                (
                    EOFError("Unexpected end of file"),
                    "Unexpected end of file",
                ),
                (
                    RuntimeError(
                        "[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/birefnet-general.onnx failed:Protobuf parsing failed."
                    ),
                    "[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/birefnet-general.onnx failed:Protobuf parsing failed.",
                ),
                (
                    RuntimeError(
                        "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/birefnet-general.onnx failed:This is an invalid model. Error: ModelProto does not have a graph."
                    ),
                    "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/birefnet-general.onnx failed:This is an invalid model. Error: ModelProto does not have a graph.",
                ),
                (
                    ValueError(
                        "SHA256 hash of downloaded file (birefnet-general.onnx) does not match the known hash"
                    ),
                    "SHA256 hash of downloaded file (birefnet-general.onnx) does not match the known hash",
                ),
            ):
                session_calls.clear()
                stderr_lines.clear()
                session_err[0] = ({"birefnet-general"}, model_load_exc)
                sys.argv = [
                    "gif_remove_bg.py",
                    "in.gif",
                    "out.webp",
                    json.dumps({"model": "birefnet-general", "outputFormat": "webp"}),
                ]
                r_fd, w_fd = os.pipe()
                err_buf = io.StringIO()
                saved_stderr = sys.stderr
                try:
                    saved_stdout_fd = os.dup(1)
                    os.dup2(w_fd, 1)
                    os.close(w_fd)
                    sys.stderr = err_buf
                    try:
                        gif_remove_bg.main()
                    finally:
                        sys.stderr = saved_stderr
                        os.dup2(saved_stdout_fd, 1)
                        os.close(saved_stdout_fd)
                    captured = os.read(r_fd, 4096).decode("utf-8")
                finally:
                    os.close(r_fd)
                stderr_lines.extend(
                    line.strip() for line in err_buf.getvalue().splitlines() if line.strip()
                )
                payload = json.loads(captured.strip())
                assert payload == {"success": False, "error": expected_msg}, payload
                assert session_calls == [("birefnet-general", cuda_providers)], (
                    f"gif_remove_bg.main must not retry on CPU or u2net for {model_load_exc!r}: {session_calls!r}"
                )
                assert not any("falling back to CPU" in line for line in stderr_lines), stderr_lines
                assert not any("retrying with u2net" in line for line in stderr_lines), stderr_lines
    finally:
        remove_bg._matting_registered = orig_matting_reg
        remove_bg._hr_matting_registered = orig_hr_matting_reg
        gif_remove_bg._read_frames = orig_read_frames
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


_verify_gif_cuda_session_host_oom()


def _verify_safe_onnx_session_host_oom():
    calls = []
    active_err = [None]

    def _fake_inference_session(model_path, providers=None):
        calls.append((model_path, list(providers) if providers is not None else None))
        if (
            active_err[0] is not None
            and providers is not None
            and "CUDAExecutionProvider" in providers
        ):
            raise active_err[0]
        return f"session:{model_path}:{providers[0] if providers else 'default'}"

    fake_ort = types.ModuleType("onnxruntime")
    fake_ort.InferenceSession = _fake_inference_session
    prev_ort = sys.modules.get("onnxruntime")
    orig_onnx_providers = gpu.onnx_providers
    sys.modules["onnxruntime"] = fake_ort

    try:
        cuda_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

        # 1) safe_onnx_session re-raises host-memory OOMs immediately without retrying CPUExecutionProvider (#3439).
        for host_oom_exc in (
            MemoryError(),
            RuntimeError("MemoryError"),
            RuntimeError("std::bad_alloc"),
            RuntimeError(
                "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."
            ),
            RuntimeError(
                "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."
            ),
            RuntimeError("DefaultCPUAllocator: failed to allocate memory"),
            RuntimeError("DefaultCPUAllocator: out of memory"),
            RuntimeError("DefaultCPUAllocator: NOT ENOUGH MEMORY"),
            RuntimeError("DefaultCPUAllocator: CAN'T ALLOCATE MEMORY"),
            RuntimeError("OSError: [Errno 12] Cannot allocate memory"),
            OSError(12, "Cannot allocate memory"),
            OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
            RuntimeError(
                "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32"
            ),
        ):
            for explicit_providers in (cuda_providers, None):
                calls.clear()
                active_err[0] = host_oom_exc
                gpu.onnx_providers = lambda: (list(cuda_providers), "cuda")
                err_buf = io.StringIO()
                saved_stderr = sys.stderr
                sys.stderr = err_buf
                try:
                    gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
                    raise AssertionError(
                        f"gpu.safe_onnx_session did not re-raise {host_oom_exc!r}"
                    )
                except Exception as caught:
                    assert caught is host_oom_exc, (caught, host_oom_exc)
                finally:
                    sys.stderr = saved_stderr
                assert calls == [("/tmp/model.onnx", cuda_providers)], (
                    f"gpu.safe_onnx_session must not retry on CPU for host OOM {host_oom_exc!r}, got {calls!r}"
                )
                assert "falling back to CPU" not in err_buf.getvalue(), err_buf.getvalue()

        # 1b) safe_onnx_session re-raises model-load / I/O / protobuf / download errors immediately without retrying CPUExecutionProvider (#3443).
        for model_load_exc in (
            FileNotFoundError(2, "No such file or directory", "/tmp/model.onnx"),
            PermissionError(13, "Permission denied", "/tmp/model.onnx"),
            IsADirectoryError(21, "Is a directory", "/tmp/model.onnx"),
            OSError(5, "Input/output error"),
            ConnectionError("Connection reset by peer"),
            EOFError("Unexpected end of file"),
            _FakeInvalidProtobuf("Load model from /tmp/model.onnx failed"),
            _FakeInvalidGraph("Load model from /tmp/model.onnx failed"),
            _FakeNoSuchFile("/tmp/model.onnx"),
            RuntimeError(
                "[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/model.onnx failed:Protobuf parsing failed."
            ),
            RuntimeError(
                "[ONNXRuntimeError] : 3 : NO_SUCHFILE : Load model from /tmp/model.onnx failed:File doesn't exist"
            ),
            RuntimeError(
                "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/model.onnx failed:This is an invalid model. Error: ModelProto does not have a graph."
            ),
            RuntimeError(
                "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/model.onnx failed:This is an invalid model. Type Error: Type 'tensor(float)' of input parameter is invalid."
            ),
            ValueError(
                "SHA256 hash of downloaded file (model.onnx) does not match the known hash"
            ),
            ValueError("Checksum mismatch"),
            RuntimeError(
                "Offline mode is enabled (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0); cannot download model"
            ),
        ):
            for explicit_providers in (cuda_providers, None):
                calls.clear()
                active_err[0] = model_load_exc
                gpu.onnx_providers = lambda: (list(cuda_providers), "cuda")
                err_buf = io.StringIO()
                saved_stderr = sys.stderr
                sys.stderr = err_buf
                try:
                    gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
                    raise AssertionError(
                        f"gpu.safe_onnx_session did not re-raise {model_load_exc!r}"
                    )
                except Exception as caught:
                    assert caught is model_load_exc, (caught, model_load_exc)
                finally:
                    sys.stderr = saved_stderr
                assert calls == [("/tmp/model.onnx", cuda_providers)], (
                    f"gpu.safe_onnx_session must not retry on CPU for model-load error {model_load_exc!r}, got {calls!r}"
                )
                assert "falling back to CPU" not in err_buf.getvalue(), err_buf.getvalue()

        # 2) safe_onnx_session still falls back to CPUExecutionProvider on CUDA VRAM / driver errors (#3439).
        for cuda_exc in (
            RuntimeError("CUDA out of memory"),
            RuntimeError("Failed to allocate memory for requested buffer"),
            RuntimeError("cudaErrorMemoryAllocation: out of memory"),
            RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
            RuntimeError("CUDA driver version is insufficient"),
            RuntimeError(
                "[ONNXRuntimeError] : 1 : FAIL : Failed to load library libonnxruntime_providers_cuda.so with error: libcudnn.so.8: cannot open shared object file: No such file or directory"
            ),
        ):
            for explicit_providers in (cuda_providers, None):
                calls.clear()
                active_err[0] = cuda_exc
                gpu.onnx_providers = lambda: (list(cuda_providers), "cuda")
                err_buf = io.StringIO()
                saved_stderr = sys.stderr
                sys.stderr = err_buf
                try:
                    sess, dev = gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
                finally:
                    sys.stderr = saved_stderr
                assert sess == "session:/tmp/model.onnx:CPUExecutionProvider", sess
                assert dev == "cpu", dev
                assert calls == [
                    ("/tmp/model.onnx", cuda_providers),
                    ("/tmp/model.onnx", ["CPUExecutionProvider"]),
                ], calls
                assert "falling back to CPU" in err_buf.getvalue(), err_buf.getvalue()

        # 3) Explicit providers with CUDAExecutionProvider return device="cuda" on success,
        #    and "cpu" when session.get_providers() reports CUDA was dropped or CPU-only was requested (#3611).
        active_err[0] = None
        for explicit_providers in (None, list(cuda_providers)):
            calls.clear()
            if explicit_providers is None:
                gpu.onnx_providers = lambda: (list(cuda_providers), "cuda")
            else:
                gpu.onnx_providers = lambda: (_ for _ in ()).throw(
                    AssertionError("onnx_providers() must not be called when providers is explicit")
                )
            sess_ok, dev_ok = gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
            assert sess_ok == "session:/tmp/model.onnx:CUDAExecutionProvider", sess_ok
            assert dev_ok == "cuda", (explicit_providers, dev_ok)
            assert calls == [("/tmp/model.onnx", cuda_providers)], calls

        calls.clear()
        sess_cpu, dev_cpu = gpu.safe_onnx_session("/tmp/model.onnx", providers=["CPUExecutionProvider"])
        assert sess_cpu == "session:/tmp/model.onnx:CPUExecutionProvider", sess_cpu
        assert dev_cpu == "cpu", dev_cpu
        assert calls == [("/tmp/model.onnx", ["CPUExecutionProvider"])], calls

        class _DroppedCudaSession:
            def get_providers(self):
                return ["CPUExecutionProvider"]

        fake_ort.InferenceSession = lambda _path, providers=None: _DroppedCudaSession()
        _, dev_dropped = gpu.safe_onnx_session("/tmp/model.onnx", providers=list(cuda_providers))
        assert dev_dropped == "cpu", dev_dropped
    finally:
        gpu.onnx_providers = orig_onnx_providers
        if prev_ort is None:
            sys.modules.pop("onnxruntime", None)
        else:
            sys.modules["onnxruntime"] = prev_ort


_verify_safe_onnx_session_host_oom()


def _verify_remove_bg_oom_handling():
    rembg_calls = []
    session_calls = []
    session_err = [None]
    active_err = [None]
    retry_err = [None]
    active_device = ["cuda"]
    stderr_lines = []
    info_msgs = []

    fake_rembg = types.ModuleType("rembg")

    def _fake_new_session(model, providers=None):
        session_calls.append((model, list(providers) if providers is not None else None))
        if (
            session_err[0] is not None
            and providers is not None
            and "CUDAExecutionProvider" in providers
        ):
            raise session_err[0]
        return f"session:{model}"

    fake_rembg.new_session = _fake_new_session

    def _fake_remove(_data, session=None, alpha_matting=False, **_kwargs):
        rembg_calls.append((session, alpha_matting))
        if not alpha_matting and active_device[0] == "cuda" and retry_err[0] is not None:
            raise retry_err[0]
        if active_err[0] is not None and (alpha_matting or active_device[0] == "cpu"):
            raise active_err[0]
        return b"png-out"

    fake_rembg.remove = _fake_remove
    fake_sessions = types.ModuleType("rembg.sessions")
    fake_sessions.sessions_class = []
    fake_gpu = types.ModuleType("gpu")
    fake_gpu.onnx_providers = lambda: (
        (["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda")
        if active_device[0] == "cuda"
        else (["CPUExecutionProvider"], "cpu")
    )
    fake_gpu.emit_info = lambda msg: info_msgs.append(msg)
    fake_model_paths = types.ModuleType("model_paths")
    fake_model_paths.ensure_rembg_model_home = lambda: None

    prev_mods = {
        k: sys.modules.get(k) for k in ("rembg", "rembg.sessions", "gpu", "model_paths")
    }
    orig_matting_reg = remove_bg._matting_registered
    orig_hr_matting_reg = remove_bg._hr_matting_registered
    orig_argv = sys.argv
    orig_u2net_home = os.environ.get("U2NET_HOME")

    sys.modules["rembg"] = fake_rembg
    sys.modules["rembg.sessions"] = fake_sessions
    sys.modules["gpu"] = fake_gpu
    sys.modules["model_paths"] = fake_model_paths
    remove_bg._matting_registered = True
    remove_bg._hr_matting_registered = True

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            in_path = os.path.join(tmpdir, "in.png")
            out_path = os.path.join(tmpdir, "out.png")
            with open(in_path, "wb") as f:
                f.write(b"png-in")
            for m_name in ("birefnet-general", "u2net"):
                open(os.path.join(tmpdir, f"{m_name}.onnx"), "wb").close()
            os.environ["U2NET_HOME"] = tmpdir

            def _run_remove_bg_main(settings_dict):
                # Each simulated request must build its own session; a GPU host has a
                # non-zero auto budget and would otherwise cache the fake model file.
                session_cache.evict_all("test isolation")
                rembg_calls.clear()
                session_calls.clear()
                info_msgs.clear()
                stderr_lines.clear()
                sys.argv = ["remove_bg.py", in_path, out_path, json.dumps(settings_dict)]
                r_fd, w_fd = os.pipe()
                err_buf = io.StringIO()
                saved_stderr = sys.stderr
                try:
                    saved_stdout_fd = os.dup(1)
                    os.dup2(w_fd, 1)
                    os.close(w_fd)
                    sys.stderr = err_buf
                    try:
                        remove_bg.main()
                    finally:
                        sys.stderr = saved_stderr
                        os.dup2(saved_stdout_fd, 1)
                        os.close(saved_stdout_fd)
                    captured = os.read(r_fd, 4096).decode("utf-8")
                finally:
                    os.close(r_fd)
                stderr_lines.extend(
                    line.strip() for line in err_buf.getvalue().splitlines() if line.strip()
                )
                return json.loads(captured.strip())

            # Host-memory OOMs during CUDA new_session must re-raise immediately without
            # retrying new_session(model, providers=["CPUExecutionProvider"]) (#3393).
            active_device[0] = "cuda"
            active_err[0] = None
            retry_err[0] = None
            cuda_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            for host_oom_exc, expected_msg in (
                (MemoryError(), "MemoryError"),
                (
                    RuntimeError(
                        "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."
                    ),
                    "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
                ),
                (
                    RuntimeError(
                        "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."
                    ),
                    "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes.",
                ),
                (
                    RuntimeError("DefaultCPUAllocator: failed to allocate memory"),
                    "DefaultCPUAllocator: failed to allocate memory",
                ),
                (
                    RuntimeError("DefaultCPUAllocator: out of memory"),
                    "DefaultCPUAllocator: out of memory",
                ),
                (OSError(12, "Cannot allocate memory"), "[Errno 12] Cannot allocate memory"),
                (
                    OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
                    "[Errno 12] Nicht genügend Hauptspeicher verfügbar",
                ),
                (
                    RuntimeError(
                        "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32"
                    ),
                    "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
                ),
                (RuntimeError("std::bad_alloc"), "std::bad_alloc"),
            ):
                session_err[0] = host_oom_exc
                payload = _run_remove_bg_main({"model": "birefnet-general"})
                assert payload == {"success": False, "error": expected_msg}, payload
                assert session_calls == [("birefnet-general", cuda_providers)], (
                    f"remove_bg.main must not retry new_session on CPU for host OOM {host_oom_exc!r}, got {session_calls!r}"
                )
                assert rembg_calls == [], rembg_calls
                assert info_msgs == [], info_msgs

            # Model-load / I/O / protobuf / download errors during CUDA new_session must re-raise
            # immediately without retrying new_session(model, providers=["CPUExecutionProvider"]) (#3443).
            for model_load_exc, expected_msg in (
                (
                    FileNotFoundError(2, "No such file or directory"),
                    "[Errno 2] No such file or directory",
                ),
                (
                    PermissionError(13, "Permission denied"),
                    "[Errno 13] Permission denied",
                ),
                (
                    OSError(5, "Input/output error"),
                    "[Errno 5] Input/output error",
                ),
                (
                    EOFError("Unexpected end of file"),
                    "Unexpected end of file",
                ),
                (
                    _FakeInvalidProtobuf("Load model from /tmp/birefnet-general.onnx failed"),
                    "Load model from /tmp/birefnet-general.onnx failed",
                ),
                (
                    _FakeInvalidGraph("Load model from /tmp/birefnet-general.onnx failed"),
                    "Load model from /tmp/birefnet-general.onnx failed",
                ),
                (
                    _FakeNoSuchFile("/tmp/birefnet-general.onnx"),
                    "/tmp/birefnet-general.onnx",
                ),
                (
                    ConnectionError("Connection reset by peer"),
                    "Connection reset by peer",
                ),
                (
                    RuntimeError(
                        "[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/birefnet-general.onnx failed:Protobuf parsing failed."
                    ),
                    "[ONNXRuntimeError] : 7 : INVALID_PROTOBUF : Load model from /tmp/birefnet-general.onnx failed:Protobuf parsing failed.",
                ),
                (
                    RuntimeError(
                        "[ONNXRuntimeError] : 3 : NO_SUCHFILE : Load model from /tmp/birefnet-general.onnx failed:File doesn't exist"
                    ),
                    "[ONNXRuntimeError] : 3 : NO_SUCHFILE : Load model from /tmp/birefnet-general.onnx failed:File doesn't exist",
                ),
                (
                    RuntimeError(
                        "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/birefnet-general.onnx failed:This is an invalid model. Error: ModelProto does not have a graph."
                    ),
                    "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/birefnet-general.onnx failed:This is an invalid model. Error: ModelProto does not have a graph.",
                ),
                (
                    RuntimeError(
                        "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/birefnet-general.onnx failed:This is an invalid model. Type Error: Type 'tensor(float)' of input parameter is invalid."
                    ),
                    "[ONNXRuntimeError] : 10 : INVALID_GRAPH : Load model from /tmp/birefnet-general.onnx failed:This is an invalid model. Type Error: Type 'tensor(float)' of input parameter is invalid.",
                ),
                (
                    ValueError(
                        "SHA256 hash of downloaded file (birefnet-general.onnx) does not match the known hash"
                    ),
                    "SHA256 hash of downloaded file (birefnet-general.onnx) does not match the known hash",
                ),
                (
                    ValueError("Checksum mismatch"),
                    "Checksum mismatch",
                ),
                (
                    RuntimeError(
                        "Offline mode is enabled (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0); cannot download model"
                    ),
                    "Offline mode is enabled (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0); cannot download model",
                ),
            ):
                session_err[0] = model_load_exc
                payload = _run_remove_bg_main({"model": "birefnet-general"})
                assert payload == {"success": False, "error": expected_msg}, payload
                assert session_calls == [("birefnet-general", cuda_providers)], (
                    f"remove_bg.main must not retry new_session on CPU for model-load error {model_load_exc!r}, got {session_calls!r}"
                )
                assert rembg_calls == [], rembg_calls
                assert info_msgs == [], info_msgs

            # CUDA VRAM / driver errors during CUDA new_session still fall back to CPUExecutionProvider (#3393).
            for cuda_exc in (
                RuntimeError("CUDA out of memory"),
                RuntimeError("cudaErrorMemoryAllocation: out of memory"),
                RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
                RuntimeError("CUDA driver version is insufficient"),
                RuntimeError(
                    "[ONNXRuntimeError] : 1 : FAIL : Failed to load library libonnxruntime_providers_cuda.so with error: libcudnn.so.8: cannot open shared object file: No such file or directory"
                ),
            ):
                session_err[0] = cuda_exc
                payload = _run_remove_bg_main({"model": "birefnet-general"})
                assert payload == {
                    "success": True,
                    "model": "birefnet-general",
                    "device": "cpu",
                }, payload
                assert session_calls == [
                    ("birefnet-general", cuda_providers),
                    ("birefnet-general", ["CPUExecutionProvider"]),
                ], session_calls
                assert rembg_calls == [("session:birefnet-general", False)], rembg_calls
                assert any("falling back to CPU" in m for m in info_msgs), info_msgs
            session_err[0] = None

            # On GPU (use_alpha_matting=True), RuntimeError / OSError / MemoryError OOMs must re-raise
            # immediately without retrying remove(..., alpha_matting=False) on the same session (#3045).
            active_device[0] = "cuda"
            for oom_exc, expected_msg in (
                (RuntimeError("CUDA out of memory"), "CUDA out of memory"),
                (
                    RuntimeError("Failed to allocate memory for requested buffer"),
                    "Failed to allocate memory for requested buffer",
                ),
                (
                    RuntimeError(
                        "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes."
                    ),
                    "[enforce fail at alloc_cpu.cpp:114] DefaultCPUAllocator: not enough memory: you tried to allocate 600000000 bytes.",
                ),
                (
                    RuntimeError(
                        "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes."
                    ),
                    "DefaultCPUAllocator: can't allocate memory: you tried to allocate 104857600 bytes.",
                ),
                (OSError(12, "Cannot allocate memory"), "[Errno 12] Cannot allocate memory"),
                (
                    RuntimeError(
                        "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32"
                    ),
                    "Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30) and data type float32",
                ),
                (MemoryError(), "MemoryError"),
            ):
                active_err[0] = oom_exc
                payload = _run_remove_bg_main({"model": "birefnet-general"})
                assert payload == {"success": False, "error": expected_msg}, payload
                assert rembg_calls == [("session:birefnet-general", True)], (
                    f"remove_bg._remove must not retry alpha_matting=False on OOM {oom_exc!r}, got {rembg_calls!r}"
                )

            # Non-OOM error on GPU (e.g. pymatting Cholesky failure) still retries with alpha_matting=False
            # and emits a structured stderr warning.
            active_err[0] = ValueError("pymatting Cholesky decomposition failed")
            retry_err[0] = None
            retry_payload = _run_remove_bg_main({"model": "birefnet-general"})
            assert retry_payload == {
                "success": True,
                "model": "birefnet-general",
                "device": "cuda",
            }, retry_payload
            assert rembg_calls == [
                ("session:birefnet-general", True),
                ("session:birefnet-general", False),
            ], rembg_calls
            warnings = [
                json.loads(line)["warning"]
                for line in stderr_lines
                if line.startswith("{") and "warning" in json.loads(line)
            ]
            assert any(
                "[remove-bg] Alpha matting failed (pymatting Cholesky decomposition failed); retrying without alpha matting"
                in w
                for w in warnings
            ), stderr_lines

            # When both alpha_matting=True and the alpha_matting=False retry fail on GPU with non-OOM,
            # the retry failure is wrapped with "Background removal failed: <detail>".
            active_err[0] = ValueError("corrupt image stream")
            retry_err[0] = ValueError("corrupt image stream")
            both_fail_payload = _run_remove_bg_main({"model": "birefnet-general"})
            assert both_fail_payload == {
                "success": False,
                "error": "Background removal failed: corrupt image stream",
            }, both_fail_payload
            assert rembg_calls == [
                ("session:birefnet-general", True),
                ("session:birefnet-general", False),
            ], rembg_calls

            # When alpha_matting=True fails with non-OOM and the alpha_matting=False retry hits OOM,
            # the OOM re-raises cleanly without the "Background removal failed: " prefix.
            active_err[0] = ValueError("pymatting Cholesky decomposition failed")
            retry_err[0] = RuntimeError("CUDA out of memory")
            retry_oom_payload = _run_remove_bg_main({"model": "birefnet-general"})
            assert retry_oom_payload == {
                "success": False,
                "error": "CUDA out of memory",
            }, retry_oom_payload
            assert rembg_calls == [
                ("session:birefnet-general", True),
                ("session:birefnet-general", False),
            ], rembg_calls
            retry_err[0] = None

            # On CPU (use_alpha_matting=False), OOM re-raises cleanly and non-OOM wraps with prefix.
            active_device[0] = "cpu"
            active_err[0] = RuntimeError("DefaultCPUAllocator: not enough memory")
            cpu_oom_payload = _run_remove_bg_main({"model": "birefnet-general"})
            assert cpu_oom_payload == {
                "success": False,
                "error": "DefaultCPUAllocator: not enough memory",
            }, cpu_oom_payload
            assert rembg_calls == [("session:birefnet-general", False)], rembg_calls

            active_err[0] = ValueError("corrupt image stream")
            cpu_non_oom_payload = _run_remove_bg_main({"model": "birefnet-general"})
            assert cpu_non_oom_payload == {
                "success": False,
                "error": "Background removal failed: corrupt image stream",
            }, cpu_non_oom_payload
            assert rembg_calls == [("session:birefnet-general", False)], rembg_calls
    finally:
        remove_bg._matting_registered = orig_matting_reg
        remove_bg._hr_matting_registered = orig_hr_matting_reg
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


_verify_remove_bg_oom_handling()
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


def _verify_dispatcher_failure_recycling():
    import io

    # 1. Immediate recycle on CUDA / ORT context-poison signatures, both exitCode=1
    #    and exitCode=0 with {"success": False, "error": ...} (the remove_bg.py path).
    for cuda_msg, exit_code in (
        ("[ONNXRuntimeError] : 1 : FAIL : CUDA failure 999: unknown error", 0),
        ("[ONNXRuntimeError] : 1 : FAIL : CUDA failure 999: unknown error", 1),
        ("RuntimeError: cudaErrorIllegalAddress: an illegal memory access was encountered", 1),
        ("RuntimeError: cuDNN error: CUDNN_STATUS_EXECUTION_FAILED", 1),
        ("ORT_RUNTIME_EXCEPTION: context poisoned", 1),
        ("RuntimeError: CUDA error: device-side assert triggered", 1),
    ):
        calls = []

        def _fake_cuda_run(script_name, args, _msg=cuda_msg, _code=exit_code):
            calls.append((script_name, args))
            return json.dumps({"success": False, "error": _msg}), _code

        orig_run = dispatcher._run_script_main
        orig_stdin = sys.stdin
        orig_stdout = sys.stdout
        orig_stderr = sys.stderr
        try:
            dispatcher._run_script_main = _fake_cuda_run
            sys.stdin = io.StringIO(
                json.dumps({"id": "req-1", "script": "doc_health", "args": ["first"]})
                + "\n"
                + json.dumps({"id": "req-2", "script": "doc_health", "args": ["second"]})
                + "\n"
            )
            out_buf = io.StringIO()
            err_buf = io.StringIO()
            sys.stdout = out_buf
            sys.stderr = err_buf
            dispatcher.main()
        finally:
            dispatcher._run_script_main = orig_run
            sys.stdin = orig_stdin
            sys.stdout = orig_stdout
            sys.stderr = orig_stderr

        assert len(calls) == 1, f"Expected dispatcher to recycle after 1st CUDA failure ({cuda_msg}), got {calls}"
        responses = [json.loads(line) for line in out_buf.getvalue().splitlines() if line.strip()]
        assert len(responses) == 1 and responses[0]["id"] == "req-1", responses
        assert "shutting down for restart" in err_buf.getvalue(), err_buf.getvalue()

    # 2. Recycle after 3 consecutive non-CUDA script failures, and reset counter on success.
    seq_outcomes = [
        (json.dumps({"success": False, "error": "bad input 1"}), 1),
        (json.dumps({"success": False, "error": "bad input 2"}), 0),
        (json.dumps({"success": True}), 0),  # resets consecutive failure count to 0
        (json.dumps({"success": False, "error": "bad input 3"}), 1),
        (json.dumps({"success": False, "error": "bad input 4"}), 1),
        (json.dumps({"success": False, "error": "bad input 5"}), 0),  # 3rd consecutive failure -> recycle
        (json.dumps({"success": True}), 0),  # must not be reached in this loop
    ]
    seq_calls = []

    def _fake_seq_run(script_name, args):
        idx = len(seq_calls)
        seq_calls.append((script_name, args))
        return seq_outcomes[idx]

    orig_run = dispatcher._run_script_main
    orig_stdin = sys.stdin
    orig_stdout = sys.stdout
    orig_stderr = sys.stderr
    try:
        dispatcher._run_script_main = _fake_seq_run
        sys.stdin = io.StringIO(
            "".join(
                json.dumps({"id": f"r-{i}", "script": "doc_health", "args": [i]}) + "\n"
                for i in range(len(seq_outcomes))
            )
        )
        out_buf = io.StringIO()
        err_buf = io.StringIO()
        sys.stdout = out_buf
        sys.stderr = err_buf
        dispatcher.main()
    finally:
        dispatcher._run_script_main = orig_run
        sys.stdin = orig_stdin
        sys.stdout = orig_stdout
        sys.stderr = orig_stderr

    assert len(seq_calls) == 6, f"Expected 6 requests before 3-consecutive-failure recycle, got {len(seq_calls)}"
    assert "shutting down for restart" in err_buf.getvalue(), err_buf.getvalue()

    # 3. Direct unit checks on _extract_failure_detail and _should_recycle_after_request
    assert dispatcher._extract_failure_detail("", 0) == ("succeeded", "")
    assert dispatcher._extract_failure_detail("plain error text", 1) == ("failed", "plain error text")
    assert dispatcher._extract_failure_detail('{"ok": true}', 0) == ("succeeded", "")
    assert dispatcher._extract_failure_detail('{"error": "missing path"}', 1) == (
        "failed",
        "missing path",
    )
    for ignored_err in (
        "canceled",
        "invalid_script_name",
        "script_not_allowed",
        "feature_not_installed",
    ):
        assert dispatcher._extract_failure_detail(
            json.dumps({"success": False, "error": ignored_err}), 1
        ) == ("ignored", "")
        # Ignored outcomes preserve consecutive_failures rather than resetting or incrementing.
        assert dispatcher._should_recycle_after_request(
            json.dumps({"success": False, "error": ignored_err}),
            1,
            consecutive_failures=2,
            request_count=5,
            max_requests=50,
            max_consecutive_failures=3,
        ) == (2, None)

    assert dispatcher._should_recycle_after_request(
        json.dumps(
            {
                "success": False,
                "error": "generic failure",
                "errorInfo": {"type": "ONNXRuntimeError"},
            }
        ),
        1,
        consecutive_failures=0,
        request_count=1,
    ) == (1, "cuda_error")

    # Multi-line stdout with non-JSON prefix before the final JSON line
    assert dispatcher._should_recycle_after_request(
        'WARNING: fallback\n{"success": false, "error": "CUDA failure 999"}',
        0,
        consecutive_failures=0,
        request_count=1,
    ) == (1, "cuda_error")

    # max_consecutive_failures=0 disables consecutive-failure recycling while keeping cuda_error active
    assert dispatcher._should_recycle_after_request(
        json.dumps({"success": False, "error": "bad input"}),
        1,
        consecutive_failures=5,
        request_count=6,
        max_requests=50,
        max_consecutive_failures=0,
    ) == (6, None)
    assert dispatcher._should_recycle_after_request(
        json.dumps({"success": False, "error": "CUDA failure 999"}),
        1,
        consecutive_failures=5,
        request_count=6,
        max_requests=50,
        max_consecutive_failures=0,
    ) == (6, "cuda_error")

    # 4. _env_non_negative_int safely handles empty, non-numeric, negative, float, and valid strings
    prev_env = os.environ.get("DISPATCHER_MAX_CONSECUTIVE_FAILURES")
    try:
        for bad_val in ("", "   ", "abc", "-1", "-5"):
            os.environ["DISPATCHER_MAX_CONSECUTIVE_FAILURES"] = bad_val
            assert dispatcher._env_non_negative_int("DISPATCHER_MAX_CONSECUTIVE_FAILURES", 3) == 3
        os.environ["DISPATCHER_MAX_CONSECUTIVE_FAILURES"] = "0"
        assert dispatcher._env_non_negative_int("DISPATCHER_MAX_CONSECUTIVE_FAILURES", 3) == 0
        os.environ["DISPATCHER_MAX_CONSECUTIVE_FAILURES"] = "2.9"
        assert dispatcher._env_non_negative_int("DISPATCHER_MAX_CONSECUTIVE_FAILURES", 3) == 2
    finally:
        if prev_env is None:
            os.environ.pop("DISPATCHER_MAX_CONSECUTIVE_FAILURES", None)
        else:
            os.environ["DISPATCHER_MAX_CONSECUTIVE_FAILURES"] = prev_env

    # 5. _cleanup_after_request catches RuntimeError from poisoned torch.cuda.empty_cache()
    fake_torch = types.ModuleType("torch")
    fake_torch.cuda = types.SimpleNamespace(
        is_available=lambda: True,
        empty_cache=lambda: (_ for _ in ()).throw(
            RuntimeError("CUDA error: device-side assert triggered")
        ),
    )
    prev_torch = sys.modules.get("torch")
    orig_stderr = sys.stderr
    try:
        sys.modules["torch"] = fake_torch
        err_buf = io.StringIO()
        sys.stderr = err_buf
        dispatcher._cleanup_after_request()
        assert "GPU cache cleanup failed" in err_buf.getvalue(), err_buf.getvalue()
    finally:
        sys.stderr = orig_stderr
        if prev_torch is None:
            sys.modules.pop("torch", None)
        else:
            sys.modules["torch"] = prev_torch


_verify_dispatcher_failure_recycling()

print("WIRE OK")
