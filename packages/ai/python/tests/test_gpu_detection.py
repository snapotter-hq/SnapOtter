"""Framework-specific CUDA probes must never depend on obsolete Paddle OCR."""
import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import gpu  # noqa: E402


# --- gpu_available() orchestration -----------------------------------------

def _patch_probes(monkeypatch, torch, onnx, smi):
    """Stub the three existing probes and reset the lru_cache for one call."""
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    monkeypatch.setattr(gpu, "_try_torch_cuda", lambda: torch)
    monkeypatch.setattr(gpu, "_try_onnx_cuda", lambda: onnx)
    monkeypatch.setattr(gpu, "_nvidia_smi_gpu_name", lambda: smi)
    gpu.gpu_available.cache_clear()


def test_gpu_available_does_not_treat_hardware_presence_as_framework_support(monkeypatch):
    _patch_probes(monkeypatch, torch=False, onnx=False, smi="NVIDIA GeForce RTX 4070")
    assert gpu.gpu_available() is False


def test_gpu_module_has_no_paddle_probe():
    assert not hasattr(gpu, "_try_paddle_cuda_subprocess")


# --- Per-framework detection (torch, ctranslate2) --------------------------
#
# Torch and CTranslate2 tools must gate on their OWN framework, not the general
# gpu_available(), which can report True based on ONNX Runtime while
# torch is a CPU-only build. Consuming the shared boolean would make those tools
# route to CUDA on a device their framework cannot use.

def test_torch_gpu_available_true_when_torch_can_use_cuda(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    monkeypatch.setattr(gpu, "_try_torch_cuda", lambda: True)
    assert gpu.torch_gpu_available() is True


def test_torch_gpu_available_false_when_override_disables_gpu(monkeypatch):
    monkeypatch.setenv("SNAPOTTER_GPU", "0")
    monkeypatch.setattr(gpu, "_try_torch_cuda", lambda: True)
    assert gpu.torch_gpu_available() is False


def test_torch_gpu_available_false_when_torch_is_cpu_only(monkeypatch):
    # The crux: gpu_available() may be True via ONNX on a GPU box, but a
    # CPU-only torch build must report no GPU so torch tools do not touch CUDA.
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    monkeypatch.setattr(gpu, "_try_torch_cuda", lambda: False)
    assert gpu.torch_gpu_available() is False


# --- torch wheel/device arch compatibility (issue #1163) -------------------
#
# A cu126 torch wheel carries no SASS or PTX for Blackwell (sm_120), yet
# torch.cuda.is_available() still returns True on an RTX 50-series card. The
# first kernel launch then fails with "no kernel image is available for
# execution on the device", and torch tools failed instead of falling back to
# CPU. The probe compares the device capability with the archs the wheel was
# built for.

def _install_fake_torch(
    monkeypatch,
    capability,
    arch_list,
    name="NVIDIA GeForce RTX 5090",
    arch_error=None,
    capability_error=None,
):
    class FakeCuda:
        def is_available(self):
            return True

        def get_device_name(self, index):
            return name

        def get_device_capability(self, index):
            if capability_error is not None:
                raise capability_error
            return capability

        def get_arch_list(self):
            if arch_error is not None:
                raise arch_error
            return list(arch_list)

    fake = types.SimpleNamespace(
        cuda=FakeCuda(), version=types.SimpleNamespace(cuda="12.6")
    )
    monkeypatch.setitem(sys.modules, "torch", fake)


def test_torch_probe_falls_back_on_a_wheel_without_the_device_arch(monkeypatch, capsys):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(monkeypatch, (12, 0), ["sm_80", "sm_86", "sm_90"])

    assert gpu.torch_gpu_available() is False

    err = capsys.readouterr().err
    assert "sm_120" in err
    assert "cu128" in err


def test_torch_probe_accepts_a_wheel_built_for_the_device(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(monkeypatch, (12, 0), ["sm_80", "sm_86", "sm_90", "sm_120"])

    assert gpu.torch_gpu_available() is True


def test_torch_probe_keeps_the_gpu_when_the_arch_list_is_unavailable(monkeypatch):
    # An older or custom build that cannot report its archs must not lose GPU
    # support over a capability check we cannot perform.
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(monkeypatch, (12, 0), [])

    assert gpu.torch_gpu_available() is True


def test_torch_probe_accepts_sass_from_the_same_major_arch(monkeypatch):
    # SASS is minor-version compatible within a major arch: sm_86 runs on an
    # sm_89 card such as the RTX 4090, but sm_90 does not run on sm_120.
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(monkeypatch, (8, 9), ["sm_80", "sm_86"])
    assert gpu.torch_gpu_available() is True

    _install_fake_torch(monkeypatch, (12, 0), ["sm_90"])
    assert gpu.torch_gpu_available() is False


def test_torch_probe_accepts_ptx_for_the_device_or_older(monkeypatch):
    # PTX is forward compatible: compute_90 JITs onto sm_120, compute_120 does
    # not run on sm_90.
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(monkeypatch, (12, 0), ["compute_90"])
    assert gpu.torch_gpu_available() is True

    _install_fake_torch(monkeypatch, (9, 0), ["compute_120"])
    assert gpu.torch_gpu_available() is False


def test_torch_probe_handles_arch_specific_targets(monkeypatch):
    # sm_90a and sm_100f code only runs on that exact capability, and
    # arch-specific PTX is not forward compatible either.
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(monkeypatch, (9, 0), ["sm_90a"])
    assert gpu.torch_gpu_available() is True

    _install_fake_torch(monkeypatch, (12, 0), ["sm_90a"])
    assert gpu.torch_gpu_available() is False

    _install_fake_torch(monkeypatch, (10, 0), ["sm_100f"])
    assert gpu.torch_gpu_available() is True

    _install_fake_torch(monkeypatch, (12, 0), ["sm_100f"])
    assert gpu.torch_gpu_available() is False

    _install_fake_torch(monkeypatch, (12, 0), ["compute_90a"])
    assert gpu.torch_gpu_available() is False


def test_torch_probe_keeps_the_gpu_when_the_arch_probe_raises(monkeypatch):
    # A patched or vendor build that cannot produce an arch list must not lose
    # CUDA support over a capability check we could not perform.
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(
        monkeypatch, (12, 0), [], arch_error=RuntimeError("no arch flags")
    )
    assert gpu.torch_gpu_available() is True


def test_torch_probe_keeps_the_gpu_when_the_capability_probe_raises(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(
        monkeypatch, (12, 0), ["sm_90"], capability_error=RuntimeError("driver gone")
    )
    assert gpu.torch_gpu_available() is True


def test_torch_probe_keeps_the_gpu_when_no_arch_entry_is_understood(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    _install_fake_torch(monkeypatch, (12, 0), ["unknown-target"])
    assert gpu.torch_gpu_available() is True


def test_ctranslate2_gpu_available_true_when_cuda_device_present(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    fake = types.SimpleNamespace(get_cuda_device_count=lambda: 1)
    monkeypatch.setitem(sys.modules, "ctranslate2", fake)
    assert gpu.ctranslate2_gpu_available() is True


def test_ctranslate2_gpu_available_false_when_no_cuda_device(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    fake = types.SimpleNamespace(get_cuda_device_count=lambda: 0)
    monkeypatch.setitem(sys.modules, "ctranslate2", fake)
    assert gpu.ctranslate2_gpu_available() is False


def test_ctranslate2_gpu_available_false_when_override_disables_gpu(monkeypatch):
    monkeypatch.setenv("SNAPOTTER_GPU", "0")
    fake = types.SimpleNamespace(get_cuda_device_count=lambda: 4)
    monkeypatch.setitem(sys.modules, "ctranslate2", fake)
    assert gpu.ctranslate2_gpu_available() is False


def test_ctranslate2_gpu_available_false_when_not_installed(monkeypatch):
    # A None entry in sys.modules makes `import ctranslate2` raise ImportError,
    # which models the framework being absent (e.g. no transcription bundle).
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    monkeypatch.setitem(sys.modules, "ctranslate2", None)
    assert gpu.ctranslate2_gpu_available() is False


def test_onnx_gpu_available_true_when_onnx_can_use_cuda(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    monkeypatch.setattr(gpu, "_try_onnx_cuda", lambda: True)
    assert gpu.onnx_gpu_available() is True


def test_onnx_gpu_available_false_when_override_disables_gpu(monkeypatch):
    monkeypatch.setenv("SNAPOTTER_GPU", "0")
    monkeypatch.setattr(gpu, "_try_onnx_cuda", lambda: True)
    assert gpu.onnx_gpu_available() is False


def test_onnx_gpu_available_false_when_onnx_is_cpu_only(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    monkeypatch.setattr(gpu, "_try_onnx_cuda", lambda: False)
    assert gpu.onnx_gpu_available() is False


def test_gpu_frameworks_available_reports_each_framework_independently(monkeypatch):
    monkeypatch.delenv("SNAPOTTER_GPU", raising=False)
    monkeypatch.setattr(gpu, "torch_gpu_available", lambda: False)
    monkeypatch.setattr(gpu, "onnx_gpu_available", lambda: True)
    monkeypatch.setattr(gpu, "ctranslate2_gpu_available", lambda: False)
    assert gpu.gpu_frameworks_available() == {
        "torch": False,
        "onnx": True,
        "ctranslate2": False,
    }


def test_safe_onnx_session_reraises_host_oom_without_cpu_retry(monkeypatch, capsys):
    cuda_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    for host_oom in (
        MemoryError(),
        RuntimeError("DefaultCPUAllocator: not enough memory"),
        RuntimeError("DefaultCPUAllocator: can't allocate memory"),
        RuntimeError("DefaultCPUAllocator: failed to allocate memory"),
        RuntimeError("DefaultCPUAllocator: out of memory"),
        OSError(12, "Cannot allocate memory"),
        OSError(12, "Nicht genügend Hauptspeicher verfügbar"),
        RuntimeError("Unable to allocate 1.86 GiB for an array with shape (4096, 4096, 30)"),
        RuntimeError("std::bad_alloc"),
    ):
        calls = []

        def fake_inference_session(model_path, providers=None, _exc=host_oom):
            calls.append((model_path, list(providers) if providers is not None else None))
            if providers and "CUDAExecutionProvider" in providers:
                raise _exc
            return "cpu-session"

        fake_ort = types.SimpleNamespace(InferenceSession=fake_inference_session)
        monkeypatch.setitem(sys.modules, "onnxruntime", fake_ort)
        monkeypatch.setattr(gpu, "onnx_providers", lambda: (list(cuda_providers), "cuda"))

        for explicit_providers in (cuda_providers, None):
            calls.clear()
            try:
                gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
                raise AssertionError(f"Expected {host_oom!r} to be re-raised")
            except Exception as exc:
                assert exc is host_oom

            assert calls == [("/tmp/model.onnx", cuda_providers)]
            assert "falling back to CPU" not in capsys.readouterr().err


def test_safe_onnx_session_reraises_model_load_io_protobuf_and_download_errors_without_cpu_retry(
    monkeypatch, capsys
):
    class InvalidProtobuf(RuntimeError):
        pass

    class InvalidGraph(RuntimeError):
        pass

    class NoSuchFile(RuntimeError):
        pass

    cuda_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    for model_load_err in (
        FileNotFoundError(2, "No such file or directory", "/tmp/model.onnx"),
        PermissionError(13, "Permission denied", "/tmp/model.onnx"),
        IsADirectoryError(21, "Is a directory", "/tmp/model.onnx"),
        OSError(5, "Input/output error"),
        ConnectionError("Connection reset by peer"),
        EOFError("Unexpected end of file while reading model"),
        InvalidProtobuf("Load model from /tmp/model.onnx failed"),
        InvalidGraph("Load model from /tmp/model.onnx failed"),
        NoSuchFile("/tmp/model.onnx"),
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
            "SHA256 hash of downloaded file (model.onnx) does not match the known hash: expected deadbeef"
        ),
        ValueError("Checksum mismatch for downloaded model"),
        RuntimeError(
            "Offline mode is enabled (SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0); cannot download model"
        ),
    ):
        calls = []

        def fake_inference_session(model_path, providers=None, _exc=model_load_err):
            calls.append((model_path, list(providers) if providers is not None else None))
            if providers and "CUDAExecutionProvider" in providers:
                raise _exc
            return "cpu-session"

        fake_ort = types.SimpleNamespace(InferenceSession=fake_inference_session)
        monkeypatch.setitem(sys.modules, "onnxruntime", fake_ort)
        monkeypatch.setattr(gpu, "onnx_providers", lambda: (list(cuda_providers), "cuda"))

        for explicit_providers in (cuda_providers, None):
            calls.clear()
            try:
                gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
                raise AssertionError(f"Expected {model_load_err!r} to be re-raised")
            except Exception as exc:
                assert exc is model_load_err

            assert calls == [("/tmp/model.onnx", cuda_providers)]
            assert "falling back to CPU" not in capsys.readouterr().err


def test_safe_onnx_session_falls_back_to_cpu_on_cuda_error(monkeypatch, capsys):
    cuda_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    for cuda_err in (
        RuntimeError("CUDA out of memory"),
        RuntimeError("Failed to allocate memory for requested buffer"),
        RuntimeError("cudaErrorMemoryAllocation: out of memory"),
        RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
        RuntimeError("CUDA driver version is insufficient"),
        RuntimeError(
            "[ONNXRuntimeError] : 1 : FAIL : Failed to load library libonnxruntime_providers_cuda.so with error: libcudnn.so.8: cannot open shared object file: No such file or directory"
        ),
    ):
        calls = []

        def fake_inference_session(model_path, providers=None, _exc=cuda_err):
            calls.append((model_path, list(providers) if providers is not None else None))
            if providers and "CUDAExecutionProvider" in providers:
                raise _exc
            return "cpu-session"

        fake_ort = types.SimpleNamespace(InferenceSession=fake_inference_session)
        monkeypatch.setitem(sys.modules, "onnxruntime", fake_ort)
        monkeypatch.setattr(gpu, "onnx_providers", lambda: (list(cuda_providers), "cuda"))

        for explicit_providers in (cuda_providers, None):
            calls.clear()
            session, device = gpu.safe_onnx_session("/tmp/model.onnx", providers=explicit_providers)
            assert session == "cpu-session"
            assert device == "cpu"
            assert calls == [
                ("/tmp/model.onnx", cuda_providers),
                ("/tmp/model.onnx", ["CPUExecutionProvider"]),
            ]
            assert "falling back to CPU" in capsys.readouterr().err


# --- safe_onnx_session() device ---------------------------------------------

def _fake_onnxruntime(monkeypatch, used):
    """Install an onnxruntime whose sessions run on the providers in ``used``."""
    class FakeSession:
        def __init__(self, _path, providers):
            self.requested = providers

        def get_providers(self):
            return [p for p in self.requested if p in used]

    fake = types.SimpleNamespace(InferenceSession=FakeSession)
    monkeypatch.setitem(sys.modules, "onnxruntime", fake)


def test_safe_onnx_session_reports_cuda_for_explicit_cuda_providers(monkeypatch):
    _fake_onnxruntime(monkeypatch, used={"CUDAExecutionProvider", "CPUExecutionProvider"})
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    session, device = gpu.safe_onnx_session("model.onnx", providers=providers)
    assert device == "cuda"
    assert session.requested == providers


def test_safe_onnx_session_reports_cpu_when_onnxruntime_drops_cuda(monkeypatch):
    _fake_onnxruntime(monkeypatch, used={"CPUExecutionProvider"})
    detected = (["CUDAExecutionProvider", "CPUExecutionProvider"], "cuda")
    monkeypatch.setattr(gpu, "onnx_providers", lambda: detected)
    _, device = gpu.safe_onnx_session("model.onnx")
    assert device == "cpu"


def test_safe_onnx_session_reports_cpu_for_cpu_providers(monkeypatch):
    _fake_onnxruntime(monkeypatch, used={"CUDAExecutionProvider", "CPUExecutionProvider"})
    _, device = gpu.safe_onnx_session("model.onnx", providers=["CPUExecutionProvider"])
    assert device == "cpu"
