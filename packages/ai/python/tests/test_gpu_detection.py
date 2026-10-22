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


def test_safe_onnx_session_falls_back_to_cpu_on_cuda_error(monkeypatch, capsys):
    cuda_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    for cuda_err in (
        RuntimeError("CUDA out of memory"),
        RuntimeError("Failed to allocate memory for requested buffer"),
        RuntimeError("cudaErrorMemoryAllocation: out of memory"),
        RuntimeError("CUBLAS_STATUS_ALLOC_FAILED"),
        RuntimeError("CUDA driver version is insufficient"),
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

        session, device = gpu.safe_onnx_session("/tmp/model.onnx")
        assert session == "cpu-session"
        assert device == "cpu"
        assert calls == [
            ("/tmp/model.onnx", cuda_providers),
            ("/tmp/model.onnx", ["CPUExecutionProvider"]),
        ]
        assert "falling back to CPU" in capsys.readouterr().err


